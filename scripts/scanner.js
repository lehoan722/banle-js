// scripts/scanner.js
// Scanner QR / barcode tối ưu cho mobile:
// - Ưu tiên camera sau siêu rộng (Ultra Wide / 0.5x)
// - Nếu không có => camera sau thường
// - Quét trực tiếp + giải mã ảnh chụp + ảnh thư viện
// - Ảnh lỗi sẽ thử thêm bản scale / tăng tương phản / xoay 90°-270°

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

let ZX = null;

async function ensureZX() {
  if (!ZX) ZX = await import(ZXING_URL);
  return ZX;
}

export function setupScanner({ videoEl, onResult, selectEl, statusEl, onDecodeError }) {
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

  function scoreCameraLabel(label = '') {
    const s = String(label || '').toLowerCase();
    let score = 0;

    const isFront = /(front|trước|mặt trước|facetime|selfie)/.test(s);
    const isRear = /(back|rear|environment|mặt sau|camera sau|triple camera|dual camera|wide camera)/.test(s);
    const isUltraWide = /(ultra[\s-]*wide|ultrawide|0[\.,]5x|0[\.,]5|cực rộng|siêu rộng)/.test(s);
    const isTele = /(tele|telephoto|zoom|2x|3x|5x|chụp xa)/.test(s);

    // Thứ tự mong muốn:
    // 1) camera sau siêu rộng
    // 2) camera sau thường
    // 3) camera không xác định
    // 4) tele
    // 5) camera trước
    if (isUltraWide && !isFront) score += 3000;
    if (isRear && !isFront) score += 1200;
    if (isTele) score -= 600;
    if (isFront) score -= 5000;

    return score;
  }

  async function listVideoDevices() {
    const ZXING = await ensureZX();
    let permissionStream = null;

    try {
      // Xin quyền trước để trình duyệt trả label camera đầy đủ hơn.
      permissionStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (_) {
      // Vẫn thử list device; nếu quyền đã được cấp trước đó có thể vẫn lấy được.
    } finally {
      try { permissionStream?.getTracks?.().forEach(t => t.stop()); } catch (_) { }
    }

    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    return devices || [];
  }

  async function populateCameraList(preferredId = '') {
    const devices = await listVideoDevices();

    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));

    if (selectEl) {
      selectEl.innerHTML = devices.map((d, i) => {
        const label = d.label || `Camera ${i + 1}`;
        return `<option value="${d.deviceId}">${label}</option>`;
      }).join('');
    }

    const preferred = devices.find(d => d.deviceId === preferredId);
    const chosen = preferred || devices[0] || null;

    if (chosen) {
      currentDeviceId = chosen.deviceId;
      if (selectEl) selectEl.value = currentDeviceId;
    }

    return devices;
  }

  async function applyFastCameraSettings() {
    const stream = videoEl?.srcObject;
    currentTrack = stream?.getVideoTracks?.()[0] || null;
    if (!currentTrack) return;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      const advanced = [];

      if ('focusMode' in caps) advanced.push({ focusMode: 'continuous' });
      if ('exposureMode' in caps) advanced.push({ exposureMode: 'continuous' });

      if (advanced.length) {
        await currentTrack.applyConstraints({ advanced });
      }
    } catch (_) { }
  }

  function handleResult(result) {
    if (!result?.getText) return false;

    const text = normText(result.getText());
    if (!text) return false;

    const now = Date.now();
    if (text === lastText && now - lastTime < 800) return false;

    lastText = text;
    lastTime = now;

    // onResult trả false => đã đọc được barcode nhưng không phải mã SP hợp lệ.
    return onResult?.(text) !== false;
  }

  async function startScan(deviceId = '') {
    if (starting) return false;
    starting = true;

    try {
      stopScan();
      setStatus('Đang mở camera sau...');

      const ZXING = await ensureZX();
      const devices = await populateCameraList(deviceId);
      const useId = deviceId || currentDeviceId || devices[0]?.deviceId || '';

      if (useId) {
        currentDeviceId = useId;
        if (selectEl) selectEl.value = useId;
      }

      reader = new ZXING.BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 35
      });

      if (useId) {
        controls = await reader.decodeFromVideoDevice(
          useId,
          videoEl,
          (result) => {
            if (result) handleResult(result);
          }
        );
      } else {
        // Fallback khi browser không cho deviceId/label rõ ràng.
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            },
            audio: false
          },
          videoEl,
          (result) => {
            if (result) handleResult(result);
          }
        );
      }

      await applyFastCameraSettings();

      const selectedLabel = selectEl?.selectedOptions?.[0]?.textContent || '';
      setStatus(selectedLabel ? `Đang quét • ${selectedLabel}` : 'Đang quét QR / mã vạch...');
      return true;
    } catch (e) {
      console.error('startScan error:', e);
      setStatus('Không mở được camera. Hãy kiểm tra quyền Camera.');
      return false;
    } finally {
      starting = false;
    }
  }

  function stopScan() {
    try { controls?.stop?.(); } catch (_) { }
    try { reader?.reset?.(); } catch (_) { }

    try {
      const stream = videoEl?.srcObject;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
    } catch (_) { }

    controls = null;
    reader = null;
    currentTrack = null;
    setStatus('');
  }

  async function changeCamera(newDeviceId) {
    if (!newDeviceId) return false;
    if (newDeviceId === currentDeviceId && videoEl?.srcObject) return true;

    currentDeviceId = newDeviceId;
    stopScan();
    return await startScan(newDeviceId);
  }

  async function toggleTorch() {
    if (!currentTrack) return false;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      if (!('torch' in caps)) {
        setStatus('Camera này không hỗ trợ bật đèn từ trình duyệt');
        return false;
      }

      const cur = currentTrack.getSettings?.().torch || false;
      await currentTrack.applyConstraints({ advanced: [{ torch: !cur }] });
      return !cur;
    } catch (_) {
      return false;
    }
  }

  async function decodeUrl(readerInstance, url) {
    try {
      return await readerInstance.decodeFromImageUrl(url);
    } catch (_) {
      return null;
    }
  }

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // Không revoke ở đây vì img có thể vẫn tham chiếu URL khi render canvas.
      // Caller sẽ revoke qua img.__objectUrl.
    }
  }

  function canvasToBlob(canvas, quality = 0.92) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  async function makeProcessedImageBlob(img, { rotate = 0, contrast = false } = {}) {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;

    // Giới hạn kích thước để tránh ngốn RAM trên điện thoại nhưng vẫn đủ nét cho barcode.
    const MAX_SIDE = 1800;
    const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const rotated = Math.abs(rotate) % 180 === 90;

    const canvas = document.createElement('canvas');
    canvas.width = rotated ? h : w;
    canvas.height = rotated ? w : h;

    const ctx = canvas.getContext('2d', { willReadFrequently: contrast });
    if (!ctx) return null;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    if (contrast) {
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;

        // Grayscale + tăng tương phản vừa phải. Không threshold cứng để giữ vạch mảnh.
        const factor = 1.55;
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = Math.max(0, Math.min(255, (gray - 128) * factor + 128));
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(imageData, 0, 0);
      } catch (_) { }
    }

    return await canvasToBlob(canvas);
  }

  async function decodeBlob(readerInstance, blob) {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    try {
      return await decodeUrl(readerInstance, url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function decodeFromFile(file) {
    if (!file) return false;

    const ZXING = await ensureZX();
    const r = new ZXING.BrowserMultiFormatReader();
    setStatus('Đang đọc QR / mã vạch trong ảnh...');

    // 1) Luôn thử ảnh gốc trước: nhanh nhất và giữ nguyên chi tiết.
    const originalUrl = URL.createObjectURL(file);
    try {
      const original = await decodeUrl(r, originalUrl);
      if (original) return handleResult(original);
    } finally {
      URL.revokeObjectURL(originalUrl);
    }

    // 2) Fallback xử lý ảnh: resize hợp lý + contrast + xoay.
    let img = null;
    let imgUrl = '';
    try {
      imgUrl = URL.createObjectURL(file);
      img = new Image();
      img.decoding = 'async';
      img.src = imgUrl;
      await img.decode();

      const attempts = [
        { rotate: 0, contrast: false },
        { rotate: 0, contrast: true },
        { rotate: 90, contrast: false },
        { rotate: 270, contrast: false },
        { rotate: 90, contrast: true },
        { rotate: 270, contrast: true }
      ];

      for (const opts of attempts) {
        const blob = await makeProcessedImageBlob(img, opts);
        const res = await decodeBlob(r, blob);
        if (res) return handleResult(res);
      }
    } catch (e) {
      console.warn('decodeFromFile fallback error:', e);
    } finally {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      try { r.reset?.(); } catch (_) { }
    }

    setStatus('Không tìm thấy QR / mã vạch trong ảnh');
    onDecodeError?.('❌ Không tìm thấy QR/mã vạch. Hãy chụp gần, rõ và đủ sáng hơn.');
    return false;
  }

  return {
    startScan,
    stopScan,
    changeCamera,
    toggleTorch,
    decodeFromFile
  };
}
