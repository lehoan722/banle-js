// scripts/quetmasp.js
// Module quét mã sản phẩm dùng chung cho nhiều trang
// ƯU TIÊN:
// 1) Quét QR bằng ZXing (rất nhanh)
// 2) Nếu không có QR thì fallback sang OCR đọc mã sản phẩm (dòng không có khoảng trắng, không chứa "SHOP", "GIA")

(function () {
  // ======= STATE & BIẾN DÙNG CHUNG =======
  let ZXING = null;
  let codeReader = null;
  let scanControls = null;
  let torchOn = false;
  let track = null;

  let hasQrResult = false;
  let autoOcrTimer = null;
  let ocrRunning = false;

  let currentTargetInputId = null;
  let currentOnResult = null;

  // ======= ZXING – LOAD ESM TỪ CDN =======
  async function ensureZXing() {
    if (ZXING) return;
    ZXING = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm');
  }

  // ======= ƯU TIÊN CAMERA SAU / ULTRA WIDE (giống 333) =======
  function scoreCameraLabel(label = '') {
    const s = label.toLowerCase();
    let score = 0;

    // Ưu tiên camera sau
    if (/(back|rear|mặt sau|environment)/.test(s)) score += 50;

    // Ưu tiên cao nhất: cực rộng / ultra wide / 0.5x
    if (/(cực rộng|siêu rộng|ultra\s*wide|0\.5x|0,5x|0\.5|0,5)/.test(s)) score += 200;

    // Tránh tele
    if (/(tele|chụp xa|zoom|2x|3x)/.test(s)) score -= 120;

    // Tránh camera trước
    if (/(front|trước|mặt trước)/.test(s)) score -= 200;

    return score;
  }

  async function pickBestBackCamera() {
    await ensureZXing();
    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    if (!devices || !devices.length) return undefined;
    devices.sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
    return devices[0].deviceId;
  }

  // ======= HÀM XỬ LÝ KẾT QUẢ CUỐI CÙNG (MÃ SP) =======
  function useFinalMasp(maspRaw) {
    if (!maspRaw) return;

    const masp = String(maspRaw).trim().toUpperCase();
    const input = currentTargetInputId
      ? document.getElementById(currentTargetInputId)
      : null;

    if (input) {
      input.value = masp;
      // Bắn change để trang đích xử lý onMaspSelected nếu có
      const ev = new Event('change', { bubbles: true });
      input.dispatchEvent(ev);
    }

    if (typeof currentOnResult === 'function') {
      try {
        currentOnResult(masp);
      } catch (e) {
        console.error('[quetmasp] Lỗi callback onResult:', e);
      }
    }

    closeScannerInternal();
  }

  // ======= HÀM PHÂN TÍCH TEXT → CHỌN DÒNG LÀ MÃ SP (CHO OCR) =======
  function extractMaspFromOcrText(text) {
    if (!text) return null;
    const lines = String(text)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    // ƯU TIÊN: dòng không có khoảng trắng, độ dài vừa phải, không chứa SHOP / GIA / PRICE...
    const blacklist = ['shop', 'hoàn', 'hoan', 'tuyet', 'tuyết', 'gia', 'giá', 'price', '€', 'vnd'];
    const isBadLine = (line) => {
      const lower = line.toLowerCase();
      return blacklist.some(w => lower.includes(w));
    };

    let best = null;

    for (const line of lines) {
      // Bỏ dòng có khoảng trắng
      if (/\s/.test(line)) continue;

      const len = line.length;
      if (len < 3 || len > 30) continue;

      if (isBadLine(line)) continue;

      // Đã qua hết filter → coi là ứng viên rất mạnh
      best = line;
      break;
    }

    return best;
  }

  // ======= ZXING CALLBACK – CHỈ NHẬN QR =======
  function onScanResult(result, err, controls) {
    if (result) {
      let text = '';
      let format = '';

      try {
        text = result.getText ? result.getText() : (result.rawValue || '');
      } catch (_) {
        text = '';
      }
      try {
        format = result.getBarcodeFormat ? String(result.getBarcodeFormat()) : '';
      } catch (_) {
        format = '';
      }

      if (!text) return;

      // CHỈ ƯU TIÊN QR
      const fmtLower = format.toLowerCase();
      if (fmtLower.includes('qr')) {
        hasQrResult = true;
        useFinalMasp(text);
      }
      // Nếu format là mã vạch (EAN, CODE128...), để OCR xử lý, không dùng trực tiếp
      return;
    }

    // lỗi decode thì bỏ qua
    if (err) {
      // console.debug('scan error:', err);
    }
  }

  // ======= START / STOP SCANNER (giống 333, sửa id) =======
  async function startScanner(deviceId) {
    await ensureZXing();
    const videoEl = document.getElementById('maspScannerVideo');
    const status = document.getElementById('maspScannerStatus');

    if (!videoEl || !status) {
      console.error('[quetmasp] Thiếu #maspScannerVideo hoặc #maspScannerStatus');
      return;
    }

    // Giảm delay giữa các lần decode → quét mượt
    codeReader = new ZXING.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 25
    });

    // Constraint nhanh: 720p, environment
    const fastConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };

    try {
      if (deviceId) {
        scanControls = await codeReader.decodeFromVideoDevice(deviceId, videoEl, onScanResult);
      } else {
        scanControls = await codeReader.decodeFromConstraints(fastConstraints, videoEl, onScanResult);
      }

      // Lưu track để bật/tắt torch
      const stream = videoEl.srcObject;
      if (stream) {
        track = stream.getVideoTracks()[0] || null;
      }

      // Thử bật continuous-focus nếu hỗ trợ
      try {
        await track?.applyConstraints?.({
          advanced: [{ focusMode: 'continuous' }]
        });
      } catch (_) { }

      status.textContent = 'Đưa mã QR / tem sản phẩm vào khung hình...';

      // HẸN GIỜ AUTO-OCR nếu sau ~2.5s vẫn chưa có QR
      clearTimeout(autoOcrTimer);
      hasQrResult = false;
      autoOcrTimer = setTimeout(() => {
        if (!hasQrResult) {
          captureAndOcr();
        }
      }, 2500);
    } catch (e) {
      console.error('[quetmasp] startScanner error:', e);
      status.textContent = 'Không mở được camera, hãy kiểm tra quyền.';
    }
  }

  async function stopScanner() {
    try { await scanControls?.stop?.(); } catch (_) { }
    const v = document.getElementById('maspScannerVideo');
    try { track?.stop?.(); } catch (_) { }
    if (v) v.srcObject = null;

    codeReader = null;
    scanControls = null;
    torchOn = false;
    track = null;

    clearTimeout(autoOcrTimer);
    autoOcrTimer = null;
  }

  async function toggleTorch() {
    if (!track) return;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      const btn = document.getElementById('maspScannerFlash');
      if (btn) btn.textContent = torchOn ? '🔦 Tắt đèn' : '🔦 Đèn';
    } catch (e) {
      const status = document.getElementById('maspScannerStatus');
      if (status) status.textContent = 'Thiết bị không hỗ trợ bật đèn.';
      torchOn = false;
    }
  }

  // ======= OCR: CHỤP KHUNG HÌNH HIỆN TẠI VÀ NHẬN DẠNG =======
  async function ensureTesseract() {
    if (window.Tesseract) return;
    // Nếu anh chưa chèn script Tesseract ở HTML thì có thể dynamic import (nhưng tốt nhất là chèn sẵn)
    // Ở đây vẫn thử dynamic import:
    try {
      await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    } catch (e) {
      console.error('[quetmasp] Không load được Tesseract:', e);
      throw e;
    }
  }

  async function captureAndOcr() {
    if (ocrRunning) return;
    ocrRunning = true;

    const status = document.getElementById('maspScannerStatus');
    const video = document.getElementById('maspScannerVideo');
    if (!video) {
      ocrRunning = false;
      return;
    }

    if (status) status.textContent = 'Đang nhận dạng mã từ ảnh...';

    // Tạo canvas tạm
    const canvas = document.createElement('canvas');
    const isLandscape = video.videoWidth >= video.videoHeight;
    const targetW = isLandscape ? 640 : 480;
    const targetH = isLandscape ? 480 : 640;

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    // Vẽ khung hình vào canvas (scale cho vừa)
    const scale = Math.min(targetW / video.videoWidth, targetH / video.videoHeight);
    const drawW = video.videoWidth * scale;
    const drawH = video.videoHeight * scale;
    const offX = (targetW - drawW) / 2;
    const offY = (targetH - drawH) / 2;
    ctx.drawImage(video, offX, offY, drawW, drawH);

    try {
      await ensureTesseract();
      const { data } = await window.Tesseract.recognize(canvas, 'eng', {
        logger: () => { } // bỏ log cho nhẹ
      });

      const masp = extractMaspFromOcrText(data.text || '');
      if (masp) {
        if (status) status.textContent = 'Đã nhận dạng được mã: ' + masp;
        useFinalMasp(masp);
      } else {
        if (status) status.textContent = 'Không tìm thấy mã sản phẩm trên ảnh, thử đưa gần hơn / rõ hơn.';
      }
    } catch (e) {
      console.error('[quetmasp] OCR error:', e);
      if (status) status.textContent = 'Lỗi OCR, vui lòng thử lại.';
    } finally {
      ocrRunning = false;
    }
  }

  // ======= OPEN / CLOSE MODAL =======
  async function openScannerInternal(targetInputId, onResult) {
    currentTargetInputId = targetInputId || null;
    currentOnResult = typeof onResult === 'function' ? onResult : null;

    try { document.activeElement?.blur(); } catch (_) { }

    const modal = document.getElementById('maspScannerModal');
    const status = document.getElementById('maspScannerStatus');

    if (!modal || !status) {
      console.error('[quetmasp] Thiếu DOM modal quét mã (#maspScannerModal / #maspScannerStatus)');
      return;
    }

    Object.assign(modal.style, {
      display: 'flex',
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)'
    });

    status.textContent = 'Đang chuẩn bị camera...';

    try {
      await ensureZXing();

      // Mồi quyền & lộ label camera (giống 333)
      try {
        const pre = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }
        });
        pre.getTracks().forEach(t => t.stop());
      } catch (_) { }

      const bestId = await pickBestBackCamera();
      await startScanner(bestId || null);
    } catch (e) {
      console.error('[quetmasp] openScanner error:', e);
      status.textContent = 'Không mở được camera. Hãy kiểm tra quyền camera / Live Text.';
    }
  }

  async function closeScannerInternal() {
    const modal = document.getElementById('maspScannerModal');
    if (modal) modal.style.display = 'none';
    await stopScanner();
  }

  // ======= GẮN SỰ KIỆN NÚT TRONG MODAL =======
  document.addEventListener('DOMContentLoaded', () => {
    const btnClose = document.getElementById('maspScannerClose');
    const btnFlash = document.getElementById('maspScannerFlash');
    const btnOcr = document.getElementById('maspScannerOcr');

    btnClose?.addEventListener('click', () => {
      closeScannerInternal();
    });

    btnFlash?.addEventListener('click', () => {
      toggleTorch();
    });

    btnOcr?.addEventListener('click', () => {
      captureAndOcr();
    });
  });

  // ======= EXPOSE GLOBAL: MaspScanner =======
  window.MaspScanner = {
    /**
     * Mở scanner cho 1 input mã sản phẩm.
     * @param {string} targetInputId - id của ô input (ví dụ 'masp')
     * @param {object} options
     *   - onResult(masp) (optional): callback khi quét xong
     */
    openForInput(targetInputId, options = {}) {
      const onResult = options.onResult;
      openScannerInternal(targetInputId, onResult);
    },

    // Cho phép trang ngoài chủ động đóng nếu cần
    close() {
      closeScannerInternal();
    },

    // Cho phép trang ngoài bấm: MaspScanner.captureOcr() nếu muốn OCR ngay
    captureOcr() {
      captureAndOcr();
    }
  };
})();
