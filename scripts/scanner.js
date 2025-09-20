// scripts/scanner.js
// ZXing ESM cho môi trường browser thuần
const ZXING_URL = 'https://esm.sh/@zxing/browser@0.0.10';

let ZX = null;
async function ensureZX() {
  if (!ZX) ZX = await import(ZXING_URL);
  return ZX;
}

export function setupScanner({ videoEl, onResult, statusEl, selectEl }) {
  let reader = null;
  let controls = null;
  let currentTrack = null;   // giữ để bật/tắt torch
  let currentDeviceId = null;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  async function enumerateCameras() {
    await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {});
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(d => d.kind === 'videoinput');
    return devices;
  }

  // Chọn mặc định ưu tiên Ultra-Wide/0.5x trên iPhone 13 Pro Max
  function pickDefaultDeviceId(devices) {
    if (!devices || !devices.length) return null;
    const score = (label) => {
      const s = (label || '').toLowerCase();
      let p = 0;
      if (s.includes('ultra') || s.includes('0.5')) p += 100; // ultra-wide
      if (s.includes('back') || s.includes('rear')) p += 20;
      if (s.includes('environment')) p += 15;
      return p;
    };
    return devices
      .map(d => ({ d, p: score(d.label) }))
      .sort((a,b)=> b.p - a.p)[0].d.deviceId;
  }

  async function startScan(deviceId = null) {
    setStatus('Đang mở camera...');
    const { BrowserMultiFormatReader } = await ensureZX();
    reader = new BrowserMultiFormatReader();

    const onScan = (result, err) => {
      if (result) {
        const text = result.getText ? result.getText() : (result.rawValue || '');
        if (text) onResult?.(text);
      }
      if (err) { /* bỏ qua decode error liên tục */ }
    };

    try {
      // Nếu chưa có deviceId → chọn mặc định theo heuristic Ultra-Wide
      if (!deviceId) {
        const devices = await enumerateCameras();
        if (selectEl) {
          // bơm danh sách vào dropdown
          selectEl.innerHTML = devices.map(d => `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`).join('');
        }
        deviceId = pickDefaultDeviceId(devices) || devices?.[0]?.deviceId || null;
        if (selectEl && deviceId) selectEl.value = deviceId;
      }

      currentDeviceId = deviceId;

      // decode
      controls = deviceId
        ? await reader.decodeFromVideoDevice(deviceId, videoEl, onScan)
        : await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, videoEl, onScan);

      // lưu track để bật/tắt torch
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

  // Torch
  async function toggleTorch() {
    if (!currentTrack) return false;
    let enabled = false;
    try {
      // đọc trạng thái hiện tại
      const caps = currentTrack.getCapabilities?.() || {};
      if (!('torch' in caps)) return false;
      const settings = currentTrack.getSettings?.() || {};
      enabled = !settings.torch;
      await currentTrack.applyConstraints({ advanced: [{ torch: enabled }] });
      return enabled;
    } catch {
      return false;
    }
  }

  // Đổi camera
  async function changeCamera(newDeviceId) {
    if (newDeviceId === currentDeviceId) return;
    stopScan();
    await startScan(newDeviceId);
  }

  // Decode từ ảnh có sẵn
  async function decodeFromFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await ensureZX();
      const r = new BrowserMultiFormatReader();
      const res = await r.decodeFromImageUrl(url);
      const text = res.getText ? res.getText() : (res.rawValue || '');
      if (text) onResult?.(text);
    } catch (e) {
      console.error('decodeFromFile:', e);
      setStatus('Không đọc được mã từ ảnh.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return { startScan, stopScan, toggleTorch, changeCamera, decodeFromFile };
}
