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
