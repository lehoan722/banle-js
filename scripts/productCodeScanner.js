// scripts/productCodeScanner.js
// UI B: Auto scan QR từ video, không cần bấm.
// Nếu không có QR -> chuyển OCR: auto chụp khi khung hình ổn định + có nút CHỤP NHÃN (OCR).

// YÊU CẦU:
//  - HTML đã load:
//      <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
//      <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
//  - Gọi: openProductCodeScanner({ onDetected: (masp) => { ... }, onCancel?: () => {} });

let _scannerOverlay = null;
let _scannerStream = null;
let _videoEl = null;
let _statusEl = null;
let _btnCapture = null;
let _btnClose = null;

let _qrScanActive = false;
let _qrFound = false;
let _ocrMode = false;
let _ocrAutoLoopId = null;

const QR_SCAN_INTERVAL_MS = 120;      // tốc độ scan QR
const QR_MAX_TIME_BEFORE_OCR = 2000;  // sau 2s không thấy QR thì chuyển OCR
const OCR_AUTO_INTERVAL_MS = 350;     // kiểm tra ổn định khung 0.35s/lần
const OCR_STABLE_FRAME_COUNT = 3;     // cần 3 lần ổn định liên tiếp

const MASP_REGEX = /[A-Z0-9\/_.-]{3,30}/g;

// =====================================
// API PUBLIC
// =====================================

export function openProductCodeScanner(options = {}) {
  const { onDetected, onCancel } = options;
  if (typeof onDetected !== 'function') {
    console.warn('openProductCodeScanner cần truyền onDetected(masp).');
    return;
  }

  injectScannerStyleIfNeeded();
  createOverlay();

  _videoEl = document.getElementById('pcs-video');
  _statusEl = document.getElementById('pcs-status');
  _btnCapture = document.getElementById('pcs-capture-btn');
  _btnClose = document.getElementById('pcs-close-btn');

  _btnClose.addEventListener('click', () => {
    cleanupScanner();
    if (typeof onCancel === 'function') onCancel();
  });

  _btnCapture.addEventListener('click', () => {
    // user bấm tay để OCR
    manualCaptureForOCR(onDetected);
  });

  startCameraAndScan(onDetected, onCancel);
}

// =====================================
// KHOI ĐỘNG CAMERA + QR AUTO SCAN
// =====================================

async function startCameraAndScan(onDetected, onCancel) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Trình duyệt không hỗ trợ camera (getUserMedia).');
    cleanupScanner();
    if (onCancel) onCancel();
    return;
  }

  _statusEl.textContent = 'Đang mở camera sau...';

  try {
    const bestDeviceId = await getBestBackCameraDeviceId();

    const constraintsList = [];
    if (bestDeviceId) {
      constraintsList.push({ video: { deviceId: { exact: bestDeviceId } } });
    }
    constraintsList.push({ video: { facingMode: { exact: 'environment' } } });
    constraintsList.push({ video: { facingMode: 'environment' } });

    let stream = null;
    for (const c of constraintsList) {
      try {
        // eslint-disable-next-line no-await-in-loop
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (e) {
        // thử constraint khác
      }
    }

    if (!stream) {
      // phương án cuối: không chỉ định gì
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    _scannerStream = stream;
    _videoEl.srcObject = stream;

    _videoEl.onloadedmetadata = () => {
      _videoEl.play().catch(() => {});
      startQrScanLoop(onDetected);
    };
  } catch (err) {
    console.error('Lỗi mở camera', err);
    alert('Không mở được camera. Vui lòng kiểm tra quyền camera.');
    cleanupScanner();
    if (onCancel) onCancel();
  }
}

async function getBestBackCameraDeviceId() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === 'videoinput');

    if (!videos.length) return null;

    // Ưu tiên label chứa "back" / "rear"
    const backLike = videos.find(d => {
      const l = (d.label || '').toLowerCase();
      return l.includes('back') || l.includes('rear');
    });
    if (backLike) return backLike.deviceId;

    // Nếu không có, cứ lấy camera video đầu tiên (thường là camera chính)
    return videos[0].deviceId;
  } catch (err) {
    console.warn('enumerateDevices lỗi:', err);
    return null;
  }
}

// =====================================
// VÒNG LẶP AUTO SCAN QR
// =====================================

