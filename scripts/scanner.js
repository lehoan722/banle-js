// scripts/scanner.js
// Bản tối ưu theo timkiemhanghoa333: quét nhanh, ưu tiên camera sau siêu rộng iPhone

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

  function scoreCameraLabel(label = '') {
    const s = String(label || '').toLowerCase();
    let score = 0;

    if (/(back|rear|environment|mặt sau|camera sau)/.test(s)) score += 100;

    if (/(ultra\s*wide|ultrawide|0\.5x|0,5x|0\.5|0,5|cực rộng|siêu rộng)/.test(s)) {
      score += 1000;
    }

    if (/(tele|zoom|2x|3x|chụp xa)/.test(s)) score -= 300;
    if (/(front|trước|mặt trước|facetime)/.test(s)) score -= 1000;

    return score;
  }

  async function listVideoDevices() {
    const ZXING = await ensureZX();

    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (_) {}

    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    return devices || [];
  }

  async function populateCameraList() {
    const devices = await listVideoDevices();

    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));

    if (selectEl) {
      selectEl.innerHTML = devices.map((d, i) => {
        const label = d.label || `Camera ${i + 1}`;
        return `<option value="${d.deviceId}">${label}</option>`;
      }).join('');
    }

    if (devices[0]) {
      currentDeviceId = devices[0].deviceId;
      if (selectEl) selectEl.value = currentDeviceId;
    }

    return devices;
  }

  async function applyFastCameraSettings() {
    const stream = videoEl?.srcObject;
    currentTrack = stream?.getVideoTracks?.()[0] || null;
    if (!currentTrack) return;

    try {
      await currentTrack.applyConstraints({
        advanced: [
          { focusMode: 'continuous' },
          { exposureMode: 'continuous' }
        ]
      });
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

      await populateCameraList();

      const useId = deviceId || currentDeviceId || '';

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

      setStatus('Đang quét... đưa mã vào khung');
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
