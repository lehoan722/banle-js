import { supabase, startSessionKeeper } from './supabaseClient.js';
import { playSuccessBeep, playAlertBeep, setupBeepUnlockOnce } from './soundBeep.js';
import {
  khoiTaoDangNhapDungChung,
  getCurrentUserInfo
} from './authModule.js';

if (typeof window !== 'undefined') window.supabase = supabase;
startSessionKeeper();

let hot = null;
let currentSessionId = null;
let currentSessionCode = '';
let currentSessionName = '';
let currentSessionStatus = '';
let currentCoSo = 'cs1';
let currentManv = '';
let currentTenNv = '';
let isAdmin = false;
let rows = [];
let selectedRowIndex = -1;
let selectedSessionId = null;
let isDraftNewSession = false;
let scanBusy = false;
let cachedSizeSuffixes = null;

const $ = (id) => document.getElementById(id);
const normalizeMasp = (v) => String(v || '').trim().toUpperCase();
const normalizeText = (v) => String(v || '').trim();
const normalizeLocation = (v) => String(v || '').trim().toUpperCase();

function normalizeDisplayPosition(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isDisplayPositionMatched(standardPosition, currentPosition) {
  const current = normalizeDisplayPosition(currentPosition);
  const standardRaw = normalizeText(standardPosition);

  // Chưa có vị trí chuẩn thì chưa kết luận là sai vị trí.
  if (!standardRaw) return true;
  if (!current) return false;

  // Hỗ trợ trường hợp danh mục có nhiều vị trí chuẩn, cách nhau bởi dấu phẩy/chấm phẩy/xuống dòng.
  const allowed = standardRaw
    .split(/[,;\n]+/)
    .map(normalizeDisplayPosition)
    .filter(Boolean);

  return allowed.includes(current);
}

function isWrongDisplayPosition(row) {
  return !!row && !isDisplayPositionMatched(row.vitri_chuan, row.vitri_hientai);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playTripleAlertBeep() {
  for (let i = 0; i < 3; i++) {
    try { playAlertBeep(); } catch (_) {}
    if (i < 2) await sleep(300);
  }
}

function playInsertedBeep() {
  try { playSuccessBeep(); } catch (_) {}
}

function setMessage(text, type = '') {
  const el = $('message');
  if (!el) return;
  el.textContent = text;
  el.className = type;
}

function focusScan(selectAll = false) {
  const el = $('scan-masp');
  if (!el || el.disabled) return;
  el.focus();
  if (selectAll) el.select();
}

function isCompletedSession() {
  return currentSessionStatus === 'HOAN_THANH';
}

function updateHeader() {
  const user = `${currentCoSo.toUpperCase()} · ${currentTenNv || currentManv || 'Người dùng'}`;
  let sessionHtml = isDraftNewSession ? ' · Phiên mới <span class="status-badge status-running">CHƯA LƯU</span>' : ' · Chưa có phiên';
  if (currentSessionCode) {
    const label = currentSessionName || currentSessionCode;
    const code = currentSessionName ? ` <span class="session-code">${currentSessionCode}</span>` : '';
    const badge = isCompletedSession()
      ? '<span class="status-badge status-done">HOÀN THÀNH</span>'
      : '<span class="status-badge status-running">ĐANG KIỂM</span>';
    sessionHtml = ` · ${label}${code} ${badge}`;
  }
  $('session-summary').innerHTML = user + sessionHtml;

  const uniqueCount = new Set(rows.map((r) => normalizeMasp(r.masp)).filter(Boolean)).size;
  $('scan-stats').textContent = `${rows.length} dòng · ${uniqueCount} mã`;
  updatePageMode();
}

function updatePageMode() {
  const completed = isCompletedSession();
  const hasSession = !!currentSessionId;
  const canEdit = hasSession && !completed;
  $('current-location').disabled = completed;
  $('scan-masp').disabled = completed || scanBusy;
  $('btn-complete-session').disabled = !canEdit || rows.length === 0;
  updateDeleteRowButton();
}

function initTable() {
  hot = new Handsontable($('hot'), {
    data: [],
    columns: [
      { data: 'stt', type: 'numeric', width: 65, readOnly: true },
      { data: 'masp', type: 'text', width: 170, readOnly: true },
      { data: 'vitri_chuan', type: 'text', width: 150, readOnly: true },
      { data: 'vitri_hientai', type: 'text', width: 150, readOnly: true },
      { data: 'manv', type: 'text', width: 95, readOnly: true }
    ],
    colHeaders: ['STT', 'Mã sản phẩm', 'Vị trí treo mẫu chuẩn', 'Vị trí hiện tại', 'Mã NV'],
    rowHeaders: false,
    width: '100%',
    height: Math.max(500, window.innerHeight - 230),
    stretchH: 'all',
    manualColumnResize: true,
    columnSorting: false,
    filters: false,
    dropdownMenu: false,
    licenseKey: 'non-commercial-and-evaluation',
    afterSelectionEnd(row) {
      selectedRowIndex = row >= 0 && row < rows.length ? row : -1;
      updateDeleteRowButton();
    },
    afterOnCellMouseDown(event, coords) {
      if (!coords || coords.row < 0 || coords.col !== 1) return;
      const rowData = this.getSourceDataAtRow(coords.row) || {};
      const masp = normalizeMasp(rowData.masp);
      if (!masp) return;

      // Chạm/click cột Mã sản phẩm -> mở StockQuickPopup của đúng mã.
      // Vẫn giữ selection của Handsontable để nút Xóa dòng hoạt động bình thường.
      if (typeof window.stockQuickPopup === 'function') {
        window.stockQuickPopup(masp);
      } else {
        setMessage('StockQuickPopup chưa sẵn sàng. Hãy tải lại trang.', 'warn');
      }
    },
    cells(row) {
      const props = { readOnly: true };
      props.renderer = function (...args) {
        Handsontable.renderers.TextRenderer.apply(this, args);
        const rowData = args[0].getSourceDataAtRow(args[2]) || {};

        // Sai vị trí treo mẫu: ưu tiên nền tím nhạt, kể cả dòng mới nhất ở đầu bảng.
        if (isWrongDisplayPosition(rowData)) {
          args[1].style.background = '#f3e8ff';
          args[1].style.color = '#581c87';
          args[1].style.fontWeight = '700';
          return;
        }

        // Dòng mới nhất bình thường vẫn được nhấn nhẹ như phiên bản trước.
        if (args[2] === 0) {
          args[1].style.background = '#fff5bf';
          args[1].style.fontWeight = '700';
        }
      };
      return props;
    }
  });
}

function renderRows() {
  rows.sort((a, b) => Number(b.stt || 0) - Number(a.stt || 0));
  hot.loadData(rows);
  hot.render();
  updateHeader();
  if (rows.length) hot.scrollViewportTo(0, 0);
}

function updateDeleteRowButton() {
  const btn = $('btn-delete-row');
  if (!btn) return;
  const row = selectedRowIndex >= 0 ? rows[selectedRowIndex] : null;
  btn.disabled = !currentSessionId || isCompletedSession() || !row?.id;
}

function clearRowSelection() {
  selectedRowIndex = -1;
  try { hot?.deselectCell(); } catch (_) {}
  updateDeleteRowButton();
}

function normalizeSizeSuffix(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^SIZE\s*/i, '')
    .replace(/\s+/g, '');
}

async function getSizeSuffixSet() {
  if (cachedSizeSuffixes) return cachedSizeSuffixes;

  const set = new Set([
    '0', '38', '39', '40', '41', '42', '43', '44', '45', '46',
    'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL',
    '2X', '3X', '4X', '5X', '6X'
  ]);

  try {
    const { data, error } = await supabase.from('dm_size').select('size').limit(500);
    if (!error) {
      (data || []).forEach((row) => {
        const raw = normalizeSizeSuffix(row?.size);
        if (!raw) return;
        set.add(raw);
        raw.split(/[,;\/|]+/).map(normalizeSizeSuffix).filter(Boolean).forEach((x) => set.add(x));
      });
    }
  } catch (err) {
    console.warn('[KTBM] Không tải được dm_size, dùng danh sách size dự phòng:', err);
  }

  cachedSizeSuffixes = set;
  return set;
}

async function findCatalogProduct(masp) {
  const code = normalizeMasp(masp);
  if (!code) return null;

  const field = currentCoSo === 'cs2' ? 'treomaucs2' : 'treomaucs1';
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select(`masp,${field}`)
    .eq('masp', code)
    .maybeSingle();

  if (error) throw error;
  if (!data?.masp) return null;

  return {
    masp: normalizeMasp(data.masp),
    vitri_chuan: normalizeText(data[field])
  };
}

async function resolveScannedMasp(rawMasp) {
  const scanned = normalizeMasp(rawMasp);
  if (!scanned) return { ok: false, scanned, masp: '', size: '', product: null };

  const exact = await findCatalogProduct(scanned);
  if (exact) return { ok: true, scanned, masp: exact.masp, size: '', stripped: false, product: exact };

  const underscoreAt = scanned.lastIndexOf('_');
  if (underscoreAt <= 0 || underscoreAt >= scanned.length - 1) {
    return { ok: false, scanned, masp: '', size: '', product: null };
  }

  const baseMasp = normalizeMasp(scanned.slice(0, underscoreAt));
  const suffix = normalizeSizeSuffix(scanned.slice(underscoreAt + 1));
  if (!baseMasp || !suffix) return { ok: false, scanned, masp: '', size: suffix, product: null };

  const validSizes = await getSizeSuffixSet();
  if (!validSizes.has(suffix)) {
    return { ok: false, scanned, masp: '', size: suffix, product: null };
  }

  const base = await findCatalogProduct(baseMasp);
  if (!base) return { ok: false, scanned, masp: '', size: suffix, product: null };

  return {
    ok: true,
    scanned,
    masp: base.masp,
    size: suffix,
    stripped: true,
    product: base
  };
}

function latestDuplicate(masp) {
  const code = normalizeMasp(masp);
  return rows
    .filter((r) => normalizeMasp(r.masp) === code && r.nguon_dong === 'BAY_MAU')
    .sort((a, b) => Number(b.stt || 0) - Number(a.stt || 0))[0] || null;
}

function resetToBlankDraft() {
  currentSessionId = null;
  currentSessionCode = '';
  currentSessionName = '';
  currentSessionStatus = '';
  isDraftNewSession = true;
  rows = [];
  $('current-location').value = '';
  $('scan-masp').value = '';
  clearRowSelection();
  renderRows();
  setMessage('Phiên mới đang ở trạng thái chưa lưu. Phiên chỉ được tạo trong hệ thống khi quét mã hợp lệ đầu tiên.', 'ok');
  setTimeout(() => $('current-location').focus(), 50);
}

async function ensureSession() {
  if (currentSessionId) return true;

  const { data, error } = await supabase.rpc('ktbm_create_session', {
    p_coso: currentCoSo,
    p_manv: currentManv,
    p_tennv: currentTenNv
  });
  if (error) throw error;

  const session = Array.isArray(data) ? data[0] : data;
  if (!session?.id) throw new Error('RPC không trả về phiên kiểm hợp lệ.');

  currentSessionId = session.id;
  currentSessionCode = session.maphien || '';
  currentSessionName = session.ten_phien || '';
  currentSessionStatus = session.trangthai || 'DANG_KIEM';
  isDraftNewSession = false;
  updateHeader();
  return true;
}

function closeNewSessionModal() {
  $('new-session-modal').classList.remove('show');
}

function requestNewSession() {
  if (isCompletedSession() && currentSessionId) {
    $('new-session-modal').classList.add('show');
    setTimeout(() => $('btn-new-clone')?.focus(), 0);
    return;
  }

  if (currentSessionId && rows.length) {
    if (!confirm('Tạo phiên trống mới? Phiên đang kiểm hiện tại đã được lưu tự động và sẽ giữ nguyên dữ liệu.')) return;
  }
  resetToBlankDraft();
}

async function cloneCompletedSession() {
  if (!currentSessionId || !isCompletedSession()) {
    setMessage('Chỉ có thể làm tiếp từ một phiên đã hoàn thành.', 'warn');
    closeNewSessionModal();
    return;
  }

  $('btn-new-clone').disabled = true;
  $('btn-new-blank').disabled = true;
  setMessage(`Đang tạo phiên mới từ ${currentSessionName || currentSessionCode}...`);
  try {
    const sourceName = currentSessionName || currentSessionCode;
    const { data, error } = await supabase.rpc('ktbm_clone_completed_session', {
      p_phien_goc_id: currentSessionId,
      p_manv: currentManv,
      p_tennv: currentTenNv
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.id) throw new Error('Không nhận được phiên mới từ máy chủ.');
    closeNewSessionModal();
    await loadSession(result.id);
    setMessage(`Đã tạo ${result.maphien} làm tiếp từ “${sourceName}”, kế thừa ${Number(result.so_dong || rows.length)} mã. Có thể tiếp tục quét từ STT kế tiếp.`, 'ok');
    setTimeout(() => $('current-location').focus(), 50);
  } catch (err) {
    console.error(err);
    setMessage(`Không tạo được phiên làm tiếp: ${err.message || err}`, 'err');
  } finally {
    $('btn-new-clone').disabled = false;
    $('btn-new-blank').disabled = false;
  }
}

function createBlankFromCompleted() {
  closeNewSessionModal();
  resetToBlankDraft();
}

async function insertScanRow(payload) {
  if (isCompletedSession()) throw new Error('Phiên đã hoàn thành và đang ở chế độ chỉ xem.');

  let inserted;

  if (!currentSessionId) {
    // Lần quét đầu tiên tạo PHIÊN + DÒNG ĐẦU trong cùng một RPC/transaction.
    // Vì vậy không thể phát sinh phiên 0 dòng nếu người dùng chỉ bấm "Tạo phiên mới" rồi thoát.
    const { data, error } = await supabase.rpc('ktbm_create_session_with_first_row', {
      p_coso: currentCoSo,
      p_masp: payload.masp,
      p_vitri_chuan: payload.vitri_chuan,
      p_vitri_hientai: payload.vitri_hientai,
      p_manv: currentManv,
      p_tennv: currentTenNv
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.session?.id || !result?.row?.id) throw new Error('Không nhận được phiên/dòng đầu tiên từ máy chủ.');

    currentSessionId = result.session.id;
    currentSessionCode = result.session.maphien || '';
    currentSessionName = result.session.ten_phien || '';
    currentSessionStatus = result.session.trangthai || 'DANG_KIEM';
    isDraftNewSession = false;
    inserted = result.row;
  } else {
    const { data, error } = await supabase.rpc('ktbm_add_scan_row', {
      p_phien_id: currentSessionId,
      p_masp: payload.masp,
      p_vitri_chuan: payload.vitri_chuan,
      p_vitri_hientai: payload.vitri_hientai,
      p_manv: currentManv,
      p_tennv: currentTenNv,
      p_nguon_dong: 'BAY_MAU'
    });
    if (error) throw error;
    inserted = Array.isArray(data) ? data[0] : data;
  }

  if (!inserted?.id) throw new Error('Không nhận được dòng vừa lưu từ máy chủ.');

  rows.unshift({
    id: inserted.id,
    stt: Number(inserted.stt),
    masp: normalizeMasp(inserted.masp),
    vitri_chuan: normalizeText(inserted.vitri_chuan),
    vitri_hientai: normalizeText(inserted.vitri_hientai),
    manv: normalizeMasp(inserted.manv),
    tennv: normalizeText(inserted.tennv),
    nguon_dong: inserted.nguon_dong || 'BAY_MAU',
    created_at: inserted.created_at || ''
  });

  renderRows();

  const wrongPosition = isWrongDisplayPosition({
    vitri_chuan: inserted.vitri_chuan,
    vitri_hientai: inserted.vitri_hientai
  });

  if (wrongPosition) {
    try { playAlertBeep(); } catch (_) {}
    setMessage(
      `Cảnh báo: ${payload.masp} đang ở ${payload.vitri_hientai} nhưng vị trí treo mẫu chuẩn là ${normalizeText(inserted.vitri_chuan) || 'chưa thiết lập'} · STT ${inserted.stt}.`,
      'warn'
    );
  } else {
    playInsertedBeep();
    setMessage(`Đã thêm ${payload.masp} tại ${payload.vitri_hientai} · STT ${inserted.stt}.`, 'ok');
  }
}

async function handleScan() {
  if (scanBusy) return;
  if (isCompletedSession()) {
    setMessage('Phiên đã hoàn thành và được khóa. Bấm Tạo phiên mới để làm tiếp từ phiên này hoặc bắt đầu phiên trống.', 'warn');
    return;
  }

  const vitri = normalizeLocation($('current-location').value);
  const scannedMasp = normalizeMasp($('scan-masp').value);

  if (!vitri) {
    setMessage('Bạn phải nhập vị trí hiện tại trước khi quét.', 'warn');
    await playTripleAlertBeep();
    $('current-location').focus();
    return;
  }
  if (!scannedMasp) return;

  scanBusy = true;
  $('scan-masp').disabled = true;
  try {
    // Kiểm tra mã trước khi tạo phiên. Mã sai/trùng không làm phát sinh phiên 0 dòng.
    const resolved = await resolveScannedMasp(scannedMasp);
    if (!resolved.ok) {
      setMessage(`Mã ${scannedMasp} không tồn tại trong danh mục hàng hóa.`, 'err');
      await playTripleAlertBeep();
      $('scan-masp').value = '';
      return;
    }

    const payload = {
      scanned: scannedMasp,
      masp: resolved.masp,
      vitri_chuan: normalizeText(resolved.product?.vitri_chuan),
      vitri_hientai: vitri
    };

    const duplicatedRow = latestDuplicate(payload.masp);
    if (duplicatedRow) {
      $('scan-masp').value = '';
      await playTripleAlertBeep();
      setMessage(
        `Sản phẩm ${payload.masp} đã có trong phiên tại STT ${duplicatedRow.stt}${duplicatedRow.vitri_hientai ? ` · vị trí ${duplicatedRow.vitri_hientai}` : ''}. Không thêm lại mã trùng.`,
        'warn'
      );
      return;
    }

    // Lần quét hợp lệ đầu tiên sẽ tự tạo phiên + dòng đầu tiên trong cùng transaction.
    await insertScanRow(payload);
    $('scan-masp').value = '';
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || err || '');
    if (msg.includes('Mã sản phẩm đã có trong phiên')) {
      setMessage(msg, 'warn');
    } else {
      setMessage(`Quét/lưu dữ liệu thất bại: ${msg}`, 'err');
    }
    await playTripleAlertBeep();
  } finally {
    scanBusy = false;
    $('scan-masp').disabled = false;
    setTimeout(() => focusScan(), 0);
  }
}

async function deleteSelectedRow() {
  if (isCompletedSession()) {
    setMessage('Phiên đã hoàn thành nên không thể xóa từng dòng.', 'warn');
    return;
  }
  const row = selectedRowIndex >= 0 ? rows[selectedRowIndex] : null;
  if (!currentSessionId || !row?.id) {
    setMessage('Hãy chọn một dòng cần xóa trước.', 'warn');
    return;
  }

  if (!confirm(`Xóa STT ${row.stt} · ${row.masp}${row.vitri_hientai ? ' · ' + row.vitri_hientai : ''}?`)) {
    setTimeout(() => focusScan(), 0);
    return;
  }

  $('btn-delete-row').disabled = true;
  try {
    const { data, error } = await supabase.rpc('ktbm_delete_scan_row', {
      p_phien_id: currentSessionId,
      p_row_id: row.id,
      p_manv: currentManv
    });
    if (error) throw error;

    rows = rows.filter((x) => x.id !== row.id);
    clearRowSelection();
    renderRows();
    setMessage(`Đã xóa STT ${row.stt} · ${row.masp}.`, 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Không xóa được dòng: ${err.message || err}`, 'err');
  } finally {
    updateDeleteRowButton();
    setTimeout(() => focusScan(), 0);
  }
}

async function listSessions() {
  const { data, error } = await supabase.rpc('ktbm_list_sessions', { p_coso: currentCoSo });
  if (error) throw error;
  return data || [];
}

async function openSessionList() {
  setMessage('Đang tải danh sách phiên kiểm...');
  try {
    const sessions = await listSessions();
    const list = $('session-list');
    list.innerHTML = '';

    if (!sessions.length) {
      list.textContent = 'Chưa có phiên kiểm nào tại cơ sở này.';
    } else {
      sessions.forEach((s) => {
        const el = document.createElement('div');
        el.className = 'session-item';
        el.dataset.id = s.id;
        el.innerHTML = `
          ${isAdmin ? '<div style="display:flex;gap:8px;align-items:flex-start"><input class="session-delete-radio" type="radio" name="ktbm-session-delete" style="width:20px;min-height:20px;margin:1px 0 0"><div style="flex:1">' : ''}
          <div class="session-title">${s.ten_phien || s.maphien || ''}${s.trangthai === 'HOAN_THANH' ? ' <span class="status-badge status-done">HOÀN THÀNH</span>' : ' <span class="status-badge status-running">ĐANG KIỂM</span>'}</div>
          ${s.ten_phien ? `<div class="session-code">${s.maphien || ''}</div>` : ''}
          <div class="session-meta">${s.ngay_tao || ''} · ${s.tennv_tao || s.manv_tao || ''} · ${Number(s.so_dong || 0)} dòng${s.ngay_hoan_thanh ? ` · hoàn thành ${s.ngay_hoan_thanh}` : ''}</div>
          ${isAdmin ? '</div></div>' : ''}
        `;

        el.addEventListener('click', (e) => {
          const radio = el.querySelector('.session-delete-radio');
          if (isAdmin && (e.target === radio || e.target.closest('.session-delete-radio'))) {
            e.stopPropagation();
            selectedSessionId = s.id;
            radio.checked = true;
            $('btn-delete-session').disabled = false;
            return;
          }
          loadSession(s.id);
        });
        list.appendChild(el);
      });
    }

    selectedSessionId = null;
    $('session-admin-actions').style.display = isAdmin ? '' : 'none';
    $('btn-delete-session').disabled = true;
    $('session-modal').classList.add('show');
    setMessage(isAdmin ? 'Chạm tên phiên để tải; chọn nút tròn rồi bấm Xóa phiên nếu cần.' : 'Chọn một phiên để tải lại.', 'ok');
  } catch (err) {
    setMessage(`Không tải được danh sách phiên: ${err.message || err}`, 'err');
  }
}

async function deleteSelectedSession() {
  if (!isAdmin) {
    setMessage('Chỉ admin được xóa phiên kiểm.', 'err');
    return;
  }
  if (!selectedSessionId) {
    setMessage('Hãy chọn phiên cần xóa.', 'warn');
    return;
  }

  const selectedEl = document.querySelector(`.session-item[data-id="${selectedSessionId}"]`);
  const sessionName = selectedEl?.querySelector('.session-title')?.textContent?.trim() || 'phiên đã chọn';
  if (!confirm(`Xóa ${sessionName} và toàn bộ dữ liệu trong phiên?\n\nThao tác này không thể hoàn tác.`)) return;

  $('btn-delete-session').disabled = true;
  try {
    const { data, error } = await supabase.rpc('ktbm_admin_delete_session', {
      p_phien_id: selectedSessionId,
      p_manv: currentManv
    });
    if (error) throw error;

    if (currentSessionId === selectedSessionId) {
      currentSessionId = null;
      currentSessionCode = '';
      currentSessionName = '';
      currentSessionStatus = '';
      rows = [];
      clearRowSelection();
      renderRows();
    }

    selectedSessionId = null;
    await openSessionList();
    setMessage(`Đã xóa ${sessionName}.`, 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Không xóa được phiên: ${err.message || err}`, 'err');
    $('btn-delete-session').disabled = false;
  }
}

async function loadSession(id) {
  setMessage('Đang tải phiên kiểm...');
  try {
    const { data, error } = await supabase.rpc('ktbm_load_session', { p_phien_id: id });
    if (error) throw error;

    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload?.id) throw new Error('Không tìm thấy phiên kiểm.');
    if (String(payload.coso || '').toLowerCase() !== currentCoSo) {
      throw new Error('Phiên không thuộc cơ sở đang đăng nhập.');
    }

    currentSessionId = payload.id;
    currentSessionCode = payload.maphien || '';
    currentSessionName = normalizeText(payload.ten_phien);
    currentSessionStatus = payload.trangthai || '';
    isDraftNewSession = false;
    rows = (payload.rows || []).map((r) => ({
      id: r.id,
      stt: Number(r.stt || 0),
      masp: normalizeMasp(r.masp),
      vitri_chuan: normalizeText(r.vitri_chuan),
      vitri_hientai: normalizeText(r.vitri_hientai),
      manv: normalizeMasp(r.manv),
      tennv: normalizeText(r.tennv),
      nguon_dong: r.nguon_dong || 'BAY_MAU',
      created_at: r.created_at || ''
    }));

    clearRowSelection();
    renderRows();
    $('session-modal').classList.remove('show');
    if (isCompletedSession()) {
      $('current-location').value = '';
      setMessage(`Đã tải phiên hoàn thành ${currentSessionName || currentSessionCode}, gồm ${rows.length} dòng. Phiên đang ở chế độ chỉ xem.`, 'ok');
    } else {
      setMessage(`Đã tải ${currentSessionName || currentSessionCode}, gồm ${rows.length} dòng. Có thể tiếp tục quét.`, 'ok');
      setTimeout(() => $('current-location').focus(), 50);
    }
  } catch (err) {
    setMessage(`Không tải được phiên: ${err.message || err}`, 'err');
  }
}

function openCompleteModal() {
  if (!currentSessionId) {
    setMessage('Chưa có phiên để hoàn thành.', 'warn');
    return;
  }
  if (isCompletedSession()) {
    setMessage('Phiên này đã hoàn thành.', 'warn');
    return;
  }
  if (!rows.length) {
    setMessage('Phiên chưa có dữ liệu quét nên chưa thể hoàn thành.', 'warn');
    return;
  }
  $('session-name').value = currentSessionName || '';
  $('complete-modal').classList.add('show');
  setTimeout(() => $('session-name')?.focus(), 0);
}

function closeCompleteModal() {
  $('complete-modal').classList.remove('show');
}

async function completeCurrentSession() {
  const tenPhien = normalizeText($('session-name').value);
  if (!tenPhien) {
    setMessage('Hãy nhập tên phiên kiểm trước khi hoàn thành.', 'warn');
    $('session-name').focus();
    return;
  }

  $('btn-complete-confirm').disabled = true;
  $('btn-complete-cancel').disabled = true;
  try {
    const { data, error } = await supabase.rpc('ktbm_complete_session', {
      p_phien_id: currentSessionId,
      p_ten_phien: tenPhien,
      p_manv: currentManv,
      p_tennv: currentTenNv
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    currentSessionName = normalizeText(result?.ten_phien || tenPhien);
    currentSessionStatus = result?.trangthai || 'HOAN_THANH';
    closeCompleteModal();
    updateHeader();
    clearRowSelection();
    setMessage(`Đã hoàn thành phiên “${currentSessionName}”. Dữ liệu đã được khóa để dùng làm phiên đối chiếu.`, 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Không hoàn thành được phiên: ${err.message || err}`, 'err');
  } finally {
    $('btn-complete-confirm').disabled = false;
    $('btn-complete-cancel').disabled = false;
  }
}

function attachEvents() {
  $('scan-masp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan();
    }
  });

  $('current-location').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('current-location').value = normalizeLocation($('current-location').value);
      focusScan(true);
    }
  });

  $('current-location').addEventListener('blur', () => {
    $('current-location').value = normalizeLocation($('current-location').value);
  });

  $('btn-new-session').addEventListener('click', requestNewSession);
  $('btn-load-session').addEventListener('click', openSessionList);
  $('btn-delete-row').addEventListener('click', deleteSelectedRow);
  $('btn-delete-session').addEventListener('click', deleteSelectedSession);
  $('btn-complete-session').addEventListener('click', openCompleteModal);
  $('btn-complete-confirm').addEventListener('click', completeCurrentSession);
  $('btn-complete-cancel').addEventListener('click', closeCompleteModal);
  $('complete-modal-close').addEventListener('click', closeCompleteModal);
  $('session-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); completeCurrentSession(); }
  });
  $('session-modal-close').addEventListener('click', () => $('session-modal').classList.remove('show'));
  $('btn-new-clone').addEventListener('click', cloneCompletedSession);
  $('btn-new-blank').addEventListener('click', createBlankFromCompleted);
  $('new-session-modal-close').addEventListener('click', closeNewSessionModal);
  $('new-session-modal').addEventListener('click', (e) => {
    if (e.target === $('new-session-modal')) closeNewSessionModal();
  });

  $('session-modal').addEventListener('click', (e) => {
    if (e.target === $('session-modal')) $('session-modal').classList.remove('show');
  });
  $('complete-modal').addEventListener('click', (e) => {
    if (e.target === $('complete-modal')) closeCompleteModal();
  });
}

(function initPage() {
  try { setupBeepUnlockOnce(document); } catch (_) {}
  initTable();
  attachEvents();

  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: false,
    loginApiPath: (cs) => `/api/login-${cs}`,
    onLoginSuccess: async (nhanvien, context) => {
      const info = getCurrentUserInfo();
      currentCoSo = String(context?.diadiem || info.diadiem || 'cs1').trim().toLowerCase();
      currentManv = normalizeMasp(nhanvien?.manv || info.manv);
      currentTenNv = normalizeText(nhanvien?.tennv || info.tennv || currentManv);
      isAdmin = !!(nhanvien?.is_admin || info.is_admin);
      $('session-admin-actions').style.display = 'none';
      updateHeader();
      setMessage('Đăng nhập thành công. Tạo phiên mới hoặc tải phiên cũ để kiểm.', 'ok');
      setTimeout(() => $('current-location').focus(), 80);
    }
  });
})();
