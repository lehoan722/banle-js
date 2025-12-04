// scripts/productCodeScanner.js
// Module mở camera, chụp ảnh nhãn và đọc mã sản phẩm
// Ưu tiên: QR → nếu không có QR thì OCR text để tìm mã sản phẩm

// YÊU CẦU HTML:
//
// <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>

let _scannerOverlay = null;
let _scannerStream = null;
let _alreadyInjectedStyle = false;

const MASP_REGEX = /[A-Z0-9\/_.-]{3,30}/g;

// ========== HÀM PUBLIC ==========

/**
 * Mở UI chụp mã sản phẩm.
 * @param {{ onDetected: (masp: string) => void, onCancel?: () => void }} options
 */
export function openProductCodeScanner(options = {}) {
  const { onDetected, onCancel } = options;
  if (typeof onDetected !== 'function') {
    console.warn('openProductCodeScanner cần truyền onDetected(masp).');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Trình duyệt không hỗ trợ camera (getUserMedia). Vui lòng dùng Chrome/Edge/Firefox mới.');
    if (onCancel) onCancel();
    return;
  }

  injectScannerStyleIfNeeded();
  createOverlay();

  const video = document.getElementById('pcs-video');
  const btnCapture = document.getElementById('pcs-btn-capture');
  const btnClose = document.getElementById('pcs-btn-close');
  const statusEl = document.getElementById('pcs-status');

  // Bật camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  }).then(stream => {
    _scannerStream = stream;
    video.srcObject = stream;
    video.play().catch(() => {});
  }).catch(err => {
    console.error('Lỗi mở camera', err);
    alert('Không mở được camera. Vui lòng kiểm tra quyền truy cập camera.');
    closeScannerOverlay();
    if (onCancel) onCancel();
  });

  btnClose.addEventListener('click', () => {
    closeScannerOverlay();
    if (onCancel) onCancel();
  });

  btnCapture.addEventListener('click', async () => {
    if (!video.videoWidth || !video.videoHeight) {
      statusEl.textContent = 'Camera chưa sẵn sàng, vui lòng đợi 1–2 giây rồi chụp lại.';
      return;
    }

    statusEl.textContent = 'Đang nhận diện mã sản phẩm...';
    btnCapture.disabled = true;

    try {
      // Chụp khung hình
      const canvas = document.createElement('canvas');
      const targetWidth = 800;
      const scale = video.videoWidth > targetWidth ? targetWidth / video.videoWidth : 1;
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const masp = await detectMaspFromCanvas(canvas, statusEl);

      if (masp) {
        const maspUpper = String(masp).toUpperCase().trim();
        statusEl.textContent = 'Đã nhận diện mã: ' + maspUpper;
        setTimeout(() => {
          closeScannerOverlay();
          onDetected(maspUpper);
        }, 250);
      } else {
        statusEl.textContent = 'Không nhận diện được mã, vui lòng đưa nhãn gần hơn và chụp lại.';
        btnCapture.disabled = false;
      }
    } catch (err) {
      console.error('Lỗi detect masp', err);
      statusEl.textContent = 'Có lỗi khi nhận diện mã, vui lòng chụp lại.';
      btnCapture.disabled = false;
    }
  });
}

// ========== XỬ LÝ ẢNH ==========

