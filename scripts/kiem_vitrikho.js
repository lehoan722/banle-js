import { supabase, startSessionKeeper } from './supabaseClient.js';
import {
  khoiTaoDangNhapDungChung,
  getCurrentUserInfo
} from './authModule.js';
import {
  playSuccessBeep,
  playAlertBeep,
  setupBeepUnlockOnce
} from './soundBeep.js';

if (typeof window !== 'undefined') window.supabase = supabase;
startSessionKeeper();

let hot = null;
let currentSessionId = null;
let currentSessionCode = '';
let currentCoSo = 'cs1';
let currentManv = '';
let currentTenNv = '';
let isAdmin = false;
let isDirty = true;
let tableMode = 'scan';
let selectedRows = new Set();
let lastSavedRowsJson = '[]';
let modalMode = 'load';
let currentAreaName = '';
let currentIsStandard = false;
let currentTaskId = null;
let currentTaskCode = '';
let currentTaskStatus = '';
let currentTaskType = '';
let currentTaskRows = [];
let currentResultRows = [];
let currentResultContext = null;
let currentMultiResultRows = [];
let currentMultiResultContext = null;
let taskRealtimeChannel = null;
let suppressTaskChange = false;

const $ = (id) => document.getElementById(id);
const normalizeMasp = (v) => String(v || '').trim().toUpperCase();
const normalizeText = (v) => String(v || '').trim();

let locationCatalog = [];
async function loadLocationCatalog() {
  const { data, error } = await supabase.rpc('kvt_list_locations', { p_coso: currentCoSo, p_khu_vuc: null });
  if (error) throw error;
  locationCatalog = Array.isArray(data) ? data : [];
  const dl = document.getElementById('warehouse-location-list');
  if (dl) dl.innerHTML = locationCatalog.map(x => `<option value="${String(x.ma_vitri||'').replace(/"/g,'&quot;')}">${x.khu_vuc||''}</option>`).join('');
  const kv = document.getElementById('area-filter');
  if (kv) {
    const areas=[...new Set(locationCatalog.map(x=>String(x.khu_vuc||'').trim()).filter(Boolean))];
    kv.innerHTML='<option value="">Tất cả khu vực</option>'+areas.map(x=>`<option value="${x}">${x}</option>`).join('');
  }
  return locationCatalog;
}
function normalizeLocationCode(v){ return String(v||'').trim().toUpperCase().replace(/\s+/g,''); }
function isValidWarehouseLocation(v){ const n=normalizeLocationCode(v); return locationCatalog.some(x=>normalizeLocationCode(x.ma_vitri)===n); }


function setMessage(text, type = '') {
  const el = $('message');
  el.textContent = text;
  el.className = type;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playTripleAlertBeep() {
  // soundBeep.js khóa beep lỗi trong khoảng 260ms để tránh chồng âm.
  // Chờ 310ms giữa các lần để người dùng nghe rõ đủ 3 tiếng.
  for (let i = 0; i < 3; i += 1) {
    try { playAlertBeep(); } catch (_) { }
    if (i < 2) await wait(310);
  }
}

function focusScan(selectAll = false) {
  const el = $('scan-masp');
  if (!el) return;
  el.focus();
  if (selectAll) el.select();
}

function setDirty(value) {
  isDirty = !!value;
  const state = $('save-state');
  if (!currentSessionId) {
    state.textContent = 'Chưa lưu';
    state.className = '';
  } else if (isDirty) {
    state.textContent = 'Có thay đổi';
    state.className = 'dirty';
  } else {
    state.textContent = 'Đã lưu';
    state.className = 'saved';
  }
  updateActionAvailability();
}

function updateHeader() {
  const who = `${currentCoSo.toUpperCase()} · ${currentTenNv || currentManv || 'Người dùng'}`;
  const phien = currentSessionCode ? ` · ${currentSessionCode}` : ' · Phiên mới';
  const area = currentAreaName ? ` · ${currentAreaName}` : '';
  const standard = currentIsStandard ? ' · CHUẨN' : '';
  $('session-summary').textContent = who + phien + area + standard;
}

function updateActionAvailability() {
  const analysisIds = [
    'btn-load-stock-location',
    'btn-load-display-location',
    'btn-multi-location',
    'btn-toggle-check',
    'btn-save-baymau',
    'btn-compare',
    'btn-set-standard'
  ];
  analysisIds.forEach((id) => {
    const el = $(id);
    if (el) el.disabled = !currentSessionId || isDirty;
  });
  $('btn-merge').disabled = !isAdmin;
  $('btn-delete-session').disabled = !isAdmin;
}

function currentRows() {
  if (!hot) return [];
  return hot.getSourceData()
    .map((r) => ({
      id: r.id || null,
      masp: normalizeMasp(r.masp),
      vitri_kho_kiem: normalizeText(r.vitri_kho_kiem),
      vitri_kho_chuan: normalizeText(r.vitri_kho_chuan)
    }))
    .filter((r) => r.masp || r.vitri_kho_kiem || r.vitri_kho_chuan);
}

function scanRowsForSave() {
  return currentRows()
    .filter((r) => r.masp && r.vitri_kho_kiem)
    .map((r) => ({ masp: r.masp, vitri_kho_kiem: r.vitri_kho_kiem }));
}

function buildCellsRenderer(row, col) {
  const props = {};
  if (tableMode === 'scan' && row === 0) {
    props.renderer = function (...args) {
      Handsontable.renderers.TextRenderer.apply(this, args);
      args[1].style.background = '#fff5bf';
    };
  }
  if (tableMode === 'unshown' && col === 1) {
    props.renderer = function (...args) {
      Handsontable.renderers.NumericRenderer.apply(this, args);
      const value = Number(args[5] || 0);
      if (value < 0) {
        args[1].style.background = '#fee2e2';
        args[1].style.color = '#b91c1c';
        args[1].style.fontWeight = '700';
      }
    };
  }
  if (tableMode === 'display-location') {
    props.renderer = function (...args) {
      Handsontable.renderers.TextRenderer.apply(this, args);
      const rowData = args[0].getSourceDataAtRow(args[2]) || {};
      if (rowData.kho_mismatch) {
        args[1].style.background = '#f3e8ff';
        args[1].style.color = '#581c87';
      }
    };
  }
  if (tableMode === 'task') {
    props.renderer = function (...args) {
      const colIndex = args[3];
      if (colIndex === 0) Handsontable.renderers.CheckboxRenderer.apply(this, args);
      else Handsontable.renderers.TextRenderer.apply(this, args);
      const rowData = args[0].getSourceDataAtRow(args[2]) || {};
      if (rowData.da_xuly) args[1].style.background = '#dcfce7';
      if (currentTaskType === 'NHIEU_VI_TRI_KHO' && colIndex === 3 && !String(rowData.vitri_chuan || '').trim()) {
        args[1].style.background = '#fff7cc';
      }
      if (colIndex === 1 && rowData.da_xuly) {
        const who = rowData.xuly_tennv || rowData.xuly_manv || '';
        const when = rowData.xuly_at || '';
        args[1].title = `${who}${when ? ' - ' + when : ''}`;
      }
    };
  }
  return props;
}

function initTable() {
  const container = $('hot');
  hot = new Handsontable(container, {
    data: [{ id: null, masp: '', vitri_kho_kiem: '' }],
    columns: [
      { data: 'masp', type: 'text', width: 170 },
      { data: 'vitri_kho_kiem', type: 'text', width: 150 }
    ],
    colHeaders: ['Mã sản phẩm', 'Vị trí vị trí kho'],
    rowHeaders: true,
    minSpareRows: 1,
    width: '100%',
    height: Math.max(470, window.innerHeight - 250),
    stretchH: 'all',
    manualColumnResize: true,
    columnSorting: true,
    filters: true,
    dropdownMenu: true,
    licenseKey: 'non-commercial-and-evaluation',
    cells: buildCellsRenderer,
    afterChange(changes, source) {
      if (!changes || source === 'loadData') return;
      if (tableMode === 'scan') {
        setDirty(true);
        return;
      }
      if (tableMode === 'task' && !suppressTaskChange && source !== 'realtime' && source !== 'rpc' && source !== 'ui-checkbox') {
        for (const [row, prop, oldValue, newValue] of changes) {
          if (prop === 'da_xuly' && oldValue !== newValue) updateTaskItem(row, !!newValue);
          if (prop === 'vitri_chuan' && oldValue !== newValue) updateTaskStandardPosition(row, newValue, oldValue);
        }
      }
    },
    afterSelectionEnd(row, col, row2) {
      selectedRows = new Set();
      const a = Math.min(row, row2);
      const b = Math.max(row, row2);
      for (let i = a; i <= b; i++) if (i >= 0) selectedRows.add(i);
    },
    afterOnCellMouseDown(event, coords) {
      if (!coords || coords.row < 0) return;
      if (tableMode === 'task') {
        const row = this.getSourceDataAtRow(coords.row) || {};

        // Xử lý checkbox chủ động để hoạt động ổn định trên cả iPhone và máy tính.
        // Không phụ thuộc vào cơ chế toggle mặc định của Handsontable.
        if (coords.col === 0) {
          event.preventDefault();
          event.stopPropagation();

          if (currentTaskStatus !== 'DANG_LAM') {
            setMessage('Phiếu đã hoàn tất, không thể thay đổi.', 'warn');
            return;
          }

          const nextValue = !Boolean(row.da_xuly);
          suppressTaskChange = true;
          this.setDataAtRowProp(coords.row, 'da_xuly', nextValue, 'ui-checkbox');
          suppressTaskChange = false;
          this.render();
          updateTaskItem(coords.row, nextValue);
          return;
        }

        // Chạm vào cột Mã SP trong phiếu vị trí kho -> mở StockQuickPopup.
        // Không liên quan tới thao tác checkbox và không làm thay đổi thứ tự dòng.
        if (coords.col === 1) {
          const masp = normalizeMasp(row.masp);
          if (masp && typeof window.stockQuickPopup === 'function') {
            window.stockQuickPopup(masp);
          } else if (masp) {
            setMessage('StockQuickPopup chưa sẵn sàng. Hãy tải lại trang.', 'warn');
          }
          return;
        }

        // Chạm các cột thông tin khác của dòng đã hoàn thành -> xem người và thời gian bày.
        if (row.da_xuly && coords.col > 1) {
          setMessage(`Đã xử lý bởi ${row.xuly_tennv || row.xuly_manv || 'nhân viên'}${row.xuly_at ? ' lúc ' + row.xuly_at : ''}.`, 'ok');
        }
        return;
      }
      if (coords.col !== 0) return;
      const masp = normalizeMasp(this.getDataAtCell(coords.row, 0));
      if (masp && typeof window.stockQuickPopup === 'function') window.stockQuickPopup(masp);
    }
  });
}

function showScanTable(rows = []) {
  tableMode = 'scan';
  const data = rows.length ? rows : [{ id: null, masp: '', vitri_kho_kiem: '' }];
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 170 },
      { data: 'vitri_kho_kiem', type: 'text', width: 150 }
    ],
    colHeaders: ['Mã sản phẩm', 'Vị trí vị trí kho'],
    cells: buildCellsRenderer,
    readOnly: false
  });
  hot.loadData(data);
  hot.render();
}

