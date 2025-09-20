// scripts/scanner.js
import { showFlash, showToast, haptic, beepSuccess, beepAlert } from "./feedback.js";

export let scanBuffer = [];

// Chuẩn hoá mã
function normCode(s) { return (s || "").trim().toUpperCase(); }

// Thêm mã vào buffer
export function addToScanBuffer(raw) {
  const code = normCode(raw);
  if (!code) return false;

  showFlash();

  if (!scanBuffer.includes(code)) {
    scanBuffer.unshift(code);
    renderScanBuffer();
    showToast(`✅ Đã quét ${code}`, "info");
    haptic(70);
    beepSuccess();
    return true;
  } else {
    showToast(`⚠️ Mã ${code} đã tồn tại`, "warn");
    haptic([40, 80, 40]);
    beepAlert();
    return false;
  }
}

// Xoá, clear, flush
export function removeFromScanBufferAt(idx) {
  if (idx >= 0 && idx < scanBuffer.length) {
    scanBuffer.splice(idx, 1);
    renderScanBuffer();
  }
}
export function clearScanBuffer() {
  scanBuffer = [];
  renderScanBuffer();
}
export function flushScanBufferToTextareaAndSearch() {
  const ta = document.getElementById("bulkTextarea");
  if (!ta) return;

  const existing = (ta.value || "")
    .split(/[\r\n]+/)
    .map(normCode)
    .filter(Boolean);
  const existingFiltered = existing.filter(c => !scanBuffer.includes(c));
  const merged = [...scanBuffer, ...existingFiltered];

  ta.value = merged.join("\n");
  ta.scrollTop = 0;

  closeScanner();      // bạn đã có hàm closeScanner global
  triggerSearch();     // gọi tìm kiếm global
}

// Hiển thị buffer panel
export function renderScanBuffer() {
  const box = document.getElementById("scanBufferBox");
  if (!box) return;
  if (!scanBuffer.length) {
    box.innerHTML = `<div class="empty">Chưa có mã nào.</div>`;
    return;
  }
  box.innerHTML = scanBuffer.map((c, i) => `
    <div class="scan-item">
      <span class="code">${c}</span>
      <button class="del" data-idx="${i}">×</button>
    </div>`).join("");
  box.querySelectorAll(".del").forEach(btn => {
    btn.onclick = () => removeFromScanBufferAt(+btn.dataset.idx);
  });
}

// scripts/scanner.js
export function setupScanner({ videoEl, onResult }) {
  let codeReader = null;
  let controls = null;

  async function startScan(deviceId = null) {
    // Dùng @zxing/browser qua ESM CDN cho môi trường thuần browser (không bundler)
    const ZXING_URL = 'https://esm.sh/@zxing/browser@0.0.10';

    if (!window.ZXing) {
      const mod = await import(ZXING_URL);
      // Lưu module lại để tái dùng
      window.ZXing = mod;
    }

    const { BrowserMultiFormatReader } = window.ZXing;
    codeReader = new BrowserMultiFormatReader();


    try {
      if (deviceId) {
        controls = await codeReader.decodeFromVideoDevice(
          deviceId,
          videoEl,
          onScanResult
        );
      } else {
        controls = await codeReader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoEl,
          onScanResult
        );
      }
    } catch (e) {
      console.error('Lỗi startScan:', e);
    }

  }

  function stopScan() {
    try { controls?.stop(); } catch (_) { }
    try { codeReader?.reset(); } catch (_) { }
    try {
      const s = videoEl?.srcObject;
      if (s) {
        s.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
    } catch (_) { }
  }


  return { startScan, stopScan };
}
