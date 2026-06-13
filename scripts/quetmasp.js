// =============================
// QUET MASP MODULE - dùng cùng kỹ thuật với main.js
// Phụ thuộc: scripts/scanner.js
// API: window.MaspScanner.openForInput("masp", { onResult })
// =============================

(function () {
  "use strict";

  let scannerApi = null;
  let scannerReady = false;
  let currentTargetId = "masp";
  let currentCallback = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function ensureScannerUI() {
    let modal = byId("maspScannerModal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "maspScannerModal";
      modal.style.cssText = `
        display:none;
        position:fixed;
        inset:0;
        background:#000;
        z-index:99999;
        align-items:center;
        justify-content:center;
        flex-direction:column;
      `;

      modal.innerHTML = `
        <video id="maspScannerVideo" autoplay playsinline
          style="width:100%;height:100%;object-fit:cover;"></video>

        <div style="
          position:absolute;
          top:10px;
          left:10px;
          right:10px;
          display:flex;
          gap:8px;
          align-items:center;
          z-index:100000;
          flex-wrap:wrap;
        ">
          <button id="maspScannerClose" type="button"
            style="padding:8px 12px;border:none;border-radius:8px;font-weight:bold;">
            Đóng
          </button>

          <select id="maspScannerCameraSelect"
            style="max-width:190px;padding:8px;border-radius:8px;font-weight:bold;">
          </select>

          <button id="maspScannerFlash" type="button"
            style="padding:8px 12px;border:none;border-radius:8px;font-weight:bold;">
            🔦 Đèn
          </button>

          <label style="
            padding:8px 12px;
            border:none;
            border-radius:8px;
            font-weight:bold;
            background:white;
            color:black;
          ">
            Ảnh
            <input id="maspScannerPickImage" type="file" accept="image/*" capture="environment" hidden>
          </label>

          <div id="maspScannerStatus"
            style="color:white;font-weight:bold;background:rgba(0,0,0,.45);padding:6px 10px;border-radius:8px;">
            Đưa mã vào camera...
          </div>
        </div>
      `;

      document.body.appendChild(modal);
    }

    // Nếu HTML cũ chưa có select/file thì tự thêm ẩn để setupScanner dùng được
    if (!byId("maspScannerCameraSelect")) {
      const select = document.createElement("select");
      select.id = "maspScannerCameraSelect";
      select.style.display = "none";
      modal.appendChild(select);
    }

    if (!byId("maspScannerPickImage")) {
      const input = document.createElement("input");
      input.id = "maspScannerPickImage";
      input.type = "file";
      input.accept = "image/*";
      input.capture = "environment";
      input.style.display = "none";
      modal.appendChild(input);
    }
  }

  async function initScannerOnce() {
    if (scannerReady && scannerApi) return scannerApi;

    ensureScannerUI();

    const mod = await import("./scanner.js");

    const videoEl = byId("maspScannerVideo");
    const statusEl = byId("maspScannerStatus");
    const selectEl = byId("maspScannerCameraSelect");
    const flashBtn = byId("maspScannerFlash");
    const fileInput = byId("maspScannerPickImage");
    const closeBtn = byId("maspScannerClose");

    scannerApi = mod.setupScanner({
      videoEl,
      statusEl,
      selectEl,
      onResult: (code) => {
        if (!code) return;

        const finalCode = String(code).trim().toUpperCase();

        const input = byId(currentTargetId);
        if (input) {
          input.value = finalCode;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }

        try {
          window.soundSuccess?.();
        } catch (_) {}

        if (typeof currentCallback === "function") {
          currentCallback(finalCode);
        }

        closeScanner();
      }
    });

    closeBtn.onclick = closeScanner;

    flashBtn.onclick = async () => {
      const on = await scannerApi.toggleTorch();
      flashBtn.textContent = on ? "🔦 Tắt đèn" : "🔦 Đèn";
    };

    selectEl.onchange = () => {
      scannerApi.changeCamera(selectEl.value);
    };

    fileInput.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) scannerApi.decodeFromFile(f);
    };

    scannerReady = true;
    return scannerApi;
  }

  async function openScannerInternal(targetId, callback) {
    currentTargetId = targetId || "masp";
    currentCallback = callback || null;

    const api = await initScannerOnce();

    const modal = byId("maspScannerModal");
    const status = byId("maspScannerStatus");

    if (status) status.textContent = "Đang mở camera sau...";
    if (modal) modal.style.display = "flex";

    // Đây là đúng cách của main.js: để setupScanner tự chọn camera sau / Ultra Wide nếu có
    api.startScan();
  }

  function closeScanner() {
    const modal = byId("maspScannerModal");
    if (modal) modal.style.display = "none";

    try {
      scannerApi?.stopScan?.();
    } catch (_) {}
  }

  window.MaspScanner = {
    openForInput(targetId, options = {}) {
      openScannerInternal(targetId, options.onResult);
    },
    close() {
      closeScanner();
    }
  };
})();