function showStockLocationTable(rows) {
  tableMode = 'stock-location';
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 150, readOnly: true },
      { data: 'vitri_kho_kiem', type: 'text', width: 135, readOnly: true },
      { data: 'vitri_kho_chuan', type: 'text', width: 125, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Vị trí bày', 'Vị trí kho'],
    cells: buildCellsRenderer,
    readOnly: true
  });
  hot.loadData(rows);
  hot.render();
}

function normalizeDisplayPosition(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isDisplayPositionMatched(checkedPosition, catalogPosition) {
  const checked = normalizeDisplayPosition(checkedPosition);
  if (!checked) return !normalizeDisplayPosition(catalogPosition);

  const allowed = String(catalogPosition || '')
    .split(/[,;\n]+/)
    .map(normalizeDisplayPosition)
    .filter(Boolean);

  return allowed.includes(checked);
}

function showDisplayLocationTable(rows) {
  tableMode = 'display-location';
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 150, readOnly: true },
      { data: 'vitri_kho_kiem', type: 'text', width: 140, readOnly: true },
      { data: 'vitri_kho_chuan', type: 'text', width: 150, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Vị trí kho đang kiểm', 'Vị trí kho chuẩn'],
    cells: buildCellsRenderer,
    readOnly: true,
    columnSorting: false
  });
  hot.loadData(rows);
  hot.render();
}

function showMultiLocationTable(rows, context = null) {
  tableMode = 'multi';
  currentMultiResultRows = Array.isArray(rows)
    ? rows.filter(x => x && x.masp && x.masp !== 'Không có mã bày nhiều vị trí')
    : [];
  currentMultiResultContext = context;
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 145, readOnly: true },
      { data: 'vitri_hien_co', type: 'text', width: 210, readOnly: true },
      { data: 'vitri_chuan', type: 'text', width: 125, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Các vị trí hiện có', 'Vị trí chuẩn'],
    cells: buildCellsRenderer,
    readOnly: true,
    columnSorting: false,
    filters: false,
    dropdownMenu: false
  });
  hot.loadData(rows.length ? rows : [{ masp: 'Không có mã bày nhiều vị trí', vitri_hien_co: '', vitri_chuan: '' }]);
  hot.render();
}

function showUnshownTable(rows, context = null) {
  tableMode = 'unshown';
  currentResultRows = Array.isArray(rows) ? rows.filter(x => x && x.masp && x.masp !== 'Không có kết quả') : [];
  currentResultContext = context;
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 155, readOnly: true },
      { data: 'ton', type: 'numeric', width: 75, readOnly: true },
      { data: 'vitrikho', type: 'text', width: 130, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Tồn', 'Vị trí kho'],
    cells: buildCellsRenderer,
    readOnly: true
  });
  hot.loadData(rows.length ? rows : [{ masp: 'Không có kết quả', ton: '', vitrikho: '' }]);
  hot.render();
}

let cachedSizeSuffixes = null;

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
    const { data, error } = await supabase
      .from('dm_size')
      .select('size')
      .limit(500);

    if (!error) {
      (data || []).forEach((row) => {
        const raw = normalizeSizeSuffix(row?.size);
        if (!raw) return;

        // Danh mục size đôi khi chứa nhãn mở rộng như "40/L/50/175".
        // Lưu cả chuỗi đầy đủ và từng thành phần để nhận mã vạch dạng _40, _L...
        set.add(raw);
        raw.split(/[,;\/|]+/).map(normalizeSizeSuffix).filter(Boolean).forEach((x) => set.add(x));
      });
    }
  } catch (err) {
    console.warn('[KBM] Không tải được dm_size, dùng danh sách size dự phòng:', err);
  }

  cachedSizeSuffixes = set;
  return set;
}

