import { supabase } from './supabaseClient.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

if (typeof window !== 'undefined') window.supabase = supabase;

const $ = (id) => document.getElementById(id);
const normalizeText = (v) => String(v ?? '').trim();
const normalizeCode = (v) => normalizeText(v).toUpperCase();
const normalizeCoSo = (v) => normalizeText(v).toLowerCase();
const normalizeLoai = (v) => {
  const s = normalizeCode(v).replace(/[\s-]+/g, '_');
  if (['BAYMAU', 'BAY_MAU', 'TREO_MAU', 'TREOMAU'].includes(s)) return 'TREOMAU';
  if (['KHO', 'KHO_HANG', 'KHOHANG'].includes(s)) return 'KHO';
  return s;
};
const isBlank = (v) => v === null || typeof v === 'undefined' || normalizeText(v) === '';

let hot = null;
let loadedSnapshot = '[]';
let currentMode = { coSo: 'cs1', loai: 'KHO' };
let isDirty = false;
let isAdmin = false;
let originalById = new Map();

const LOAI_OPTIONS = ['KHO', 'TREOMAU'];
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
  if (loai === 'TREOMAU') {
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
  fixed.loai_vitri = normalizeLoai(row.loai_vitri || (currentMode.loai === 'ALL' ? '' : currentMode.loai));
  fixed.co_so = normalizeCoSo(row.co_so || currentMode.coSo);
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
    loai_vitri: row.loai_vitri,
    co_so: row.co_so,
    khu_vuc: row.khu_vuc || null,
    thu_tu: Number(row.thu_tu || 0),
    active: !!row.active,
    ghi_chu: row.ghi_chu || null
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
  const next = getComparablePayload(row);
  // originalById giữ RAW của DB để việc chuẩn hóa kho->KHO, treomau->TREOMAU được coi là thay đổi.
  return JSON.stringify(next) !== JSON.stringify(original);
}

function keyChanged(row) {
  if (!row?.id) return false;
  const o = originalById.get(row.id);
  if (!o) return false;
  return normalizeCode(o.ma_vitri) !== normalizeCode(row.ma_vitri)
    || normalizeCoSo(o.co_so) !== normalizeCoSo(row.co_so)
    || normalizeLoai(o.loai_vitri) !== normalizeLoai(row.loai_vitri);
}

