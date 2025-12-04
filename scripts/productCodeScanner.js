// =========================
//  productCodeScanner.js
//  BẢN NÂNG CẤP FULL POWER
//  => Kết hợp toàn bộ ưu điểm:
//     • Quét QR cực nhanh (bản cũ)
//     • Chọn camera sau thông minh (333)
//     • Auto-chụp khi ảnh rõ
//     • OCR fallback khi không có QR
// =========================

import Tesseract from "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

// ====== DOM modal ======
let modal = null;
let video = null;
let btnClose = null;
let btnFlash = null;
let btnOcr = null;
let statusEl = null;

let stream = null;
let track = null;
let torchSupported = false;
let scanning = false;
let onDetectedCallback = null;

// ====== QR library ======
import jsQR from "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.esm.js";

function createModalIfNeeded() {
    if (modal) return;

    modal = document.createElement("div");
    modal.style = `
        position:fixed;left:0;top:0;width:100%;height:100%;
        background:rgba(0,0,0,0.75);display:none;
        align-items:center;justify-content:center;z-index:99999;
    `;

    modal.innerHTML = `
        <div style="
            background:#111;padding:10px;border-radius:8px;
            max-width:480px;width:92vw;color:white;
            text-align:center;display:flex;flex-direction:column;gap:8px;">
            
            <video id="pcScanVideo" autoplay muted playsinline
                style="width:100%;border-radius:8px;background:black;"></video>

            <div style="display:flex;gap:6px;">
                <button id="pcBtnClose" style="flex:1;padding:6px;">Đóng</button>
                <button id="pcBtnFlash" style="flex:1;padding:6px;">🔦</button>
                <button id="pcBtnOCR" style="flex:1;padding:6px;">OCR</button>
            </div>

            <div id="pcStatus" style="font-size:12px;">Đang khởi tạo camera…</div>
        </div>
    `;

    document.body.appendChild(modal);

    video = modal.querySelector("#pcScanVideo");
    btnClose = modal.querySelector("#pcBtnClose");
    btnFlash = modal.querySelector("#pcBtnFlash");
    btnOcr = modal.querySelector("#pcBtnOCR");
    statusEl = modal.querySelector("#pcStatus");

    btnClose.onclick = closeScanner;
    btnFlash.onclick = toggleTorch;
    btnOcr.onclick = manualOcr;
}

// ====== chọn camera sau ======
async function getBackCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    // ưu tiên các camera có chữ "back" / "environment"
    let back = cams.find(c => /back|environment/i.test(c.label));
    return back ? back.deviceId : (cams[0] ? cams[0].deviceId : null);
}

// ====== bật camera ======
async function startCamera() {
    const deviceId = await getBackCameraId();

    stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId,
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ zoom: 2 }]
        }
    });

    video.srcObject = stream;

    track = stream.getVideoTracks()[0];

    // kiểm tra hỗ trợ torch
    try {
        const caps = track.getCapabilities();
        torchSupported = caps.torch || false;
        btnFlash.style.opacity = torchSupported ? "1" : "0.5";
    } catch (_) {
        torchSupported = false;
        btnFlash.style.opacity = "0.5";
    }
}

// ====== bật/tắt đèn ======
function toggleTorch() {
    if (!track || !torchSupported) return;

    const settings = track.getSettings();
    const newTorch = !settings.torch;

    track.applyConstraints({ advanced: [{ torch: newTorch }] });
}

// ====== đóng ======
function closeScanner() {
    scanning = false;

    if (track) track.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());

    track = null;
    stream = null;

    modal.style.display = "none";
}

// ====== OCR fallback ======
async function runOCR(canvas) {
    statusEl.textContent = "OCR đang xử lý…";

    let result = await Tesseract.recognize(canvas, "eng", {
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-_",
    });

    let text = result.data.text || "";
    text = text.replace(/\s+/g, "").toUpperCase();

    // lọc theo logic mã SP của bạn: không có "SHOP", không có "GIA"
    const lines = result.data.text.split("\n").map(x => x.trim());

    for (let line of lines) {
        const l = line.toUpperCase().replace(/\s+/g, "");
        if (!l) continue;
        if (l.includes("SHOP") || l.includes("GIA")) continue;
        if (/^[A-Z0-9/_-]+$/.test(l)) return l;
    }

    return null;
}

// ====== Manual OCR ======
async function manualOcr() {
    if (!video) return;
    let canvas = captureFrame();

    const code = await runOCR(canvas);
    if (code) {
        onDetected(code);
    } else {
        statusEl.textContent = "Không tìm được mã trong ảnh.";
    }
}

// ====== chụp ảnh để phân tích ======
function captureFrame() {
    let canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    return canvas;
}

// ====== handle detect ======
function onDetected(code) {
    closeScanner();
    if (onDetectedCallback) onDetectedCallback(code);
}

// ====== vòng quét chính ======
async function tick() {
    if (!scanning) return;

    const canvas = captureFrame();
    const ctx = canvas.getContext("2d");
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // ---- Thử đọc QR trước (cực nhanh) ----
    const qr = jsQR(img.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
    if (qr && qr.data) {
        statusEl.textContent = "Đã quét QR!";
        return onDetected(qr.data.trim().toUpperCase());
    }

    // ---- OCR auto-capture ----
    statusEl.textContent = "Đang dò mã bằng OCR…";
    const text = await runOCR(canvas);

    if (text) {
        return onDetected(text);
    }

    // tiếp tục vòng quét
    setTimeout(tick, 300);
}

// ====== mở module ======
export async function openProductCodeScanner(opts = {}) {
    createModalIfNeeded();

    onDetectedCallback = opts.onDetected || null;

    modal.style.display = "flex";
    statusEl.textContent = "Đang mở camera…";

    scanning = true;

    await startCamera();

    statusEl.textContent = "Đang quét…";

    tick(); // bắt đầu vòng quét
}