async function findExactCatalogMasp(masp) {
  const code = normalizeMasp(masp);
  if (!code) return null;

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp')
    .eq('masp', code)
    .maybeSingle();

  if (error) throw error;
  return data?.masp ? normalizeMasp(data.masp) : null;
}

/**
 * Chuẩn hóa mã quét có hậu tố size.
 * Ví dụ SC60403-9/DEN_40 -> SC60403-9/DEN.
 * An toàn theo 2 bước:
 * 1) Ưu tiên mã nguyên gốc nếu tồn tại trong dmhanghoa.
 * 2) Chỉ bỏ hậu tố sau dấu _ cuối khi hậu tố là size hợp lệ
 *    và mã phần trước thực sự tồn tại trong dmhanghoa.
 */
async function resolveScannedMasp(rawMasp) {
  const scanned = normalizeMasp(rawMasp);
  if (!scanned) return { ok: false, scanned, masp: '', size: '' };

  const exact = await findExactCatalogMasp(scanned);
  if (exact) return { ok: true, scanned, masp: exact, size: '', stripped: false };

  const underscoreAt = scanned.lastIndexOf('_');
  if (underscoreAt <= 0 || underscoreAt >= scanned.length - 1) {
    return { ok: false, scanned, masp: '', size: '' };
  }

  const baseMasp = normalizeMasp(scanned.slice(0, underscoreAt));
  const suffix = normalizeSizeSuffix(scanned.slice(underscoreAt + 1));
  if (!baseMasp || !suffix) return { ok: false, scanned, masp: '', size: suffix };

  const validSizes = await getSizeSuffixSet();
  if (!validSizes.has(suffix)) {
    return { ok: false, scanned, masp: '', size: suffix };
  }

  const baseExact = await findExactCatalogMasp(baseMasp);
  if (!baseExact) return { ok: false, scanned, masp: '', size: suffix };

  return {
    ok: true,
    scanned,
    masp: baseExact,
    size: suffix,
    stripped: true
  };
}

async function validateMasp(masp) {
  return !!(await findExactCatalogMasp(masp));
}

async function handleScan() {
  if (tableMode !== 'scan') showScanTable(scanRowsForSave());

  const vitri = normalizeText($('current-location').value);
  const scannedMasp = normalizeMasp($('scan-masp').value);
  if (!vitri) {
    setMessage('Bạn phải nhập vị trí vị trí kho trước khi quét.', 'warn');
    $('current-location').focus();
    return;
  }
  if (!scannedMasp) return;

  $('scan-masp').disabled = true;
  try {
    const resolved = await resolveScannedMasp(scannedMasp);
    if (!resolved.ok) {
      setMessage(`Mã ${scannedMasp} không tồn tại trong danh mục hàng hóa.`, 'err');
      void playTripleAlertBeep();
      $('scan-masp').value = '';
      return;
    }

    const masp = resolved.masp;
    const rows = scanRowsForSave();
    rows.unshift({ id: null, masp, vitri_kho_kiem: vitri });
    showScanTable(rows);
    setDirty(true);
    setMessage(
      resolved.stripped
        ? `Đã nhận ${scannedMasp} là mã ${masp}, size ${resolved.size}; thêm tại ${vitri}.`
        : `Đã thêm ${masp} tại ${vitri}.`,
      'ok'
    );
    try { playSuccessBeep(); } catch (_) { }
    $('scan-masp').value = '';
    hot.scrollViewportTo(0, 0);
  } catch (err) {
    console.error(err);
    setMessage(`Không kiểm tra được mã sản phẩm: ${err.message || err}`, 'err');
    void playTripleAlertBeep();
  } finally {
    $('scan-masp').disabled = false;
    setTimeout(() => focusScan(), 0);
  }
}