function rawKeyChanged(row) {
  if (!row?.id) return false;
  const o = originalById.get(row.id);
  if (!o) return false;
  // Có cả thay đổi chỉ về hoa/thường: vẫn cần RPC để chuẩn hóa dmhanghoa nếu có.
  return normalizeText(o.ma_vitri) !== normalizeText(row.ma_vitri)
    || normalizeText(o.co_so) !== normalizeText(row.co_so)
    || normalizeText(o.loai_vitri) !== normalizeText(row.loai_vitri);
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
    { data:'loai_vitri', type:'dropdown', source:LOAI_OPTIONS, strict:true, allowInvalid:false, width:110 },
    { data:'co_so', type:'dropdown', source:COSO_OPTIONS, strict:true, allowInvalid:false, width:80 },
    { data:'khu_vuc', type:'text', width:120 },
    { data:'thu_tu', type:'numeric', width:70 },
    { data:'active', type:'checkbox', width:65 },
    { data:'ghi_chu', type:'text', width:180 },
    { data:'so_sp', type:'numeric', width:75, readOnly:true },
    { data:'trangthai', type:'text', width:130, readOnly:true }
  ];

  hot = new Handsontable(container, {
    data: rows.length ? rows : [makeEmptyRow()],
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
      const keyProps = new Set(['ma_vitri','co_so','loai_vitri']);
      for (const [r, prop, oldValue, newValue] of changes) {
        if (!keyProps.has(prop) || oldValue === newValue) continue;
        const row = this.getSourceDataAtRow(r) || {};
        if (!row.id) continue; // dòng mới chưa liên kết dmhanghoa nên không cần cảnh báo
        const oldText = String(oldValue ?? '').trim();
        const newText = String(newValue ?? '').trim();
        const label = prop === 'ma_vitri' ? 'MÃ VỊ TRÍ' : prop === 'co_so' ? 'CƠ SỞ' : 'LOẠI VỊ TRÍ';
        const ok = confirm(`⚠️ Bạn đang thay đổi ${label} của một vị trí đã tồn tại\n\n${oldText || '(trống)'} → ${newText || '(trống)'}\n\nThay đổi khóa vị trí có thể làm thay đổi dữ liệu vị trí của các sản phẩm đang liên kết. Khi bấm LƯU, hệ thống sẽ cập nhật dm_vitri và dmhanghoa đồng thời trong một transaction.\n\nBạn có chắc chắn muốn thay đổi?`);
        if (!ok) {
          this.setDataAtRowProp(r, prop, oldValue, 'system');
          setMessage('Đã hủy thay đổi khóa vị trí.', 'warn');
        } else {
          this.setDataAtRowProp(r, 'trangthai', 'THAY ĐỔI KHÓA', 'system');
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

function resetBlankTable(message = 'Bảng đã làm trống. Bạn có thể dán dữ liệu từ Excel hoặc nhập Mã vị trí rồi bấm Tải dữ liệu.') {
  currentMode = selectedMode();
  originalById = new Map();
  loadedSnapshot = '[]';
  isDirty = false;
  initTable([makeEmptyRow()]);
  if ($('filter-text')) $('filter-text').value = '';
  setMessage(message, 'ok');
}

function getLookupPositionCodesFromTable() {
  if (!hot) return [];
  const seen = new Set();
  const result = [];
  for (const row of hot.getSourceData()) {
    const code = normalizeCode(row?.ma_vitri);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

async function loadData() {
  currentMode = selectedMode();
  const lookupCodes = getLookupPositionCodesFromTable();
  $('btn-load').disabled = true;
  setMessage(lookupCodes.length
    ? `Đang tải dữ liệu cho ${lookupCodes.length} mã vị trí đã nhập...`
    : 'Đang tải danh mục vị trí...');
  try {
    const { data, error } = await supabase
      .from('dm_vitri')
      .select('id,ma_vitri,ten_vitri,loai_vitri,co_so,khu_vuc,thu_tu,active,ghi_chu,created_at,updated_at')
      .ilike('co_so', currentMode.coSo)
      .order('loai_vitri')
      .order('thu_tu')
      .order('ma_vitri');
    if (error) throw error;

    // Tương thích dữ liệu cũ: kho/KHO, treomau/TREOMAU/BAY_MAU...
    const lookupSet = new Set(lookupCodes);
    const sourceRows = (data || []).filter(r => {
      if (currentMode.loai !== 'ALL' && normalizeLoai(r.loai_vitri) !== currentMode.loai) return false;
      if (lookupSet.size && !lookupSet.has(normalizeCode(r.ma_vitri))) return false;
      return true;
    });

    // Giữ RAW để nhận ra kho -> KHO, treomau -> TREOMAU là thay đổi thật cần lưu.
    const rawById = new Map(sourceRows.map(r => [r.id, {
      ma_vitri: normalizeText(r.ma_vitri),
      ten_vitri: normalizeText(r.ten_vitri) || null,
      loai_vitri: normalizeText(r.loai_vitri),
      co_so: normalizeText(r.co_so),
      khu_vuc: normalizeText(r.khu_vuc) || null,
      thu_tu: Number(r.thu_tu || 0),
      active: r.active !== false,
      ghi_chu: normalizeText(r.ghi_chu) || null
    }]));

    const rows = sourceRows.map(r => ({
      ...r,
      ma_vitri: normalizeCode(r.ma_vitri),
      loai_vitri: normalizeLoai(r.loai_vitri),
      co_so: normalizeCoSo(r.co_so),
      chon:false, so_sp:0, trangthai:''
    }));

    const usageMaps = new Map();
    for (const loai of LOAI_OPTIONS) usageMaps.set(loai, await fetchUsageMap(currentMode.coSo, loai));
    rows.forEach(r => {
      r.so_sp = usageMaps.get(normalizeLoai(r.loai_vitri))?.get(normalizeCode(r.ma_vitri)) || 0;
    });

    initTable(rows);
    originalById = rawById;
    loadedSnapshot = JSON.stringify(dataRows().map(r => ({...getComparablePayload(r), id:r.id})));
    isDirty = false;

    applyClientFilter();
    if (lookupCodes.length) {
      const foundSet = new Set(rows.map(r => normalizeCode(r.ma_vitri)));
      const missing = lookupCodes.filter(code => !foundSet.has(code));
      setMessage(
        `Đã tải ${rows.length}/${lookupCodes.length} mã vị trí đã nhập${missing.length ? `. Không tìm thấy: ${missing.slice(0,20).join(', ')}${missing.length > 20 ? '...' : ''}` : ''}.`,
        missing.length ? 'warn' : 'ok'
      );
    } else {
      setMessage(`Đã tải ${rows.length} vị trí của ${currentMode.coSo.toUpperCase()}${currentMode.loai === 'ALL' ? '' : ' · ' + currentMode.loai}.`, 'ok');
    }
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

async function previewKeyMigration(row) {
  const o = originalById.get(row.id);
  if (!o) return null;
  const oldCoSo = normalizeCoSo(o.co_so);
  const oldLoai = normalizeLoai(o.loai_vitri);
  const oldMa = normalizeCode(o.ma_vitri);
  const newCoSo = normalizeCoSo(row.co_so);
  const newLoai = normalizeLoai(row.loai_vitri);
  const newMa = normalizeCode(row.ma_vitri);
  const oldCol = getDmHangHoaColumn(oldCoSo, oldLoai);
  const newCol = getDmHangHoaColumn(newCoSo, newLoai);
  if (!oldCol || !newCol) throw new Error(`Không xác định được cột dmhanghoa cho ${oldCoSo}/${oldLoai} → ${newCoSo}/${newLoai}.`);

  const { count, error } = await supabase
    .from('dmhanghoa')
    .select('masp', { count:'exact', head:true })
    .ilike(oldCol, oldMa);
  if (error) throw error;
  return { oldCoSo, oldLoai, oldMa, newCoSo, newLoai, newMa, oldCol, newCol, count:Number(count || 0) };
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

    const migrations = [];
    for (const item of checked.validRows) {
      if (item.row.id && rawKeyChanged(item.row)) {
        migrations.push({ item, preview: await previewKeyMigration(item.row) });
      }
    }

    if (migrations.length) {
      const lines = migrations.slice(0, 12).map(({item,preview}) =>
        `• ${preview.oldCoSo.toUpperCase()}/${preview.oldLoai}/${preview.oldMa} → ${preview.newCoSo.toUpperCase()}/${preview.newLoai}/${preview.newMa}: ${preview.count} SP (${preview.oldCol}${preview.oldCol !== preview.newCol ? ' → ' + preview.newCol : ''})`
      ).join('\n');
      const more = migrations.length > 12 ? `\n... và ${migrations.length - 12} thay đổi khóa khác.` : '';
      if (!confirm(`⚠️ CÓ ${migrations.length} THAY ĐỔI KHÓA VỊ TRÍ\n\n${lines}${more}\n\nCác sản phẩm liên quan trong dmhanghoa sẽ được cập nhật đồng thời. Nếu bất kỳ bước nào lỗi, RPC sẽ rollback thay đổi của dòng đó.\n\nBạn chắc chắn muốn tiếp tục?`)) {
        setMessage('Đã hủy lưu dữ liệu.', 'warn');
        return;
      }
    } else if (!confirm(`Sẽ ghi ${checked.validRows.length} dòng vào dm_vitri. Tiếp tục?`)) {
      return;
    }

    let ok = 0, fail = 0, migratedProducts = 0;
    const errors = [];

    for (const item of checked.validRows) {
      const payload = getComparablePayload(item.row);
      let resultData = null, resultError = null;

      if (!item.row.id) {
        const result = await supabase
          .from('dm_vitri')
          .insert({ ...payload, updated_at:new Date().toISOString() })
          .select('id')
          .maybeSingle();
        resultData = result.data;
        resultError = result.error;
      } else if (rawKeyChanged(item.row)) {
        const result = await supabase.rpc('dmvitri_admin_update_atomic', {
          p_vitri_id: item.row.id,
          p_ma_vitri: payload.ma_vitri,
          p_ten_vitri: payload.ten_vitri,
          p_loai_vitri: payload.loai_vitri,
          p_co_so: payload.co_so,
          p_khu_vuc: payload.khu_vuc,
          p_thu_tu: payload.thu_tu,
          p_active: payload.active,
          p_ghi_chu: payload.ghi_chu
        });
        resultError = result.error;
        resultData = result.data;
        if (!resultError) migratedProducts += Number(result.data?.updated_products || 0);
      } else {
        const result = await supabase
          .from('dm_vitri')
          .update({ ...payload, updated_at:new Date().toISOString() })
          .eq('id', item.row.id)
          .select('id')
          .maybeSingle();
        resultData = result.data;
        resultError = result.error;
      }

      const returnedId = resultData?.id || resultData?.vitri_id || item.row.id;
      if (resultError || !returnedId) {
        fail++;
        errors.push(`Dòng ${item.index + 1} (${item.row.ma_vitri}): ${resultError?.message || 'Không ghi được'}`);
      } else {
        ok++;
      }
    }

    // QUAN TRỌNG: Không gọi setDataAtRowProp trong vòng lặp lưu.
    // Handsontable có minSpareRows và có thể thay đổi số dòng vật lý khi ghi id/trạng thái,
    // gây lỗi "Assertion failed: Expecting an unsigned number" và làm dừng batch sau dòng đầu.
    // Chỉ cập nhật giao diện SAU KHI toàn bộ request DB đã chạy xong.
    try {
      checked.validRows.forEach((item) => {
        const rowError = errors.find(e => e.startsWith(`Dòng ${item.index + 1} (`));
        if (item.index >= 0 && item.index < hot.countSourceRows()) {
          hot.setDataAtRowProp(item.index, 'trangthai', rowError ? 'LỖI' : 'OK', 'system');
        }
      });
      hot.render();
    } catch (uiErr) {
      console.warn('[suadmvitri] DB save completed; skipped per-row UI status update:', uiErr);
    }

    if (fail) {
      setMessage(`Đã lưu ${ok} dòng, ${fail} dòng lỗi. Đã đồng bộ ${migratedProducts} lượt SP. ${errors.slice(0,3).join(' | ')}`, 'warn');
      return;
    }

    // DB đã thành công. Refresh là bước riêng để không báo nhầm "lưu thất bại" nếu Handsontable reload lỗi.
    setMessage(`Đã lưu thành công ${ok} dòng và đồng bộ ${migratedProducts} lượt sản phẩm. Đang tải lại bảng...`, 'ok');
    try {
      await loadData();
    } catch (reloadErr) {
      console.error(reloadErr);
      setMessage(`Đã lưu DB thành công ${ok} dòng và đồng bộ ${migratedProducts} lượt SP, nhưng tải lại bảng bị lỗi. Bấm Tải dữ liệu để nạp lại.`, 'warn');
    }
  } catch (err) {
    console.error(err);
    setMessage(`Lưu dữ liệu thất bại: ${err.message || err}`, 'err');
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
      ['cs1','TREOMAU','treomaucs1'], ['cs2','TREOMAU','treomaucs2']
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
    if (isDirty && !confirm('Có thay đổi chưa lưu. Làm lại sẽ bỏ các thay đổi này và làm trắng bảng. Tiếp tục?')) return;
    resetBlankTable();
  });
  $('btn-audit').addEventListener('click', auditProductPositions);
  $('btn-export').addEventListener('click', exportCsv);
  $('btn-disable').addEventListener('click', disableSelected);
  $('btn-delete').addEventListener('click', deleteSelected);
  $('filter-text').addEventListener('input', applyClientFilter);
  $('co-so').addEventListener('change', () => { currentMode = selectedMode(); resetBlankTable('Đã đổi cơ sở. Bảng đã làm trống để nhập/dán dữ liệu mới hoặc nhập mã vị trí cần tải.'); });
  $('loai-vitri').addEventListener('change', () => { currentMode = selectedMode(); resetBlankTable('Đã đổi loại vị trí. Bảng đã làm trống để nhập/dán dữ liệu mới hoặc nhập mã vị trí cần tải.'); });

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
  initTable([makeEmptyRow()]);
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
      resetBlankTable('Trang sẵn sàng. Dán dữ liệu từ Excel, hoặc nhập Mã vị trí rồi bấm Tải dữ liệu. Nếu bảng trống, Tải dữ liệu sẽ tải toàn bộ theo bộ lọc phía trên.');
    }
  });
})();
