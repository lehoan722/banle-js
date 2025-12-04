// scripts/productCodeScanner.js
// Module mở camera, chụp ảnh nhãn và cố gắng đọc mã sản phẩm
// Ưu tiên: QR → nếu không có QR thì OCR text để tìm mã sản phẩm

// LƯU Ý:
// - Cần load trước 2 thư viện global trong HTML:
//   + jsQR:    window.jsQR
//   + Tesseract: window.Tesseract

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
      const canvas = document.createElement('canvas');
      // Giảm kích thước để xử lý nhanh hơn nhưng vẫn đủ rõ
      const targetWidth = 640;
      const scale = video.videoWidth > targetWidth ? targetWidth / video.videoWidth : 1;
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const masp = await detectMaspFromCanvas(canvas, statusEl);

      if (masp) {
        const maspUpper = String(masp).toUpperCase().trim();
        statusEl.textContent = 'Đã nhận diện mã: ' + maspUpper;
        // Đợi 1 chút cho user kịp nhìn, sau đó đóng overlay
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

// ========== XỬ LÝ ẢNH ==========

async function detectMaspFromCanvas(canvas, statusEl) {
  // 1. Thử đọc QR trước
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
    const result = await window.Tesseract.recognize(canvas, 'eng', {
      logger: () => { } // không spam log
    });

    const rawText = (result && result.data && result.data.text) || '';
    if (!rawText.trim()) return null;

    const maspFromText = extractMaspFromText(rawText);
    return maspFromText || null;
  } catch (err) {
    console.error('Lỗi OCR Tesseract', err);
    return null;
  }
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
    // Chọn match có độ dài hợp lý nhất (tránh quá dài)
    const sorted = matches
      .map(m => m.trim())
      .filter(m => m.length >= 3 && m.length <= 30);
    if (sorted.length > 0) {
      return sorted[0];
    }
  }

  return null;
}

function extractMaspFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let candidates = [];

  for (let line of lines) {
    const upper = line.toUpperCase();

    // Loại bỏ các dòng chắc chắn không phải mã sản phẩm
    if (upper.includes('SHOP') && (upper.includes('HOAN') || upper.includes('HOÀN'))) continue;
    if (upper.includes('GIÁ') || upper.includes('GIA:') || upper.includes('EUR') || upper.includes('VNĐ')) continue;
    if (upper.includes('SIZE') || upper.includes('KÍCH CỠ') || upper.includes('KICH CO')) continue;

    // Tìm các đoạn giống mã
    const matches = upper.match(MASP_REGEX);
    if (matches && matches.length) {
      matches.forEach(m => {
        const trimmed = m.trim();
        if (trimmed.length >= 3 && trimmed.length <= 30) {
          candidates.push(trimmed);
        }
      });
    }
  }

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
          Đưa mã QR hoặc nhãn sản phẩm vào giữa khung rồi bấm CHỤP MÃ.
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
