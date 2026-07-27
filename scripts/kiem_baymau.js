import { supabase, startSessionKeeper } from './supabaseClient.js';
import {
  khoiTaoDangNhapDungChung,
  getCurrentUserInfo
} from './authModule.js';

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
let currentTaskRows = [];
let currentResultRows = [];
let currentResultContext = null;
let taskRealtimeChannel = null;
let suppressTaskChange = false;

const $ = (id) => document.getElementById(id);
const normalizeMasp = (v) => String(v || '').trim().toUpperCase();
const normalizeText = (v) => String(v || '').trim();

function setMessage(text, type = '') {
  const el = $('message');
  el.textContent = text;
  el.className = type;
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
      vitri_baymau: normalizeText(r.vitri_baymau),
      vitri_kho: normalizeText(r.vitri_kho)
    }))
    .filter((r) => r.masp || r.vitri_baymau || r.vitri_kho);
}

function scanRowsForSave() {
  return currentRows()
    .filter((r) => r.masp && r.vitri_baymau)
    .map((r) => ({ masp: r.masp, vitri_baymau: r.vitri_baymau }));
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
  if (tableMode === 'task') {
    props.renderer = function (...args) {
      const colIndex = args[3];
      if (colIndex === 0) Handsontable.renderers.CheckboxRenderer.apply(this, args);
      else Handsontable.renderers.TextRenderer.apply(this, args);
      const rowData = args[0].getSourceDataAtRow(args[2]) || {};
      if (rowData.da_baymau) args[1].style.background = '#dcfce7';
      if (colIndex === 1 && rowData.da_baymau) {
        const who = rowData.baymau_tennv || rowData.baymau_manv || '';
        const when = rowData.baymau_at || '';
        args[1].title = `${who}${when ? ' - ' + when : ''}`;
      }
    };
  }
  return props;
}

