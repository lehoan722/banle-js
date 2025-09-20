// scripts/scanner.js
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

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  async function enumerateCameras() {
    // iOS cần gọi gUM trước để có label
    await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {});
    return (await navigator.mediaDevices.enumerateDevices())
      .filter(d => d.kind === 'videoinput');
  }

  // Ưu tiên “cực rộng/ultra/0.5x” + “mặt sau/back/rear”
  function pickDefaultDeviceId(devices) {
    if (!devices?.length) return null;
    const score = (label = '') => {
      const s = label.toLowerCase();
      let p = 0;
      if (s.includes('cực rộng') || s.includes('ultra') || s.includes('0.5')) p += 100;
      if (s.includes('mặt sau') || s.includes('back') || s.includes('rear') || s.includes('environment')) p += 20;
      return p;
    };
    return devices
      .map(d => ({ d, p: score(d.label) }))
      .sort((a,b) => b.p - a.p)[0].d.deviceId;
  }

  const onScan = (result, err) => {
    if (result) {
      const text = result.getText ? result.getText() : (result.rawValue || '');
      if (text) onResult?.(text);
    }
  };

  async function startScan(deviceId = null) {
    setStatus('Đang mở camera...');
    const { BrowserMultiFormatReader } = await ensureZX();
    reader = new BrowserMultiFormatReader();

    try {
      if (!deviceId) {
        const devices = await enumerateCameras();
        // bơm danh sách vào dropdown nếu có
        if (selectEl) {
          selectEl.innerHTML = devices.map(d =>
            `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`
          ).join('');
        }
        deviceId = pickDefaultDeviceId(devices) || devices?.[0]?.deviceId || null;
        if (selectEl && deviceId) selectEl.value = deviceId;
      }

      currentDeviceId = deviceId;

      controls = deviceId
        ? await reader.decodeFromVideoDevice(deviceId, videoEl, onScan)
        : await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoEl, onScan);

      // lưu track để điều khiển torch (nếu máy hỗ trợ)
      const stream = videoEl.srcObject;
      currentTrack = stream?.getVideoTracks?.()[0] || null;

      setStatus('Đang quét... đưa mã vào khung');
    } catch (e) {
      console.error('startScan error:', e);
      setStatus('Không mở được camera');
    }
  }

  function stopScan() {
    try { controls?.stop(); } catch {}
    try { reader?.reset(); } catch {}
    try {
      const s = videoEl?.srcObject;
      if (s) { s.getTracks().forEach(t => t.stop()); videoEl.srcObject = null; }
    } catch {}
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
      const cur = currentTrack.getSettings?.().torch;
      await currentTrack.applyConstraints({ advanced: [{ torch: !cur }] });
      return !cur;
    } catch {
      return false;
    }
  }

  // (Tuỳ chọn) decode từ ảnh có sẵn:
  async function decodeFromFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await ensureZX();
      const r = new BrowserMultiFormatReader();
      const res = await r.decodeFromImageUrl(url);
      const text = res.getText ? res.getText() : (res.rawValue || '');
      if (text) onResult?.(text);
    } finally { URL.revokeObjectURL(url); }
  }

  return { startScan, stopScan, changeCamera, toggleTorch, decodeFromFile };
}
