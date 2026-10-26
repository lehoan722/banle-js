import { supabase } from './supabaseClient.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

const TABLE_NAME = 'dm_vitri';
const PAGE_SIZE = 1000;

const FIELDS = [
  'ma_vitri',
  'ten_vitri',
  'loai_vitri',
  'co_so',
  'khu_vuc',
  'thu_tu',
  'active',
  'ghi_chu'
];

let hot = null;
let originalById = new Map();
let currentLoadedRows = [];
let lastLoadArgs = null;
let suppressStatusRefresh = false;

function el(id) { return document.getElementById(id); }

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setSummary(html) {
  const node = el('summary');
  if (node) node.innerHTML = html;
}

function normalizeText(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizeUpper(v) {
  const s = normalizeText(v);
  return s === null ? null : s.toUpperCase();
}

function normalizeInteger(v) {
  if (v === undefined || v === null || String(v).trim() === '') return 0;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function normalizeBoolean(v) {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null || String(v).trim() === '') return true;
  const s = String(v).trim().toLowerCase();
  if (['1','true','yes','y','co','có','x','active','dang dung','đang dùng'].includes(s)) return true;
  if (['0','false','no','n','khong','không','inactive','ngung dung','ngừng dùng'].includes(s)) return false;
  return null;
}

function normalizeRow(row) {
  return {
    id: row?.id || null,
    ma_vitri: normalizeUpper(row?.ma_vitri),
    ten_vitri: normalizeText(row?.ten_vitri),
    loai_vitri: normalizeUpper(row?.loai_vitri),
    co_so: normalizeUpper(row?.co_so),
    khu_vuc: normalizeText(row?.khu_vuc),
    thu_tu: normalizeInteger(row?.thu_tu),
    active: normalizeBoolean(row?.active),
    ghi_chu: normalizeText(row?.ghi_chu),
    __status: row?.__status || '',
    __error: row?.__error || ''
  };
}

function businessSnapshot(row) {
  const n = normalizeRow(row);
  const out = {};
  FIELDS.forEach(k => { out[k] = n[k]; });
  return out;
}

function sameBusinessData(a, b) {
  return JSON.stringify(businessSnapshot(a)) === JSON.stringify(businessSnapshot(b));
}

function hasBusinessData(row) {
  if (!row) return false;
  // Không coi active=true hoặc thu_tu=0 mặc định là một dòng dữ liệu thật.
  // Một dòng chỉ được tính khi người dùng đã nhập ít nhất một trường nhận diện/nội dung.
  const meaningfulFields = ['ma_vitri','ten_vitri','loai_vitri','co_so','khu_vuc','ghi_chu'];
  return meaningfulFields.some(k => {
    const v = row[k];
    return !(v === null || v === undefined || String(v).trim() === '');
  });
}

function keyOf(row) {
  const coSo = normalizeUpper(row?.co_so) || '';
  const loai = normalizeUpper(row?.loai_vitri) || '';
  const ma = normalizeUpper(row?.ma_vitri) || '';
  return `${coSo}|||${loai}|||${ma}`;
}

function blankRow() {
  return {
    id: null,
    ma_vitri: null,
    ten_vitri: null,
    loai_vitri: null,
    co_so: null,
    khu_vuc: null,
    thu_tu: 0,
    active: true,
    ghi_chu: null,
    __status: '',
    __error: ''
  };
}

function getRowState(row) {
  if (!hasBusinessData(row)) return { status: '', error: '' };
  if (row.__error) return { status: 'LỖI', error: row.__error };
  if (!row.id) return { status: 'MỚI', error: '' };
  const original = originalById.get(row.id);
  if (!original) return { status: 'MỚI', error: '' };
  if (sameBusinessData(row, original)) return { status: 'KHÔNG ĐỔI', error: '' };
  return { status: 'ĐÃ SỬA', error: '' };
}

function refreshRowStatuses(rows = null) {
  if (!hot || suppressStatusRefresh) return;
  const data = hot.getSourceData();
  const rowIndexes = Array.isArray(rows) ? rows : data.map((_, i) => i);
  suppressStatusRefresh = true;
  hot.batch(() => {
    for (const r of rowIndexes) {
      const row = data[r];
      if (!row) continue;
      const state = getRowState(row);
      row.__status = state.status;
      if (!state.error) row.__error = row.__error || '';
      hot.setDataAtRowProp(r, '__status', state.status, 'statusRefresh');
    }
  });
  suppressStatusRefresh = false;
  hot.render();
}

function initTable() {
  const container = el('hot');
  if (!container) return;
  if (hot) hot.destroy();

  hot = new Handsontable(container, {
    data: [blankRow()],
    columns: [
      { data: 'ma_vitri', type: 'text', width: 125 },
      { data: 'ten_vitri', type: 'text', width: 190 },
      { data: 'loai_vitri', type: 'text', width: 135 },
      { data: 'co_so', type: 'dropdown', source: ['CS1','CS2'], strict: false, allowInvalid: true, width: 85 },
      { data: 'khu_vuc', type: 'text', width: 140 },
      { data: 'thu_tu', type: 'numeric', numericFormat: { pattern: '0' }, width: 80 },
      { data: 'active', type: 'checkbox', width: 90 },
      { data: 'ghi_chu', type: 'text', width: 220 },
      { data: '__status', type: 'text', readOnly: true, width: 110 }
    ],
    colHeaders: ['Mã vị trí','Tên vị trí','Loại vị trí','Cơ sở','Khu vực','Thứ tự','Đang dùng','Ghi chú','Trạng thái'],
    rowHeaders: true,
    minSpareRows: 1,
    minRows: 20,
    width: '100%',
    height: 620,
    stretchH: 'all',
    manualColumnResize: true,
    manualRowMove: true,
    copyPaste: true,
    contextMenu: true,
    licenseKey: 'non-commercial-and-evaluation',

    beforeChange(changes, source) {
      if (!changes || ['loadData','statusRefresh'].includes(source)) return;
      for (const change of changes) {
        const [rowIndex, prop, oldVal, newVal] = change;
        if (!FIELDS.includes(prop)) continue;
        if (prop === 'ma_vitri' || prop === 'loai_vitri' || prop === 'co_so') {
          change[3] = normalizeUpper(newVal);
        } else if (prop === 'thu_tu') {
          if (newVal === '' || newVal === null || newVal === undefined) change[3] = 0;
        } else if (prop === 'active') {
          const b = normalizeBoolean(newVal);
          if (b !== null) change[3] = b;
        }
      }
    },

    afterChange(changes, source) {
      if (!changes || ['loadData','statusRefresh'].includes(source)) return;
      const rows = [...new Set(changes.map(c => c[0]))];
      rows.forEach(r => {
        const row = hot.getSourceDataAtRow(r);
        if (row) { row.__error = ''; }
      });
      refreshRowStatuses(rows);
    },

    cells(row, col) {
      const cp = {};
      const src = this.instance.getSourceDataAtRow(row) || {};
      if (src.__error) cp.className = 'row-error';
      if (col === 8) {
        const st = src.__status;
        if (st === 'MỚI') cp.className = 'status-new';
        else if (st === 'ĐÃ SỬA') cp.className = 'status-changed';
        else if (st === 'OK') cp.className = 'status-ok';
        else if (st === 'LỖI') cp.className = 'status-error';
        else if (st === 'KHÔNG ĐỔI') cp.className = 'status-same';
      }
      return cp;
    }
  });
}

function buildFiltersFromUI() {
  return {
    co_so: normalizeUpper(el('filter-coso')?.value || ''),
    loai_vitri: normalizeText(el('filter-loai')?.value || ''),
    khu_vuc: normalizeText(el('filter-khuvuc')?.value || ''),
    active: el('filter-active')?.value ?? 'true',
    search: normalizeText(el('filter-search')?.value || '')
  };
}

async function fetchAllRows(filters) {
  const rows = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from(TABLE_NAME)
      .select('id,ma_vitri,ten_vitri,loai_vitri,co_so,khu_vuc,thu_tu,active,ghi_chu,created_at,updated_at')
      .order('co_so', { ascending: true })
      .order('loai_vitri', { ascending: true })
      .order('khu_vuc', { ascending: true, nullsFirst: false })
      .order('thu_tu', { ascending: true })
      .order('ma_vitri', { ascending: true });

    if (filters?.co_so) q = q.eq('co_so', filters.co_so);
    if (filters?.loai_vitri) q = q.ilike('loai_vitri', `%${filters.loai_vitri}%`);
    if (filters?.khu_vuc) q = q.ilike('khu_vuc', `%${filters.khu_vuc}%`);
    if (filters?.active === 'true') q = q.eq('active', true);
    if (filters?.active === 'false') q = q.eq('active', false);
    if (filters?.search) {
      const safe = filters.search.replace(/,/g, ' ');
      q = q.or(`ma_vitri.ilike.%${safe}%,ten_vitri.ilike.%${safe}%`);
    }

    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function loadRowsIntoTable(rows) {
  originalById = new Map();
  currentLoadedRows = rows.map(r => normalizeRow(r));

  for (const row of currentLoadedRows) {
    if (row.id) originalById.set(row.id, businessSnapshot(row));
    row.__status = 'KHÔNG ĐỔI';
    row.__error = '';
  }

  hot.loadData(currentLoadedRows.length ? currentLoadedRows : [blankRow()]);
  refreshRowStatuses();
}

async function loadData(filters = null) {
  if (!hot) return;
  const f = filters || buildFiltersFromUI();
  lastLoadArgs = { ...f };

  setSummary('⏳ Đang tải danh mục vị trí...');
  const rows = await fetchAllRows(f);
  loadRowsIntoTable(rows);
  setSummary(`✅ Đã tải <b>${rows.length}</b> vị trí.`);
}

async function loadAll() {
  el('filter-coso').value = '';
  el('filter-loai').value = '';
  el('filter-khuvuc').value = '';
  el('filter-active').value = '';
  el('filter-search').value = '';
  await loadData({ co_so:null, loai_vitri:null, khu_vuc:null, active:'', search:null });
}

function getRelevantRows() {
  if (!hot) return [];
  return hot.getSourceData()
    .map((r, rowIndex) => ({ rowIndex, row: r }))
    .filter(x => hasBusinessData(x.row));
}

function validateRowsLocal() {
  const items = getRelevantRows();
  const errors = [];
  const keyMap = new Map();

  for (const item of items) {
    const r = normalizeRow(item.row);
    item.row.__error = '';

    if (!r.ma_vitri) errors.push({ ...item, msg: 'Thiếu Mã vị trí' });
    if (!r.loai_vitri) errors.push({ ...item, msg: 'Thiếu Loại vị trí' });
    if (!r.co_so) errors.push({ ...item, msg: 'Thiếu Cơ sở' });
    if (r.co_so && !['CS1','CS2'].includes(r.co_so)) errors.push({ ...item, msg: 'Cơ sở chỉ cho phép CS1 hoặc CS2' });
    if (!Number.isInteger(r.thu_tu) || Number.isNaN(r.thu_tu)) errors.push({ ...item, msg: 'Thứ tự phải là số nguyên' });
    if (r.active === null) errors.push({ ...item, msg: 'Đang dùng chỉ nhận TRUE/FALSE hoặc 1/0' });

    const key = keyOf(r);
    if (r.ma_vitri && r.loai_vitri && r.co_so) {
      if (keyMap.has(key)) {
        const other = keyMap.get(key);
        errors.push({ ...item, msg: `Trùng khóa với dòng ${other.rowIndex + 1}: Cơ sở + Loại + Mã vị trí` });
      } else {
        keyMap.set(key, item);
      }
    }
  }

  // Gộp lỗi theo dòng và đánh dấu
  const byRow = new Map();
  errors.forEach(e => {
    if (!byRow.has(e.rowIndex)) byRow.set(e.rowIndex, []);
    byRow.get(e.rowIndex).push(e.msg);
  });
  byRow.forEach((msgs, rowIndex) => {
    const row = hot.getSourceDataAtRow(rowIndex);
    row.__error = msgs.join('; ');
    row.__status = 'LỖI';
  });

  refreshRowStatuses();
  hot.render();
  return { ok: errors.length === 0, errors, items };
}

async function fetchDbKeys() {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id,co_so,loai_vitri,ma_vitri')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function validateAgainstDatabase() {
  const local = validateRowsLocal();
  if (!local.ok) return local;

  const dbRows = await fetchDbKeys();
  const dbMap = new Map();
  dbRows.forEach(r => dbMap.set(keyOf(r), r));

  const errors = [];
  for (const item of local.items) {
    const r = normalizeRow(item.row);
    const found = dbMap.get(keyOf(r));
    if (found && found.id !== r.id) {
      const msg = `Khóa Cơ sở + Loại + Mã đã tồn tại trong database`;
      item.row.__error = msg;
      item.row.__status = 'LỖI';
      errors.push({ ...item, msg });
    }
  }

  hot.render();
  return { ok: errors.length === 0, errors, items: local.items };
}

function summarizeChanges() {
  const items = getRelevantRows();
  let added = 0, changed = 0, same = 0, error = 0;
  for (const { row } of items) {
    const state = getRowState(row).status;
    if (state === 'MỚI') added++;
    else if (state === 'ĐÃ SỬA') changed++;
    else if (state === 'KHÔNG ĐỔI') same++;
    else if (state === 'LỖI') error++;
  }
  return { total: items.length, added, changed, same, error };
}

async function checkData() {
  try {
    setSummary('⏳ Đang kiểm tra dữ liệu và đối chiếu trùng trong database...');
    const result = await validateAgainstDatabase();
    const s = summarizeChanges();
    if (!result.ok) {
      const details = result.errors.slice(0, 20).map(e => `Dòng ${e.rowIndex + 1}: ${escHtml(e.msg)}`).join('<br>');
      setSummary(`❌ Có <b>${result.errors.length}</b> lỗi. ${details ? `<details><summary>Xem lỗi</summary>${details}</details>` : ''}`);
      return false;
    }
    setSummary(`✅ Dữ liệu hợp lệ: <b>${s.total}</b> dòng | <b>${s.added}</b> mới | <b>${s.changed}</b> đã sửa | <b>${s.same}</b> không đổi.`);
    return true;
  } catch (err) {
    console.error(err);
    alert('Lỗi khi kiểm tra dữ liệu: ' + (err?.message || err));
    setSummary('❌ Không kiểm tra được dữ liệu.');
    return false;
  }
}

function addRows() {
  const count = 10;
  hot.alter('insert_row_below', hot.countRows(), count);
  const start = Math.max(0, hot.countRows() - count - 1);
  for (let i = start; i < hot.countRows(); i++) {
    const row = hot.getSourceDataAtRow(i);
    if (row && row.active === undefined) row.active = true;
    if (row && row.thu_tu === undefined) row.thu_tu = 0;
  }
  hot.selectCell(Math.max(0, hot.countRows() - count - 1), 0);
  setSummary(`➕ Đã thêm ${count} dòng trống. Có thể dán dữ liệu từ Google Sheets vào ngay.`);
}

function reorderVisibleRows() {
  const rows = getRelevantRows();
  if (!rows.length) {
    alert('Không có dòng dữ liệu để đánh lại thứ tự.');
    return;
  }
  if (!confirm(`Đánh lại cột Thứ tự cho ${rows.length} dòng hiện trên bảng thành 10, 20, 30...?`)) return;

  hot.batch(() => {
    rows.forEach((item, idx) => {
      hot.setDataAtRowProp(item.rowIndex, 'thu_tu', (idx + 1) * 10, 'reorder');
    });
  });
  refreshRowStatuses(rows.map(x => x.rowIndex));
  setSummary(`🔢 Đã đánh lại thứ tự cho ${rows.length} dòng.`);
}

async function copyAll() {
  const items = getRelevantRows();
  if (!items.length) {
    alert('Không có dữ liệu để copy.');
    return;
  }

  const headers = ['Mã vị trí','Tên vị trí','Loại vị trí','Cơ sở','Khu vực','Thứ tự','Đang dùng','Ghi chú'];
  const lines = [headers.join('\t')];
  for (const { row } of items) {
    const r = normalizeRow(row);
    lines.push([
      r.ma_vitri ?? '',
      r.ten_vitri ?? '',
      r.loai_vitri ?? '',
      r.co_so ?? '',
      r.khu_vuc ?? '',
      Number.isFinite(r.thu_tu) ? r.thu_tu : '',
      r.active ? 'TRUE' : 'FALSE',
      r.ghi_chu ?? ''
    ].map(v => String(v).replace(/\t|\r?\n/g, ' ')).join('\t'));
  }

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    setSummary(`📋 Đã copy ${items.length} dòng vào clipboard. Có thể dán thẳng sang Google Sheets/Excel.`);
  } catch (e) {
    console.warn(e);
    alert('Trình duyệt không cho phép ghi clipboard tự động. Hãy chọn vùng trong bảng rồi Ctrl+C.');
  }
}

function collectChangesForSave() {
  const inserts = [];
  const updates = [];

  for (const { rowIndex, row } of getRelevantRows()) {
    const n = normalizeRow(row);
    const payload = businessSnapshot(n);

    if (!n.id) {
      inserts.push({ rowIndex, row, payload });
      continue;
    }

    const original = originalById.get(n.id);
    if (!original || JSON.stringify(payload) !== JSON.stringify(original)) {
      updates.push({ rowIndex, row, id: n.id, payload });
    }
  }
  return { inserts, updates };
}

async function saveChanges() {
  try {
    const valid = await checkData();
    if (!valid) return;

    const { inserts, updates } = collectChangesForSave();
    if (!inserts.length && !updates.length) {
      alert('Không có thay đổi nào cần lưu.');
      return;
    }

    const message = `Sắp lưu ${inserts.length} dòng mới và ${updates.length} dòng đã sửa.\n\n` +
      `Lưu ý: vị trí ngừng sử dụng nên đặt Active = FALSE, không xóa vật lý.\n\nBạn chắc chắn muốn tiếp tục?`;
    if (!confirm(message)) return;

    setSummary(`⏳ Đang lưu ${inserts.length + updates.length} dòng...`);
    let ok = 0;
    let fail = 0;
    const errors = [];

    // UPDATE từng dòng theo ID để đổi được cả mã/loại/cơ sở mà vẫn đúng bản ghi.
    for (const item of updates) {
      const payload = { ...item.payload, updated_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(payload)
        .eq('id', item.id)
        .select('id');

      if (error || !data?.length) {
        fail++;
        item.row.__status = 'LỖI';
        item.row.__error = error?.message || 'Không cập nhật được dòng';
        errors.push(`Dòng ${item.rowIndex + 1}: ${item.row.__error}`);
      } else {
        ok++;
        item.row.__status = 'OK';
        item.row.__error = '';
      }
    }

    // INSERT theo nhóm nhỏ để dễ xác định lỗi và không gửi request quá lớn.
    const insertChunkSize = 100;
    for (let i = 0; i < inserts.length; i += insertChunkSize) {
      const chunk = inserts.slice(i, i + insertChunkSize);
      const payloads = chunk.map(x => ({ ...x.payload, updated_at: new Date().toISOString() }));
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(payloads)
        .select('id,ma_vitri,loai_vitri,co_so');

      if (error) {
        fail += chunk.length;
        chunk.forEach(x => {
          x.row.__status = 'LỖI';
          x.row.__error = error.message;
          errors.push(`Dòng ${x.rowIndex + 1}: ${error.message}`);
        });
      } else {
        ok += chunk.length;
        const idMap = new Map((data || []).map(r => [keyOf(r), r.id]));
        chunk.forEach(x => {
          x.row.id = idMap.get(keyOf(x.payload)) || x.row.id || null;
          x.row.__status = 'OK';
          x.row.__error = '';
        });
      }
    }

    hot.render();

    if (fail) {
      setSummary(`⚠️ Đã lưu: <b style="color:#15803d">${ok} OK</b>, <b style="color:#dc2626">${fail} lỗi</b>. ` +
        `<details><summary>Xem chi tiết</summary>${errors.slice(0, 50).map(escHtml).join('<br>')}</details>`);
      return;
    }

    setSummary(`✅ Đã lưu thành công <b>${ok}</b> dòng. Đang tải lại dữ liệu chuẩn từ database...`);
    await loadData(lastLoadArgs || buildFiltersFromUI());
  } catch (err) {
    console.error(err);
    alert('Lỗi khi lưu danh mục vị trí: ' + (err?.message || err));
    setSummary('❌ Lưu dữ liệu thất bại.');
  }
}

function attachEvents() {
  el('btn-load')?.addEventListener('click', () => loadData().catch(handleError));
  el('btn-load-all')?.addEventListener('click', () => loadAll().catch(handleError));
  el('btn-add')?.addEventListener('click', addRows);
  el('btn-check')?.addEventListener('click', checkData);
  el('btn-reorder')?.addEventListener('click', reorderVisibleRows);
  el('btn-copy')?.addEventListener('click', copyAll);
  el('btn-save')?.addEventListener('click', saveChanges);
  el('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Hủy toàn bộ thay đổi chưa lưu và tải lại dữ liệu từ database?')) return;
    await loadData(lastLoadArgs || buildFiltersFromUI());
  });

  ['filter-search','filter-loai','filter-khuvuc'].forEach(id => {
    el(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') loadData().catch(handleError);
    });
  });
}

