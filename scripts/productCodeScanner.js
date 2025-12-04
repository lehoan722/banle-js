// scripts/productCodeScanner.js
// Module mở camera, chụp ảnh nhãn và cố gắng đọc mã sản phẩm
// Ưu tiên: QR → nếu không có QR thì OCR text để tìm mã sản phẩm

// YÊU CẦU:
// - HTML đã load 2 thư viện global:
//   <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
//   <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>

let _scannerOverlay = null;
let _scannerStream = null;
let _alreadyInjectedStyle = false;

// worker OCR dùng chung cho nhiều lần scan (để nhanh hơn)
let _maspOcrWorkerPromise = null;

// regex fallback khi cần bắt chuỗi con
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
        }, 300);
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

/**
 * Gọi trước 1 lần sau khi load trang để load sẵn worker OCR (scan sẽ nhanh hơn).
 */
export function preloadMaspOcr() {
  if (!window.Tesseract) return;
  getMaspOcrWorker().catch(() => {});
}

// ========== XỬ LÝ ẢNH ==========

async function detectMaspFromCanvas(canvas, statusEl) {
  // 1. Thử đọc QR trước (rất nhanh, chính xác)
  if (window.jsQR) {
    try {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = window.jsQR(imageData.data, canvas.width, canvas.height);
      if (qr && qr.data) {
        const maspFromQr = extractMaspFromString(qr.data);
        if (maspFromQr) return maspFromQr;
      }
    } catch (err) {
      console.warn('Lỗi decode QR', err);
    }
  } else {
    console.warn('jsQR chưa được load (window.jsQR).');
  }

  // 2. Nếu QR không được thì dùng OCR để đọc chữ
  if (!window.Tesseract) {
    console.warn('Tesseract chưa được load (window.Tesseract).');
    return null;
  }

  statusEl.textContent = 'Đang dùng OCR để đọc chữ trên nhãn...';

  try {
    const worker = await getMaspOcrWorker();

    // Crop vùng trung tâm (tránh dòng "Shop Hoàn Tuyết" phía trên và "Giá" phía dưới)
    const cropCanvas = document.createElement('canvas');
    const cw = canvas.width;
    const ch = canvas.height;

    const cropWidth = Math.floor(cw * 0.9);
    const cropHeight = Math.floor(ch * 0.4);
    const cropX = Math.floor((cw - cropWidth) / 2);
    const cropY = Math.floor((ch - cropHeight) / 2);

    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;

    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const { data } = await worker.recognize(cropCanvas);
    const rawText = (data && data.text) || '';

    if (!rawText.trim()) return null;

    const maspFromText = extractMaspFromText(rawText);
    return maspFromText || null;
  } catch (err) {
    console.error('Lỗi OCR Tesseract', err);
    return null;
  }
}

// ========== WORKER OCR DÙNG CHUNG ==========

async function getMaspOcrWorker() {
  if (_maspOcrWorkerPromise) return _maspOcrWorkerPromise;

  if (!window.Tesseract) {
    throw new Error('Tesseract chưa sẵn sàng.');
  }

  _maspOcrWorkerPromise = (async () => {
    const worker = await window.Tesseract.createWorker({
      logger: () => {} // không spam log
    });
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    // Giới hạn tập ký tự cho giống mã SP → tăng tốc & giảm nhầm
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/-_.',
      preserve_interword_spaces: '0'
    });
    return worker;
  })();

  return _maspOcrWorkerPromise;
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
 * Phân tích toàn bộ text OCR để tìm dòng mã sản phẩm.
 * Ưu tiên: dòng KHÔNG có khoảng trắng, không có "SHOP"/"GIA",
 * độ dài 5–20, có ít nhất 1 chữ số (và thường có chữ).
 */
function extractMaspFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let strongCandidates = [];
  let weakCandidates = [];

  for (let line of lines) {
    const upper = line.toUpperCase();

    // Loại bỏ các dòng chắc chắn không phải mã sản phẩm
    if (upper.includes('SHOP') && (upper.includes('HOAN') || upper.includes('HOÀN'))) continue;
    if (upper.includes('GIA') || upper.includes('GIÁ') || upper.includes('EUR') || upper.includes('VND') || upper.includes('VNĐ')) continue;
    if (upper.includes('SIZE') || upper.includes('KICH CO') || upper.includes('KÍCH CỠ')) continue;

    // 1) ƯU TIÊN CASE MẠNH: dòng không có khoảng trắng, độ dài 5–20, có số
    const noSpace = !/\s/.test(upper);
    const hasDigit = /[0-9]/.test(upper);
    const len = upper.length;

    if (noSpace && hasDigit && len >= 5 && len <= 20) {
      strongCandidates.push(upper);
      continue;
    }

    // 2) CASE YẾU HƠN: bắt chuỗi con bằng regex
    const matches = upper.match(MASP_REGEX);
    if (matches && matches.length) {
      matches.forEach(m => {
        const trimmed = m.trim();
        const l2 = trimmed.length;
        if (l2 >= 3 && l2 <= 30) {
          weakCandidates.push(trimmed);
        }
      });
    }
  }

  // Nếu có candidate mạnh → dùng chúng
  let candidates = strongCandidates.length ? strongCandidates : weakCandidates;
  if (!candidates.length) return null;

  // Nếu có dmhanghoa cache thì ưu tiên mã nào tồn tại
  if (window.sanPhamData && typeof window.sanPhamData === 'object') {
    const validByCatalog = candidates.find(c => window.sanPhamData[c]);
    if (validByCatalog) return validByCatalog;
  }

  // Nếu không có trong catalog, chọn candidate đầu tiên
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
          Đưa mã QR hoặc nhãn sản phẩm (dòng mã như 558008-DNAU) vào giữa khung rồi bấm CHỤP MÃ.
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
