import { supabase } from './supabaseClient.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

if (typeof window !== 'undefined') window.supabase = supabase;

const $ = (id) => document.getElementById(id);
const normalizeText = (v) => String(v ?? '').trim();
const normalizeCode = (v) => normalizeText(v).toUpperCase();
const normalizeCoSo = (v) => normalizeText(v).toLowerCase();
const normalizeLoai = (v) => {
  const s = normalizeCode(v).replace(/[\s-]+/g, '_');
  if (['BAYMAU', 'BAY_MAU', 'TREO_MAU', 'TREOMAU'].includes(s)) return 'BAY_MAU';
  if (['KHO', 'KHO_HANG', 'KHOHANG'].includes(s)) return 'KHO';
  return s;
};

// Chuẩn ghi xuống DB. Giữ tương thích với dữ liệu hiện tại của hệ thống:
// - kho      -> KHO
// - treomau  -> TREOMAU
// Giao diện vẫn hiển thị nhãn BÀY MẪU, nhưng DB dùng TREOMAU để không phá code cũ.
const dbLoaiValue = (v) => normalizeLoai(v) === 'BAY_MAU' ? 'TREOMAU' : normalizeLoai(v);
const normalizeDbLoaiForCompare = (v) => normalizeCode(v).replace(/[\s-]+/g, '_');
const isBlank = (v) => v === null || typeof v === 'undefined' || normalizeText(v) === '';

let hot = null;
let loadedSnapshot = '[]';
let currentMode = { coSo: 'cs1', loai: 'KHO' };
let isDirty = false;
let isAdmin = false;
let originalById = new Map();

const LOAI_OPTIONS = ['KHO', 'BAY_MAU'];
const COSO_OPTIONS = ['cs1', 'cs2', 'cs3'];

function setMessage(text, type = '') {
  const el = $('message');
  el.textContent = text;
  el.className = type;
}

function selectedMode() {
  return {
    coSo: normalizeCoSo($('co-so')?.value || 'cs1'),
    loai: normalizeLoai($('loai-vitri')?.value || 'KHO')
  };
}

function getDmHangHoaColumn(coSo, loai) {
  if (loai === 'KHO') {
    if (coSo === 'cs1') return 'vitrikho1';
    if (coSo === 'cs2') return 'vitrikho2';
    if (coSo === 'cs3') return 'vitrikho3';
  }
  if (loai === 'BAY_MAU') {
    if (coSo === 'cs1') return 'treomaucs1';
    if (coSo === 'cs2') return 'treomaucs2';
  }
  return null;
}

function makeEmptyRow() {
  return {
    id: null,
    chon: false,
    ma_vitri: '',
    ten_vitri: '',
    loai_vitri: currentMode.loai === 'ALL' ? '' : currentMode.loai,
    co_so: currentMode.coSo,
    khu_vuc: '',
    thu_tu: 0,
    active: true,
    ghi_chu: '',
    so_sp: 0,
    trangthai: ''
  };
}

function normalizeRow(row) {
  const fixed = { ...row };
  fixed.id = row.id || null;
  fixed.chon = !!row.chon;
  fixed.ma_vitri = normalizeCode(row.ma_vitri);
  fixed.ten_vitri = normalizeText(row.ten_vitri);
  fixed.loai_vitri = currentMode.loai === 'ALL' ? normalizeLoai(row.loai_vitri) : currentMode.loai;
  fixed.co_so = currentMode.loai === 'ALL' ? normalizeCoSo(row.co_so || currentMode.coSo) : currentMode.coSo;
  fixed.khu_vuc = normalizeText(row.khu_vuc);
  fixed.thu_tu = Number.isFinite(Number(row.thu_tu)) ? Number(row.thu_tu) : 0;
  fixed.active = row.active !== false && String(row.active).toLowerCase() !== 'false' && String(row.active) !== '0';
  fixed.ghi_chu = normalizeText(row.ghi_chu);
  fixed.so_sp = Number(row.so_sp || 0);
  fixed.trangthai = normalizeText(row.trangthai);
  return fixed;
}

function dataRows() {
  if (!hot) return [];
  return hot.getSourceData()
    .map(normalizeRow)
    .filter(r => r.id || r.ma_vitri || r.ten_vitri || r.khu_vuc || r.ghi_chu);
}

