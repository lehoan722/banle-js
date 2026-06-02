// scripts/scanner.js
// Bản tối ưu QR: ưu tiên QR-only, camera sau/siêu rộng iPhone, chống quét lặp

const ZXING_URL = 'https://esm.sh/@zxing/browser@0.0.10';

let ZX = null;

async function ensureZX() {
  if (!ZX) ZX = await import(ZXING_URL);
  return ZX;
}

export function setupScanner({ videoEl, onResult, selectEl, statusEl }) {
  let reader = null;
  let controls = null;
  let currentTrack = null;
  let currentDeviceId = null;
  let lastScanText = '';
  let lastScanTime = 0;
  let isStarting = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  async function enumerateCameras() {
    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (_) {}

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
  }

  function scoreCamera(label = '') {
    const s = String(label || '').toLowerCase();
    let p = 0;

    // Ưu tiên siêu rộng iPhone
    if (s.includes('ultra wide')) p += 200;
    if (s.includes('ultrawide')) p += 200;
    if (s.includes('cực rộng')) p += 200;
    if (s.includes('0.5')) p += 180;
    if (s.includes('0,5')) p += 180;

    // Ưu tiên camera sau
    if (s.includes('back')) p += 100;
    if (s.includes('rear')) p += 100;
    if (s.includes('environment')) p += 80;
    if (s.includes('mặt sau')) p += 100;
    if (s.includes('sau')) p += 60;

    // Tránh camera trước
    if (s.includes('front')) p -= 100;
    if (s.includes('facetime')) p -= 100;
    if (s.includes('trước')) p -= 100;

    return p;
  }

  function pickDefaultDeviceId(devices) {
    if (!devices || !devices.length) return null;

    return devices
      .map(d => ({ d, p: scoreCamera(d.label) }))
      .sort((a, b) => b.p - a.p)[0].d.deviceId;
  }

  function fillCameraSelect(devices, selectedId) {
    if (!selectEl) return;

    selectEl.innerHTML = devices.map((d, index) => {
      const name = d.label || `Camera ${index + 1}`;
      return `<option value="${d.deviceId}">${name}</option>`;
    }).join('');

    if (selectedId) selectEl.value = selectedId;
  }

  function getFastConstraints(deviceId = null) {
    if (deviceId) {
      return {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false
      };
    }

    return {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: false
    };
  }

  async function applyCameraOptimizations() {
    const stream = videoEl?.srcObject;
    currentTrack = stream?.getVideoTracks?.()[0] || null;
    if (!currentTrack) return;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      const advanced = [];

      if ('focusMode' in caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }

      if ('exposureMode' in caps && Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
        advanced.push({ exposureMode: 'continuous' });
      }

      if (advanced.length) {
        await currentTrack.applyConstraints({ advanced });
      }
    } catch (_) {
      // iPhone/Safari có thể không hỗ trợ, bỏ qua
    }
  }

  function handleScan(result) {
    if (!result) return;

    const text = result.getText ? result.getText() : (result.rawValue || '');
    if (!text) return;

    const now = Date.now();

    // Chống quét lặp liên tục cùng một mã
    if (text === lastScanText && now - lastScanTime < 900) return;

    lastScanText = text;
    lastScanTime = now;

    onResult?.(text);
  }

  async function startScan(deviceId = null) {
    if (isStarting) return;
    isStarting = true;

    try {
      stopScan();

      setStatus('Đang mở camera...');

      const { BrowserQRCodeReader } = await ensureZX();

      reader = new BrowserQRCodeReader();

      if (!deviceId) {
        const devices = await enumerateCameras();
        deviceId = pickDefaultDeviceId(devices) || devices?.[0]?.deviceId || null;
        fillCameraSelect(devices, deviceId);
      }

      currentDeviceId = deviceId;

      const constraints = getFastConstraints(deviceId);

      controls = await reader.decodeFromConstraints(
        constraints,
        videoEl,
        (result, err) => {
          if (result) handleScan(result);
        }
      );

      await applyCameraOptimizations();

      setStatus('Đang quét QR... đưa mã vào giữa khung');
    } catch (e) {
      console.error('startScan error:', e);

      // Fallback nếu exact deviceId lỗi
      try {
        const { BrowserQRCodeReader } = await ensureZX();
        reader = new BrowserQRCodeReader();

        controls = await reader.decodeFromConstraints(
          getFastConstraints(null),
          videoEl,
          (result) => {
            if (result) handleScan(result);
          }
        );

        await applyCameraOptimizations();

        setStatus('Đang quét QR bằng camera sau...');
      } catch (e2) {
        console.error('fallback scan error:', e2);
        setStatus('Không mở được camera');
      }
    } finally {
      isStarting = false;
    }
  }

  function stopScan() {
    try { controls?.stop(); } catch (_) {}
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

    const url = URL.createObjectURL(file);

    try {
      const { BrowserQRCodeReader } = await ensureZX();
      const r = new BrowserQRCodeReader();

      const res = await r.decodeFromImageUrl(url);
      const text = res.getText ? res.getText() : (res.rawValue || '');

      if (text) onResult?.(text);
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
