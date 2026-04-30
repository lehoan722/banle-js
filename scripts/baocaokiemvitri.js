import { supabase } from './supabaseClient.js';

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
    .from('v_kiem_vitri_nhieu_vitri')
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
    .from('v_kiem_vitri_so_sanh_dmhanghoa')
    .select('*')
    .eq('coso', coso)
    .eq('loai_kiem', loai)
    .neq('ketqua', 'OK')
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
    .from('v_kiem_vitri_can_cap_nhat_dm')
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
  const { masp } = getFilters();

  let q = supabase
    .from('v_kiem_vitri_chua_co_treo_mau')
    .select('*')
    .limit(500);

  if (masp) q = q.ilike('masp', `%${masp}%`);

  const { data, error } = await q;
  if (error) throw error;

  renderTable(data, [
    { data: 'masp' },
    { data: 'tensp' },
    { data: 'treomaucs1' },
    { data: 'treomaucs2' },
    { data: 'vitrikho1' },
    { data: 'vitrikho2' }
  ], [
    'Mã sản phẩm',
    'Tên sản phẩm',
    'Treo mẫu CS1',
    'Treo mẫu CS2',
    'Vị trí kho CS1',
    'Vị trí kho CS2'
  ]);

  setPreview(`⚪ Có <b>${data.length}</b> mã chưa có treo mẫu trong danh mục.`);
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

  alert('Đã cập nhật vị trí chuẩn.');
  await loadReport();
}

function boQuaTam() {
  alert('Bước sau sẽ tạo bảng trạng thái xử lý để lưu dòng bỏ qua / đã gom xong / cần kiểm lại.');
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