function getComparablePayload(row) {
  return {
    ma_vitri: row.ma_vitri,
    ten_vitri: row.ten_vitri || null,
    loai_vitri: dbLoaiValue(row.loai_vitri),
    co_so: normalizeCoSo(row.co_so),
    khu_vuc: row.khu_vuc || null,
    thu_tu: Number(row.thu_tu || 0),
    active: !!row.active,
    ghi_chu: row.ghi_chu || null
  };
}

function getRawComparablePayload(row) {
  return {
    ma_vitri: normalizeText(row.ma_vitri),
    ten_vitri: normalizeText(row.ten_vitri) || null,
    loai_vitri: normalizeText(row.loai_vitri),
    co_so: normalizeText(row.co_so),
    khu_vuc: normalizeText(row.khu_vuc) || null,
    thu_tu: Number(row.thu_tu || 0),
    active: row.active !== false,
    ghi_chu: normalizeText(row.ghi_chu) || null
  };
}

function getSavePayload(row) {
  return { ...getComparablePayload(row), updated_at: new Date().toISOString() };
}

function markDirty() {
  const current = dataRows().map(r => ({...getComparablePayload(r), id:r.id}));
  isDirty = JSON.stringify(current) !== loadedSnapshot;
}

function isRowChanged(row) {
  if (!row.id) return true;
  const original = originalById.get(row.id);
  if (!original) return true;
  return JSON.stringify(getComparablePayload(row)) !== JSON.stringify(original);
}

function statusClass(value) {
  const v = normalizeCode(value);
  if (['OK', 'SẼ THÊM', 'SẼ CẬP NHẬT'].includes(v)) return 'ht-status-ok';
  if (v.includes('TRÙNG') || v.includes('ĐANG DÙNG') || v.includes('CẢNH BÁO')) return 'ht-status-warn';
  if (v.includes('LỖI') || v.includes('KHÔNG HỢP LỆ') || v.includes('THIẾU')) return 'ht-status-err';
  return '';
}

function initTable(rows = []) {
  const container = $('hot');
  if (hot) hot.destroy();

  const isAll = currentMode.loai === 'ALL';
  const columns = [
    { data:'chon', type:'checkbox', width:48 },
    { data:'ma_vitri', type:'text', width:125 },
    { data:'ten_vitri', type:'text', width:190 },
    { data:'loai_vitri', type:'dropdown', source:LOAI_OPTIONS, strict:true, allowInvalid:false, width:110, readOnly:!isAll },
    { data:'co_so', type:'dropdown', source:COSO_OPTIONS, strict:true, allowInvalid:false, width:80, readOnly:!isAll },
    { data:'khu_vuc', type:'text', width:120 },
    { data:'thu_tu', type:'numeric', width:70 },
    { data:'active', type:'checkbox', width:65 },
    { data:'ghi_chu', type:'text', width:180 },
    { data:'so_sp', type:'numeric', width:75, readOnly:true },
    { data:'trangthai', type:'text', width:130, readOnly:true }
  ];

  hot = new Handsontable(container, {
    data: rows.length ? rows : Array.from({length:25}, makeEmptyRow),
    columns,
    colHeaders:['Chọn','Mã vị trí','Tên vị trí','Loại','Cơ sở','Khu vực','Thứ tự','Active','Ghi chú','Số SP','Trạng thái'],
    rowHeaders:true,
    minSpareRows:1,
    width:'100%',
    height:Math.max(520, window.innerHeight - 260),
    stretchH:'all',
    manualColumnResize:true,
    columnSorting:true,
    filters:true,
    dropdownMenu:true,
    licenseKey:'non-commercial-and-evaluation',
    cells(row, col) {
      const props = {};
      if (col === 10) {
        const val = this.instance.getDataAtCell(row, col);
        props.className = statusClass(val);
      }
      return props;
    },
    afterChange(changes, source) {
      if (!changes || source === 'loadData' || source === 'system') return;
      // Tự khóa/điền cơ sở + loại theo chế độ đang chọn.
      if (currentMode.loai !== 'ALL') {
        for (const [r] of changes) {
          this.setDataAtRowProp(r, 'co_so', currentMode.coSo, 'system');
          this.setDataAtRowProp(r, 'loai_vitri', currentMode.loai, 'system');
        }
      }
      markDirty();
    },
    afterOnCellMouseDown(event, coords) {
      if (!coords || coords.row < 0 || coords.col !== 1) return;
      const row = this.getSourceDataAtRow(coords.row) || {};
      if (row.id && row.ma_vitri) showUsage(row).catch(err => setMessage(`Không tải được sản phẩm sử dụng vị trí: ${err.message || err}`, 'err'));
    }
  });
}