async function saveSession() {
  const rows = scanRowsForSave();
  if (!rows.length) {
    setMessage('Chưa có dữ liệu mã sản phẩm và vị trí vị trí kho để lưu.', 'warn');
    return;
  }

  $('btn-save').disabled = true;
  setMessage(`Đang lưu ${rows.length} dòng dữ liệu...`);
  try {
    const { data, error } = await supabase.rpc('kvt_save_session', {
      p_phien_id: currentSessionId,
      p_coso: currentCoSo,
      p_manv: currentManv,
      p_tennv: currentTenNv,
      p_khu_vuc: normalizeText($('area-name').value),
      p_rows: rows
    });
    if (error) throw error;

    currentSessionId = data?.id || data?.phien_id || currentSessionId;
    currentSessionCode = data?.maphien || currentSessionCode;
    currentAreaName = data?.khu_vuc || normalizeText($('area-name').value);
    $('area-name').value = currentAreaName;
    lastSavedRowsJson = JSON.stringify(rows);
    setDirty(false);
    updateHeader();
    setMessage(`Đã lưu thành công ${rows.length} dòng vào ${currentSessionCode}.`, 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Lưu dữ liệu thất bại: ${err.message || err}`, 'err');
  } finally {
    $('btn-save').disabled = false;
    focusScan();
  }
}

async function listSessions() {
  const { data, error } = await supabase.rpc('kvt_list_sessions', { p_coso: currentCoSo });
  if (error) throw error;
  return data || [];
}

function openSessionModal(mode, sessions) {
  modalMode = mode;
  const list = $('session-list');
  const isMerge = mode === 'merge';
  const isDelete = mode === 'delete';
  $('session-modal-title').textContent = isMerge ? 'Chọn các phiên cần ghép' : isDelete ? 'Chọn các phiên cần xóa' : `Các phiên ${currentCoSo.toUpperCase()}`;
  $('merge-actions').style.display = isMerge ? '' : 'none';
  $('delete-actions').style.display = isDelete ? '' : 'none';

  list.innerHTML = '';
  if (!sessions.length) {
    list.textContent = 'Chưa có phiên kiểm nào tại cơ sở này.';
  } else {
    sessions.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'session-row';
      row.innerHTML = `
        ${(isMerge || isDelete) ? `<input type="checkbox" class="session-action-check" value="${s.id}">` : '<span>›</span>'}
        <div class="session-main" data-id="${s.id}">
          <div class="session-title">${s.maphien}${s.is_phien_ghep ? ' · Phiên ghép' : ''}${s.is_standard ? ' · CHUẨN' : ''}</div>
          <div class="session-meta">${s.ngay_tao || ''} · ${s.tennv_tao || s.manv_tao || ''} · ${Number(s.so_dong || 0)} dòng${s.khu_vuc ? ' · ' + s.khu_vuc : ''}</div>
        </div>`;
      list.appendChild(row);
    });
  }

  if (!isMerge && !isDelete) {
    list.querySelectorAll('.session-main').forEach((el) => {
      el.addEventListener('click', () => loadSession(el.dataset.id));
    });
  }
  $('session-modal').classList.add('show');
}

function closeModal() { $('session-modal').classList.remove('show'); }

async function showLoadSessions() {
  try {
    setMessage('Đang tải danh sách phiên kiểm...');
    openSessionModal('load', await listSessions());
    setMessage('Chọn một phiên cùng cơ sở để tiếp tục kiểm.', 'ok');
  } catch (err) {
    setMessage(`Không tải được danh sách phiên: ${err.message || err}`, 'err');
  }
}

async function loadSession(id) {
  try {
    const { data, error } = await supabase.rpc('kvt_load_session', { p_phien_id: id });
    if (error) throw error;
    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload) throw new Error('Không tìm thấy phiên kiểm');
    if (String(payload.coso).toLowerCase() !== currentCoSo) throw new Error('Phiên không thuộc cơ sở đang đăng nhập');

    currentSessionId = payload.id;
    currentSessionCode = payload.maphien;
    currentAreaName = normalizeText(payload.khu_vuc);
    currentIsStandard = !!payload.is_standard;
    $('area-name').value = currentAreaName;
    const rows = (payload.rows || []).map((r) => ({
      id: r.id || null,
      masp: normalizeMasp(r.masp),
      vitri_kho_kiem: normalizeText(r.vitri_kho_kiem)
    }));
    showScanTable(rows);
    lastSavedRowsJson = JSON.stringify(scanRowsForSave());
    setDirty(false);
    updateHeader();
    closeModal();
    setMessage(`Đã tải ${currentSessionCode}, gồm ${rows.length} dòng.`, 'ok');
    focusScan();
  } catch (err) {
    setMessage(`Không tải được phiên: ${err.message || err}`, 'err');
  }
}

function requireSaved() {
  if (!currentSessionId) {
    setMessage('Bạn phải lưu dữ liệu phiên kiểm trước khi thực hiện chức năng này.', 'warn');
    return false;
  }
  if (isDirty) {
    setMessage('Dữ liệu đã thay đổi. Hãy bấm Lưu dữ liệu trước.', 'warn');
    return false;
  }
  return true;
}

async function loadStockLocations() {
  if (!requireSaved()) return;
  const rows = scanRowsForSave();
  const unique = Array.from(new Set(rows.map((r) => r.masp)));
  const field = currentCoSo === 'cs2' ? 'vitrikho2' : 'vitrikho1';
  const map = new Map();
  try {
    for (let i = 0; i < unique.length; i += 400) {
      const chunk = unique.slice(i, i + 400);
      const { data, error } = await supabase.from('dmhanghoa').select(`masp,${field}`).in('masp', chunk);
      if (error) throw error;
      (data || []).forEach((r) => map.set(normalizeMasp(r.masp), normalizeText(r[field])));
    }
    showStockLocationTable(rows.map((r) => ({ ...r, vitri_kho_chuan: map.get(r.masp) || '' })));
    setMessage(`Đã tải vị trí kho ${currentCoSo.toUpperCase()} cho ${rows.length} dòng.`, 'ok');
  } catch (err) {
    setMessage(`Không tải được vị trí kho: ${err.message || err}`, 'err');
  }
}

async function loadDisplayLocations() {
  if (!requireSaved()) return;
  const rows = scanRowsForSave();
  const unique = Array.from(new Set(rows.map((r) => r.masp)));
  const field = currentCoSo === 'cs2' ? 'vitrikho2' : 'vitrikho1';
  const map = new Map();

  try {
    for (let i = 0; i < unique.length; i += 400) {
      const chunk = unique.slice(i, i + 400);
      const { data, error } = await supabase
        .from('dmhanghoa')
        .select(`masp,${field}`)
        .in('masp', chunk);
      if (error) throw error;
      (data || []).forEach((r) => {
        map.set(normalizeMasp(r.masp), normalizeText(r[field]));
      });
    }

    const comparedRows = rows.map((r) => {
      const catalogPosition = map.get(r.masp) || '';
      return {
        ...r,
        vitri_kho_chuan: catalogPosition,
        kho_mismatch: !isDisplayPositionMatched(r.vitri_kho_kiem, catalogPosition)
      };
    });

    const mismatchCount = comparedRows.filter((r) => r.kho_mismatch).length;
    showDisplayLocationTable(comparedRows);

    if (mismatchCount > 0) {
      setMessage(`Đã tải vị trí vị trí kho ${currentCoSo.toUpperCase()} cho ${rows.length} dòng. Có ${mismatchCount} dòng lệch chuẩn được tô tím nhạt.`, 'warn');
    } else {
      setMessage(`Đã tải vị trí vị trí kho ${currentCoSo.toUpperCase()} cho ${rows.length} dòng. Tất cả vị trí đều khớp.`, 'ok');
    }
  } catch (err) {
    setMessage(`Không tải được vị trí vị trí kho: ${err.message || err}`, 'err');
  }
}

async function showMultiLocations() {
  if (!requireSaved()) return;
  const grouped = new Map();
  scanRowsForSave().forEach((r) => {
    if (!grouped.has(r.masp)) grouped.set(r.masp, new Set());
    grouped.get(r.masp).add(r.vitri_kho_kiem);
  });
  let results = Array.from(grouped.entries())
    .map(([masp, set]) => ({
      masp,
      positions: Array.from(set),
      vitri_hien_co: Array.from(set).join(', '),
      vitri_chuan: '',
      count: set.size
    }))
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count || a.masp.localeCompare(b.masp, 'vi'));

  try {
    if (results.length) {
      const field = currentCoSo === 'cs2' ? 'vitrikho2' : 'vitrikho1';
      const map = new Map();
      const masps = results.map(x => x.masp);
      for (let i = 0; i < masps.length; i += 400) {
        const { data, error } = await supabase.from('dmhanghoa').select(`masp,${field}`).in('masp', masps.slice(i, i + 400));
        if (error) throw error;
        (data || []).forEach(r => map.set(normalizeMasp(r.masp), normalizeText(r[field])));
      }
      results = results.map(r => {
        // Luôn hiển thị vị trí kho chuẩn đã lưu trong danh mục hàng hóa,
        // kể cả vị trí chuẩn đó KHÔNG nằm trong các vị trí vừa kiểm của phiên.
        // Trước đây code chỉ điền khi vị trí chuẩn duy nhất trùng với một vị trí hiện có,
        // nên các trường hợp lệch vị trí bị để trống và gây hiểu nhầm là chưa có vị trí chuẩn.
        const catalogRaw = map.get(r.masp) || '';
        return { ...r, vitri_chuan: catalogRaw };
      });
    }
  } catch (err) {
    console.warn('Không lấy được vị trí mẫu hiện tại để gợi ý:', err);
  }

  showMultiLocationTable(results, { source: 'NHIEU_VI_TRI_KHO', phien_id: currentSessionId });
  setMessage(`Có ${results.length} mã đang bày tại nhiều vị trí. Có thể lưu thành phiếu để nhân viên chọn vị trí chuẩn và xử lý.`, results.length ? 'warn' : 'ok');
}

async function loadFilterOptions() {
  try {
    const [{ data: cats }, { data: groups }] = await Promise.all([
      supabase.from('dmchungloai').select('machungloai,tenchungloai').order('machungloai'),
      supabase.from('dmnhomhang').select('manhom,tennhom,diadiem').order('manhom')
    ]);
    $('category-select').innerHTML = '<option value="">Chủng loại</option>' +
      (cats || []).map((x) => `<option value="${x.machungloai}">${x.machungloai}${x.tenchungloai ? ' - ' + x.tenchungloai : ''}</option>`).join('');
    $('group-picker').innerHTML = '<option value="">Chọn nhóm hàng</option>' +
      (groups || []).filter((x) => !x.diadiem || x.diadiem === 'ALL' || String(x.diadiem).toLowerCase() === currentCoSo)
        .map((x) => `<option value="${x.manhom}">${x.manhom}${x.tennhom ? ' - ' + x.tennhom : ''}</option>`).join('');
  } catch (err) {
    console.warn('Không tải được nhóm/chủng loại:', err);
  }
}

function normalizeGroupList(raw) {
  const seen = new Set();
  return String(raw || '')
    .split(',')
    .map((x) => normalizeMasp(x))
    .filter((x) => {
      if (!x || seen.has(x)) return false;
      seen.add(x);
      return true;
    })
    .join(', ');
}

function appendSelectedGroup() {
  const picker = $('group-picker');
  const input = $('group-select');
  const selected = normalizeMasp(picker?.value);
  if (!selected || !input) return;
  input.value = normalizeGroupList(input.value ? `${input.value}, ${selected}` : selected);
  picker.value = '';
}



function chunkArray(items, size = 40) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function fetchStockAfterCheckInChunks(masps, coso, progressLabel = 'Đang tính tồn') {
  const uniqueMasps = Array.from(new Set((masps || []).map(normalizeMasp).filter(Boolean)));
  const chunks = chunkArray(uniqueMasps, 40);
  const stockMap = new Map();

  for (let i = 0; i < chunks.length; i++) {
    setMessage(`${progressLabel}: lô ${i + 1}/${chunks.length} (${Math.min((i + 1) * 40, uniqueMasps.length)}/${uniqueMasps.length} mã)...`);
    const { data, error } = await supabase.rpc('kvt_stock_after_check', {
      p_masps: chunks[i],
      p_coso: coso
    });
    if (error) throw error;
    (data || []).forEach((row) => {
      stockMap.set(normalizeMasp(row.masp), Number(row.ton_sau_kiem || 0));
    });
  }
  return stockMap;
}

function mergeCandidatesWithStock(candidates, stockMap) {
  return (candidates || [])
    .map((x) => ({
      masp: normalizeMasp(x.masp),
      ton: Number(stockMap.get(normalizeMasp(x.masp)) || 0),
      vitrikho: x.vitrikho || ''
    }))
    .filter((x) => x.ton !== 0)
    .sort((a, b) => {
      const ga = a.ton > 0 ? 0 : 1;
      const gb = b.ton > 0 ? 0 : 1;
      if (ga !== gb) return ga - gb;
      if (a.ton !== b.ton) return b.ton - a.ton;
      return a.masp.localeCompare(b.masp, 'vi');
    });
}

async function runUnshown() {
  if (!requireSaved()) return;
  const from = $('date-from').value;
  const to = $('date-to').value;
  const nhom = normalizeGroupList($('group-select').value);
  $('group-select').value = nhom;
  const chungloai = $('category-select').value;
  if (!from || !to || !chungloai) {
    setMessage('Bạn bắt buộc chọn từ ngày, đến ngày và chủng loại. Nhóm hàng có thể để trống.', 'warn');
    return;
  }
  if (from > to) {
    setMessage('Từ ngày phải nhỏ hơn hoặc bằng đến ngày.', 'warn');
    return;
  }

  $('btn-run-unshown').disabled = true;
  setMessage('Đang lấy danh sách hàng đã bán/nhập nhưng chưa thấy vị trí kho...');
  try {
    const { data: candidates, error } = await supabase.rpc('kvt_hang_chua_kiem_candidates', {
      p_phien_id: currentSessionId,
      p_tu_ngay: from,
      p_den_ngay: to,
      p_nhomhang: nhom,
      p_chungloai: chungloai
    });
    if (error) throw error;

    const rows = candidates || [];
    if (!rows.length) {
      showUnshownTable([]);
      setMessage('Không có mã nào cần đối chiếu.', 'ok');
      return;
    }

    const stockMap = await fetchStockAfterCheckInChunks(
      rows.map((x) => x.masp),
      rows[0]?.coso || currentCoSo,
      'Đang tính tồn sau kiểm'
    );
    const result = mergeCandidatesWithStock(rows, stockMap);
    showUnshownTable(result, { source: 'HANG_CHUA_KIEM', from, to, chungloai, nhomhang: nhom, phien_id: currentSessionId });
    setMessage(`Tìm thấy ${result.length} mã cần xem xét vị trí kho. Đã xử lý ${rows.length} mã theo từng lô; tồn bằng 0 đã bỏ qua.`, 'ok');
  } catch (err) {
    setMessage(`Kiểm tra hàng chưa vị trí kho thất bại: ${err.message || err}`, 'err');
  } finally {
    $('btn-run-unshown').disabled = false;
  }
}

function deleteSelectedRows() {
  if (tableMode !== 'scan') {
    setMessage('Hãy trở lại bảng quét trước khi xóa dòng.', 'warn');
    return;
  }
  if (!selectedRows.size) {
    setMessage('Bạn chưa chọn dòng cần xóa.', 'warn');
    return;
  }
  const rows = scanRowsForSave().filter((_, idx) => !selectedRows.has(idx));
  showScanTable(rows);
  selectedRows = new Set();
  setDirty(true);
  setMessage('Đã xóa các dòng được chọn. Hãy lưu lại dữ liệu.', 'ok');
}

function newSession() {
  if (isDirty && scanRowsForSave().length && !confirm('Dữ liệu hiện tại chưa lưu. Bạn có chắc muốn tạo phiên mới?')) return;
  currentSessionId = null;
  currentSessionCode = '';
  currentAreaName = '';
  currentIsStandard = false;
  $('area-name').value = '';
  lastSavedRowsJson = '[]';
  showScanTable([]);
  setDirty(true);
  updateHeader();
  setMessage('Đã tạo phiên mới trên màn hình. Hãy quét dữ liệu rồi bấm Lưu dữ liệu.', 'ok');
  focusScan();
}

async function showMergeSessions() {
  if (!isAdmin) return;
  try {
    openSessionModal('merge', await listSessions());
  } catch (err) {
    setMessage(`Không tải được phiên để ghép: ${err.message || err}`, 'err');
  }
}

async function confirmMerge() {
  if (!isAdmin || modalMode !== 'merge') return;
  const ids = Array.from(document.querySelectorAll('.session-action-check:checked')).map((x) => x.value);
  if (ids.length < 2) {
    setMessage('Phải chọn ít nhất hai phiên để ghép.', 'warn');
    return;
  }
  try {
    const { data, error } = await supabase.rpc('kvt_merge_sessions', {
      p_phien_ids: ids,
      p_coso: currentCoSo,
      p_manv: currentManv,
      p_tennv: currentTenNv
    });
    if (error) throw error;
    closeModal();
    await loadSession(data.id || data.phien_id);
    setMessage(`Đã tạo phiên ghép ${data.maphien}.`, 'ok');
  } catch (err) {
    setMessage(`Ghép phiên thất bại: ${err.message || err}`, 'err');
  }
}


async function showDeleteSessions() {
  if (!isAdmin) return;
  try {
    openSessionModal('delete', await listSessions());
  } catch (err) {
    setMessage(`Không tải được phiên để xóa: ${err.message || err}`, 'err');
  }
}

async function confirmDeleteSessions() {
  if (!isAdmin || modalMode !== 'delete') return;
  const ids = Array.from(document.querySelectorAll('.session-action-check:checked')).map((x) => x.value);
  if (!ids.length) {
    setMessage('Bạn chưa chọn phiên cần xóa.', 'warn');
    return;
  }
  const sessions = await listSessions();
  const selected = sessions.filter(s => ids.includes(s.id));
  const totalRows = selected.reduce((sum, s) => sum + Number(s.so_dong || 0), 0);
  const names = selected.map(s => s.maphien).join(', ');
  if (!confirm(`Bạn sắp xóa ${ids.length} phiên với khoảng ${totalRows} dòng dữ liệu:\n${names}\n\nThao tác này không thể hoàn tác. Tiếp tục?`)) return;
  try {
    const { data, error } = await supabase.rpc('kvt_admin_delete_sessions', {
      p_phien_ids: ids,
      p_coso: currentCoSo
    });
    if (error) throw error;
    if (ids.includes(currentSessionId)) newSession();
    closeModal();
    setMessage(`Đã xóa ${data?.deleted_count || ids.length} phiên.`, 'ok');
  } catch (err) {
    setMessage(`Xóa phiên thất bại: ${err.message || err}`, 'err');
  }
}

async function setCurrentAsStandard() {
  if (!isAdmin || !requireSaved()) return;
  const area = normalizeText($('area-name').value);
  if (!area) {
    setMessage('Hãy nhập tên khu vực kiểm trước khi đặt làm phiên chuẩn.', 'warn');
    $('area-name').focus();
    return;
  }
  const name = prompt('Tên phiên chuẩn:', currentSessionCode + ' - ' + area);
  if (name === null) return;
  try {
    const { data, error } = await supabase.rpc('kvt_admin_set_standard', {
      p_phien_id: currentSessionId,
      p_standard_name: normalizeText(name) || currentSessionCode,
      p_khu_vuc: area
    });
    if (error) throw error;
    currentIsStandard = true;
    currentAreaName = area;
    updateHeader();
    setMessage(`Đã đặt ${currentSessionCode} làm phiên chuẩn cho khu vực ${area}.`, 'ok');
  } catch (err) {
    setMessage(`Không đặt được phiên chuẩn: ${err.message || err}`, 'err');
  }
}

async function showCompareModal() {
  if (!requireSaved()) return;
  try {
    const sessions = await listSessions();
    const optionHtml = (s) => `<option value="${s.id}">${s.maphien}${s.is_standard ? ' · CHUẨN' : ''}${s.khu_vuc ? ' · ' + s.khu_vuc : ''}</option>`;
    const standards = sessions.filter(s => s.is_standard);
    $('compare-standard').innerHTML = (standards.length ? standards : sessions).map(optionHtml).join('');
    $('compare-current').innerHTML = sessions.map(optionHtml).join('');
    if (currentSessionId) $('compare-current').value = currentSessionId;
    $('compare-modal').classList.add('show');
  } catch (err) {
    setMessage(`Không tải được danh sách phiên để so sánh: ${err.message || err}`, 'err');
  }
}

function closeCompareModal() { $('compare-modal').classList.remove('show'); }

async function runCompareSessions() {
  const standardId = $('compare-standard').value;
  const currentId = $('compare-current').value;
  if (!standardId || !currentId) {
    setMessage('Hãy chọn đủ phiên chuẩn và phiên hiện tại.', 'warn');
    return;
  }
  if (standardId === currentId) {
    setMessage('Phiên chuẩn và phiên hiện tại phải khác nhau.', 'warn');
    return;
  }
  $('btn-run-compare').disabled = true;
  setMessage('Đang lấy danh sách chênh lệch giữa hai phiên...');
  try {
    const { data, error } = await supabase.rpc('kvt_compare_sessions_candidates', {
      p_phien_chuan_id: standardId,
      p_phien_hientai_id: currentId
    });
    if (error) throw error;

    const candidates = data?.missing_candidates || [];
    const multi = data?.multi_locations || [];
    let missing = [];
    if (candidates.length) {
      const stockMap = await fetchStockAfterCheckInChunks(
        candidates.map((x) => x.masp),
        data?.coso || currentCoSo,
        'Đang tính tồn các mã thiếu'
      );
      missing = mergeCandidatesWithStock(candidates, stockMap);
    }

    closeCompareModal();
    showUnshownTable(missing, { source: 'SO_SANH_PHIEN', phien_id: currentId, phien_chuan_id: standardId });
    if (multi.length) {
      const text = multi.slice(0, 20).map(x => `${x.masp}: ${(x.positions || []).join(', ')}`).join(' | ');
      setMessage(`Thiếu ${missing.length} mã so với phiên chuẩn. Phiên hiện tại có ${multi.length} mã bày nhiều vị trí. ${text}`, 'warn');
    } else {
      setMessage(`Thiếu ${missing.length} mã so với phiên chuẩn. Phiên hiện tại không có mã bày nhiều vị trí.`, missing.length ? 'warn' : 'ok');
    }
  } catch (err) {
    setMessage(`So sánh phiên thất bại: ${err.message || err}`, 'err');
  } finally {
    $('btn-run-compare').disabled = false;
  }
}


function unsubscribeTaskRealtime() {
  if (taskRealtimeChannel) {
    try { supabase.removeChannel(taskRealtimeChannel); } catch (_) {}
    taskRealtimeChannel = null;
  }
}

function taskProgressText() {
  const total = currentTaskRows.length;
  const done = currentTaskRows.filter(r => r.da_xuly).length;
  return `${done}/${total}`;
}

function taskPositionOptions(rowData) {
  return String(rowData?.vitri_hien_co || '')
    .split(',')
    .map(normalizeText)
    .filter(Boolean);
}

function showTaskTable(task, rows) {
  tableMode = 'task';
  currentTaskId = task.id;
  currentTaskCode = task.macongviec || '';
  currentTaskStatus = task.trangthai || 'DANG_LAM';
  currentTaskType = String(task.nguon || '').toUpperCase();
  currentTaskRows = Array.isArray(rows) ? rows.slice().sort((a,b) => Number(a.thu_tu)-Number(b.thu_tu)) : [];

  const isMulti = currentTaskType === 'NHIEU_VI_TRI_KHO';
  const columns = isMulti ? [
    { data: 'da_xuly', type: 'checkbox', checkedTemplate: true, uncheckedTemplate: false, width: 52, readOnly: currentTaskStatus !== 'DANG_LAM' },
    { data: 'masp', type: 'text', width: 135, readOnly: true },
    { data: 'vitri_hien_co', type: 'text', width: 190, readOnly: true },
    { data: 'vitri_chuan', type: 'dropdown', width: 120, readOnly: currentTaskStatus !== 'DANG_LAM' }
  ] : [
    { data: 'da_xuly', type: 'checkbox', checkedTemplate: true, uncheckedTemplate: false, width: 48, readOnly: currentTaskStatus !== 'DANG_LAM' },
    { data: 'masp', type: 'text', width: 145, readOnly: true },
    { data: 'ton', type: 'numeric', width: 58, readOnly: true },
    { data: 'vitrikho', type: 'text', width: 105, readOnly: true }
  ];

  hot.updateSettings({
    columns,
    colHeaders: isMulti
      ? ['Đã xử lý', 'Mã SP', 'Vị trí hiện có', 'Vị trí chuẩn']
      : ['Đã xử lý', 'Mã SP', 'Tồn', 'Vị trí kho'],
    cells(row, col) {
      const props = buildCellsRenderer(row, col);
      if (isMulti && col === 3) {
        props.type = 'dropdown';
        props.source = taskPositionOptions(currentTaskRows[row]);
        props.strict = true;
        props.allowInvalid = false;
        props.readOnly = currentTaskStatus !== 'DANG_LAM';
      }
      return props;
    },
    readOnly: false,
    columnSorting: false,
    filters: false,
    dropdownMenu: false
  });
  suppressTaskChange = true;
  hot.loadData(currentTaskRows);
  suppressTaskChange = false;
  hot.render();
  $('btn-task-complete').style.display = isAdmin ? '' : 'none';
  $('btn-task-complete').textContent = currentTaskStatus === 'HOAN_TAT' ? 'Mở lại phiếu' : 'Hoàn tất phiếu';
  const label = isMulti ? 'xử lý nhiều vị trí' : 'vị trí kho';
  setMessage(`Phiếu ${task.ten_congviec || task.macongviec} (${label}): ${taskProgressText()}. Thứ tự dòng được giữ nguyên trên mọi máy.`, currentTaskStatus === 'HOAN_TAT' ? 'ok' : '');
  subscribeTaskRealtime();
}

async function saveCurrentResultAsTask() {
  if (!isAdmin) return;

  const isMulti = tableMode === 'multi' && currentMultiResultRows.length;
  const isUnshown = tableMode === 'unshown' && currentResultRows.length;
  if (!isMulti && !isUnshown) {
    setMessage('Hãy mở kết quả hàng chưa vị trí kho, so sánh phiên hoặc bày nhiều vị trí trước khi lưu giao việc.', 'warn');
    return;
  }

  const ctx = isMulti ? (currentMultiResultContext || {}) : (currentResultContext || {});
  const suggested = isMulti
    ? `Xử lý nhiều vị trí ${currentSessionCode || ''}`
    : currentResultContext?.source === 'SO_SANH_PHIEN'
      ? `Vị trí kho so sánh ${currentSessionCode || ''}`
      : `Vị trí kho ${$('category-select').value || ''} ${$('group-select').value || ''}`.trim();
  const name = prompt('Tên phiếu giao việc:', suggested);
  if (name === null) return;

  const rows = isMulti
    ? currentMultiResultRows.map(x => ({
        masp: x.masp,
        ton: 0,
        vitrikho: '',
        vitri_hien_co: x.vitri_hien_co || '',
        vitri_chuan: x.vitri_chuan || ''
      }))
    : currentResultRows.map(x => ({
        masp:x.masp,
        ton:Number(x.ton||0),
        vitrikho:x.vitrikho||'',
        vitri_hien_co:'',
        vitri_chuan:''
      }));

  try {
    const { data, error } = await supabase.rpc('kvt_admin_create_task', {
      p_coso: currentCoSo,
      p_ten_congviec: normalizeText(name) || suggested || 'Phiếu công việc vị trí kho',
      p_nguon: isMulti ? 'NHIEU_VI_TRI_KHO' : (ctx.source || 'HANG_CHUA_KIEM'),
      p_phien_nguon_id: ctx.phien_id || currentSessionId,
      p_tu_ngay: ctx.from || null,
      p_den_ngay: ctx.to || null,
      p_chungloai: ctx.chungloai || null,
      p_nhomhang: ctx.nhomhang || null,
      p_rows: rows
    });
    if (error) throw error;
    setMessage(`Đã tạo phiếu ${data.macongviec} gồm ${data.so_dong} mã.`, 'ok');
  } catch (err) {
    setMessage(`Không lưu được phiếu giao việc: ${err.message || err}`, 'err');
  }
}

async function showTaskList() {
  try {
    const { data, error } = await supabase.rpc('kvt_list_tasks', { p_coso: currentCoSo });
    if (error) throw error;
    const rows = data || [];
    $('task-list').innerHTML = rows.length ? rows.map(t => `
      <div class="session-row task-list-row" data-id="${t.id}">
        <div></div><div class="session-main">
          <div class="session-title">${t.nguon === 'NHIEU_VI_TRI_KHO' ? '[Nhiều vị trí] ' : '[Chưa bày] '}${t.ten_congviec} · ${t.da_bay}/${t.tong_dong}${t.trangthai==='HOAN_TAT' ? ' · HOÀN TẤT' : ''}</div>
          <div class="session-meta">${t.macongviec} · ${t.ngay_tao} · ${t.tennv_tao || ''}</div>
        </div>
      </div>`).join('') : '<div>Chưa có phiếu công việc vị trí kho.</div>';
    $('task-list').querySelectorAll('.task-list-row').forEach(el => el.addEventListener('click', () => loadTask(el.dataset.id)));
    $('task-modal').classList.add('show');
  } catch (err) { setMessage(`Không tải được danh sách công việc: ${err.message || err}`, 'err'); }
}

function closeTaskModal() { $('task-modal').classList.remove('show'); }

async function loadTask(id) {
  try {
    const { data, error } = await supabase.rpc('kvt_load_task', { p_congviec_id:id, p_coso:currentCoSo });
    if (error) throw error;
    closeTaskModal();
    showTaskTable(data, data.rows || []);
  } catch (err) { setMessage(`Không mở được phiếu: ${err.message || err}`, 'err'); }
}

async function updateTaskStandardPosition(rowIndex, newValue, oldValue) {
  if (currentTaskType !== 'NHIEU_VI_TRI_KHO') return;
  const row = hot.getSourceDataAtRow(rowIndex);
  if (!row?.id || !currentTaskId) return;
  try {
    const { data, error } = await supabase.rpc('kvt_set_task_item_standard_position', {
      p_chitiet_id: row.id,
      p_congviec_id: currentTaskId,
      p_coso: currentCoSo,
      p_vitri_chuan: normalizeText(newValue)
    });
    if (error) throw error;
    Object.assign(row, data);
    currentTaskRows[rowIndex] = row;
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'vitri_chuan', data.vitri_chuan || '', 'rpc');
    suppressTaskChange = false;
    hot.render();
    setMessage(`${data.masp}: vị trí chuẩn ${data.vitri_chuan || 'chưa chọn'}.`, 'ok');
  } catch (err) {
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'vitri_chuan', oldValue || '', 'rpc');
    suppressTaskChange = false;
    setMessage(`Không lưu được vị trí chuẩn: ${err.message || err}`, 'err');
  }
}

async function updateTaskItem(rowIndex, done) {
  const row = hot.getSourceDataAtRow(rowIndex);
  if (!row?.id || !currentTaskId) return;
  try {
    const { data, error } = await supabase.rpc('kvt_set_task_item_done', {
      p_chitiet_id: row.id,
      p_congviec_id: currentTaskId,
      p_coso: currentCoSo,
      p_da_xuly: done
    });
    if (error) throw error;
    Object.assign(row, data);
    currentTaskRows[rowIndex] = row;
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'da_xuly', data.da_xuly, 'rpc');
    suppressTaskChange = false;
    hot.render();
    const actionText = currentTaskType === 'NHIEU_VI_TRI_KHO' ? 'đã xử lý' : 'đã bày';
    setMessage(`${data.masp}: ${data.da_xuly ? actionText + ' bởi ' + (data.xuly_tennv || data.xuly_manv || '') + ' lúc ' + (data.xuly_at || '') : 'đã bỏ đánh dấu'}. Tiến độ ${taskProgressText()}.`, 'ok');
  } catch (err) {
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'da_xuly', !done, 'rpc');
    suppressTaskChange = false;
    setMessage(`Không lưu được đánh dấu: ${err.message || err}`, 'err');
  }
}

function subscribeTaskRealtime() {
  unsubscribeTaskRealtime();
  if (!currentTaskId) return;
  taskRealtimeChannel = supabase.channel(`kbm-task-${currentTaskId}-${Date.now()}`)
    .on('postgres_changes', {
      event:'UPDATE', schema:'public', table:'kiem_vitrikho_congviec_chitiet',
      filter:`congviec_id=eq.${currentTaskId}`
    }, payload => {
      const n = payload.new || {};
      const idx = currentTaskRows.findIndex(r => r.id === n.id);
      if (idx < 0) return;
      currentTaskRows[idx] = { ...currentTaskRows[idx], ...n,
        ton: currentTaskRows[idx].ton,
        vitrikho: currentTaskRows[idx].vitrikho,
        vitri_hien_co: n.vitri_hien_co ?? currentTaskRows[idx].vitri_hien_co,
        vitri_chuan: n.vitri_chuan ?? currentTaskRows[idx].vitri_chuan,
        xuly_at: n.xuly_at ? new Date(n.xuly_at).toLocaleString('vi-VN') : null
      };
      suppressTaskChange = true;
      hot.setDataAtRowProp(idx, 'da_xuly', !!n.da_xuly, 'realtime');
      if (currentTaskType === 'NHIEU_VI_TRI_KHO') {
        hot.setDataAtRowProp(idx, 'vitri_chuan', currentTaskRows[idx].vitri_chuan || '', 'realtime');
      }
      suppressTaskChange = false;
      hot.render();
      setMessage(`Tiến độ phiếu ${currentTaskCode}: ${taskProgressText()}.`, 'ok');
    }).subscribe();
}

async function toggleTaskComplete() {
  if (!isAdmin || !currentTaskId) return;
  const next = currentTaskStatus === 'HOAN_TAT' ? 'DANG_LAM' : 'HOAN_TAT';
  const total = currentTaskRows.length;
  const done = currentTaskRows.filter(r => r.da_xuly).length;
  if (next === 'HOAN_TAT' && done < total && !confirm(`Phiếu còn ${total-done} mã chưa ${currentTaskType === 'NHIEU_VI_TRI_KHO' ? 'xử lý' : 'bày'}. Vẫn hoàn tất?`)) return;
  try {
    const { data, error } = await supabase.rpc('kvt_admin_set_task_status', { p_congviec_id:currentTaskId, p_coso:currentCoSo, p_trangthai:next });
    if (error) throw error;
    currentTaskStatus = data.trangthai;
    showTaskTable({ id:currentTaskId, macongviec:currentTaskCode, ten_congviec:currentTaskCode, trangthai:currentTaskStatus }, currentTaskRows);
  } catch (err) { setMessage(`Không đổi được trạng thái phiếu: ${err.message || err}`, 'err'); }
}

async function saveKhoToCatalog() {
  if (!isAdmin || !requireSaved()) return;
  if (!confirm('Hệ thống chỉ lưu các mã có đúng một vị trí vị trí kho. Các mã nhiều vị trí sẽ không được lưu. Tiếp tục?')) return;
  try {
    const { data, error } = await supabase.rpc('kvt_admin_save_vitrikho', { p_phien_id: currentSessionId });
    if (error) throw error;
    const conflicts = data?.conflicts || [];
    if (conflicts.length) {
      showMultiLocationTable(conflicts.map((x) => ({ masp: x.masp, vitri_hien_co: (x.positions || []).join(', '), vitri_chuan: '' })), { source: 'NHIEU_VI_TRI_KHO', phien_id: currentSessionId });
      setMessage(`Đã lưu ${data.updated_count || 0} mã có một vị trí. Còn ${conflicts.length} mã nhiều vị trí chưa được lưu.`, 'warn');
    } else {
      setMessage(`Đã lưu vị trí vị trí kho vào danh mục cho ${data.updated_count || 0} mã.`, 'ok');
    }
  } catch (err) {
    setMessage(`Không lưu được vị trí vị trí kho: ${err.message || err}`, 'err');
  }
}

function attachEvents() {
  $('scan-masp').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('scan-masp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleScan(); }
  });
  $('current-location').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); focusScan(); }
  });

  $('btn-save').addEventListener('click', saveSession);
  $('btn-load-session').addEventListener('click', showLoadSessions);
  $('btn-load-stock-location').addEventListener('click', loadDisplayLocations);
  $('btn-multi-location').addEventListener('click', showMultiLocations);
  $('btn-run-unshown').addEventListener('click', runUnshown);
  $('group-picker').addEventListener('change', appendSelectedGroup);
  $('group-select').addEventListener('blur', (e) => { e.target.value = normalizeGroupList(e.target.value); });
  $('btn-delete-rows').addEventListener('click', deleteSelectedRows);
  $('btn-new-session').addEventListener('click', newSession);
  $('btn-back-main').addEventListener('click', () => {
    unsubscribeTaskRealtime();
    currentTaskId = null;
    currentTaskType = '';
    $('btn-task-complete').style.display = 'none';
    showScanTable(scanRowsForSave());
    setMessage('Đã trở lại bảng quét.', 'ok');
  });
  $('btn-merge').addEventListener('click', showMergeSessions);
  $('btn-confirm-merge').addEventListener('click', confirmMerge);
  $('btn-save-baymau').addEventListener('click', saveKhoToCatalog);
  $('btn-save-task').addEventListener('click', saveCurrentResultAsTask);
  $('btn-open-tasks').addEventListener('click', showTaskList);
  $('btn-task-complete').addEventListener('click', toggleTaskComplete);
  $('btn-delete-session').addEventListener('click', showDeleteSessions);
  $('btn-confirm-delete-session').addEventListener('click', confirmDeleteSessions);
  $('btn-set-standard').addEventListener('click', setCurrentAsStandard);
  $('btn-compare').addEventListener('click', showCompareModal);
  $('btn-run-compare').addEventListener('click', runCompareSessions);
  $('compare-modal-close').addEventListener('click', closeCompareModal);
  $('task-modal-close').addEventListener('click', closeTaskModal);
  $('task-modal').addEventListener('click', (e) => { if (e.target === $('task-modal')) closeTaskModal(); });
  $('compare-modal').addEventListener('click', (e) => { if (e.target === $('compare-modal')) closeCompareModal(); });
  $('area-name').addEventListener('input', () => { currentAreaName = normalizeText($('area-name').value); setDirty(true); updateHeader(); });

  $('btn-toggle-commands').addEventListener('click', () => {
    const p = $('command-panel');
    const open = p.style.display === 'block';
    p.style.display = open ? 'none' : 'block';
    $('btn-toggle-commands').textContent = open ? 'Chức năng ▼' : 'Chức năng ▲';
  });
  $('btn-toggle-check').addEventListener('click', () => {
    const p = $('check-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
  });
  $('session-modal-close').addEventListener('click', closeModal);
  $('session-modal').addEventListener('click', (e) => { if (e.target === $('session-modal')) closeModal(); });

  window.addEventListener('beforeunload', (e) => {
    unsubscribeTaskRealtime();
    if (!isDirty || !scanRowsForSave().length) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

(function initPage() {
  try { setupBeepUnlockOnce(document); } catch (_) { }
  initTable();
  attachEvents();
  const today = new Date().toISOString().slice(0, 10);
  $('date-to').value = today;

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
      $('btn-merge').style.display = isAdmin ? '' : 'none';
      $('btn-save-baymau').style.display = isAdmin ? '' : 'none';
      $('btn-set-standard').style.display = isAdmin ? '' : 'none';
      $('btn-delete-session').style.display = isAdmin ? '' : 'none';
      $('btn-save-task').style.display = isAdmin ? '' : 'none';
      updateHeader();
      setDirty(true);
      await loadFilterOptions();
      setTimeout(() => $('current-location').focus(), 80);
    }
  });
})();