async function detectMaspFromCanvas(canvas, statusEl) {
  // 1. THỬ QR TRƯỚC – ƯU TIÊN HOÀN TOÀN
  if (window.jsQR) {
    try {
      statusEl.textContent = 'Đang quét QR...';
      const qrData = tryDecodeQr(canvas);
      if (qrData) {
        const maspFromQr = extractMaspFromString(qrData);
        if (maspFromQr) {
          return maspFromQr; // Có QR → dùng luôn, KHÔNG OCR nữa
        }
      }
    } catch (err) {
      console.warn('Lỗi decode QR', err);
    }
  } else {
    console.warn('jsQR chưa được load (window.jsQR).');
  }

  // 2. Nếu QR không đọc được → chuyển sang OCR
  if (!window.Tesseract) {
    console.warn('Tesseract chưa được load (window.Tesseract).');
    return null;
  }

  statusEl.textContent = 'Không thấy QR, đang dùng OCR để đọc chữ trên nhãn (tối đa ~8 giây)...';

  try {
    // Crop vùng trung tâm (tránh dòng "Shop Hoàn Tuyết" ở trên và "Giá" ở dưới)
    const cropCanvas = document.createElement('canvas');
    const cw = canvas.width;
    const ch = canvas.height;

    const cropWidth = Math.floor(cw * 0.9);
    const cropHeight = Math.floor(ch * 0.45);
    const cropX = Math.floor((cw - cropWidth) / 2);
    const cropY = Math.floor((ch - cropHeight) / 2);

    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;

    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Gọi OCR với timeout để tránh treo
    const ocrPromise = window.Tesseract.recognize(cropCanvas, 'eng', {
      logger: () => { /* có thể log % nếu muốn */ }
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timeout')), 8000)
    );

    const result = await Promise.race([ocrPromise, timeoutPromise]);
    const rawText = (result && result.data && result.data.text) || '';

    if (!rawText.trim()) return null;

    const maspFromText = extractMaspFromText(rawText);
    return maspFromText || null;
  } catch (err) {
    console.error('Lỗi OCR Tesseract', err);
    return null;
  }
}

// ========== QUÉT QR 2 LẦN (FULL & THU NHỎ) ==========

function tryDecodeQr(canvas) {
  if (!window.jsQR) return null;

  const ctx = canvas.getContext('2d');

  // Lần 1: quét trên khung gốc
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr1 = window.jsQR(imageData.data, canvas.width, canvas.height);
    if (qr1 && qr1.data) return qr1.data;
  } catch (err) {
    console.warn('QR pass1 error', err);
  }

  // Lần 2: thu nhỏ lại để tăng tương phản / độ sắc nét cho jsQR
  try {
    const maxW = 400;
    const scale = canvas.width > maxW ? maxW / canvas.width : 1;
    const w = Math.floor(canvas.width * scale);
    const h = Math.floor(canvas.height * scale);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = w;
    smallCanvas.height = h;
    const sctx = smallCanvas.getContext('2d');
    sctx.drawImage(canvas, 0, 0, w, h);

    const imageData2 = sctx.getImageData(0, 0, w, h);
    const qr2 = window.jsQR(imageData2.data, w, h);
    if (qr2 && qr2.data) return qr2.data;
  } catch (err) {
    console.warn('QR pass2 error', err);
  }

  return null;
}

// ========== HÀM PHÂN TÍCH MÃ TỪ STRING/TEXT ==========

function extractMaspFromString(str) {
  if (!str) return null;
  const upper = String(str).toUpperCase().trim();

  // Nếu QR chứa đúng 1 mã đơn giản → dùng luôn
  if (/^[A-Z0-9\/_.-]{3,30}$/.test(upper)) {
    return upper;
  }

  // Nếu QR chứa định dạng có dấu | hoặc ; thì lấy token đầu tiên
  const byPipe = upper.split(/[|;]/)[0].trim();
  if (/^[A-Z0-9\/_.-]{3,30}$/.test(byPipe)) {
    return byPipe;
  }

  // Nếu vẫn chưa tìm được, thử regex trên toàn chuỗi
  const matches = upper.match(MASP_REGEX);
  if (matches && matches.length > 0) {
    const sorted = matches
      .map(m => m.trim())
      .filter(m => m.length >= 3 && m.length <= 30);
    if (sorted.length > 0) {
      return sorted[0];
    }
  }

  return null;
}

/**
 * Phân tích text OCR để tìm dòng mã sản phẩm.
 * Tem của bạn:
 *  - Dòng mã: KHÔNG có khoảng trắng, có số + chữ, dài 5–20
 *  - Không chứa "SHOP", "GIA/GIÁ", "SIZE"...
 */
function extractMaspFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let strong = [];
  let weak = [];

  for (let line of lines) {
    const upper = line.toUpperCase();

    // Loại bỏ những dòng chắc chắn không phải mã
    if (upper.includes('SHOP') && (upper.includes('HOAN') || upper.includes('HOÀN'))) continue;
    if (upper.includes('GIÁ') || upper.includes('GIA:') || upper.includes('EUR') || upper.includes('VND') || upper.includes('VNĐ')) continue;
    if (upper.includes('SIZE') || upper.includes('KICH CO') || upper.includes('KÍCH CỠ')) continue;

    const noSpace = !/\s/.test(upper);
    const hasDigit = /[0-9]/.test(upper);
    const len = upper.length;

    // 1) Ưu tiên mạnh: dòng không có khoảng trắng, có số, dài 5–20
    if (noSpace && hasDigit && len >= 5 && len <= 20) {
      strong.push(upper);
      continue;
    }

    // 2) Bắt chuỗi con bằng regex (yếu hơn)
    const matches = upper.match(MASP_REGEX);
    if (matches && matches.length) {
      matches.forEach(m => {
        const t = m.trim();
        const l2 = t.length;
        if (l2 >= 3 && l2 <= 30) weak.push(t);
      });
    }
  }

  let candidates = strong.length ? strong : weak;
  if (!candidates.length) return null;

  // Nếu có dmhanghoa cache thì ưu tiên mã nào tồn tại
  if (window.sanPhamData && typeof window.sanPhamData === 'object') {
    const valid = candidates.find(c => window.sanPhamData[c]);
    if (valid) return valid;
  }

  // Nếu không có trong catalog, lấy candidate đầu tiên
  return candidates[0];
}

// ========== UI OVERLAY & STYLE ==========

function createOverlay() {
  closeScannerOverlay(); // Xóa cái cũ nếu còn

  const overlay = document.createElement('div');
  overlay.id = 'pcs-overlay';
  overlay.innerHTML = `
    <div class="pcs-backdrop">
      <div class="pcs-dialog">
        <div class="pcs-title">Chụp mã sản phẩm</div>
        <video id="pcs-video" autoplay playsinline class="pcs-video"></video>
        <div class="pcs-actions">
          <button id="pcs-btn-capture" class="pcs-btn pcs-btn-primary">CHỤP MÃ</button>
          <button id="pcs-btn-close" class="pcs-btn pcs-btn-secondary">ĐÓNG</button>
        </div>
        <div id="pcs-status" class="pcs-status">
          Đưa mã QR hoặc nhãn (dòng như 558008-DNAU) vào giữa khung rồi bấm CHỤP MÃ.
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _scannerOverlay = overlay;
}

function closeScannerOverlay() {
  if (_scannerStream) {
    _scannerStream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) { }
    });
    _scannerStream = null;
  }
  if (_scannerOverlay && _scannerOverlay.parentNode) {
    _scannerOverlay.parentNode.removeChild(_scannerOverlay);
  }
  _scannerOverlay = null;
}

function injectScannerStyleIfNeeded() {
  if (_alreadyInjectedStyle) return;
  _alreadyInjectedStyle = true;

  const style = document.createElement('style');
  style.textContent = `
    #pcs-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
    }
    .pcs-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pcs-dialog {
      background: #111827;
      color: #f9fafb;
      border-radius: 10px;
      padding: 10px;
      width: 90%;
      max-width: 420px;
      box-sizing: border-box;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pcs-title {
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 4px;
    }
    .pcs-video {
      width: 100%;
      max-height: 260px;
      background: #000;
      border-radius: 6px;
      object-fit: cover;
    }
    .pcs-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .pcs-btn {
      flex: 1 1 0;
      padding: 6px 4px;
      border-radius: 4px;
      border: none;
      font-size: 13px;
      cursor: pointer;
    }
    .pcs-btn-primary {
      background: #22c55e;
      color: #052e16;
      font-weight: 600;
    }
    .pcs-btn-secondary {
      background: #4b5563;
      color: #f3f4f6;
    }
    .pcs-btn:disabled {
      opacity: 0.7;
      cursor: default;
    }
    .pcs-status {
      font-size: 12px;
      color: #e5e7eb;
      margin-top: 4px;
      min-height: 18px;
      text-align: left;
    }
  `;
  document.head.appendChild(style);
}