function startQrScanLoop(onDetected) {
  if (!window.jsQR) {
    console.warn('jsQR chưa được load.');
    startOcrMode(onDetected);
    return;
  }

  _qrScanActive = true;
  _qrFound = false;
  _ocrMode = false;

  _statusEl.textContent = 'Đưa mã QR vào giữa khung, hệ thống sẽ tự quét...';

  const startTime = Date.now();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const loop = () => {
    if (!_qrScanActive || !_videoEl || _videoEl.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
      if (_qrScanActive) {
        requestAnimationFrame(loop);
      }
      return;
    }

    const elapsed = Date.now() - startTime;

    // Nếu quá thời gian mà chưa thấy QR: chuyển OCR mode
    if (elapsed > QR_MAX_TIME_BEFORE_OCR && !_qrFound && !_ocrMode) {
      startOcrMode(onDetected);
      return;
    }

    const vw = _videoEl.videoWidth;
    const vh = _videoEl.videoHeight;
    if (!vw || !vh) {
      requestAnimationFrame(loop);
      return;
    }

    // cắt một vùng vuông trung tâm để scan QR (nhanh hơn)
    const size = Math.min(vw, vh) * 0.7;
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    const targetSize = 400;
    canvas.width = targetSize;
    canvas.height = targetSize;
    ctx.drawImage(_videoEl, sx, sy, size, size, 0, 0, targetSize, targetSize);

    try {
      const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
      const qr = window.jsQR(imageData.data, targetSize, targetSize);
      if (qr && qr.data) {
        _qrFound = true;
        _qrScanActive = false;

        const maspFromQr = extractMaspFromString(qr.data);
        if (maspFromQr) {
          _statusEl.textContent = 'Đã nhận diện QR: ' + maspFromQr;
          setTimeout(() => {
            const maspUpper = maspFromQr.toUpperCase().trim();
            const cb = onDetected;
            cleanupScanner();
            cb(maspUpper);
          }, 200);
          return;
        } else {
          // Có QR nhưng data không hợp lệ → chuyển OCR
          startOcrMode(onDetected);
          return;
        }
      }
    } catch (err) {
      console.warn('QR decode error:', err);
    }

    // chờ một nhịp
    setTimeout(() => {
      if (_qrScanActive) requestAnimationFrame(loop);
    }, QR_SCAN_INTERVAL_MS);
  };

  requestAnimationFrame(loop);
}

// =====================================
// CHUYỂN SANG OCR MODE
// =====================================

function startOcrMode(onDetected) {
  if (_ocrMode) return;
  _ocrMode = true;
  _qrScanActive = false;

  if (!window.Tesseract) {
    console.warn('Tesseract chưa load, không dùng được OCR.');
    _statusEl.textContent = 'Không thấy QR, và OCR không khả dụng (thiếu Tesseract).';
    document.getElementById('pcs-manual-capture').style.display = 'block';
    return;
  }

  _statusEl.textContent =
    'Không thấy QR. Giữ nhãn ổn định trong khung, hệ thống sẽ tự chụp để đọc mã, hoặc bấm CHỤP NHÃN (OCR).';
  document.getElementById('pcs-manual-capture').style.display = 'block';

  startOcrAutoCaptureLoop(onDetected);
}

function startOcrAutoCaptureLoop(onDetected) {
  stopOcrAutoLoop();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let lastSample = null;
  let stableCount = 0;
  let capturing = false;

  _ocrAutoLoopId = setInterval(async () => {
    if (capturing || !_videoEl || _videoEl.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return;
    }

    const vw = _videoEl.videoWidth;
    const vh = _videoEl.videoHeight;
    if (!vw || !vh) return;

    const sizeW = vw * 0.9;
    const sizeH = vh * 0.45;
    const sx = (vw - sizeW) / 2;
    const sy = (vh - sizeH) / 2;

    const targetW = 600;
    const scale = targetW / sizeW;
    const targetH = Math.floor(sizeH * scale);

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(_videoEl, sx, sy, sizeW, sizeH, 0, 0, targetW, targetH);

    // Lấy mẫu ảnh nhỏ để tính độ thay đổi
    const sampleSize = 40;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleSize;
    sampleCanvas.height = sampleSize;
    const sctx = sampleCanvas.getContext('2d');
    sctx.drawImage(canvas, 0, 0, sampleSize, sampleSize);
    const sampleData = sctx.getImageData(0, 0, sampleSize, sampleSize).data;

    if (!lastSample) {
      lastSample = sampleData;
      stableCount = 0;
      return;
    }

    let diff = 0;
    for (let i = 0; i < sampleData.length; i += 4) {
      const g1 = (lastSample[i] + lastSample[i + 1] + lastSample[i + 2]) / 3;
      const g2 = (sampleData[i] + sampleData[i + 1] + sampleData[i + 2]) / 3;
      diff += Math.abs(g1 - g2);
    }
    const avgDiff = diff / (sampleData.length / 4);

    // Nếu khung hình ít thay đổi → coi như ổn định
    if (avgDiff < 8) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastSample = sampleData;

    if (stableCount >= OCR_STABLE_FRAME_COUNT) {
      // Ảnh đã đủ ổn định → chụp để OCR
      stableCount = 0;
      capturing = true;
      _statusEl.textContent = 'Ảnh ổn định, đang đọc mã từ nhãn...';

      try {
        const masp = await detectMaspFromCanvas(canvas, _statusEl);
        if (masp) {
          const maspUpper = masp.toUpperCase().trim();
          _statusEl.textContent = 'Đã nhận diện mã: ' + maspUpper;
          setTimeout(() => {
            const cb = onDetected;
            cleanupScanner();
            cb(maspUpper);
          }, 250);
        } else {
          _statusEl.textContent = 'Không đọc được mã với OCR tự động. Bạn có thể bấm CHỤP NHÃN (OCR) để thử lại.';
        }
      } catch (err) {
        console.error('OCR auto capture error:', err);
        _statusEl.textContent = 'Lỗi khi dùng OCR tự động, thử lại hoặc bấm CHỤP NHÃN.';
      } finally {
        capturing = false;
      }
    }
  }, OCR_AUTO_INTERVAL_MS);
}

