// scripts/baocaoxnt17_chuyenkho.js
import { supabase } from './supabaseClient.js'; // dùng chung client đã có

let hot;
const SIZE_ORDER = ['size 0','size 38','size 39','size 40','size 41','size 42','size 43','size 44','size 45']; // 9 dòng/1 mã

// ===== 1) Đọc filter do XNT17 gửi sang =====
function getFilters() {
  const raw = sessionStorage.getItem('xnt17_transfer_filters');
  if (!raw) return null;
  return JSON.parse(raw);
}

// ===== 2) Tải toàn bộ dữ liệu bằng RPC hiện có =====
async function fetchAllRows(params) {
  // trước hết, đếm tổng bản ghi để biết cần lặp mấy trang  :contentReference[oaicite:4]{index=4}
  const { data: cntData, error: cntErr } = await supabase.rpc('baocaoxnt17_count', params);
  if (cntErr) throw cntErr;
  const total = Number(cntData || 0);

  const pageSize = 10000; // theo default RPC của bạn  :contentReference[oaicite:5]{index=5}
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const all = [];

  for (let p = 1; p <= pages; p++) {
    const pageParams = { ...params, p_limit: pageSize, p_offset: (p-1)*pageSize };
    const { data, error } = await supabase.rpc('baocaoxnt17_paged', pageParams);
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

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
    g[size] = { masp, size: r.size, cs1: r.ton_cs1||0, cs2: r.ton_cs2||0 }; // tồn từng cơ sở  :contentReference[oaicite:6]{index=6}
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
        goiy, tong: (it.cs1 + it.cs2), vitri_cs1: '', vitri_cs2: '', __isSum:false
      });
      sum1 += it.cs1; sum2 += it.cs2;
    }

    // dòng cuối: "Tổng" (thay cho "Vị trí kho")
    out.push({
      masp, size: 'Tổng', cs1: sum1, cs2: sum2,
      goiy: calcGoiy(sum1, sum2), tong: (sum1 + sum2),
      vitri_cs1: '', vitri_cs2: '', __isSum:true
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
    colHeaders: ['Mã SP','Size','CS1','CS2','Gợi ý','Tổng','Vị trí CS1','Vị trí CS2'],
    columns: [
      { data:'masp', readOnly:true },
      { data:'size', readOnly:true },
      { data:'cs1', readOnly:true, type:'numeric' },
      { data:'cs2', readOnly:true, type:'numeric' },
      { data:'goiy', readOnly:true },
      { data:'tong', readOnly:true, type:'numeric' },
      { data:'vitri_cs1', readOnly:true },
      { data:'vitri_cs2', readOnly:true },
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
      if (tr) tr.scrollIntoView({ block:'center' });
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
  const filters = getFilters();
  if (!filters) {
    document.getElementById('status').textContent = 'Thiếu tham số lọc từ XNT17';
    return;
  }
  document.getElementById('status').textContent = 'Đang tải dữ liệu…';

  try {
    const raw = await fetchAllRows(filters);                        // gọi count & paged hiện có  :contentReference[oaicite:8]{index=8} :contentReference[oaicite:9]{index=9}
    const rows = buildTransferTable(raw);                           // nhóm + tạo dòng “Tổng”
    await patchVitri(rows);                                         // chèn vị trí từ dmhanghoa
    renderHOT(rows);
    document.getElementById('status').textContent =
      `Đã tải ${rows.length} dòng (đã có dòng Tổng cho từng mã)`;
  } catch (e) {
    console.error(e);
    document.getElementById('status').textContent = 'Lỗi tải dữ liệu: ' + e.message;
    alert('Lỗi tải dữ liệu: ' + e.message);
  }
}

document.getElementById('btnReload').onclick = boot;
boot();
