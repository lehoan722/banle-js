import { setupScanner } from './scanner.js';
import { showFlash, showToast } from './feedback.js';

export function mountProductScanner({
  hostSelector = ".mobile-mini-actions, .top-inputs",
  targetInputId = "masp",
  autoEnter = true,
  buttonText = "📷 Quét"
} = {}) {
  if (document.getElementById("popupScan") == null) {
    const popup = document.createElement("div");
    popup.id = "popupScan";
    popup.style.cssText = "display:none;position:fixed;inset:0;background:#000;z-index:10000;";
    popup.innerHTML = `
      <video id="scanVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video>

      <div style="position:absolute;top:10px;left:10px;right:10px;display:flex;gap:8px;align-items:center;z-index:10001;">
        <select id="cameraSelect" style="flex:1;max-width:50%;padding:6px;border-radius:8px;"></select>
        <button id="flashBtn" type="button" style="padding:6px 10px;border-radius:8px;">🔦 Đèn</button>

        <label style="padding:6px 10px;border-radius:8px;background:white;color:black;">
          Ảnh
          <input id="pickImage" type="file" accept="image/*" capture="environment" hidden>
        </label>

        <span id="scanStatus" style="color:white;font-weight:bold;"></span>
        <button id="btnCloseScan" type="button" style="padding:6px 10px;border-radius:8px;">Đóng</button>
      </div>
    `;
    document.body.appendChild(popup);
  }

  const videoEl = document.getElementById("scanVideo");
  const statusEl = document.getElementById("scanStatus");
  const selectEl = document.getElementById("cameraSelect");
  const flashBtn = document.getElementById("flashBtn");
  const fileInput = document.getElementById("pickImage");
  const popupEl = document.getElementById("popupScan");

  if (!videoEl || !selectEl || !popupEl) {
    console.warn("Thiếu phần tử scanner.");
    return null;
  }

  const scanner = setupScanner({
    videoEl,
    statusEl,
    selectEl,
    onResult: (code) => {
      if (!code) return;

      showFlash?.();
      showToast?.(`✅ Đã quét: ${code}`, "info");
      try { window.soundSuccess?.(); } catch {}

      const input = document.getElementById(targetInputId);
      if (input) {
        input.value = String(code).trim().toUpperCase();

        if (autoEnter) {
          input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
          );
        } else {
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      popupEl.style.display = "none";
      scanner.stopScan();
    }
  });

  let btnScan = document.getElementById("btnScanQuick");
  if (!btnScan) {
    btnScan = document.createElement("button");
    btnScan.textContent = buttonText;
    btnScan.type = "button";
    btnScan.id = "btnScanQuick";

    const host = document.querySelector(hostSelector);
    if (host) host.appendChild(btnScan);
  }

  btnScan.onclick = () => {
    popupEl.style.display = "block";
    scanner.startScan();
  };

  document.getElementById("btnCloseScan").onclick = () => {
    popupEl.style.display = "none";
    scanner.stopScan();
  };

  if (flashBtn) {
    flashBtn.onclick = async () => {
      const on = await scanner.toggleTorch();
      flashBtn.textContent = on ? "🔦 Tắt đèn" : "🔦 Đèn";
    };
  }

  selectEl.onchange = () => scanner.changeCamera(selectEl.value);

  if (fileInput) {
    fileInput.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) scanner.decodeFromFile(f);
    };
  }

  return scanner;
}
