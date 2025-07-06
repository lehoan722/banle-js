import { supabase } from '../scripts/supabaseClient.js';

let hot;
let products = [];
let filtered = [];
let selected = [];
export let globalTemsAll = [];
export let globalBlank = 0;
export let currentPage = 1;
export let totalPages = 1;

// Cấu hình bảng
const colHeaders = [
  "STT", "Mã hàng", "Tên hàng", "Số lượng tem in",
  "ĐVT", "Size", "Giá lẻ", "In", "Giá nhập"
];
const columns = [
  { data: 0, type: 'numeric' },
  { data: 1, type: 'text' },
  { data: 2, type: 'text' },
  { data: 3, type: 'numeric' },
  { data: 4, type: 'text' },
  { data: 5, type: 'text' },
  { data: 6, type: 'numeric' },
  { data: 7, type: 'checkbox' },
  { data: 8, type: 'numeric' }
];

// Khởi tạo bảng sau khi DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById('hot');
  hot = new Handsontable(container, {
    data: [],
    colHeaders: colHeaders,
    columns: columns,
    rowHeaders: true,
    minSpareRows: 1,
    licenseKey: 'non-commercial-and-evaluation',
    contextMenu: true,
    copyPaste: true,
    manualColumnResize: true,
    manualRowResize: true,
    stretchH: 'all',
    afterChange: syncHandsontableToSelected,
    beforeChange(changes, source) {
      if (source === 'edit') {
        const readOnlyColumns = [1, 2, 4, 6, 8];
        for (let i = changes.length - 1; i >= 0; i--) {
          if (readOnlyColumns.includes(changes[i][1])) {
            changes.splice(i, 1);
          }
        }
      }
    },
    afterOnCellDblClick(row) {
      const data = hot.getSourceData();
      if (confirm("Bạn có chắc chắn muốn xóa dòng này?")) {
        data.splice(row, 1);
        data.forEach((r, idx) => r[0] = idx + 1);
        hot.loadData(data);
      }
    }
  });

  document.getElementById('search').addEventListener('input', () => {
    const val = document.getElementById('search').value.trim().toLowerCase();
    if (val.length === 0) {
      filtered = [];
      products = [];
      renderProductList();
    } else {
      searchProducts(val);
    }
  });
});

// Tìm kiếm sản phẩm Supabase
async function searchProducts(keyword) {
  let { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp, dvt, giale, gianhap')
    .or(`masp.ilike.%${keyword}%,tensp.ilike.%${keyword}%`)
    .order('masp')
    .limit(100);

  filtered = data || [];
  products = data || [];
  renderProductList();
}

// Hiển thị danh sách sản phẩm
function renderProductList() {
  const productListDiv = document.getElementById('productList');
  let html = '<table>';
  html += '<tr><th>Mã SP</th><th>Tên hàng</th></tr>';
  for (let p of filtered) {
    html += `<tr data-masp="${p.masp}"><td>${p.masp}</td><td>${p.tensp}</td></tr>`;
  }
  html += '</table>';
  productListDiv.innerHTML = html;

  productListDiv.querySelectorAll('tr[data-masp]').forEach(row => {
    row.ondblclick = () => selectProduct(row.dataset.masp);
  });
}

// Thêm sản phẩm vào bảng
function selectProduct(masp) {
  if (!hot) return;
  const p = products.find(x => x.masp === masp);
  if (!p) return;

  let data = hot.getSourceData();
  data = data.filter(row =>
    Array.isArray(row)
      ? row.some(cell => cell !== null && cell !== "")
      : Object.values(row).some(cell => cell !== null && cell !== "")
  );

  data.push([
    data.length + 1,
    p.masp,
    p.tensp,
    1,
    p.dvt || "",
    "",
    p.giale,
    true,
    p.gianhap
  ]);

  data.forEach((row, idx) => row[0] = idx + 1);
  hot.loadData(data);
}

// Đồng bộ bảng Handsontable với biến `selected`
export function syncHandsontableToSelected() {
  if (!hot) return;
  const data = hot.getData().filter(row => row[1] && row[2]);
  selected = data.map(row => ({
    stt: row[0],
    masp: row[1],
    tensp: row[2],
    sltem: row[3],
    dvt: row[4],
    size: row[5],
    giale: row[6],
    tick: !!row[7],
    gianhap: row[8],
    sl: row[5] || 1
  }));
}

// Cho phép in hoặc export gọi selected
export function getSelectedRows() {
  return selected;
}

// Tiện ích định dạng giá
export function formatGia(val) {
  if (!val || val == 0) return '';
  return parseInt(val).toLocaleString('vi-VN');
}