function stopOcrAutoLoop() {
  if (_ocrAutoLoopId) {
    clearInterval(_ocrAutoLoopId);
    _ocrAutoLoopId = null;
  }
}

// =====================================
// CHỤP TAY → OCR
// =====================================

function manualCaptureForOCR(onDetected) {
  if (!_videoEl || _videoEl.readyState !== HTMLMediaElement.HAVE_ENOUGH_DATA) {
    _statusEl.textContent = 'Camera chưa sẵn sàng, vui lòng chờ 1–2 giây rồi bấm lại.';
    return;
  }

  _statusEl.textContent = 'Đang chụp và đọc mã từ nhãn...';

  const vw = _videoEl.videoWidth;
  const vh = _videoEl.videoHeight;

  const sizeW = vw * 0.9;
  const sizeH = vh * 0.45;
  const sx = (vw - sizeW) / 2;
  const sy = (vh - sizeH) / 2;

  const targetW = 800;
  const scale = targetW / sizeW;
  const targetH = Math.floor(sizeH * scale);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = targetW;
  canvas.height = targetH;
  ctx.drawImage(_videoEl, sx, sy, sizeW, sizeH, 0, 0, targetW, targetH);

  detectMaspFromCanvas(canvas, _statusEl)
    .then(masp => {
      if (masp) {
        const maspUpper = masp.toUpperCase().trim();
        _statusEl.textContent = 'Đã nhận diện mã: ' + maspUpper;
        setTimeout(() => {
          const cb = onDetected;
          cleanupScanner();
          cb(maspUpper);
        }, 250);
      } else {
        _statusEl.textContent = 'Không đọc được mã. Hãy chụp gần hơn, rõ hơn, rồi thử lại.';
      }
    })
    .catch(err => {
      console.error('OCR manual error:', err);
      _statusEl.textContent = 'Có lỗi khi OCR, vui lòng thử lại.';
    });
}

// =====================================
// OCR MÃ SẢN PHẨM TỪ CANVAS
// =====================================