function handleError(err) {
  console.error(err);
  alert('Có lỗi: ' + (err?.message || err));
  setSummary('❌ Có lỗi khi xử lý dữ liệu.');
}

function setStartupStatus(message, isError = false) {
  const node = document.getElementById('startup-status');
  if (!node) return;
  node.style.display = 'block';
  node.style.color = isError ? '#b42318' : '#111827';
  node.innerHTML = message;
}

function hideStartupStatus() {
  const node = document.getElementById('startup-status');
  if (node) node.style.display = 'none';
}

async function ensureHandsontable() {
  if (typeof window.Handsontable !== 'undefined') return true;

  setStartupStatus('⏳ Thư viện bảng chưa tải được từ CDN chính. Đang thử nguồn dự phòng...');

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/handsontable@10.0.0/dist/handsontable.full.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được Handsontable từ cả CDN chính và CDN dự phòng.'));
    document.head.appendChild(script);
  });

  return typeof window.Handsontable !== 'undefined';
}

async function startBusinessUI() {
  try {
    const ok = await ensureHandsontable();
    if (!ok) throw new Error('Handsontable chưa sẵn sàng.');

    initTable();
    attachEvents();

    const app = document.getElementById('app-container');
    if (app) app.style.display = 'block';
    hideStartupStatus();

    await loadData();
  } catch (err) {
    console.error('Lỗi khởi tạo suadmvitri:', err);
    setStartupStatus(
      '❌ Không khởi tạo được trang Quản lý Danh mục Vị trí.<br>' +
      '<b>Chi tiết:</b> ' + escHtml(err?.message || err) +
      '<br><br>Hãy kiểm tra Network xem file <b>scripts/suadmvitri.js</b>, <b>supabaseClient.js</b>, <b>authModule.js</b> và Handsontable có trả về HTTP 200 hay không.',
      true
    );
  }
}

