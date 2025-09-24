// scripts/baocaoxnt17_chuyenkho.js
import { supabase } from './supabaseClient.js'; // dùng chung client đã có

let hot;
const SIZE_ORDER = ['size 0', 'size 38', 'size 39', 'size 40', 'size 41', 'size 42', 'size 43', 'size 44', 'size 45']; // 9 dòng/1 mã

// ===== 1) Đọc filter do XNT17 gửi sang =====
function getFilters() {
  const raw = sessionStorage.getItem('xnt17_transfer_filters');
  if (!raw) return null;
  return JSON.parse(raw);
}

function buildCountParams(params) {
  const {
    tu_ngay, den_ngay, p_dsmsp,
    p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
    p_mausac_filter, p_size_filter, p_nhacc_filter,
    p_khachhang_filter, p_nhanvien_filter,
    p_tu_gia, p_den_gia,
    loc_duong, loc_am, loc_het,
    loc_phatsinh_nhap, loc_phatsinh_xuat,
    p_tonghop_size
  } = params;

  return {
    tu_ngay, den_ngay, p_dsmsp,
    p_diadiem_filter, p_nhomhang_filter, p_chungloai_filter,
    p_mausac_filter, p_size_filter, p_nhacc_filter,
    p_khachhang_filter, p_nhanvien_filter,
    p_tu_gia, p_den_gia,
    loc_duong, loc_am, loc_het,
    loc_phatsinh_nhap, loc_phatsinh_xuat,
    p_tonghop_size
  };
}


// ===== 2) Tải toàn bộ dữ liệu bằng RPC hiện có =====


// ===== 3) Gom theo masp → 9 size + 1 dòng “Tổng” =====
function buildTransferTable(rows) {
  // rows: [{masp, size, ton_cs1, ton_cs2, ...}]
  // map theo mã
  const map = new Map();
  for (const r of rows) {
    const masp = (r.masp || '').toUpperCase();
    if (!map.has(masp)) map.set(masp, {});
    const g = map.get(masp);
    const size = (r.size || '').toLowerCase();
    g[size] = { masp, size: r.size, cs1: r.ton_cs1 || 0, cs2: r.ton_cs2 || 0 }; // tồn từng cơ sở  :contentReference[oaicite:6]{index=6}
  }

  const out = [];
  for (const [masp, sizes] of map) {
    let sum1 = 0, sum2 = 0;

    // 9 dòng size theo thứ tự chuẩn
    for (const s of SIZE_ORDER) {
      const key = s.toLowerCase();
      const it = sizes[key] || { masp, size: s, cs1: 0, cs2: 0 };
      const goiy = calcGoiy(it.cs1, it.cs2);
      out.push({
        masp, size: it.size, cs1: it.cs1, cs2: it.cs2,
        goiy, tong: (it.cs1 + it.cs2), vitri_cs1: '', vitri_cs2: '', __isSum: false
      });
      sum1 += it.cs1; sum2 += it.cs2;
    }

    // dòng cuối: "Tổng" (thay cho "Vị trí kho")
    out.push({
      masp, size: 'Tổng', cs1: sum1, cs2: sum2,
      goiy: calcGoiy(sum1, sum2), tong: (sum1 + sum2),
      vitri_cs1: '', vitri_cs2: '', __isSum: true
    });
  }
  return out;
}

// Quy tắc gợi ý giữ nguyên tinh thần file chuyển kho Google Sheet  :contentReference[oaicite:7]{index=7}
function calcGoiy(cs1, cs2) {
  if (cs1 >= 1 && cs2 === 0) return '1v2';
  if (cs1 === 0 && cs2 >= 2) return '2v1';
  if (cs1 <= 1 && cs2 > 2) return '2v1';
  if (cs2 <= 1 && cs1 > 2) return '1v2';
  return 'cân bằng';
}

// (Tối giản) Lấy vị trí kho từ dmhanghoa — bạn có thể thay bằng JOIN RPC riêng nếu muốn
async function patchVitri(outArr) {
  // lấy danh sách mã duy nhất
  const uniq = [...new Set(outArr.map(r => r.masp))];
  // query dmhanghoa để lấy vị trí 2 cơ sở
  // (giả sử cột tên là vitri_cs1, vitri_cs2 — bạn sửa lại nếu cột khác)
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, vitri_cs1, vitri_cs2')
    .in('masp', uniq);
  if (error) return;

  const vitriMap = new Map(data.map(d => [d.masp.toUpperCase(), d]));
  for (const r of outArr) {
    const v = vitriMap.get(r.masp);
    if (!v) continue;
    r.vitri_cs1 = v.vitri_cs1 || '';
    r.vitri_cs2 = v.vitri_cs2 || '';
  }
}

