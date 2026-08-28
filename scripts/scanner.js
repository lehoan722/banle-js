// scripts/scanner.js
// Bản tối ưu theo timkiemhanghoa333: quét nhanh, ưu tiên camera sau siêu rộng iPhone

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

let ZX = null;

async function ensureZX() {
  if (!ZX) ZX = await import(ZXING_URL);
  return ZX;
}

export function setupScanner({ videoEl, onResult, selectEl, statusEl }) {
  let reader = null;
  let controls = null;
  let currentTrack = null;
  let currentDeviceId = '';
  let lastText = '';
  let lastTime = 0;
  let starting = false;

  // Nút chọn camera hiển thị trực tiếp trên giao diện.
  // Không thay đổi luồng quét; chỉ gọi lại changeCamera() đang có sẵn.
  const ultraBtn = document.getElementById('btnCameraUltra');
  const normalBtn = document.getElementById('btnCameraNormal');
  let ultraDeviceId = '';
  let normalDeviceId = '';

  function updateCameraButtons() {
    if (ultraBtn) {
      const available = !!ultraDeviceId;
      ultraBtn.style.display = available ? '' : 'none';
      if (available) {
        const active = currentDeviceId === ultraDeviceId;
        ultraBtn.style.background = active ? '#1976d2' : '#fff';
        ultraBtn.style.color = active ? '#fff' : '#111';
        ultraBtn.style.border = active ? '2px solid #fff' : '1px solid #aaa';
      }
    }

    if (normalBtn) {
      const available = !!normalDeviceId;
      normalBtn.style.display = available ? '' : 'none';
      if (available) {
        const active = currentDeviceId === normalDeviceId;
        normalBtn.style.background = active ? '#1976d2' : '#fff';
        normalBtn.style.color = active ? '#fff' : '#111';
        normalBtn.style.border = active ? '2px solid #fff' : '1px solid #aaa';
      }
    }
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function normText(s) {
    return String(s || '').trim().toUpperCase();
  }

  function scoreCameraLabel(label = '') {
    const s = String(label || '').toLowerCase();
    let score = 0;

    if (/(back|rear|environment|mặt sau|camera sau)/.test(s)) score += 100;

    if (/(ultra\s*wide|ultrawide|0\.5x|0,5x|0\.5|0,5|cực rộng|siêu rộng)/.test(s)) {
      score += 1000;
    }

    if (/(tele|zoom|2x|3x|chụp xa)/.test(s)) score -= 300;
    if (/(front|trước|mặt trước|facetime)/.test(s)) score -= 1000;

    return score;
  }

  async function listVideoDevices() {
    const ZXING = await ensureZX();

    try {
      await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
    } catch (_) {}

    const devices = await ZXING.BrowserCodeReader.listVideoInputDevices();
    return devices || [];
  }

  async function populateCameraList() {
    const devices = await listVideoDevices();

    // CHỈ GIỮ 2 LỰA CHỌN:
    // 1) Camera sau siêu rộng (nếu trình duyệt công khai riêng camera này)
    // 2) Camera sau thường
    // Không thay đổi bất kỳ logic quét mã nào khác.
    const isFront = (label = '') =>
      /(front|trước|mặt trước|facetime|user)/i.test(String(label));

    const isUltraWide = (label = '') =>
      /(ultra\s*wide|ultrawide|0\.5x|0,5x|0\.5|0,5|cực rộng|siêu rộng)/i.test(String(label));

    const isTele = (label = '') =>
      /(tele|telephoto|zoom|2x|3x|5x|chụp xa)/i.test(String(label));

    const isBack = (label = '') =>
      /(back|rear|environment|mặt sau|camera sau)/i.test(String(label));

    // Ưu tiên đúng camera siêu rộng mặt sau.
    const ultraCandidates = devices
      .filter(d => !isFront(d.label) && isUltraWide(d.label))
      .sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));

    const ultra = ultraCandidates[0] || null;

    // Camera thường: ưu tiên camera mặt sau, loại ultra-wide và tele/zoom.
    let normalCandidates = devices
      .filter(d =>
        !isFront(d.label) &&
        !isUltraWide(d.label) &&
        !isTele(d.label) &&
        isBack(d.label)
      )
      .sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));

    // Một số máy không ghi rõ chữ Back/Rear trong label.
    // Khi đó fallback sang camera không phải trước, không ultra, không tele.
    if (!normalCandidates.length) {
      normalCandidates = devices
        .filter(d =>
          !isFront(d.label) &&
          !isUltraWide(d.label) &&
          !isTele(d.label)
        )
        .sort((a, b) => scoreCameraLabel(b.label) - scoreCameraLabel(a.label));
    }

    const normal = normalCandidates[0] || null;

    ultraDeviceId = ultra?.deviceId || '';
    normalDeviceId = normal?.deviceId || '';

    // Danh sách dùng thực tế: tối đa 2 camera.
    const choices = [];
    if (ultra) {
      choices.push({
        deviceId: ultra.deviceId,
        label: 'Camera siêu rộng'
      });
    }

    if (normal && (!ultra || normal.deviceId !== ultra.deviceId)) {
      choices.push({
        deviceId: normal.deviceId,
        label: 'Camera thường'
      });
    }

    // Fallback cuối cùng: nếu trình duyệt không cho biết nhãn camera rõ ràng,
    // vẫn lấy camera khả dụng đầu tiên để chức năng quét không bị mất.
    if (!choices.length && devices[0]) {
      normalDeviceId = devices[0].deviceId;
      choices.push({
        deviceId: devices[0].deviceId,
        label: 'Camera thường'
      });
    }

    if (selectEl) {
      selectEl.innerHTML = choices.map(d =>
        `<option value="${d.deviceId}">${d.label}</option>`
      ).join('');
    }

    // Mặc định: siêu rộng nếu có; nếu không thì camera thường.
    if (choices[0]) {
      currentDeviceId = choices[0].deviceId;
      if (selectEl) selectEl.value = currentDeviceId;
    }

    updateCameraButtons();

    // startScan() chỉ cần danh sách để biết camera đã được chuẩn bị;
    // trả về choices giúp đúng với dropdown đã lọc.
    return choices;
  }

  async function applyFastCameraSettings() {
    const stream = videoEl?.srcObject;
    currentTrack = stream?.getVideoTracks?.()[0] || null;
    if (!currentTrack) return;

    try {
      await currentTrack.applyConstraints({
        advanced: [
          { focusMode: 'continuous' },
          { exposureMode: 'continuous' }
        ]
      });
    } catch (_) {}
  }

  function handleResult(result) {
    if (!result?.getText) return;

    const text = normText(result.getText());
    if (!text) return;

    const now = Date.now();

    if (text === lastText && now - lastTime < 800) return;

    lastText = text;
    lastTime = now;

    onResult?.(text);
  }

  async function startScan(deviceId = '') {
    if (starting) return;
    starting = true;

    try {
      stopScan();

      setStatus('Đang mở camera...');

      const ZXING = await ensureZX();

      await populateCameraList();

      const useId = deviceId || currentDeviceId || '';

      if (useId) {
        currentDeviceId = useId;
        if (selectEl) selectEl.value = useId;
      }

      reader = new ZXING.BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 25
      });

      if (useId) {
        controls = await reader.decodeFromVideoDevice(
          useId,
          videoEl,
          (result) => handleResult(result)
        );
      } else {
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: false
          },
          videoEl,
          (result) => handleResult(result)
        );
      }

      await applyFastCameraSettings();

      setStatus('Đang quét... đưa mã vào khung');
    } catch (e) {
      console.error('startScan error:', e);
      setStatus('Không mở được camera');
    } finally {
      starting = false;
    }
  }

  function stopScan() {
    try { controls?.stop?.(); } catch (_) {}
    try { reader?.reset?.(); } catch (_) {}

    try {
      const stream = videoEl?.srcObject;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
    } catch (_) {}

    controls = null;
    reader = null;
    currentTrack = null;
    setStatus('');
  }

  async function changeCamera(newDeviceId) {
    if (!newDeviceId || newDeviceId === currentDeviceId) return;
    currentDeviceId = newDeviceId;
    updateCameraButtons();
    stopScan();
    await startScan(newDeviceId);
    updateCameraButtons();
  }

  // Hai nút thao tác nhanh: bấm là đổi ngay, không mở dropdown.
  ultraBtn?.addEventListener('click', () => {
    if (ultraDeviceId) changeCamera(ultraDeviceId);
  });

  normalBtn?.addEventListener('click', () => {
    if (normalDeviceId) changeCamera(normalDeviceId);
  });

  async function toggleTorch() {
    if (!currentTrack) return false;

    try {
      const caps = currentTrack.getCapabilities?.() || {};
      if (!('torch' in caps)) return false;

      const cur = currentTrack.getSettings?.().torch || false;

      await currentTrack.applyConstraints({
        advanced: [{ torch: !cur }]
      });

      return !cur;
    } catch (_) {
      return false;
    }
  }

  async function decodeFromFile(file) {
    if (!file) return;

    const ZXING = await ensureZX();
    const r = new ZXING.BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 25
    });

    const url = URL.createObjectURL(file);

    try {
      const res = await r.decodeFromImageUrl(url);
      handleResult(res);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return {
    startScan,
    stopScan,
    changeCamera,
    toggleTorch,
    decodeFromFile
  };
}