async function fetchAllDmVitri() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('dm_vitri')
      .select('id,ma_vitri,ten_vitri,loai_vitri,co_so,khu_vuc,thu_tu,active,ghi_chu,created_at,updated_at')
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function fetchUsageMap(coSo, loai) {
  const col = getDmHangHoaColumn(coSo, loai);
  const map = new Map();
  if (!col) return map;

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('dmhanghoa')
      .select(`masp,${col}`)
      .not(col, 'is', null)
      .range(from, from + 999);
    if (error) throw error;
    for (const row of (data || [])) {
      const key = normalizeCode(row[col]);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  return map;
}

async function loadData() {
  currentMode = selectedMode();
  $('btn-load').disabled = true;
  setMessage('Đang tải danh mục vị trí...');
  try {
    // Không lọc loai_vitri trực tiếp ở DB vì dữ liệu lịch sử đang có nhiều kiểu:
    // kho / KHO / treomau / TREOMAU / BAY_MAU...
    // Tải theo cơ sở trước, sau đó chuẩn hóa và lọc phía client.
    const { data: rawData, error } = await supabase
      .from('dm_vitri')
      .select('id,ma_vitri,ten_vitri,loai_vitri,co_so,khu_vuc,thu_tu,active,ghi_chu,created_at,updated_at')
      .ilike('co_so', currentMode.coSo)
      .order('thu_tu')
      .order('ma_vitri');
    if (error) throw error;

    const sourceData = (rawData || []).filter(r =>
      currentMode.loai === 'ALL' || normalizeLoai(r.loai_vitri) === currentMode.loai
    );

    // Giao diện hiển thị chuẩn, nhưng originalById bên dưới giữ RAW DB để phát hiện
    // các thay đổi chuẩn hóa như kho -> KHO, treomau -> TREOMAU.
    const rows = sourceData.map(r => ({
      ...r,
      ma_vitri: normalizeCode(r.ma_vitri),
      loai_vitri: normalizeLoai(r.loai_vitri),
      co_so: normalizeCoSo(r.co_so),
      chon:false, so_sp:0, trangthai:''
    }));

    if (currentMode.loai === 'ALL') {
      const maps = new Map();
      for (const loai of LOAI_OPTIONS) maps.set(loai, await fetchUsageMap(currentMode.coSo, loai));
      rows.forEach(r => { r.so_sp = maps.get(normalizeLoai(r.loai_vitri))?.get(normalizeCode(r.ma_vitri)) || 0; });
    } else {
      const usage = await fetchUsageMap(currentMode.coSo, currentMode.loai);
      rows.forEach(r => { r.so_sp = usage.get(normalizeCode(r.ma_vitri)) || 0; });
    }

    initTable(rows);
    // Giữ giá trị RAW đã có trong DB để việc chuẩn hóa chữ hoa/loại vị trí được nhận là thay đổi.
    originalById = new Map(sourceData.map(r => [r.id, getRawComparablePayload(r)]));
    loadedSnapshot = JSON.stringify(dataRows().map(r => ({...getComparablePayload(r), id:r.id})));
    isDirty = false;
    applyClientFilter();
    setMessage(`Đã tải ${rows.length} vị trí của ${currentMode.coSo.toUpperCase()}${currentMode.loai === 'ALL' ? '' : ' · ' + currentMode.loai}.`, 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Tải dữ liệu thất bại: ${err.message || err}`, 'err');
  } finally {
    $('btn-load').disabled = false;
  }
}

function applyClientFilter() {
  if (!hot) return;
  const text = normalizeText($('filter-text')?.value).toLowerCase();
  const plugin = hot.getPlugin('filters');
  plugin.clearConditions();
  if (text) {
    plugin.addCondition(1, 'contains', [text]);
    // Handsontable filter không hỗ trợ OR nhiều cột theo cách gọn; giữ lọc mã để nhanh.
  }
  plugin.filter();
}

async function checkRows({showMessage=true} = {}) {
  const rows = dataRows();
  if (!rows.length) {
    if (showMessage) setMessage('Không có dữ liệu để kiểm tra.', 'warn');
    return { ok:false, validRows:[] };
  }

  const existing = await fetchAllDmVitri();
  const existingById = new Map(existing.map(r => [r.id, r]));
  const keyOwner = new Map();
  existing.forEach(r => keyOwner.set(`${normalizeCoSo(r.co_so)}|${normalizeLoai(r.loai_vitri)}|${normalizeCode(r.ma_vitri)}`, r.id));

  const seen = new Map();
  let errors = 0;
  let warnings = 0;
  const validRows = [];

  hot.batch(() => {
    hot.getSourceData().forEach((raw, idx) => {
      const row = normalizeRow(raw);
      if (!row.id && !row.ma_vitri && !row.ten_vitri && !row.khu_vuc && !row.ghi_chu) {
        hot.setDataAtRowProp(idx, 'trangthai', '', 'system');
        return;
      }

      const issues = [];
      if (!row.ma_vitri) issues.push('THIẾU MÃ');
      if (!COSO_OPTIONS.includes(row.co_so)) issues.push('CƠ SỞ KHÔNG HỢP LỆ');
      if (!LOAI_OPTIONS.includes(row.loai_vitri)) issues.push('LOẠI KHÔNG HỢP LỆ');

      const key = `${row.co_so}|${row.loai_vitri}|${row.ma_vitri}`;
      if (row.ma_vitri) {
        if (seen.has(key)) issues.push('TRÙNG TRONG BẢNG');
        else seen.set(key, idx);

        const ownerId = keyOwner.get(key);
        if (ownerId && ownerId !== row.id) issues.push('TRÙNG DỮ LIỆU');
      }

      // Nếu chỉnh row có id, bảo đảm id vẫn còn tồn tại.
      if (row.id && !existingById.has(row.id)) issues.push('ID KHÔNG CÒN TỒN TẠI');

      let status = '';
      if (issues.length) {
        errors++;
        status = issues.join(' | ');
      } else {
        status = row.id ? (isRowChanged(row) ? 'SẼ CẬP NHẬT' : 'OK') : 'SẼ THÊM';
        if (isRowChanged(row)) validRows.push({ index:idx, row });
      }
      hot.setDataAtRowProp(idx, 'trangthai', status, 'system');
    });
  });
  hot.render();

  if (showMessage) {
    setMessage(errors ? `Kiểm tra xong: ${errors} dòng lỗi. Hãy sửa trước khi lưu.` : `Kiểm tra xong: ${validRows.length} dòng hợp lệ, có thể lưu.`, errors ? 'warn' : 'ok');
  }
  return { ok: errors === 0, validRows, errors, warnings };
}

async function saveData() {
  if (!isAdmin) return;
  $('btn-save').disabled = true;
  try {
    setMessage('Đang kiểm tra dữ liệu trước khi lưu...');
    const checked = await checkRows({showMessage:false});
    if (!checked.ok) {
      setMessage(`Có ${checked.errors} dòng lỗi. Không ghi dữ liệu để tránh tạo danh mục vị trí sai.`, 'err');
      return;
    }
    if (!checked.validRows.length) {
      setMessage('Không có dòng mới hoặc thay đổi cần lưu.', 'ok');
      return;
    }

    if (!confirm(`Sẽ ghi ${checked.validRows.length} dòng vào dm_vitri.\nDòng đã có sẽ cập nhật theo ID; dòng mới sẽ được thêm. Tiếp tục?`)) return;

    let ok = 0, fail = 0;
    const errors = [];
    for (const item of checked.validRows) {
      const payload = getSavePayload(item.row);
      let result;
      if (item.row.id) {
        result = await supabase.from('dm_vitri').update(payload).eq('id', item.row.id).select('id').maybeSingle();
      } else {
        result = await supabase.from('dm_vitri').insert(payload).select('id').maybeSingle();
      }
      if (result.error || !result.data?.id) {
        fail++;
        errors.push(`Dòng ${item.index + 1} (${item.row.ma_vitri}): ${result.error?.message || 'Không ghi được'}`);
        hot.setDataAtRowProp(item.index, 'trangthai', 'LỖI', 'system');
      } else {
        ok++;
        hot.setDataAtRowProp(item.index, 'id', result.data.id, 'system');
        hot.setDataAtRowProp(item.index, 'trangthai', 'OK', 'system');
      }
    }
    hot.render();

    if (fail) {
      setMessage(`Đã lưu ${ok} dòng, ${fail} dòng lỗi. ${errors.slice(0,3).join(' | ')}`, 'warn');
    } else {
      setMessage(`Đã lưu thành công ${ok} dòng. Đang tải lại danh mục...`, 'ok');
      try {
        await loadData();
      } catch (reloadErr) {
        console.error('Lưu DB thành công nhưng tải lại giao diện lỗi:', reloadErr);
        setMessage(`Đã lưu thành công ${ok} dòng vào DB, nhưng tải lại bảng bị lỗi: ${reloadErr.message || reloadErr}. Bạn có thể bấm Tải dữ liệu để tải lại.`, 'warn');
      }
    }
  } catch (err) {
    console.error(err);
    setMessage(`Lưu dữ liệu thất bại trước khi hoàn tất: ${err.message || err}`, 'err');
  } finally {
    $('btn-save').disabled = false;
  }
}

function selectedRows() {
  return dataRows().filter(r => r.chon && r.id);
}

async function getUsageCountForRow(row) {
  const col = getDmHangHoaColumn(row.co_so, row.loai_vitri);
  if (!col) return 0;
  const { count, error } = await supabase
    .from('dmhanghoa')
    .select('masp', { count:'exact', head:true })
    .ilike(col, row.ma_vitri);
  if (error) throw error;
  return Number(count || 0);
}

async function disableSelected() {
  const rows = selectedRows();
  if (!rows.length) return setMessage('Chưa chọn dòng cần ngừng dùng.', 'warn');
  if (!confirm(`Chuyển ${rows.length} vị trí đã chọn sang active=false?`)) return;

  let ok = 0, fail = 0;
  for (const row of rows) {
    const { error } = await supabase.from('dm_vitri').update({active:false, updated_at:new Date().toISOString()}).eq('id', row.id);
    if (error) fail++; else ok++;
  }
  setMessage(`Ngừng dùng: ${ok} OK${fail ? `, ${fail} lỗi` : ''}.`, fail ? 'warn' : 'ok');
  await loadData();
}

async function deleteSelected() {
  const allSelected = dataRows().filter(r => r.chon);
  if (!allSelected.length) return setMessage('Chưa chọn dòng cần xóa.', 'warn');

  const unsaved = allSelected.filter(r => !r.id);
  const saved = allSelected.filter(r => r.id);

  if (unsaved.length) {
    const removeKeys = new Set(unsaved.map(r => `${r.ma_vitri}|${r.co_so}|${r.loai_vitri}|${r.ten_vitri}|${r.khu_vuc}`));
    const remain = hot.getSourceData().filter(raw => {
      const r = normalizeRow(raw);
      if (r.id) return true;
      return !removeKeys.has(`${r.ma_vitri}|${r.co_so}|${r.loai_vitri}|${r.ten_vitri}|${r.khu_vuc}`);
    });
    hot.loadData(remain.length ? remain : [makeEmptyRow()]);
    markDirty();
  }

  if (!saved.length) {
    return setMessage(`Đã bỏ ${unsaved.length} dòng mới khỏi bảng.`, 'ok');
  }

  if (!confirm(`Sẽ kiểm tra và xóa ${saved.length} vị trí đã lưu. Vị trí đang được sản phẩm sử dụng sẽ KHÔNG bị xóa. Tiếp tục?`)) return;

  let deleted = 0, blocked = 0, fail = 0;
  const notes = [];
  for (const row of saved) {
    try {
      const count = await getUsageCountForRow(row);
      if (count > 0) {
        blocked++;
        notes.push(`${row.ma_vitri}: đang được ${count} SP sử dụng`);
        continue;
      }
      const { error } = await supabase.from('dm_vitri').delete().eq('id', row.id);
      if (error) { fail++; notes.push(`${row.ma_vitri}: ${error.message}`); }
      else deleted++;
    } catch (err) {
      fail++;
      notes.push(`${row.ma_vitri}: ${err.message || err}`);
    }
  }
  setMessage(`Đã bỏ ${unsaved.length} dòng mới · Xóa DB: ${deleted} OK · ${blocked} bị chặn vì đang dùng${fail ? ` · ${fail} lỗi` : ''}${notes.length ? ` | ${notes.slice(0,3).join(' ; ')}` : ''}.`, (blocked || fail) ? 'warn' : 'ok');
  await loadData();
}

async function showUsage(row) {
  const col = getDmHangHoaColumn(row.co_so, normalizeLoai(row.loai_vitri));
  $('usage-title').textContent = `${row.ma_vitri} · ${row.co_so.toUpperCase()} · ${normalizeLoai(row.loai_vitri)}`;
  const content = $('usage-content');
  if (!col) {
    content.textContent = 'Loại vị trí này chưa có cột tương ứng trong dmhanghoa.';
    $('usage-modal').classList.add('show');
    return;
  }

  content.textContent = 'Đang tải sản phẩm...';
  $('usage-modal').classList.add('show');

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select(`masp,tensp,${col}`)
    .ilike(col, row.ma_vitri)
    .order('masp')
    .limit(2000);
  if (error) throw error;

  const rows = data || [];
  content.innerHTML = rows.length
    ? `<div style="margin-bottom:7px;font-weight:700;">${rows.length} sản phẩm đang sử dụng vị trí này</div>
       <table class="mini-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th>${col}</th></tr></thead><tbody>${rows.map(x => `<tr><td>${escapeHtml(x.masp)}</td><td>${escapeHtml(x.tensp || '')}</td><td>${escapeHtml(x[col] || '')}</td></tr>`).join('')}</tbody></table>`
    : '<div>Không có sản phẩm nào đang sử dụng vị trí này.</div>';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function scanDmHangHoaColumn(col) {
  const result = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('dmhanghoa')
      .select(`masp,${col}`)
      .not(col, 'is', null)
      .range(from, from + 999);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return result;
}

async function auditProductPositions() {
  $('btn-audit').disabled = true;
  setMessage('Đang đối chiếu vị trí sản phẩm với dm_vitri...');
  try {
    const dm = await fetchAllDmVitri();
    const validSets = new Map();
    for (const coSo of COSO_OPTIONS) {
      for (const loai of LOAI_OPTIONS) {
        validSets.set(`${coSo}|${loai}`, new Set(
          dm.filter(v => normalizeCoSo(v.co_so) === coSo && normalizeLoai(v.loai_vitri) === loai && v.active !== false)
            .map(v => normalizeCode(v.ma_vitri))
        ));
      }
    }

    const checks = [
      ['cs1','KHO','vitrikho1'], ['cs2','KHO','vitrikho2'], ['cs3','KHO','vitrikho3'],
      ['cs1','BAY_MAU','treomaucs1'], ['cs2','BAY_MAU','treomaucs2']
    ];

    const summary = [];
    const invalidSamples = [];

    for (const [coSo, loai, col] of checks) {
      const rows = await scanDmHangHoaColumn(col);
      const valid = validSets.get(`${coSo}|${loai}`) || new Set();
      let ok = 0, invalid = 0, blank = 0;
      for (const row of rows) {
        const raw = normalizeText(row[col]);
        if (!raw) { blank++; continue; }
        const code = normalizeCode(raw);
        if (valid.has(code)) ok++;
        else {
          invalid++;
          if (invalidSamples.length < 300) invalidSamples.push({coSo,loai,col,masp:row.masp,value:raw});
        }
      }
      summary.push({coSo,loai,col,ok,invalid,scanned:rows.length});
    }

    $('audit-content').innerHTML = `
      <div class="summary-grid">
        ${summary.map(s => `<div class="summary-box"><b>${s.coSo.toUpperCase()} · ${s.loai}</b><br>Hợp lệ: <b>${s.ok}</b><br>Sai chuẩn: <b style="color:#b91c1c">${s.invalid}</b><br>Đã quét: ${s.scanned}</div>`).join('')}
      </div>
      <div style="font-weight:700;margin:8px 0;">Mẫu dữ liệu sai (tối đa 300 dòng)</div>
      ${invalidSamples.length ? `<table class="mini-table"><thead><tr><th>CS</th><th>Loại</th><th>Cột</th><th>Mã SP</th><th>Giá trị hiện tại</th></tr></thead><tbody>${invalidSamples.map(x => `<tr><td>${x.coSo.toUpperCase()}</td><td>${x.loai}</td><td>${x.col}</td><td>${escapeHtml(x.masp)}</td><td>${escapeHtml(x.value)}</td></tr>`).join('')}</tbody></table>` : '<div>Không phát hiện dữ liệu vị trí sai chuẩn.</div>'}`;
    $('audit-modal').classList.add('show');
    const totalInvalid = summary.reduce((a,b) => a + b.invalid, 0);
    setMessage(`Đã kiểm tra xong. Có ${totalInvalid} giá trị vị trí sản phẩm chưa khớp danh mục vị trí active.`, totalInvalid ? 'warn' : 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`Kiểm tra dữ liệu sản phẩm thất bại: ${err.message || err}`, 'err');
  } finally {
    $('btn-audit').disabled = false;
  }
}

function csvEscape(value) {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv() {
  const rows = dataRows();
  if (!rows.length) return setMessage('Không có dữ liệu để tải CSV.', 'warn');
  const headers = ['ma_vitri','ten_vitri','loai_vitri','co_so','khu_vuc','thu_tu','active','ghi_chu','so_sp'];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dm_vitri_${currentMode.coSo}_${currentMode.loai}_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setMessage(`Đã tạo file CSV gồm ${rows.length} dòng.`, 'ok');
}

function attachEvents() {
  $('btn-load').addEventListener('click', loadData);
  $('btn-check').addEventListener('click', () => checkRows());
  $('btn-save').addEventListener('click', saveData);
  $('btn-reset').addEventListener('click', () => {
    if (isDirty && !confirm('Có thay đổi chưa lưu. Làm lại sẽ bỏ các thay đổi này. Tiếp tục?')) return;
    loadData();
  });
  $('btn-audit').addEventListener('click', auditProductPositions);
  $('btn-export').addEventListener('click', exportCsv);
  $('btn-disable').addEventListener('click', disableSelected);
  $('btn-delete').addEventListener('click', deleteSelected);
  $('filter-text').addEventListener('input', applyClientFilter);
  $('co-so').addEventListener('change', () => { currentMode = selectedMode(); });
  $('loai-vitri').addEventListener('change', () => { currentMode = selectedMode(); initTable([]); setMessage('Đã đổi chế độ. Bấm Tải dữ liệu để lấy danh mục hiện có.', 'warn'); });

  $('usage-close').addEventListener('click', () => $('usage-modal').classList.remove('show'));
  $('usage-modal').addEventListener('click', e => { if (e.target === $('usage-modal')) $('usage-modal').classList.remove('show'); });
  $('audit-close').addEventListener('click', () => $('audit-modal').classList.remove('show'));
  $('audit-modal').addEventListener('click', e => { if (e.target === $('audit-modal')) $('audit-modal').classList.remove('show'); });

  window.addEventListener('beforeunload', e => {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

(function initPage() {
  currentMode = selectedMode();
  initTable([]);
  attachEvents();

  khoiTaoDangNhapDungChung({
    appContainerId:'app-container',
    macDinhDiaDiem:'cs1',
    tuDongKhoaCoSo:false,
    loginApiPath:(cs) => `/api/login-${cs}`,
    onLoginSuccess:async (nhanvien, context) => {
      if (!nhanvien?.is_admin) {
        alert('Trang SỬA DANH MỤC VỊ TRÍ chỉ dành cho admin.');
        await dangXuatDungChung({ appContainerId:'app-container' });
        return;
      }
      isAdmin = true;
      const cs = normalizeCoSo(context?.diadiem || 'cs1');
      if (COSO_OPTIONS.includes(cs)) $('co-so').value = cs;
      currentMode = selectedMode();
      initTable([]);
      await loadData();
    }
  });
})();