(function initPage() {
  setStartupStatus('⏳ Đang kiểm tra đăng nhập Admin...');

  try {
    // Quan trọng: KHÔNG khởi tạo Handsontable trước đăng nhập.
    // Nếu CDN bảng lỗi, trang đăng nhập vẫn phải hoạt động thay vì trắng hoàn toàn.
    khoiTaoDangNhapDungChung({
      appContainerId: 'app-container',
      macDinhDiaDiem: 'cs1',
      tuDongKhoaCoSo: true,
      loginApiPath: '/api/login-cs1',
      onLoginSuccess: async (nhanvien) => {
        if (!nhanvien?.is_admin) {
          alert('Bạn không có quyền truy cập trang QUẢN LÝ DANH MỤC VỊ TRÍ.\nChỉ admin mới được phép chỉnh sửa!');
          await dangXuatDungChung({ appContainerId: 'app-container' });
          return;
        }

        console.log('Admin đăng nhập thành công vào suadmvitri:', nhanvien.manv);
        setStartupStatus('⏳ Đăng nhập thành công. Đang khởi tạo bảng dữ liệu...');
        await startBusinessUI();
      }
    });
  } catch (err) {
    console.error('Lỗi gọi authModule:', err);
    setStartupStatus(
      '❌ Không khởi tạo được module đăng nhập.<br><b>Chi tiết:</b> ' + escHtml(err?.message || err) +
      '<br><br>Kiểm tra lại hai file <b>scripts/authModule.js</b> và <b>scripts/supabaseClient.js</b>.',
      true
    );
  }
})();