async function detectMaspFromCanvas(canvas, statusEl) {
  if (!window.Tesseract) {
    console.warn('Tesseract chưa được load.');
    return null;
  }

  statusEl.textContent = 'Đang dùng OCR để đọc chữ trên nhãn (tối đa ~8 giây)...';

  try {
    const ocrPromise = window.Tesseract.recognize(canvas, 'eng', {
      logger: () => {}
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timeout')), 8000)
    );

    const result = await Promise.race([ocrPromise, timeoutPromise]);
    const rawText = result && result.data && result.data.text ? result.data.text : '';

    if (!rawText.trim()) return null;

    const maspFromText = extractMaspFromText(rawText);
    return maspFromText || null;
  } catch (err) {
    console.error('Lỗi OCR Tesseract', err);
    return null;
  }
}

// =====================================
// XỬ LÝ STRING → MÃ SẢN PHẨM
// =====================================

function extractMaspFromString(str) {
  if (!str) return null;
  const upper = String(str).toUpperCase().trim();

  if (/^[A-Z0-9\/_.-]{3,30}$/.test(upper)) {
    return upper;
  }

  const first = upper.split(/[|;]/)[0].trim();
  if (/^[A-Z0-9\/_.-]{3,30}$/.test(first)) {
    return first;
  }

  const matches = upper.match(MASP_REGEX);
  if (matches && matches.length > 0) {
    const sorted = matches
      .map(m => m.trim())
      .filter(m => m.length >= 3 && m.length <= 30);
    if (sorted.length > 0) return sorted[0];
  }
  return null;
}

function extractMaspFromText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  let strong = [];
  let weak = [];

  for (let line of lines) {
    const upper = line.toUpperCase();

    // Loại bỏ các dòng chắc chắn không phải mã
    if (upper.includes('SHOP') && (upper.includes('HOAN') || upper.includes('HOÀN'))) continue;
    if (upper.includes('GIÁ') || upper.includes('GIA:') || upper.includes('EUR') || upper.includes('VND') || upper.includes('VNĐ')) continue;
    if (upper.includes('SIZE') || upper.includes('KICH CO') || upper.includes('KÍCH CỠ')) continue;

    const noSpace = !/\s/.test(upper);
    const hasDigit = /[0-9]/.test(upper);
    const len = upper.length;

    // Ưu tiên: dòng không khoảng trắng, có số, dài 5–20 (giống 558008-DNAU)
    if (noSpace && hasDigit && len >= 5 && len <= 20) {
      strong.push(upper);
      continue;
    }

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

  // Nếu có cache dmhanghoa → ưu tiên mã tồn tại
  if (window.sanPhamData && typeof window.sanPhamData === 'object') {
    const valid = candidates.find(c => window.sanPhamData[c]);
    if (valid) return valid;
  }

  return candidates[0];
}

// =====================================
// UI & CLEANUP
// =====================================

function createOverlay() {
  closeScannerOverlay(); // xóa nếu đang có

  const wrapper = document.createElement('div');
  wrapper.id = 'pcs-overlay';
  wrapper.innerHTML = `
    <div class="pcs-backdrop">
      <div class="pcs-dialog">
        <div class="pcs-title">Quét mã sản phẩm</div>
        <div class="pcs-video-wrap">
          <video id="pcs-video" autoplay playsinline class="pcs-video"></video>
          <div id="pcs-status" class="pcs-status">
            Đang mở camera...
          </div>
        </div>
        <div id="pcs-manual-capture" class="pcs-manual" style="display:none;">
          <button id="pcs-capture-btn" class="pcs-btn pcs-btn-primary">CHỤP NHÃN (OCR)</button>
        </div>
        <button id="pcs-close-btn" class="pcs-btn pcs-btn-secondary pcs-close">ĐÓNG</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);
  _scannerOverlay = wrapper;
}

function closeScannerOverlay() {
  if (_scannerOverlay && _scannerOverlay.parentNode) {
    _scannerOverlay.parentNode.removeChild(_scannerOverlay);
  }
  _scannerOverlay = null;
}

function cleanupScanner() {
  stopOcrAutoLoop();
  _qrScanActive = false;

  if (_scannerStream) {
    _scannerStream.getTracks().forEach(t => {
      try { t.stop(); } catch (e) {}
    });
    _scannerStream = null;
  }

  closeScannerOverlay();

  _videoEl = null;
  _statusEl = null;
  _btnCapture = null;
  _btnClose = null;
}

function injectScannerStyleIfNeeded() {
  if (document.getElementById('pcs-style')) return;

  const style = document.createElement('style');
  style.id = 'pcs-style';
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
      border-radius: 12px;
      padding: 10px;
      width: 92%;
      max-width: 430px;
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
    .pcs-video-wrap {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
    }
    .pcs-video {
      width: 100%;
      max-height: 260px;
      object-fit: cover;
      display: block;
    }
    .pcs-status {
      font-size: 12px;
      color: #e5e7eb;
      padding: 4px 6px;
      background: rgba(0,0,0,0.5);
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      text-align: left;
    }
    .pcs-manual {
      margin-top: 6px;
      display: flex;
      justify-content: center;
    }
    .pcs-btn {
      padding: 6px 10px;
      border-radius: 6px;
      border: none;
      font-size: 13px;
      cursor: pointer;
    }
    .pcs-btn-primary {
      background: #22c55e;
      color: #052e16;
      font-weight: 600;
      flex: 1 1 0;
    }
    .pcs-btn-secondary {
      background: #4b5563;
      color: #f9fafb;
      margin-top: 4px;
      width: 100%;
    }
    .pcs-close {
      margin-top: 4px;
    }
    .pcs-btn:disabled {
      opacity: 0.7;
      cursor: default;
    }
  `;
  document.head.appendChild(style);
}
