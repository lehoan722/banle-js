import { supabase } from './supabaseClient.js';
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}

let hot;
let currentTab = 'nhieu_vitri';
let currentRows = [];

function getFilters() {
  return {
    coso: document.getElementById('filter-coso')?.value || 'cs1',
    loai: document.getElementById('filter-loai')?.value || 'treomau',
    masp: (document.getElementById('filter-masp')?.value || '').trim().toUpperCase()
  };
}

function setPreview(html) {
  const el = document.getElementById('preview');
  if (el) el.innerHTML = html;
}

function getTodayYMD() {
  return new Date().toISOString().slice(0, 10);
}

async function layTonNhanhTheoMasps(masps) {
  const unique = Array.from(
    new Set((masps || []).map(x => String(x || '').trim().toUpperCase()).filter(Boolean))
  );

  if (unique.length === 0) return {};

  const result = {};
  const chunkSize = 200;
  const denNgay = getTodayYMD();

  for (let i = 0; i < unique.length; i += chunkSize) {
    const arr = unique.slice(i, i + chunkSize);

    const { data, error } = await supabase.rpc('xntnhanh', {
      p_masps: arr,
      p_den_ngay: denNgay,
      p_tonghop_size: true
    });

    if (error) throw error;

    (data || []).forEach(r => {
      const masp = String(r.masp || '').trim().toUpperCase();
      result[masp] = {
        ton_cs1: Number(r.ton_cs1 || 0),
        ton_cs2: Number(r.ton_cs2 || 0),
        tong_ton: Number(r.tong_ton || 0)
      };
    });
  }

  return result;
}

function initTable() {
  const container = document.getElementById('hot');

  hot = new Handsontable(container, {
    data: [],
    colHeaders: true,
    rowHeaders: true,
    width: '100%',
    height: 520,
    stretchH: 'all',
    manualColumnResize: true,
    afterOnCellMouseDown: function (event, coords) {
      if (!coords || coords.row < 0) return;

      const row = currentRows[coords.row];
      const masp = String(row?.masp || '').trim().toUpperCase();

      if (!masp) return;

      if (typeof window.stockQuickPopup === 'function') {
        window.stockQuickPopup(masp);
      }
    },
    licenseKey: 'non-commercial-and-evaluation',
    columns: []
  });
}

function renderTable(rows, columns, headers) {
  currentRows = rows || [];

  hot.updateSettings({
    data: currentRows,
    columns,
    colHeaders: headers
  });

  hot.render();
}

async function loadNhieuViTri() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_nhieu_vitri')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('lan_kiem_cuoi', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'so_vitri' },
    { data: 'ds_vitri' },
    { data: 'lan_kiem_cuoi' }
  ], [
    'Mã sản phẩm',
    'Số vị trí',
    'Danh sách vị trí',
    'Lần kiểm cuối'
  ]);

  setPreview(`🔴 Có <b>${data.length}</b> mã đang nằm nhiều vị trí.`);
}

async function loadSaiChuan() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_sai_vitri_chuan')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)    
    .order('created_at', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'vitri_thucte' },
    { data: 'vitri_chuan' },
    { data: 'khu_vuc' },
    { data: 'ketqua' },
    { data: 'created_at' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Vị trí thực tế',
    'Vị trí chuẩn',
    'Khu vực kiểm',
    'Kết quả',
    'Ngày kiểm'
  ]);

  setPreview(`🟠 Có <b>${data.length}</b> dòng sai hoặc chưa có vị trí chuẩn.`);
}

async function loadCanCapNhat() {
  const { coso, loai, masp } = getFilters();

  let q = supabase
    .from('v_can_treo_mau')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .order('lan_kiem_cuoi', { ascending: false })
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'vitri_thucte' },
    { data: 'vitri_chuan' },
    { data: 'so_lan_thay' },
    { data: 'lan_kiem_cuoi' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Vị trí thực tế',
    'Vị trí chuẩn',
    'Số lần thấy',
    'Lần kiểm cuối'
  ]);

  setPreview(`🟡 Có <b>${data.length}</b> mã thực tế đã thấy nhưng danh mục chưa có vị trí chuẩn.`);
}

async function loadChuaTreo() {
  const { masp, coso } = getFilters();

  let q = supabase
    .from('v_thieu_treo_mau')
    .select('*')
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  const tonMap = await layTonNhanhTheoMasps((data || []).map(r => r.masp));

  const dataCoTon = (data || [])
    .map(r => {
      const ma = String(r.masp || '').trim().toUpperCase();
      const ton = tonMap[ma] || {};

      return {
        ...r,
        ton_cs1: ton.ton_cs1 || 0,
        ton_cs2: ton.ton_cs2 || 0,
        tong_ton: ton.tong_ton || 0
      };
    })
    .filter(r => {
      return coso === 'cs2'
        ? Number(r.ton_cs2 || 0) > 0
        : Number(r.ton_cs1 || 0) > 0;
    });

  renderTable(dataCoTon, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'ton_cs1' },
    { data: 'ton_cs2' },
    { data: 'treomaucs1' },
    { data: 'treomaucs2' },
    { data: 'vitrikho1' },
    { data: 'vitrikho2' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Tồn CS1',
    'Tồn CS2',
    'Treo mẫu CS1',
    'Treo mẫu CS2',
    'Vị trí kho CS1',
    'Vị trí kho CS2'
  ]);

  setPreview(`⚪ Có <b>${dataCoTon.length}</b> mã còn tồn nhưng chưa có treo mẫu.`);
}

