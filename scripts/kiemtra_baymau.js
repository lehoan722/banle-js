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
let currentSessionStatus = '';
let currentCoSo = 'cs1';
let currentManv = '';
let currentTenNv = '';
let rows = [];
let duplicatePending = null;
let scanBusy = false;
let cachedSizeSuffixes = null;

const $ = (id) => document.getElementById(id);
const normalizeMasp = (v) => String(v || '').trim().toUpperCase();
const normalizeText = (v) => String(v || '').trim();
const normalizeLocation = (v) => String(v || '').trim().toUpperCase();

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

function updateHeader() {
  const user = `${currentCoSo.toUpperCase()} · ${currentTenNv || currentManv || 'Người dùng'}`;
  const session = currentSessionCode ? ` · ${currentSessionCode}` : ' · Chưa có phiên';
  $('session-summary').textContent = user + session;

  const uniqueCount = new Set(rows.map((r) => normalizeMasp(r.masp)).filter(Boolean)).size;
  $('scan-stats').textContent = `${rows.length} dòng · ${uniqueCount} mã`;
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
    cells(row) {
      const props = { readOnly: true };
      if (row === 0) {
        props.renderer = function (...args) {
          Handsontable.renderers.TextRenderer.apply(this, args);
          args[1].style.background = '#fff5bf';
          args[1].style.fontWeight = '700';
        };
      }
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

function openDuplicateModal(payload, duplicatedRow) {
  duplicatePending = payload;
  $('duplicate-info').innerHTML = `
    Mã <b>${payload.masp}</b> đã có trong phiên.<br>
    Đã quét gần nhất tại <b>STT ${duplicatedRow.stt}</b>${duplicatedRow.vitri_hientai ? ` · vị trí <b>${duplicatedRow.vitri_hientai}</b>` : ''}.<br><br>
    Bạn vẫn muốn thêm một dòng mới cho mã này?
  `;
  $('duplicate-modal').classList.add('show');
}

function closeDuplicateModal() {
  $('duplicate-modal').classList.remove('show');
  duplicatePending = null;
}

async function ensureSession() {
  if (currentSessionId) return true;
  await createNewSession(false);
  return !!currentSessionId;
}

async function createNewSession(askConfirm = true) {
  if (askConfirm && currentSessionId && !confirm('Tạo phiên mới? Phiên hiện tại đã được lưu tự động và sẽ không mất dữ liệu.')) return;

  $('btn-new-session').disabled = true;
  setMessage('Đang tạo phiên kiểm mới...');
  try {
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
    currentSessionStatus = session.trangthai || 'DANG_KIEM';
    rows = [];
    renderRows();
    setMessage(`Đã tạo ${currentSessionCode}. Nhập vị trí hiện tại rồi quét sản phẩm.`, 'ok');
    $('current-location').focus();
  } catch (err) {
    console.error(err);
    setMessage(`Không tạo được phiên kiểm: ${err.message || err}`, 'err');
  } finally {
    $('btn-new-session').disabled = false;
  }
}

async function insertScanRow(payload) {
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

  const inserted = Array.isArray(data) ? data[0] : data;
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
  playInsertedBeep(); // 1 tiếng tít khi một dòng mới đã được lưu và nhảy vào bảng.
  setMessage(`Đã thêm ${payload.masp} tại ${payload.vitri_hientai} · STT ${inserted.stt}.`, 'ok');
}

async function handleScan() {
  if (scanBusy || $('duplicate-modal').classList.contains('show')) return;

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
    if (!(await ensureSession())) return;

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
      openDuplicateModal(payload, duplicatedRow);
      return;
    }

    await insertScanRow(payload);
    $('scan-masp').value = '';
  } catch (err) {
    console.error(err);
    setMessage(`Quét/lưu dữ liệu thất bại: ${err.message || err}`, 'err');
    await playTripleAlertBeep();
  } finally {
    scanBusy = false;
    $('scan-masp').disabled = false;
    if (!$('duplicate-modal').classList.contains('show')) setTimeout(() => focusScan(), 0);
  }
}

async function confirmDuplicate() {
  if (!duplicatePending) return;
  const payload = duplicatePending;
  $('btn-duplicate-confirm').disabled = true;
  $('btn-duplicate-cancel').disabled = true;
  try {
    await insertScanRow(payload);
    closeDuplicateModal();
  } catch (err) {
    console.error(err);
    setMessage(`Không thêm được mã trùng: ${err.message || err}`, 'err');
    await playTripleAlertBeep();
  } finally {
    $('btn-duplicate-confirm').disabled = false;
    $('btn-duplicate-cancel').disabled = false;
    setTimeout(() => focusScan(), 0);
  }
}

function cancelDuplicate() {
  closeDuplicateModal();
  setMessage('Đã hủy mã trùng. Tiếp tục quét sản phẩm khác.', 'warn');
  setTimeout(() => focusScan(), 0);
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
        el.innerHTML = `
          <div class="session-title">${s.maphien || ''}</div>
          <div class="session-meta">${s.ngay_tao || ''} · ${s.tennv_tao || s.manv_tao || ''} · ${Number(s.so_dong || 0)} dòng · ${s.trangthai || ''}</div>
        `;
        el.addEventListener('click', () => loadSession(s.id));
        list.appendChild(el);
      });
    }

    $('session-modal').classList.add('show');
    setMessage('Chọn một phiên để tải lại.', 'ok');
  } catch (err) {
    setMessage(`Không tải được danh sách phiên: ${err.message || err}`, 'err');
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
    currentSessionStatus = payload.trangthai || '';
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

    renderRows();
    $('session-modal').classList.remove('show');
    setMessage(`Đã tải ${currentSessionCode}, gồm ${rows.length} dòng. Có thể tiếp tục quét.`, 'ok');
    setTimeout(() => $('current-location').focus(), 50);
  } catch (err) {
    setMessage(`Không tải được phiên: ${err.message || err}`, 'err');
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

  $('btn-new-session').addEventListener('click', () => createNewSession(true));
  $('btn-load-session').addEventListener('click', openSessionList);
  $('session-modal-close').addEventListener('click', () => $('session-modal').classList.remove('show'));
  $('btn-duplicate-confirm').addEventListener('click', confirmDuplicate);
  $('btn-duplicate-cancel').addEventListener('click', cancelDuplicate);

  $('session-modal').addEventListener('click', (e) => {
    if (e.target === $('session-modal')) $('session-modal').classList.remove('show');
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
      updateHeader();
      setMessage('Đăng nhập thành công. Tạo phiên mới hoặc tải phiên cũ để kiểm.', 'ok');
      setTimeout(() => $('current-location').focus(), 80);
    }
  });
})();
