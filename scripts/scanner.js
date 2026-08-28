// scripts/scanner.js
// Bản gốc giữ nguyên luồng quét/đẩy mã.
// Chỉ thay đổi chọn camera: ưu tiên camera sau siêu rộng/0.5x,
// nếu không có thì tự động dùng camera sau thông thường.
// Không cho người dùng phải chọn camera thủ công.

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

let ZX = null;

async function ensureZX() {
  if (!ZX) ZX = await import(ZXING_URL);
  return ZX;
}

export function setupScanner({ videoEl, onResult, selectEl, statusEl }) {
  let reader = null;
  let controls = null;
  let currentTrack = null;
  let currentDeviceId = '';
  let lastText = '';
  let lastTime = 0;
  let starting = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function normText(s) {
    return String(s || '').trim().toUpperCase();
  }

  function cameraInfo(label = '') {
    const s = String(label || '').toLowerCase();

    const isFront = /(front|trước|mặt trước|facetime|user)/.test(s);
    const isBack = /(back|rear|environment|mặt sau|camera sau|world)/.test(s);

    // Dấu hiệu rõ nhất của camera siêu rộng.
    const isUltraWide =
      /(ultra[\s_-]*wide|ultrawide|0[\.,]5x|0[\.,]5|cực rộng|siêu rộng)/.test(s);

    // Một số iPhone/Safari chỉ trả camera logic theo cụm ống kính.
    // "Dual Wide" / "Triple Camera" có khả năng chứa ống kính ultra-wide.
    const isBackMultiLens =
      isBack && /(dual[\s_-]*wide|dual|triple|multi|composite)/.test(s);

    const isTele = /(tele|telephoto|2x|3x|5x|chụp xa)/.test(s);

    let score = 0;

    // Ưu tiên tuyệt đối camera siêu rộng thật nếu label nhận diện được.
    if (isUltraWide && isBack) score += 10000;
    else if (isUltraWide) score += 9000;

    // Tiếp theo là cụm camera sau nhiều ống kính vì có thể chuyển được về 0.5x.
    if (isBackMultiLens) score += 4000;

    // Sau cùng là camera sau thông thường.
    if (isBack) score += 2000;

    // Không ưu tiên tele và loại camera trước.
    if (isTele) score -= 1000;
    if (isFront) score -= 10000;

    return { score, isBack, isUltraWide, isBackMultiLens, isFront, isTele };
  }

  async function listVideoDevices() {
    const ZXING = await ensureZX();

    // Xin quyền trước để browser trả label camera đầy đủ hơn.
    let permissionStream = null;
    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (_) {
      // Nếu quyền đã có / browser xử lý khác, vẫn thử enumerate phía dưới.
    } finally {
      try {
        permissionStream?.getTracks?.().forEach(t => t.stop());
      } catch (_) {}
    }

    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    return devices || [];
  }

  async function chooseBestBackCamera() {
    const devices = await listVideoDevices();

    // Xếp theo: Ultra-wide/0.5x -> cụm camera sau nhiều lens -> camera sau -> camera khác.
    const ranked = [...devices].sort((a, b) => {
      const sa = cameraInfo(a.label).score;
      const sb = cameraInfo(b.label).score;
      return sb - sa;
    });

    const best = ranked[0] || null;

    // Giữ selectEl để main.js gốc không lỗi, nhưng giao diện đã ẩn nó.
    if (selectEl) {
      selectEl.innerHTML = ranked.map((d, i) => {
        const label = d.label || `Camera ${i + 1}`;
        return `<option value="${d.deviceId}">${label}</option>`;
      }).join('');

      if (best) selectEl.value = best.deviceId;
    }

    if (best) currentDeviceId = best.deviceId;

    return { best, devices: ranked };
  }

  async function applyFastCameraSettings() {
    const stream = videoEl?.srcObject;
    currentTrack = stream?.getVideoTracks?.()[0] || null;
    if (!currentTrack) return;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      const advanced = [];

      // Giữ tối ưu focus/exposure của bản gốc.
      if ('focusMode' in caps) advanced.push({ focusMode: 'continuous' });
      if ('exposureMode' in caps) advanced.push({ exposureMode: 'continuous' });

      if (advanced.length) {
        try {
          await currentTrack.applyConstraints({ advanced });
        } catch (_) {}
      }

      // Fallback quan trọng:
      // Trên một số máy, browser chỉ expose một "Back Camera" logic.
      // Nếu camera đó cho phép zoom nhỏ hơn 1x thì ép về mức nhỏ nhất,
      // thường tương ứng góc 0.5x / ultra-wide.
      const zoomCaps = caps.zoom;
      if (zoomCaps && Number.isFinite(zoomCaps.min) && zoomCaps.min < 1) {
        try {
          await currentTrack.applyConstraints({
            advanced: [{ zoom: zoomCaps.min }]
          });
        } catch (_) {}
      }
    } catch (_) {}
  }

  function handleResult(result) {
    if (!result?.getText) return;

    const text = normText(result.getText());
    if (!text) return;

    const now = Date.now();

    if (text === lastText && now - lastTime < 800) return;

    lastText = text;
    lastTime = now;

    onResult?.(text);
  }

  async function startScan(deviceId = '') {
    if (starting) return;
    starting = true;

    try {
      stopScan();

      setStatus('Đang mở camera...');

      const ZXING = await ensureZX();

      // Nếu main.js không truyền deviceId, tự chọn camera tốt nhất.
      const chosen = await chooseBestBackCamera();

      const useId = deviceId || chosen.best?.deviceId || currentDeviceId || '';

      if (useId) {
        currentDeviceId = useId;
        if (selectEl) selectEl.value = useId;
      }

      reader = new ZXING.BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 25
      });

      if (useId) {
        controls = await reader.decodeFromVideoDevice(
          useId,
          videoEl,
          (result) => handleResult(result)
        );
      } else {
        // Không enumerate được camera: fallback chuẩn camera sau.
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: false
          },
          videoEl,
          (result) => handleResult(result)
        );
      }

      await applyFastCameraSettings();

      const trackLabel = currentTrack?.label || chosen.best?.label || '';
      const info = cameraInfo(trackLabel);

      if (info.isUltraWide || info.isBackMultiLens) {
        setStatus('Đang quét bằng camera sau góc rộng...');
      } else {
        setStatus('Đang quét bằng camera sau...');
      }
    } catch (e) {
      console.error('startScan error:', e);
      setStatus('Không mở được camera');
    } finally {
      starting = false;
    }
  }

  function stopScan() {
    try { controls?.stop?.(); } catch (_) {}
    try { reader?.reset?.(); } catch (_) {}

    try {
      const stream = videoEl?.srcObject;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
    } catch (_) {}

    controls = null;
    reader = null;
    currentTrack = null;
    setStatus('');
  }

  // Giữ hàm này để tương thích main.js gốc.
  // Do select camera đã bị ẩn nên người dùng không gọi nó từ giao diện.
  async function changeCamera(newDeviceId) {
    if (!newDeviceId || newDeviceId === currentDeviceId) return;
    currentDeviceId = newDeviceId;
    stopScan();
    await startScan(newDeviceId);
  }

  async function toggleTorch() {
    if (!currentTrack) return false;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      if (!('torch' in caps)) return false;

      const cur = currentTrack.getSettings?.().torch || false;

      await currentTrack.applyConstraints({
        advanced: [{ torch: !cur }]
      });

      return !cur;
    } catch (_) {
      return false;
    }
  }

  async function decodeFromFile(file) {
    if (!file) return;

    const ZXING = await ensureZX();
    const r = new ZXING.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 25
    });

    const url = URL.createObjectURL(file);

    try {
      const res = await r.decodeFromImageUrl(url);
      handleResult(res);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    startScan,
    stopScan,
    changeCamera,
    toggleTorch,
    decodeFromFile
  };
}