async function loadReport() {
  try {
    setPreview('⏳ Đang tải báo cáo...');

    if (currentTab === 'nhieu_vitri') await loadNhieuViTri();
    if (currentTab === 'sai_chuan') await loadSaiChuan();
    if (currentTab === 'can_cap_nhat') await loadCanCapNhat();
    if (currentTab === 'chua_treo') await loadChuaTreo();

  } catch (err) {
    console.error(err);
    setPreview(`<span style="color:red;">❌ Lỗi tải báo cáo: ${err.message || err}</span>`);
  }
}

function getSelectedRow() {
  const sel = hot.getSelectedLast();
  if (!sel) return null;

  const rowIndex = sel[0];
  if (rowIndex < 0) return null;

  return currentRows[rowIndex] || null;
}

function getFieldCanUpdate(row) {
  const { coso, loai } = getFilters();

  if (loai === 'treomau' && coso === 'cs1') return 'treomaucs1';
  if (loai === 'treomau' && coso === 'cs2') return 'treomaucs2';
  if (loai === 'vitrikho' && coso === 'cs1') return 'vitrikho1';
  if (loai === 'vitrikho' && coso === 'cs2') return 'vitrikho2';

  return null;
}

async function capNhatViTriChuan() {
  const row = getSelectedRow();

  if (!row) {
    alert('Bạn cần chọn 1 dòng trước.');
    return;
  }

  const masp = (row.masp || '').toString().trim().toUpperCase();
  const vitri = (row.vitri_thucte || '').toString().trim().toUpperCase();
  const field = getFieldCanUpdate(row);

  if (!masp || !vitri || !field) {
    alert('Dòng này chưa đủ dữ liệu để cập nhật.');
    return;
  }

  if (!confirm(`Cập nhật ${field} của mã ${masp} = ${vitri}?`)) {
    return;
  }

  const { error } = await supabase
    .from('dmhanghoa')
    .update({ [field]: vitri })
    .eq('masp', masp);

  if (error) {
    alert('Lỗi cập nhật danh mục: ' + error.message);
    return;
  }

  await supabase
    .from('kiem_vitri_xuly')
    .insert([{
      coso: getFilters().coso,
      loai_kiem: getFilters().loai,
      masp,
      vitri_thucte: vitri,
      vitri_chuan: row.vitri_chuan || null,
      hanh_dong: 'DA_CAP_NHAT',
      ghichu: `Cập nhật ${field} = ${vitri}`,
      manv: localStorage.getItem('manv') || sessionStorage.getItem('manv') || null,
      tennv: localStorage.getItem('tennv') || sessionStorage.getItem('tennv') || null
    }]);

  alert('Đã cập nhật vị trí chuẩn và ghi lịch sử xử lý.');
  await loadReport();
}

async function boQuaTam() {
  const row = getSelectedRow();

  if (!row) {
    alert('Bạn cần chọn 1 dòng trước.');
    return;
  }

  const { coso, loai } = getFilters();

  const masp = (row.masp || '').toString().trim().toUpperCase();
  const vitriThucTe = (row.vitri_thucte || '').toString().trim().toUpperCase();
  const vitriChuan = (row.vitri_chuan || '').toString().trim().toUpperCase();

  if (!masp) {
    alert('Dòng này không có mã sản phẩm.');
    return;
  }

  if (!confirm(`Bỏ qua tạm mã ${masp}?`)) {
    return;
  }

  const { error } = await supabase
    .from('kiem_vitri_xuly')
    .insert([{
      coso,
      loai_kiem: loai,
      masp,
      vitri_thucte: vitriThucTe || null,
      vitri_chuan: vitriChuan || null,
      hanh_dong: 'BO_QUA',
      ghichu: null,
      manv: localStorage.getItem('manv') || sessionStorage.getItem('manv') || null,
      tennv: localStorage.getItem('tennv') || sessionStorage.getItem('tennv') || null
    }]);

  if (error) {
    alert('Lỗi lưu trạng thái bỏ qua: ' + error.message);
    return;
  }

  alert('Đã đánh dấu bỏ qua tạm.');
}

function attachEvents() {
  document.getElementById('btn-load')?.addEventListener('click', loadReport);
  document.getElementById('btn-cap-nhat')?.addEventListener('click', capNhatViTriChuan);
  document.getElementById('btn-bo-qua')?.addEventListener('click', boQuaTam);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await loadReport();
    });
  });

  document.getElementById('filter-masp')?.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await loadReport();
    }
  });

  document.getElementById('filter-coso')?.addEventListener('change', loadReport);
  document.getElementById('filter-loai')?.addEventListener('change', loadReport);
}

document.addEventListener('DOMContentLoaded', async () => {
  initTable();
  attachEvents();
  await loadReport();
});
