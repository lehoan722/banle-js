// =============================
//  QUET MASP MODULE (QR + OCR)
//  VERSION: FINAL – NO FRAME
//  Tối ưu cho iPhone / Safari
//  Tự chọn camera sau (ưu tiên Ultra Wide)
//  Auto-scan QR → fallback auto-OCR
// =============================

(function () {

  //========================
  // GLOBAL STATE
  //========================
  let ZXING = null;
  let codeReader = null;
  let scanControls = null;
  let torchOn = false;
  let track = null;

  let hasQrResult = false;
  let autoOcrTimer = null;
  let ocrRunning = false;

  let currentTargetId = null;
  let currentCallback = null;


  //========================
  // LOAD ZXING ESM
  //========================
  async function ensureZXing() {
    if (ZXING) return ZXING;
    ZXING = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm');
    return ZXING;
  }


  //========================
  // CHỌN CAMERA SAU TỐT NHẤT
  //========================

  function scoreCamera(label = "") {
    const s = label.toLowerCase();
    let score = 0;

    if (s.includes("back") || s.includes("rear") || s.includes("environment")) score += 50;
    if (s.includes("ultra") || s.includes("0.5x") || s.includes("0,5x")) score += 200;
    if (s.includes("tele") || s.includes("zoom") || s.includes("2x") || s.includes("3x")) score -= 150;
    if (s.includes("front")) score -= 300;

    return score;
  }

  async function pickBestCamera() {
    const ZX = await ensureZXing();
    const devices = await ZX.BrowserCodeReader.listVideoInputDevices();
    if (!devices.length) return null;

    devices.sort((a, b) => scoreCamera(b.label) - scoreCamera(a.label));

    return devices[0].deviceId;
  }


  //========================
  // QUILT MÃ (KẾT QUẢ CUỐI)
  //========================
  function applyFinalResult(raw) {
    if (!raw) return;
    const code = String(raw).trim().toUpperCase();

    const input = document.getElementById(currentTargetId);
    if (input) {
      input.value = code;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (typeof currentCallback === "function") currentCallback(code);

    closeScanner();
  }


  //========================
  // PHÂN TÍCH TEXT → MÃ SP (CHO OCR)
  //========================
  function extractMasp(text) {
    if (!text) return null;

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const blacklist = ["shop", "hoàn", "tuyết", "gia", "giá", "price", "vnd", "vnđ", "eur"];

    function isBad(line) {
      const t = line.toLowerCase();
      return blacklist.some(w => t.includes(w));
    }

    for (const line of lines) {
      if (/\s/.test(line)) continue;
      if (line.length < 3 || line.length > 30) continue;
      if (isBad(line)) continue;

      return line; // ứng viên mạnh nhất
    }

    return null;
  }


  //========================
  // ZXING CALLBACK – ƯU TIÊN QR
  //========================
  function onScanResult(result, err) {
    if (result) {
      let text = "";
      let fmt = "";

      try { text = result.getText(); } catch (_) { }
      try { fmt = result.getBarcodeFormat(); } catch (_) { }

      if (!text) return;

      const f = String(fmt).toLowerCase();
      if (f.includes("qr")) {
        hasQrResult = true;
        applyFinalResult(text);
      }
      return;
    }
  }


  //========================
  // BẬT / TẮT ĐÈN
  //========================
  async function toggleTorch() {
    if (!track) return;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });

      const btn = document.getElementById("maspScannerFlash");
      if (btn) btn.textContent = torchOn ? "🔦 Tắt" : "🔦 Đèn";
    } catch (e) {
      const status = document.getElementById("maspScannerStatus");
      if (status) status.textContent = "Thiết bị không hỗ trợ bật đèn.";
      torchOn = false;
    }
  }


  //========================
  // AUTO-OCR
  //========================
  async function ensureTesseract() {
    if (window.Tesseract) return;
    await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  }

  async function captureOCR() {
    if (ocrRunning) return;
    ocrRunning = true;

    const video = document.getElementById("maspScannerVideo");
    const status = document.getElementById("maspScannerStatus");

    status.textContent = "Đang OCR...";

    const canvas = document.createElement("canvas");
    const W = 640, H = 480;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const scale = Math.min(W / vw, H / vh);
    const dw = vw * scale;
    const dh = vh * scale;

    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);

    try {
      await ensureTesseract();
      const { data } = await Tesseract.recognize(canvas, "eng", {
        logger: () => { }
      });

      const masp = extractMasp(data.text || "");
      if (masp) {
        status.textContent = "Nhận diện: " + masp;
        applyFinalResult(masp);
      } else {
        status.textContent = "Không nhận được mã. Thử lại gần hơn.";
      }
    } catch (err) {
      console.error("OCR error:", err);
      status.textContent = "Lỗi OCR.";
    }

    ocrRunning = false;
  }


  //========================
  // KHỞI ĐỘNG CAMERA
  //========================
  async function startScanner(deviceId) {
    await ensureZXing();

    const video = document.getElementById("maspScannerVideo");
    const status = document.getElementById("maspScannerStatus");

    codeReader = new ZXING.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 40
    });

    const constraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      if (deviceId) {
        scanControls = await codeReader.decodeFromVideoDevice(
          deviceId,
          video,
          onScanResult
        );
      } else {
        scanControls = await codeReader.decodeFromConstraints(
          constraints,
          video,
          onScanResult
        );
      }

      const stream = video.srcObject;
      if (stream) track = stream.getVideoTracks()[0];

      // Auto-OCR fallback sau 2.5s nếu không có QR
      clearTimeout(autoOcrTimer);
      hasQrResult = false;

      autoOcrTimer = setTimeout(() => {
        if (!hasQrResult) captureOCR();
      }, 2500);

      status.textContent = "Đưa mã vào camera...";
    } catch (err) {
      console.error("Camera error:", err);
      status.textContent = "Không mở được camera.";
    }
  }


  //========================
  // OPEN / CLOSE MODAL
  //========================
  async function openScannerInternal(targetId, callback) {
    currentTargetId = targetId;
    currentCallback = callback;

    const modal = document.getElementById("maspScannerModal");
    modal.style.display = "flex";

    const status = document.getElementById("maspScannerStatus");
    status.textContent = "Đang mở camera...";

    try {
      await ensureZXing();

      // Safari yêu cầu "mồi" để lộ label camera
      try {
        const pre = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }
        });
        pre.getTracks().forEach(t => t.stop());
      } catch (_) { }

      const best = await pickBestCamera();
      await startScanner(best);
    } catch (e) {
      console.error("openScanner error:", e);
      status.textContent = "Lỗi mở camera.";
    }
  }

  async function closeScanner() {
    const modal = document.getElementById("maspScannerModal");
    modal.style.display = "none";

    try { await scanControls?.stop?.(); } catch (_) { }
    try { track?.stop?.(); } catch (_) { }

    const v = document.getElementById("maspScannerVideo");
    if (v) v.srcObject = null;

    torchOn = false;
    ocrRunning = false;
    hasQrResult = false;
  }


  //========================
  // GẮN SỰ KIỆN NÚT
  //========================
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("maspScannerClose").addEventListener("click", closeScanner);
    document.getElementById("maspScannerFlash").addEventListener("click", toggleTorch);
    document.getElementById("maspScannerOcr").addEventListener("click", captureOCR);
  });


  //========================
  // API PUBLIC
  //========================
  window.MaspScanner = {
    openForInput(targetId, options = {}) {
      const cb = options.onResult;
      openScannerInternal(targetId, cb);
    },
    close() {
      closeScanner();
    }
  };

})();