// ===== 4) Render Handsontable + đồng bộ ảnh =====
function renderHOT(rows) {
  const container = document.getElementById('hot');
  if (hot) hot.destroy();

  hot = new Handsontable(container, {
    data: rows,
    licenseKey: 'non-commercial-and-evaluation',
    rowHeaders: true,
    colHeaders: ['Mã SP', 'Size', 'CS1', 'CS2', 'Gợi ý', 'Tổng', 'Vị trí CS1', 'Vị trí CS2'],
    columns: [
      { data: 'masp', readOnly: true },
      { data: 'size', readOnly: true },
      { data: 'cs1', readOnly: true, type: 'numeric' },
      { data: 'cs2', readOnly: true, type: 'numeric' },
      { data: 'goiy', readOnly: true },
      { data: 'tong', readOnly: true, type: 'numeric' },
      { data: 'vitri_cs1', readOnly: true },
      { data: 'vitri_cs2', readOnly: true },
    ],
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    height: '100%',
    stretchH: 'all',
    cells: (row, col) => {
      const cell = {};
      const r = rows[row];
      if (r?.__isSum) cell.className = 'sumRow';
      return cell;
    },
    afterSelectionEnd: (r) => {
      const row = rows[r];
      if (!row) return;
      // cập nhật ảnh theo mã
      updateImagesByMasp(row.masp);
      // center vào block mã này: cuộn để nó nằm giữa viewport
      const tr = hot.getCell(r, 0)?.parentElement;
      if (tr) tr.scrollIntoView({ block: 'center' });
    }
  });

  // Copy
  document.getElementById('btnCopy').onclick = () => {
    const headers = hot.getColHeader();
    const tsv = [headers.join('\t')]
      .concat(hot.getData().map(row => row.map(v => v ?? '').join('\t')))
      .join('\n');
    navigator.clipboard.writeText(tsv).then(() => alert('Đã copy bảng'));
  };

  // Export
  document.getElementById('btnExport').onclick = () => {
    const headers = hot.getColHeader();
    const aoa = [headers, ...hot.getData()];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'ChuyenKho');
    XLSX.writeFile(wb, `goi_y_chuyen_kho_${Date.now()}.xlsx`);
  };
}

// ===== 5) Đồng bộ ảnh (reuse pattern của XNT17) =====
// Bạn có thể thay bằng đúng hàm tải ảnh đang dùng ở XNT17 (cùng cấu trúc). Dưới đây là placeholder:
function updateImagesByMasp(masp) {
  // TODO: nếu XNT17 có sẵn hàm build link ảnh theo masp thì gọi lại cho đồng nhất.
  // Tạm thời minh họa: 2 ảnh theo đường dẫn chuẩn của bạn (sửa domain/path theo dự án)
  const base = `https://your.cdn.example/images/${encodeURIComponent(masp)}`;
  document.getElementById('img1').src = `${base}_1.jpg`;
  document.getElementById('img2').src = `${base}_2.jpg`;
}

// ===== 6) Entry point =====
async function boot() {
  document.getElementById('status').textContent = 'Đang tải dữ liệu…';

  // 1) Ưu tiên lấy data đã đẩy sẵn từ XNT17
  const rawRows = sessionStorage.getItem('xnt17_transfer_rows');
  let raw = [];
  if (rawRows) {
    raw = JSON.parse(rawRows);
  } else {
    // (fallback) nếu mở thẳng trang này không qua XNT17, mới gọi RPC
    const filters = getFilters();
    if (!filters) { document.getElementById('status').textContent = 'Thiếu dữ liệu/thiếu filter'; return; }
    raw = await fetchAllRows(filters); // giữ lại hàm này như phương án B
  }

  // 2) Dựng bảng chuyển kho
  const rows = buildTransferTable(raw);   // 9 dòng size + 1 dòng “Tổng”
  await patchVitri(rows);                 // lấy vị trí từ dmhanghoa (đọc trực tiếp table)
  renderHOT(rows);

  // 3) Tuỳ chọn: dọn storage (tránh chiếm bộ nhớ phiên)
  // sessionStorage.removeItem('xnt17_transfer_rows');

  document.getElementById('status').textContent =
    `Đã tải ${rows.length} dòng (đã có dòng Tổng cho từng mã)`;
}


document.getElementById('btnReload').onclick = boot;
boot();