function initTable() {
  const container = $('hot');
  hot = new Handsontable(container, {
    data: [{ id: null, masp: '', vitri_baymau: '' }],
    columns: [
      { data: 'masp', type: 'text', width: 170 },
      { data: 'vitri_baymau', type: 'text', width: 150 }
    ],
    colHeaders: ['Mã sản phẩm', 'Vị trí bày mẫu'],
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
      if (tableMode === 'task' && !suppressTaskChange && source !== 'realtime' && source !== 'rpc') {
        for (const [row, prop, oldValue, newValue] of changes) {
          if (prop === 'da_baymau' && oldValue !== newValue) updateTaskItem(row, !!newValue);
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
        if (row.da_baymau && coords.col > 0) {
          setMessage(`Đã bày bởi ${row.baymau_tennv || row.baymau_manv || 'nhân viên'}${row.baymau_at ? ' lúc ' + row.baymau_at : ''}.`, 'ok');
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
  const data = rows.length ? rows : [{ id: null, masp: '', vitri_baymau: '' }];
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 170 },
      { data: 'vitri_baymau', type: 'text', width: 150 }
    ],
    colHeaders: ['Mã sản phẩm', 'Vị trí bày mẫu'],
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
      { data: 'vitri_baymau', type: 'text', width: 135, readOnly: true },
      { data: 'vitri_kho', type: 'text', width: 125, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Vị trí bày', 'Vị trí kho'],
    cells: buildCellsRenderer,
    readOnly: true
  });
  hot.loadData(rows);
  hot.render();
}

function showMultiLocationTable(rows) {
  tableMode = 'multi';
  hot.updateSettings({
    columns: [
      { data: 'masp', type: 'text', width: 160, readOnly: true },
      { data: 'vitri_baymau', type: 'text', width: 220, readOnly: true }
    ],
    colHeaders: ['Mã SP', 'Các vị trí bày mẫu'],
    cells: buildCellsRenderer,
    readOnly: true
  });
  hot.loadData(rows.length ? rows : [{ masp: 'Không có mã bày nhiều vị trí', vitri_baymau: '' }]);
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

async function validateMasp(masp) {
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp')
    .eq('masp', masp)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function handleScan() {
  if (tableMode !== 'scan') showScanTable(scanRowsForSave());

  const vitri = normalizeText($('current-location').value);
  const masp = normalizeMasp($('scan-masp').value);
  if (!vitri) {
    setMessage('Bạn phải nhập vị trí bày mẫu trước khi quét.', 'warn');
    $('current-location').focus();
    return;
  }
  if (!masp) return;

  $('scan-masp').disabled = true;
  try {
    const valid = await validateMasp(masp);
    if (!valid) {
      setMessage(`Mã ${masp} không tồn tại trong danh mục hàng hóa.`, 'err');
      $('scan-masp').value = '';
      return;
    }

    const rows = scanRowsForSave();
    rows.unshift({ id: null, masp, vitri_baymau: vitri });
    showScanTable(rows);
    setDirty(true);
    setMessage(`Đã thêm ${masp} tại ${vitri}.`, 'ok');
    $('scan-masp').value = '';
    hot.scrollViewportTo(0, 0);
  } catch (err) {
    console.error(err);
    setMessage(`Không kiểm tra được mã sản phẩm: ${err.message || err}`, 'err');
  } finally {
    $('scan-masp').disabled = false;
    setTimeout(() => focusScan(), 0);
  }
}

async function saveSession() {
  const rows = scanRowsForSave();
  if (!rows.length) {
    setMessage('Chưa có dữ liệu mã sản phẩm và vị trí bày mẫu để lưu.', 'warn');
    return;
  }

  $('btn-save').disabled = true;
  setMessage(`Đang lưu ${rows.length} dòng dữ liệu...`);
  try {
    const { data, error } = await supabase.rpc('kbm_save_session', {
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
  const { data, error } = await supabase.rpc('kbm_list_sessions', { p_coso: currentCoSo });
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
    const { data, error } = await supabase.rpc('kbm_load_session', { p_phien_id: id });
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
      vitri_baymau: normalizeText(r.vitri_baymau)
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
    showStockLocationTable(rows.map((r) => ({ ...r, vitri_kho: map.get(r.masp) || '' })));
    setMessage(`Đã tải vị trí kho ${currentCoSo.toUpperCase()} cho ${rows.length} dòng.`, 'ok');
  } catch (err) {
    setMessage(`Không tải được vị trí kho: ${err.message || err}`, 'err');
  }
}

function showMultiLocations() {
  if (!requireSaved()) return;
  const grouped = new Map();
  scanRowsForSave().forEach((r) => {
    if (!grouped.has(r.masp)) grouped.set(r.masp, new Set());
    grouped.get(r.masp).add(r.vitri_baymau);
  });
  const results = Array.from(grouped.entries())
    .map(([masp, set]) => ({ masp, vitri_baymau: Array.from(set).join(', '), count: set.size }))
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count || a.masp.localeCompare(b.masp, 'vi'));
  showMultiLocationTable(results);
  setMessage(`Có ${results.length} mã đang bày tại nhiều vị trí.`, results.length ? 'warn' : 'ok');
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
    const { data, error } = await supabase.rpc('kbm_stock_after_check', {
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
  setMessage('Đang lấy danh sách hàng đã bán/nhập nhưng chưa thấy bày mẫu...');
  try {
    const { data: candidates, error } = await supabase.rpc('kbm_hang_chua_bay_candidates', {
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
    showUnshownTable(result, { source: 'HANG_CHUA_BAY', from, to, chungloai, nhomhang: nhom, phien_id: currentSessionId });
    setMessage(`Tìm thấy ${result.length} mã cần xem xét bày mẫu. Đã xử lý ${rows.length} mã theo từng lô; tồn bằng 0 đã bỏ qua.`, 'ok');
  } catch (err) {
    setMessage(`Kiểm tra hàng chưa bày mẫu thất bại: ${err.message || err}`, 'err');
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
    const { data, error } = await supabase.rpc('kbm_merge_sessions', {
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
    const { data, error } = await supabase.rpc('kbm_admin_delete_sessions', {
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
    const { data, error } = await supabase.rpc('kbm_admin_set_standard', {
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
    const { data, error } = await supabase.rpc('kbm_compare_sessions_candidates', {
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
  const done = currentTaskRows.filter(r => r.da_baymau).length;
  return `${done}/${total}`;
}

function showTaskTable(task, rows) {
  tableMode = 'task';
  currentTaskId = task.id;
  currentTaskCode = task.macongviec || '';
  currentTaskStatus = task.trangthai || 'DANG_LAM';
  currentTaskRows = Array.isArray(rows) ? rows.slice().sort((a,b) => Number(a.thu_tu)-Number(b.thu_tu)) : [];
  hot.updateSettings({
    columns: [
      { data: 'da_baymau', type: 'checkbox', width: 48, readOnly: currentTaskStatus !== 'DANG_LAM' },
      { data: 'masp', type: 'text', width: 145, readOnly: true },
      { data: 'ton', type: 'numeric', width: 58, readOnly: true },
      { data: 'vitrikho', type: 'text', width: 105, readOnly: true }
    ],
    colHeaders: ['Đã bày', 'Mã SP', 'Tồn', 'Vị trí kho'],
    cells: buildCellsRenderer,
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
  setMessage(`Phiếu ${task.ten_congviec || task.macongviec}: ${taskProgressText()}. Thứ tự dòng được giữ nguyên trên mọi máy.`, currentTaskStatus === 'HOAN_TAT' ? 'ok' : '');
  subscribeTaskRealtime();
}

async function saveCurrentResultAsTask() {
  if (!isAdmin) return;
  if (tableMode !== 'unshown' || !currentResultRows.length) {
    setMessage('Hãy mở kết quả hàng chưa bày mẫu hoặc kết quả so sánh trước khi lưu giao việc.', 'warn');
    return;
  }
  const suggested = currentResultContext?.source === 'SO_SANH_PHIEN'
    ? `Bày mẫu so sánh ${currentSessionCode || ''}`
    : `Bày mẫu ${$('category-select').value || ''} ${$('group-select').value || ''}`.trim();
  const name = prompt('Tên phiếu giao bày mẫu:', suggested);
  if (name === null) return;
  try {
    const ctx = currentResultContext || {};
    const { data, error } = await supabase.rpc('kbm_admin_create_task', {
      p_coso: currentCoSo,
      p_ten_congviec: normalizeText(name) || suggested || 'Phiếu bày mẫu',
      p_nguon: ctx.source || 'HANG_CHUA_BAY',
      p_phien_nguon_id: ctx.phien_id || currentSessionId,
      p_tu_ngay: ctx.from || null,
      p_den_ngay: ctx.to || null,
      p_chungloai: ctx.chungloai || null,
      p_nhomhang: ctx.nhomhang || null,
      p_rows: currentResultRows.map(x => ({ masp:x.masp, ton:Number(x.ton||0), vitrikho:x.vitrikho||'' }))
    });
    if (error) throw error;
    setMessage(`Đã tạo phiếu ${data.macongviec} gồm ${data.so_dong} mã.`, 'ok');
  } catch (err) {
    setMessage(`Không lưu được phiếu giao bày mẫu: ${err.message || err}`, 'err');
  }
}

async function showTaskList() {
  try {
    const { data, error } = await supabase.rpc('kbm_list_tasks', { p_coso: currentCoSo });
    if (error) throw error;
    const rows = data || [];
    $('task-list').innerHTML = rows.length ? rows.map(t => `
      <div class="session-row task-list-row" data-id="${t.id}">
        <div></div><div class="session-main">
          <div class="session-title">${t.ten_congviec} · ${t.da_bay}/${t.tong_dong}${t.trangthai==='HOAN_TAT' ? ' · HOÀN TẤT' : ''}</div>
          <div class="session-meta">${t.macongviec} · ${t.ngay_tao} · ${t.tennv_tao || ''}</div>
        </div>
      </div>`).join('') : '<div>Chưa có phiếu giao bày mẫu.</div>';
    $('task-list').querySelectorAll('.task-list-row').forEach(el => el.addEventListener('click', () => loadTask(el.dataset.id)));
    $('task-modal').classList.add('show');
  } catch (err) { setMessage(`Không tải được danh sách công việc: ${err.message || err}`, 'err'); }
}

function closeTaskModal() { $('task-modal').classList.remove('show'); }

async function loadTask(id) {
  try {
    const { data, error } = await supabase.rpc('kbm_load_task', { p_congviec_id:id, p_coso:currentCoSo });
    if (error) throw error;
    closeTaskModal();
    showTaskTable(data, data.rows || []);
  } catch (err) { setMessage(`Không mở được phiếu: ${err.message || err}`, 'err'); }
}

async function updateTaskItem(rowIndex, done) {
  const row = hot.getSourceDataAtRow(rowIndex);
  if (!row?.id || !currentTaskId) return;
  try {
    const { data, error } = await supabase.rpc('kbm_set_task_item_done', {
      p_chitiet_id: row.id,
      p_congviec_id: currentTaskId,
      p_coso: currentCoSo,
      p_da_baymau: done
    });
    if (error) throw error;
    Object.assign(row, data);
    currentTaskRows[rowIndex] = row;
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'da_baymau', data.da_baymau, 'rpc');
    suppressTaskChange = false;
    hot.render();
    setMessage(`${data.masp}: ${data.da_baymau ? 'đã bày bởi ' + (data.baymau_tennv || data.baymau_manv || '') + ' lúc ' + (data.baymau_at || '') : 'đã bỏ đánh dấu'}. Tiến độ ${taskProgressText()}.`, 'ok');
  } catch (err) {
    suppressTaskChange = true;
    hot.setDataAtRowProp(rowIndex, 'da_baymau', !done, 'rpc');
    suppressTaskChange = false;
    setMessage(`Không lưu được đánh dấu: ${err.message || err}`, 'err');
  }
}

function subscribeTaskRealtime() {
  unsubscribeTaskRealtime();
  if (!currentTaskId) return;
  taskRealtimeChannel = supabase.channel(`kbm-task-${currentTaskId}-${Date.now()}`)
    .on('postgres_changes', {
      event:'UPDATE', schema:'public', table:'kiem_baymau_congviec_chitiet',
      filter:`congviec_id=eq.${currentTaskId}`
    }, payload => {
      const n = payload.new || {};
      const idx = currentTaskRows.findIndex(r => r.id === n.id);
      if (idx < 0) return;
      currentTaskRows[idx] = { ...currentTaskRows[idx], ...n,
        ton: currentTaskRows[idx].ton,
        vitrikho: currentTaskRows[idx].vitrikho,
        baymau_at: n.baymau_at ? new Date(n.baymau_at).toLocaleString('vi-VN') : null
      };
      suppressTaskChange = true;
      hot.setDataAtRowProp(idx, 'da_baymau', !!n.da_baymau, 'realtime');
      suppressTaskChange = false;
      hot.render();
      setMessage(`Tiến độ phiếu ${currentTaskCode}: ${taskProgressText()}.`, 'ok');
    }).subscribe();
}

async function toggleTaskComplete() {
  if (!isAdmin || !currentTaskId) return;
  const next = currentTaskStatus === 'HOAN_TAT' ? 'DANG_LAM' : 'HOAN_TAT';
  const total = currentTaskRows.length;
  const done = currentTaskRows.filter(r => r.da_baymau).length;
  if (next === 'HOAN_TAT' && done < total && !confirm(`Phiếu còn ${total-done} mã chưa bày. Vẫn hoàn tất?`)) return;
  try {
    const { data, error } = await supabase.rpc('kbm_admin_set_task_status', { p_congviec_id:currentTaskId, p_coso:currentCoSo, p_trangthai:next });
    if (error) throw error;
    currentTaskStatus = data.trangthai;
    showTaskTable({ id:currentTaskId, macongviec:currentTaskCode, ten_congviec:currentTaskCode, trangthai:currentTaskStatus }, currentTaskRows);
  } catch (err) { setMessage(`Không đổi được trạng thái phiếu: ${err.message || err}`, 'err'); }
}

async function saveBayMauToCatalog() {
  if (!isAdmin || !requireSaved()) return;
  if (!confirm('Hệ thống chỉ lưu các mã có đúng một vị trí bày mẫu. Các mã nhiều vị trí sẽ không được lưu. Tiếp tục?')) return;
  try {
    const { data, error } = await supabase.rpc('kbm_admin_save_baymau', { p_phien_id: currentSessionId });
    if (error) throw error;
    const conflicts = data?.conflicts || [];
    if (conflicts.length) {
      showMultiLocationTable(conflicts.map((x) => ({ masp: x.masp, vitri_baymau: (x.positions || []).join(', ') })));
      setMessage(`Đã lưu ${data.updated_count || 0} mã có một vị trí. Còn ${conflicts.length} mã nhiều vị trí chưa được lưu.`, 'warn');
    } else {
      setMessage(`Đã lưu vị trí bày mẫu vào danh mục cho ${data.updated_count || 0} mã.`, 'ok');
    }
  } catch (err) {
    setMessage(`Không lưu được vị trí bày mẫu: ${err.message || err}`, 'err');
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
  $('btn-load-stock-location').addEventListener('click', loadStockLocations);
  $('btn-multi-location').addEventListener('click', showMultiLocations);
  $('btn-run-unshown').addEventListener('click', runUnshown);
  $('group-picker').addEventListener('change', appendSelectedGroup);
  $('group-select').addEventListener('blur', (e) => { e.target.value = normalizeGroupList(e.target.value); });
  $('btn-delete-rows').addEventListener('click', deleteSelectedRows);
  $('btn-new-session').addEventListener('click', newSession);
  $('btn-back-main').addEventListener('click', () => {
    unsubscribeTaskRealtime();
    currentTaskId = null;
    $('btn-task-complete').style.display = 'none';
    showScanTable(scanRowsForSave());
    setMessage('Đã trở lại bảng quét.', 'ok');
  });
  $('btn-merge').addEventListener('click', showMergeSessions);
  $('btn-confirm-merge').addEventListener('click', confirmMerge);
  $('btn-save-baymau').addEventListener('click', saveBayMauToCatalog);
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
