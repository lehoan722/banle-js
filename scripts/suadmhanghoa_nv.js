import { supabase } from './supabaseClient.js';
import { backupAllTablesToZip, backupAllTablesToExcel } from './backup.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

// Cho stockQuickPopup dùng được supabase global
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}

// ==== Khai báo các trường bảng danh mục hàng hóa (giống bảng SQL) ====  
const COLS = [
  //{ name: "masp", label: "Mã sản phẩm" },
  // { name: "tensp", label: "Tên sản phẩm" },
  // { name: "gianhap", label: "Giá nhập" },
  //{ name: "giale", label: "Giá lẻ" },
  //{ name: "giasi", label: "Giá sỉ" },
  //{ name: "mangan", label: "Mã ngắn" },
  //{ name: "nhomhang", label: "Nhóm hàng" },
  //{ name: "nhacc", label: "Nhà CC" },
  //{ name: "chungloai", label: "Chủng loại" },
  { name: "vitrikho1", label: "Vị trí kho 1" },
  { name: "vitrikho2", label: "Vị trí kho 2" },
  //{ name: "mausac", label: "Màu sắc" },
  //{ name: "khuyenmai", label: "Khuyến mãi" },
  //{ name: "quanlykichco", label: "Quản lý kích cỡ" },
  //{ name: "active", label: "Đang dùng?" },
  // { name: "ngaysua", label: "Ngày sửa" },
  //{ name: "ngaykiem", label: "Ngày kiểm" },
  // { name: "dvt", label: "ĐVT" },
  // { name: "nhapdau", label: "Ngày nhập đầu" },
  { name: "treomaucs1", label: "treo mau cs1" },
  { name: "treomaucs2", label: "treo mau cs2" },
  // { name: "vitrikho3", label: "Vị trí kho 3" },
  // { name: "commission_group", label: "nhom hoa hong" },

];

// ==== Cấu hình cho tính năng lọc theo điều kiện & tải danh sách giá trị ====
const DISTINCT_WHITELIST = new Set([
  // Các cột “danh mục/nhóm” thường có ít giá trị -> tải distinct nhẹ
  'nhomhang',
  'chungloai',
  'treomaucs1',
  'treomaucs2',
  'vitrikho1',
  'vitrikho2',
  'vitri',
  'nhacc',
]);

const DISTINCT_MAX_UNIQUE = 2000;   // tối đa số giá trị distinct đổ ra bảng
const DISTINCT_MAX_SCAN = 20000;    // tối đa số dòng quét để lấy distinct
const DISTINCT_BATCH = 1000;        // mỗi lần đọc bao nhiêu dòng

const FILTER_MAX_ROWS = 10000;      // tối đa số sản phẩm tải theo điều kiện (tránh nặng HOT)
const FILTER_BATCH = 1000;

const FILTER_NUMERIC_COLS = new Set(['gianhap', 'giale', 'giasi']);
const FILTER_BOOLEAN_COLS = new Set(['active', 'quanlykichco']);

// ==== Lọc theo khoảng ngày tạo (created_at) ====
// Nếu người dùng chọn từ ngày/đến ngày, ta sẽ chỉ tải các mã sản phẩm có created_at nằm trong khoảng đó.
// Input type="date" trả về YYYY-MM-DD. Ta convert theo múi giờ VN (+07:00) rồi đưa về ISO (UTC) để so sánh chính xác với timestamptz.
function getCreatedAtRangeISO() {
  const fromEl = document.getElementById('date-from');
  const toEl = document.getElementById('date-to');

  const fromDate = (fromEl?.value || '').toString().trim(); // YYYY-MM-DD hoặc ''
  const toDate = (toEl?.value || '').toString().trim();

  if (!fromDate && !toDate) return null;

  // Nếu chỉ chọn 1 đầu mút: cho phép lọc 1 chiều
  // Chuyển sang ISO UTC theo mốc giờ VN (Asia/Ho_Chi_Minh ~ +07:00)
  const mkStart = (d) => new Date(`${d}T00:00:00+07:00`).toISOString();
  const mkEnd = (d) => new Date(`${d}T23:59:59.999+07:00`).toISOString();

  const range = {};
  if (fromDate) range.fromISO = mkStart(fromDate);
  if (toDate) range.toISO = mkEnd(toDate);

  // Validate: nếu có cả 2 mà from > to thì báo lỗi
  if (range.fromISO && range.toISO) {
    const a = new Date(range.fromISO).getTime();
    const b = new Date(range.toISO).getTime();
    if (a > b) {
      alert('Khoảng ngày không hợp lệ: "Từ ngày" phải nhỏ hơn hoặc bằng "Đến ngày".');
      return null;
    }
  }

  return range;
}

function applyCreatedAtRange(q, range) {
  if (!range) return q;
  if (range.fromISO) q = q.gte('created_at', range.fromISO);
  if (range.toISO) q = q.lte('created_at', range.toISO);
  return q;
}


function applyFilterQuery(q, colname, rawValue) {


  // Hỗ trợ nhiều giá trị cách nhau bằng dấu phẩy: dùng .in() (match chính xác)
  // rawValue có thể là mảng (đã được split/trim ở nơi gọi)
  if (Array.isArray(rawValue)) {
    const vals = rawValue.map(v => String(v).trim()).filter(Boolean);
    if (vals.length === 0) return q.eq(colname, null);

    // Boolean
    if (FILTER_BOOLEAN_COLS.has(colname)) {
      const bools = vals
        .map(v => v.toLowerCase())
        .map(v => (v === '1' || v === 'true') ? true : (v === '0' || v === 'false') ? false : null)
        .filter(v => v !== null);

      if (bools.length === 0) return q.eq(colname, null);
      // nếu có cả true và false -> không cần lọc
      if (bools.includes(true) && bools.includes(false)) return q;
      return q.eq(colname, bools[0]);
    }

    // Số
    if (FILTER_NUMERIC_COLS.has(colname)) {
      const nums = vals
        .map(v => Number(String(v).replace(',', '.')))
        .filter(n => Number.isFinite(n));
      if (nums.length === 0) return q.eq(colname, null);
      return q.in(colname, nums);
    }

    // Text: OR + ilike dạng contains (không phân biệt hoa/thường)
    // Ví dụ: nhập noc4 -> match mọi giá trị có chứa noc4
    const orExpr = vals.map(v => `${colname}.ilike.%${v}%`).join(',');
    return q.or(orExpr);

  }  // Nếu là boolean
  if (FILTER_BOOLEAN_COLS.has(colname)) {
    const v = String(rawValue).trim().toLowerCase();
    if (v === '1' || v === 'true') return q.eq(colname, true);
    if (v === '0' || v === 'false') return q.eq(colname, false);
    // nếu nhập sai -> trả về query sẽ không có kết quả
    return q.eq(colname, null);
  }

  // Nếu là số
  if (FILTER_NUMERIC_COLS.has(colname)) {
    const n = Number(String(rawValue).trim().replace(',', '.'));
    if (Number.isFinite(n)) return q.eq(colname, n);
    return q.eq(colname, null);
  }

  // Mặc định: text -> ilike contains để không phân biệt hoa thường
  const pattern = String(rawValue).trim();
  return q.ilike(colname, `%${pattern}%`);
}


function getColLabel(colname) {
  const colInfo = COLS.find(c => c.name === colname);
  return colInfo ? colInfo.label : colname;
}

// ==== Ô nhập mã sản phẩm nhanh (giống upanhnhanh) ====
let quickMaspInput = null;
let quickMaspSuggestDiv = null;

function positionQuickMaspSuggest() {
  if (!quickMaspInput || !quickMaspSuggestDiv) return;
  const rect = quickMaspInput.getBoundingClientRect();
  quickMaspSuggestDiv.style.left = (rect.left + window.scrollX) + 'px';
  quickMaspSuggestDiv.style.top = (rect.bottom + 4 + window.scrollY) + 'px';
  quickMaspSuggestDiv.style.minWidth = rect.width + 'px';
}

function hideQuickMaspSuggest() {
  if (quickMaspSuggestDiv) quickMaspSuggestDiv.style.display = 'none';
}

function focusQuickMaspInput(selectAll = false) {
  if (!quickMaspInput) return;
  quickMaspInput.focus();
  if (selectAll) quickMaspInput.select();
}

async function loadQuickMaspSuggest(keyword) {
  if (!quickMaspSuggestDiv || !quickMaspInput) return;

  const q = String(keyword || '').trim();
  const currentInput = String(quickMaspInput.value || '').trim();

  // Ô nhập đang trống thì tuyệt đối không hiện danh sách
  if (!q || !currentInput) {
    hideQuickMaspSuggest();
    return;
  }

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp')
    .or(`masp.ilike.%${q}%,tensp.ilike.%${q}%`)
    .order('masp')
    .limit(100);

  if (error) {
    console.warn('Lỗi load gợi ý mã SP:', error);
    hideQuickMaspSuggest();
    return;
  }

  if (!data || !data.length) {
    hideQuickMaspSuggest();
    return;
  }

  let html = '<table style="border-collapse:collapse;width:100%;"><tbody>';
  for (const row of data) {
    const masp = (row.masp || '').toString().trim().toUpperCase();
    const tensp = (row.tensp || '').toString();
    html += `
      <tr data-masp="${masp}" style="cursor:pointer;">
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;white-space:nowrap;width:120px;">${masp}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#4b5563;">${tensp}</td>
      </tr>
    `;
  }
  html += '</tbody></table>';

  quickMaspSuggestDiv.innerHTML = html;
  positionQuickMaspSuggest();
  quickMaspSuggestDiv.style.display = 'block';

  quickMaspSuggestDiv.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', async () => {
      const masp = (tr.dataset.masp || '').trim().toUpperCase();
      quickMaspInput.value = masp;
      hideQuickMaspSuggest();
      await xuLyNhapNhanhMaSanPham();
    });
  });
}

function timDongTrongTiepTheo(colname) {
  if (!hot) return -1;

  for (let r = 0; r < hot.countRows(); r++) {
    const masp = (hot.getDataAtCell(r, 0) || '').toString().trim();
    const val = (hot.getDataAtCell(r, 1) || '').toString().trim();
    const trangthai = (hot.getDataAtCell(r, 2) || '').toString().trim();

    if (!masp && !val && !trangthai) return r;
  }

  hot.alter('insert_row_below', hot.countRows(), 1);
  return hot.countRows() - 1;
}

async function kiemTraMaSanPhamTonTai(masp) {
  const ma = String(masp || '').trim().toUpperCase();
  if (!ma) return null;

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp')
    .eq('masp', ma)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function xuLyNhapNhanhMaSanPham() {
  const previewEl = document.getElementById('preview');
  const colSelect = document.getElementById('col-select');

  if (!hot) return;
  if (!colSelect || !colSelect.value) {
    alert("Bạn cần chọn mục cần ghi vào trước khi nhập mã sản phẩm!");
    focusQuickMaspInput(true);
    return;
  }

  const colname = colSelect.value;
  const masp = (quickMaspInput?.value || '').toString().trim().toUpperCase();

  if (!masp) {
    focusQuickMaspInput(true);
    return;
  }

  try {
    const found = await kiemTraMaSanPhamTonTai(masp);

    if (!found) {
      alert("Mã sản phẩm không hợp lệ!");
      if (previewEl) {
        previewEl.innerHTML = `<span style="color:#e53935;">❌ Mã sản phẩm <b>${masp}</b> không tồn tại trong danh mục hàng hóa.</span>`;
      }
      quickMaspInput.value = '';
      hideQuickMaspSuggest();
      focusQuickMaspInput();
      return;
    }

    const rowIndex = timDongTrongTiepTheo(colname);

    hot.setDataAtCell(rowIndex, 0, masp);
    hot.setDataAtCell(rowIndex, 1, null);
    hot.setDataAtCell(rowIndex, 2, null);

    currentTableMode = 'masp';

    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã thêm mã <b>${masp}</b> vào bảng dữ liệu.</span>`;
    }

    quickMaspInput.value = '';
    hideQuickMaspSuggest();

    // Chỉ cuộn tới dòng vừa thêm, KHÔNG chọn cell để tránh mất focus ô nhập mã
    hot.scrollViewportTo(rowIndex, 0);

    // Trả focus lại ô nhập mã để nhập tiếp mã sau
    setTimeout(() => {
      focusQuickMaspInput();
    }, 0);
  } catch (err) {
    console.error(err);
    alert("Lỗi khi kiểm tra mã sản phẩm: " + (err?.message || err));
    focusQuickMaspInput(true);
  }
}

function attachQuickMaspEvents() {
  quickMaspInput = document.getElementById('quick-masp');
  quickMaspSuggestDiv = document.getElementById('quick-masp-suggest');

  if (!quickMaspInput || !quickMaspSuggestDiv) return;

  quickMaspInput.addEventListener('input', () => {
    quickMaspInput.value = quickMaspInput.value.toUpperCase();
    const v = quickMaspInput.value.trim();

    if (!v) {
      hideQuickMaspSuggest();
      return;
    }

    loadQuickMaspSuggest(v).catch(console.warn);
  });

  quickMaspInput.addEventListener('focus', () => {
    const v = quickMaspInput.value.trim();
    if (!v) {
      hideQuickMaspSuggest();
    }
  });

  quickMaspInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await xuLyNhapNhanhMaSanPham();
    }
  });

  quickMaspInput.addEventListener('blur', () => {
    setTimeout(() => hideQuickMaspSuggest(), 150);
  });

  window.addEventListener('resize', positionQuickMaspSuggest);
  window.addEventListener('scroll', positionQuickMaspSuggest, true);

  document.addEventListener('click', (ev) => {
    if (!quickMaspSuggestDiv || quickMaspSuggestDiv.style.display === 'none') return;
    if (ev.target === quickMaspInput || quickMaspSuggestDiv.contains(ev.target)) return;
    hideQuickMaspSuggest();
  });
}

// ==== Hỗ trợ UX: double-click để đẩy giá trị vào ô "Giá trị lọc" ====
function appendToFilterInput(value) {
  const input = document.getElementById('filter-value');
  if (!input) return;

  const v = (value ?? "").toString().trim();
  if (!v) return;

  const current = (input.value || "").toString().trim();
  if (!current) {
    input.value = v;
    input.focus();
    return;
  }

  const parts = current.split(',').map(x => x.trim()).filter(Boolean);
  // tránh trùng (không phân biệt hoa/thường)
  const exists = parts.some(x => x.toLowerCase() === v.toLowerCase());
  if (!exists) parts.push(v);

  input.value = parts.join(', ');
  input.focus();
}
function isDistinctAllowed(colname) {
  return DISTINCT_WHITELIST.has(colname);
}

async function fetchDistinctValuesFromDmHangHoa(colname, createdAtRange) {
  const set = new Set();
  let from = 0;

  while (from < DISTINCT_MAX_SCAN && set.size < DISTINCT_MAX_UNIQUE) {
    const to = from + DISTINCT_BATCH - 1;

    const { data, error } = await supabase
      .from('dmhanghoa')
      .select(colname)
      .not(colname, 'is', null)
      // áp dụng lọc created_at nếu có

      .range(from, to);

    if (error) throw error;

    if (!data || data.length === 0) break;

    for (const row of data) {
      const v = row?.[colname];
      if (v === null || typeof v === 'undefined') continue;
      const s = String(v).trim();
      if (!s) continue;
      set.add(s);
      if (set.size >= DISTINCT_MAX_UNIQUE) break;
    }

    if (data.length < DISTINCT_BATCH) break;
    from += DISTINCT_BATCH;
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

async function fetchRowsByFilterFromDmHangHoa(colname, filterValue, createdAtRange) {
  const rows = [];
  let from = 0;

  while (rows.length < FILTER_MAX_ROWS) {
    const to = from + FILTER_BATCH - 1;

    let q = supabase
      .from('dmhanghoa')
      .select(`masp,${colname}`);

    q = applyCreatedAtRange(q, createdAtRange);

    q = applyFilterQuery(q, colname, filterValue);

    const { data, error } = await q.range(from, to);

    if (error) throw error;

    if (!data || data.length === 0) break;

    rows.push(...data);

    if (data.length < FILTER_BATCH) break;
    from += FILTER_BATCH;
  }

  return rows;
}


// ==== Render dropdown chọn cột cần ghi ====
function renderColSelect() {
  let html = `<option value="" selected disabled>-- Chọn mục cần ghi --</option>` +
    COLS
      .map(c => `<option value="${c.name}">${c.label}</option>`)
      .join("");

  const colSelect = document.getElementById('col-select');
  if (colSelect) {
    colSelect.innerHTML = html;
  }
}


// ==== Table Handsontable (chỉ gồm masp, cột cần sửa, trạng thái) ====
let hot;
let currentTableMode = 'masp';
let duplicateMasps = new Set();
let duplicateMaspColorMap = new Map();

function taoBangMauChoMaTrung(duplicateSet) {
  duplicateMaspColorMap = new Map();

  const palette = [
    '#ffe3e3', // đỏ nhạt
    '#fff3bf', // vàng nhạt
    '#d3f9d8', // xanh lá nhạt
    '#d0ebff', // xanh dương nhạt
    '#e5dbff', // tím nhạt
    '#ffd8a8', // cam nhạt
    '#fcc2d7', // hồng nhạt
    '#c5f6fa', // cyan nhạt
    '#f8f0fc', // tím hồng nhạt
    '#e9fac8'  // xanh chuối nhạt
  ];

  let i = 0;
  for (const masp of duplicateSet) {
    duplicateMaspColorMap.set(masp, palette[i % palette.length]);
    i++;
  }
}

function ensureDuplicateMaspStyle() {
  if (document.getElementById('duplicate-masp-style')) return;

  const style = document.createElement('style');
  style.id = 'duplicate-masp-style';
  style.textContent = `
    .htCore td.masp-trung {
      color: #7f1d1d !important;
      font-weight: 700 !important;
      border: 1px solid rgba(127, 29, 29, 0.18) !important;
    }
  `;
  document.head.appendChild(style);
}

function initTable(colname = 'vitrikho1') {
  currentTableMode = 'masp';
  const colInfo = COLS.find(c => c.name === colname);
  const colLabel = colInfo ? colInfo.label : colname;

  const colHeaders = ['Mã sản phẩm', colLabel, 'Trạng thái'];
  const columns = [
    { data: 'masp', type: 'text', width: 150 },
    { data: colname, type: 'text', width: 150 },
    { data: 'trangthai', type: 'text', width: 110 }
  ];

  const container = document.getElementById('hot');
  if (!container) return;

  if (hot) hot.destroy();

  hot = new Handsontable(container, {
    data: Array.from({ length: 30 }, () => ({ masp: null, [colname]: null, trangthai: null })),
    columns,
    colHeaders,
    rowHeaders: true,
    minSpareRows: 1,
    width: '100%',
    height: 420,
    stretchH: 'all',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',

    cells: function (row, col) {
      const cellProperties = {};

      // Tô màu cột mã sản phẩm nếu bị trùng, mỗi mã một màu riêng
      if (col === 0) {
        const masp = (this.instance.getDataAtCell(row, 0) || '').toString().trim().toUpperCase();
        if (masp && duplicateMasps.has(masp)) {
          cellProperties.className = 'masp-trung';

          const bg = duplicateMaspColorMap.get(masp);
          if (bg) {
            cellProperties.renderer = function (instance, td, row, col, prop, value, cellProperties) {
              Handsontable.renderers.TextRenderer.apply(this, arguments);
              td.style.background = bg;
              td.style.color = '#7f1d1d';
              td.style.fontWeight = '700';
            };
          }
        }
      }

      if (col === 2) {
        const val = this.instance.getDataAtCell(row, col);
        if (val === "OK") cellProperties.className = "trangthai-ok";
        if (val === "BỎ QUA") cellProperties.className = "trangthai-boqua";
        if (val === "LỖI") cellProperties.className = "trangthai-loi";
        if (val === "MÃ KHÔNG TỒN TẠI") cellProperties.className = "trangthai-khongtontai";
        if (val === "CHƯA CÓ GIÁ TRỊ") cellProperties.className = "trangthai-chuacovitri";
      }

      return cellProperties;
    },

    afterOnCellMouseDown: function (event, coords) {
      if (!coords || coords.row < 0) return;

      // 1) Nếu click vào cột mã sản phẩm -> mở stockQuickPopup
      if (coords.col === 0) {
        const masp = (this.getDataAtCell(coords.row, 0) || '').toString().trim().toUpperCase();
        if (masp && typeof window.stockQuickPopup === 'function') {
          window.stockQuickPopup(masp);
        }
        return;
      }

      // 2) Giữ nguyên logic cũ: ở chế độ danh sách thì click cột giá trị để đẩy sang ô lọc
      if (currentTableMode !== 'distinct') return;
      if (coords.col !== 1) return;

      const val = this.getDataAtCell(coords.row, coords.col);
      appendToFilterInput(val);
    },
    afterOnCellDblClick: function (event, coords) {
      // Double click ở cột giá trị (cột thứ 2) -> đẩy vào ô điều kiện lọc
      if (currentTableMode !== 'distinct') return;
      if (!coords || coords.row < 0) return;
      if (coords.col !== 1) return;
      const val = this.getDataAtCell(coords.row, coords.col);
      appendToFilterInput(val);
    }
  });
}

// ==== Sự kiện giao diện chính ====
function attachUIEvents() {
  const colSelect = document.getElementById('col-select');
  const btnReset = document.getElementById('btn-reset');
  const btnKiemTra = document.getElementById('btn-kiemtra');
  const btnTonNhanh = document.getElementById('btn-ton-nhanh');
  const btnXoaTrung = document.getElementById('btn-xoa-trung');
  const btnDienCotB = document.getElementById('btn-dien-cot-b');
  const btnCopyAB = document.getElementById('btn-copy-ab');
  const btnPasteAB = document.getElementById('btn-paste-ab');
  const btnXoa = document.getElementById('btn-xoa');
  const btnBackup = document.getElementById('btn-backup');
  const btnLuu = document.getElementById('btn-luu');

  const inputFilter = document.getElementById('filter-value');
  const btnLoadFilter = document.getElementById('btn-load-filter');
  const btnKiemTraThuaThieu = document.getElementById('btn-kiem-tra-thua-thieu');
  const previewEl = document.getElementById('preview');

  if (colSelect) {
    colSelect.onchange = function () {
      initTable(this.value);
      hideQuickMaspSuggest();
      if (previewEl) previewEl.innerHTML = "";
      focusQuickMaspInput();
    };
  }

  if (btnReset) {
    btnReset.onclick = function () {
      initTable(colSelect?.value || 'vitrikho1');
      if (inputFilter) inputFilter.value = "";
      if (quickMaspInput) quickMaspInput.value = "";
      hideQuickMaspSuggest();
      if (previewEl) previewEl.innerHTML = "";
      focusQuickMaspInput();
    };
  }

  if (btnKiemTra) {
    btnKiemTra.onclick = kiemTraViTri;
  }

  if (btnTonNhanh) {
    btnTonNhanh.onclick = tonNhanh;
  }

  if (btnXoaTrung) {
    btnXoaTrung.onclick = xoaMaSanPhamTrung;
  }

  if (btnDienCotB) {
    btnDienCotB.onclick = dienCotBHangLoat;
  }

  if (btnCopyAB) {
    btnCopyAB.onclick = copyCotAVaB;
  }

  if (btnPasteAB) {
    btnPasteAB.onclick = danCotAVaB;
  }

  if (btnXoa) {
    btnXoa.onclick = xoaSanPhamDaCoViTri;
  }

  if (btnBackup) {
    btnBackup.onclick = backupTruocKhiGhi;
  }

  if (btnLuu) {
    btnLuu.onclick = luuDuLieu;
  }

  if (btnLoadFilter) {
    btnLoadFilter.onclick = taiDanhSachTheoDieuKien;
  }

  if (btnKiemTraThuaThieu) {
    btnKiemTraThuaThieu.onclick = kiemTraThuaThieu;
  }

  if (inputFilter) {
    inputFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') taiDanhSachTheoDieuKien();
    });
  }

  attachQuickMaspEvents();
}

function timDanhSachMaTrung() {
  if (!hot) return new Set();

  const counts = {};
  const allRows = hot.getSourceData();

  for (const row of allRows) {
    const masp = (row.masp || '').toString().trim().toUpperCase();
    if (!masp) continue;
    counts[masp] = (counts[masp] || 0) + 1;
  }

  const result = new Set();
  Object.keys(counts).forEach(masp => {
    if (counts[masp] > 1) result.add(masp);
  });

  return result;
}

function xoaMaSanPhamTrung() {
  const previewEl = document.getElementById('preview');
  const colSelect = document.getElementById('col-select');

  if (!hot) return;

  const allRows = hot.getSourceData();
  const duplicateSet = timDanhSachMaTrung();

  if (duplicateSet.size === 0) {
    duplicateMasps = new Set();
    duplicateMaspColorMap = new Map();
    hot.updateSettings({ cells: hot.getSettings().cells });
    hot.render();

    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#16a34a;">✅ Không có mã sản phẩm trùng để xóa.</span>`;
    }
    alert("Không có mã sản phẩm trùng.");
    return;
  }

  if (!confirm("Bạn có muốn xóa các mã sản phẩm trùng không?\nHệ thống sẽ giữ lại dòng đầu tiên của mỗi mã và xóa các dòng trùng phía sau.")) {
    return;
  }

  const seen = new Set();
  const filteredRows = [];

  for (const row of allRows) {
    const masp = (row.masp || '').toString().trim().toUpperCase();

    // Giữ nguyên dòng trống
    if (!masp) {
      continue;
    }

    // Giữ lại dòng đầu tiên của mỗi mã
    if (!seen.has(masp)) {
      seen.add(masp);
      filteredRows.push({
        ...row,
        masp
      });
    }
  }

  // Nếu sau khi lọc không còn dòng nào thì tạo 1 dòng trống
  if (filteredRows.length === 0) {
    const colname = colSelect?.value || 'vitrikho1';
    filteredRows.push({ masp: null, [colname]: null, trangthai: null });
  }

  duplicateMasps = new Set();
  duplicateMaspColorMap = new Map();

  hot.loadData(filteredRows);
  hot.updateSettings({ cells: hot.getSettings().cells });
  hot.render();

  if (previewEl) {
    previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã xóa các mã sản phẩm trùng. Mỗi mã chỉ giữ lại 1 dòng đầu tiên.</span>`;
  }

  if (quickMaspInput) {
    quickMaspInput.focus();
  }
}

function dienCotBHangLoat() {
  const previewEl = document.getElementById('preview');
  const colSelect = document.getElementById('col-select');

  if (!hot) return;
  if (!colSelect || !colSelect.value) {
    alert("Bạn cần chọn mục cần ghi vào trước khi điền cột B!");
    return;
  }

  const allRows = hot.getSourceData();
  if (!allRows || allRows.length === 0) {
    alert("Không có dữ liệu trong bảng.");
    return;
  }

  const firstValue = (hot.getDataAtCell(0, 1) ?? '').toString().trim();

  if (!firstValue) {
    alert("Bạn cần nhập giá trị ở cột B dòng đầu tiên trước khi dùng nút Điền cột B.");
    return;
  }

  let count = 0;

  hot.batch(() => {
    for (let r = 0; r < hot.countRows(); r++) {
      const masp = (hot.getDataAtCell(r, 0) || '').toString().trim().toUpperCase();
      if (!masp) continue;

      hot.setDataAtCell(r, 1, firstValue);
      count++;
    }
  });

  if (previewEl) {
    previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã điền giá trị <b>${firstValue}</b> xuống cột B cho <b>${count}</b> dòng có mã sản phẩm.</span>`;
  }

  if (quickMaspInput) {
    quickMaspInput.focus();
  }
}

async function copyCotAVaB() {
  const previewEl = document.getElementById('preview');
  if (!hot) return;

  const allRows = hot.getSourceData();

  const lines = allRows
    .map(row => {
      const masp = (row.masp || '').toString().trim().toUpperCase();
      const valB = Object.keys(row).find(k => !['masp', 'trangthai'].includes(k));
      const b = valB ? (row[valB] ?? '').toString().trim() : '';
      return { masp, b };
    })
    .filter(r => r.masp || r.b);

  if (lines.length === 0) {
    alert("Không có dữ liệu để copy.");
    return;
  }

  const text = lines.map(r => `${r.masp}\t${r.b}`).join('\n');

  try {
    await navigator.clipboard.writeText(text);
    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã copy ${lines.length} dòng của cột A và cột B.</span>`;
    }
  } catch (err) {
    console.error(err);
    alert("Không copy được vào clipboard: " + (err?.message || err));
  }

  if (quickMaspInput) quickMaspInput.focus();
}

async function danCotAVaB() {
  const previewEl = document.getElementById('preview');
  const colSelect = document.getElementById('col-select');

  if (!hot) return;
  if (!colSelect || !colSelect.value) {
    alert("Bạn cần chọn mục cần ghi vào trước khi dán dữ liệu!");
    return;
  }

  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      alert("Clipboard đang trống.");
      return;
    }

    const lines = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      alert("Không có dữ liệu hợp lệ để dán.");
      return;
    }

    const parsed = lines.map(line => {
      const parts = line.split('\t');
      return {
        masp: (parts[0] || '').toString().trim().toUpperCase(),
        valB: (parts[1] || '').toString().trim()
      };
    }).filter(r => r.masp || r.valB);

    if (parsed.length === 0) {
      alert("Dữ liệu clipboard không đúng định dạng cột A và cột B.");
      return;
    }

    const colname = colSelect.value;

    // Xóa màu trùng cũ trước khi dán
    duplicateMasps = new Set();
    duplicateMaspColorMap = new Map();

    const rows = parsed.map(r => ({
      masp: r.masp || null,
      [colname]: r.valB || null,
      trangthai: null
    }));

    // thêm 1 dòng trống cuối cho dễ nhập tiếp
    rows.push({ masp: null, [colname]: null, trangthai: null });

    hot.loadData(rows);
    hot.updateSettings({ cells: hot.getSettings().cells });
    hot.render();

    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã dán ${parsed.length} dòng vào cột A và cột B.</span>`;
    }
  } catch (err) {
    console.error(err);
    alert("Không đọc được clipboard: " + (err?.message || err));
  }

  if (quickMaspInput) quickMaspInput.focus();
}

// ==== Kiểm tra vị trí ====

// ==== Tồn nhanh: lấy tồn tổng theo mã qua RPC xntnhanh ====
function getTodayVNDateYMD() {
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const y = vnNow.getFullYear();
  const m = String(vnNow.getMonth() + 1).padStart(2, '0');
  const d = String(vnNow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getUniqueMaspsFromTable() {
  if (!hot) return [];

  const rows = hot.getSourceData();
  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const masp = (row.masp || '').toString().trim().toUpperCase();
    if (!masp) continue;
    if (seen.has(masp)) continue;
    seen.add(masp);
    result.push(masp);
  }

  return result;
}

async function fetchTonNhanhByMasps(masps) {
  const resultMap = {};
  if (!masps || masps.length === 0) return resultMap;

  const chunkSize = 200;
  const chunks = chunkArray(masps, chunkSize);
  const denNgay = getTodayVNDateYMD();

  for (let i = 0; i < chunks.length; i++) {
    const arr = chunks[i];

    const { data, error } = await supabase.rpc('xntnhanh', {
      p_masps: arr,
      p_den_ngay: denNgay,
      p_tonghop_size: true
    });

    if (error) throw error;

    (data || []).forEach(row => {
      const masp = (row.masp || '').toString().trim().toUpperCase();
      if (!masp) return;

      resultMap[masp] = {
        ton_cs1: Number(row.ton_cs1 || 0),
        ton_cs2: Number(row.ton_cs2 || 0)
      };
    });
  }

  return resultMap;
}

async function tonNhanh() {
  const previewEl = document.getElementById('preview');
  if (!hot) return;

  const masps = getUniqueMaspsFromTable();

  if (masps.length === 0) {
    alert('Chưa có mã sản phẩm nào ở cột A để lấy tồn nhanh.');
    return;
  }

  try {
    if (previewEl) {
      previewEl.innerHTML = `<span>⏳ Đang lấy tồn nhanh cho <b>${masps.length}</b> mã sản phẩm...</span>`;
    }

    const tonMap = await fetchTonNhanhByMasps(masps);

    let countUpdated = 0;

    hot.batch(() => {
      for (let r = 0; r < hot.countRows(); r++) {
        const masp = (hot.getDataAtCell(r, 0) || '').toString().trim().toUpperCase();
        if (!masp) {
          hot.setDataAtCell(r, 2, null);
          continue;
        }

        const ton = tonMap[masp] || { ton_cs1: 0, ton_cs2: 0 };
        const text = `${ton.ton_cs1}/${ton.ton_cs2}`;
        hot.setDataAtCell(r, 2, text);
        countUpdated++;
      }
    });

    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#16a34a;">✅ Đã lấy tồn nhanh cho <b>${countUpdated}</b> dòng. Định dạng: <b>CS1/CS2</b>.</span>`;
    }

    hot.render();

    if (quickMaspInput) quickMaspInput.focus();
  } catch (err) {
    console.error(err);
    alert('Lỗi khi lấy tồn nhanh: ' + (err?.message || err));
    if (previewEl) {
      previewEl.innerHTML = `<span style="color:#dc2626;">❌ Lỗi khi lấy tồn nhanh.</span>`;
    }
  }
}

async function kiemTraViTri() {
  const colSelect = document.getElementById('col-select');
  const previewEl = document.getElementById('preview');
  if (!colSelect) return;

  const colname = colSelect.value;
  if (!colname) {
    alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
    return;
  }

  if (!hot) return;

  // Luôn reset danh sách mã trùng trước mỗi lần kiểm tra
  duplicateMasps = new Set();
  duplicateMaspColorMap = new Map();

  duplicateMasps = new Set();
  duplicateMaspColorMap = new Map();
  hot.updateSettings({ cells: hot.getSettings().cells });
  hot.render();

  // 1) Kiểm tra mã trùng trước
  const duplicateSet = timDanhSachMaTrung();
  if (duplicateSet.size > 0) {
    duplicateMasps = duplicateSet;
    taoBangMauChoMaTrung(duplicateSet);

    hot.updateSettings({ cells: hot.getSettings().cells });
    hot.render();

    const dsTrung = Array.from(duplicateSet).join(', ');

    if (previewEl) {
      previewEl.innerHTML = `
        <span style="color:#b91c1c; font-weight:700;">
          ⚠️ Phát hiện mã sản phẩm bị trùng: ${dsTrung}.
          Hãy bấm nút "Xóa trùng" hoặc tự xóa các dòng trùng rồi bấm lại "Kiểm tra vị trí".
        </span>
      `;
    }

    alert("Có mã sản phẩm bị trùng. Hệ thống đã tô màu để bạn nhận biết. Hãy xóa mã trùng rồi bấm lại Kiểm tra vị trí.");
    return;
  }

  // Không có mã trùng -> bỏ highlight cũ nếu có
  hot.updateSettings({ cells: hot.getSettings().cells });
  hot.render();

  const allRows = hot.getSourceData();
  const maspRows = [];

  for (let row of allRows) {
    const masp = (row.masp || "").toString().trim().toUpperCase();
    if (masp) {
      maspRows.push({ masp, [colname]: null, trangthai: null });
    }
  }

  const uniqueMasps = maspRows.map(r => r.masp);

  if (uniqueMasps.length === 0) {
    const colLabel = getColLabel(colname);

    if (!isDistinctAllowed(colname)) {
      alert(`Bạn chưa nhập mã sản phẩm để kiểm tra.\n\nCột "${colLabel}" hiện chưa hỗ trợ tải danh sách giá trị đơn nhất.`);
      return;
    }

    const ok = confirm(
      `Bạn chưa nhập mã sản phẩm để kiểm tra.\n\nBạn có muốn tải DANH SÁCH GIÁ TRỊ (đơn nhất) của cột "${colLabel}" để tham khảo & copy dán vào ô điều kiện không?`
    );

    if (!ok) {
      alert("Hãy nhập mã sản phẩm vào cột A để kiểm tra.");
      return;
    }

    await taiDanhSachGiaTriCotDangChon();
    return;
  }

  hot.loadData(maspRows);

  const { data: found, error } = await supabase
    .from('dmhanghoa')
    .select(`masp,${colname}`)
    .in('masp', uniqueMasps);

  if (error) {
    alert('Lỗi kết nối Supabase!');
    return;
  }

  const maspMap = {};
  found.forEach(row => {
    maspMap[row.masp.toUpperCase()] = row[colname];
  });

  hot.batch(() => {
    for (let r = 0; r < hot.countRows(); r++) {
      const masp = (hot.getDataAtCell(r, 0) || "").toString().trim().toUpperCase();
      hot.setDataAtCell(r, 0, masp);

      if (!masp) {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, null);
        continue;
      }

      if (typeof maspMap[masp] === "undefined") {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, "MÃ KHÔNG TỒN TẠI");
      } else if (maspMap[masp]) {
        hot.setDataAtCell(r, 1, maspMap[masp]);
        hot.setDataAtCell(r, 2, "BỎ QUA");
      } else {
        hot.setDataAtCell(r, 1, null);
        hot.setDataAtCell(r, 2, "CHƯA CÓ GIÁ TRỊ");
      }
    }
  });

  if (previewEl) {
    previewEl.innerHTML = `<span>✅ Đã kiểm tra xong.</span>`;
  }

  hot.updateSettings({ cells: hot.getSettings().cells });
  hot.render();
}

// ==== Tải danh sách GIÁ TRỊ (đơn nhất) của cột đang chọn để tham khảo ====
async function taiDanhSachGiaTriCotDangChon() {
  const colSelect = document.getElementById('col-select');
  const previewEl = document.getElementById('preview');
  if (!colSelect || !hot) return;

  const colname = colSelect.value;
  const colLabel = getColLabel(colname);

  if (!colname) {
    alert("Bạn cần chọn cột trước khi tải danh sách giá trị!");
    return;
  }

  if (!isDistinctAllowed(colname)) {
    alert(`Cột "${colLabel}" hiện chưa hỗ trợ tải danh sách giá trị đơn nhất.`);
    return;
  }

  try {
    const createdAtRange = getCreatedAtRangeISO();
    const rangeNote = (createdAtRange?.fromISO || createdAtRange?.toISO)
      ? ` (lọc theo created_at${createdAtRange?.fromISO ? ' từ ' + (document.getElementById('date-from')?.value || '') : ''}${createdAtRange?.toISO ? ' đến ' + (document.getElementById('date-to')?.value || '') : ''})`
      : '';

    if (previewEl) previewEl.innerHTML = `<span>⏳ Đang tải danh sách giá trị của cột <b>${colLabel}</b>${rangeNote}...</span>`;


    const values = await fetchDistinctValuesFromDmHangHoa(colname, createdAtRange);

    const rows = values.map(v => ({
      masp: "",
      [colname]: v,
      trangthai: "DANH SÁCH"
    }));

    hot.loadData(rows);
    currentTableMode = 'distinct';

    if (previewEl) {
      previewEl.innerHTML =
        `✅ Đã tải <b>${values.length}</b> giá trị (đơn nhất) của cột <b>${colLabel}</b>. ` +
        `Bạn có thể copy ở cột <b>${colLabel}</b> và dán vào ô <b>Giá trị lọc</b>.`;
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi tải danh sách giá trị: " + (err?.message || err));
    if (previewEl) previewEl.innerHTML = "";
  }
}

// ==== Tải danh sách sản phẩm theo điều kiện (cột đang chọn = giá trị lọc) ====

// ==== Kiểm tra thừa thiếu: tải thêm mã theo điều kiện nhưng KHÔNG xóa bảng hiện có ====
async function kiemTraThuaThieu() {
  const colSelect = document.getElementById('col-select');
  const inputFilter = document.getElementById('filter-value');
  const previewEl = document.getElementById('preview');

  if (!colSelect || !hot) return;

  const colname = colSelect.value;
  const colLabel = getColLabel(colname);
  const rawFilter = (inputFilter?.value || '').toString();
  const filterValues = rawFilter.split(',').map(v => v.trim()).filter(Boolean);

  if (!colname) {
    alert("Bạn cần chọn cột trước khi kiểm tra thừa thiếu!");
    return;
  }

  if (filterValues.length === 0) {
    alert(`Bạn cần nhập "Giá trị lọc" cho cột "${colLabel}" trước khi kiểm tra thừa thiếu!`);
    return;
  }

  try {
    const filterText = filterValues.join(', ');
    const createdAtRange = getCreatedAtRangeISO();
    const rangeNote = (createdAtRange?.fromISO || createdAtRange?.toISO)
      ? ` (lọc theo created_at${createdAtRange?.fromISO ? ' từ ' + (document.getElementById('date-from')?.value || '') : ''}${createdAtRange?.toISO ? ' đến ' + (document.getElementById('date-to')?.value || '') : ''})`
      : '';

    if (previewEl) {
      previewEl.innerHTML = `<span>⏳ Đang kiểm tra thừa thiếu theo <b>${colLabel}</b> thuộc: <b>${filterText}</b>${rangeNote}...</span>`;
    }

    const foundRows = await fetchRowsByFilterFromDmHangHoa(
      colname,
      (filterValues.length === 1 ? filterValues[0] : filterValues),
      createdAtRange
    );

    if (!foundRows || foundRows.length === 0) {
      if (previewEl) {
        previewEl.innerHTML = `⚠️ Không tìm thấy sản phẩm nào có <b>${colLabel}</b> thuộc: <b>${filterText}</b>.`;
      }
      return;
    }

    // Danh sách mã đang có trên bảng
    const existingRows = hot.getSourceData();
    const existingMasps = new Set(
      existingRows
        .map(r => (r.masp || '').toString().trim().toUpperCase())
        .filter(Boolean)
    );

    // Chỉ lấy các mã chưa có trên bảng để thêm vào
    const rowsToAdd = [];
    let skipped = 0;

    for (const r of foundRows) {
      const masp = (r.masp || '').toString().trim().toUpperCase();
      if (!masp) continue;

      if (existingMasps.has(masp)) {
        skipped++;
        continue;
      }

      existingMasps.add(masp);

      rowsToAdd.push({
        masp,
        [colname]: r[colname],
        trangthai: 'TẢI THÊM'
      });
    }

    if (rowsToAdd.length === 0) {
      if (previewEl) {
        previewEl.innerHTML = `✅ Đã kiểm tra xong. Không có mã nào cần tải thêm. Có <b>${skipped}</b> mã đã có sẵn trên bảng.`;
      }
      return;
    }

    // Lấy dữ liệu hiện tại, bỏ các dòng trống hoàn toàn ở cuối để ghép cho gọn
    const currentRows = hot.getSourceData().filter(row => {
      const masp = (row.masp || '').toString().trim();
      const valB = Object.keys(row)
        .filter(k => !['masp', 'trangthai'].includes(k))
        .some(k => (row[k] ?? '').toString().trim() !== '');
      const trangthai = (row.trangthai || '').toString().trim();
      return masp || valB || trangthai;
    });

    const mergedRows = [
      ...currentRows,
      ...rowsToAdd,
      { masp: null, [colname]: null, trangthai: null }
    ];

    hot.loadData(mergedRows);
    hot.updateSettings({ cells: hot.getSettings().cells });
    hot.render();

    if (previewEl) {
      previewEl.innerHTML =
        `✅ Đã tải thêm <b>${rowsToAdd.length}</b> mã để kiểm tra thừa thiếu. ` +
        `Có <b>${skipped}</b> mã đã có sẵn trên bảng nên bỏ qua.`;
    }

    if (quickMaspInput) quickMaspInput.focus();
  } catch (err) {
    console.error(err);
    alert("Lỗi khi kiểm tra thừa thiếu: " + (err?.message || err));
    if (previewEl) previewEl.innerHTML = "";
  }
}

async function taiDanhSachTheoDieuKien() {
  const colSelect = document.getElementById('col-select');
  const inputFilter = document.getElementById('filter-value');
  const previewEl = document.getElementById('preview');
  if (!colSelect || !hot) return;

  const colname = colSelect.value;
  const colLabel = getColLabel(colname);
  const rawFilter = (inputFilter?.value || "").toString();
  const filterValues = rawFilter.split(',').map(v => v.trim()).filter(Boolean);

  if (!colname) {
    alert("Bạn cần chọn cột trước khi tải theo điều kiện!");
    return;
  }

  if (filterValues.length === 0) {
    alert(`Bạn cần nhập "Giá trị lọc" cho cột "${colLabel}"! (có thể nhập nhiều giá trị cách nhau bằng dấu ,)`);
    return;
  }

  try {
    const filterText = filterValues.join(', ');
    const createdAtRange = getCreatedAtRangeISO();
    const rangeNote = (createdAtRange?.fromISO || createdAtRange?.toISO)
      ? ` (lọc theo created_at${createdAtRange?.fromISO ? ' từ ' + (document.getElementById('date-from')?.value || '') : ''}${createdAtRange?.toISO ? ' đến ' + (document.getElementById('date-to')?.value || '') : ''})`
      : '';

    if (previewEl) previewEl.innerHTML = `<span>⏳ Đang tải danh sách sản phẩm có <b>${colLabel}</b> thuộc: <b>${filterText}</b>${rangeNote}...</span>`;

    const foundRows = await fetchRowsByFilterFromDmHangHoa(colname, (filterValues.length === 1 ? filterValues[0] : filterValues), createdAtRange);

    if (!foundRows || foundRows.length === 0) {
      hot.loadData([{ masp: "", [colname]: "", trangthai: "KHÔNG CÓ KẾT QUẢ" }]);
      if (previewEl) previewEl.innerHTML = `⚠️ Không tìm thấy sản phẩm nào có <b>${colLabel}</b> thuộc: <b>${filterText}</b>.`;
      return;
    }

    const rows = foundRows.slice(0, FILTER_MAX_ROWS).map(r => ({
      masp: (r.masp || "").toString().trim().toUpperCase(),
      [colname]: r[colname],
      trangthai: "TẢI ĐIỀU KIỆN"
    }));

    hot.loadData(rows);

    const note = (foundRows.length >= FILTER_MAX_ROWS)
      ? ` (đang giới hạn hiển thị ${FILTER_MAX_ROWS} dòng đầu)`
      : "";

    if (previewEl) {
      previewEl.innerHTML = `✅ Đã tải <b>${rows.length}</b> sản phẩm theo điều kiện <b>${colLabel}</b> thuộc: <b>${filterText}</b>${note}.`;
    }
  } catch (err) {
    console.error(err);
    alert("Lỗi khi tải theo điều kiện: " + (err?.message || err));
    if (previewEl) previewEl.innerHTML = "";
  }
}
// ==== Xóa sản phẩm đã có vị trí (và dòng trống) ====
function xoaSanPhamDaCoViTri() {
  const previewEl = document.getElementById('preview');
  if (!hot) return;

  let tableData = hot.getSourceData();
  tableData = tableData.filter(row =>
    row.masp && row.trangthai !== "BỎ QUA"
  );

  if (tableData.length === 0) {
    tableData.push({ masp: null, vitrikho1: null, trangthai: null });
  }

  hot.loadData(tableData);
  hot.updateSettings({ cells: hot.getSettings().cells });

  if (previewEl) {
    previewEl.innerHTML = `<span>👉 Nhập vị trí cho các sản phẩm chưa có vị trí hoặc mã mới.</span>`;
  }
}

// ==== Backup danh mục ====
async function backupTruocKhiGhi() {
  const overlay = document.getElementById('backup-overlay');
  if (!confirm("Bạn muốn backup toàn bộ dữ liệu các bảng chính trước khi ghi?")) return;

  if (overlay) overlay.style.display = "block";

  try {
    await backupAllTablesToZip();
    alert("Đã backup toàn bộ các bảng quan trọng!\nHãy di chuyển file vừa tải về vào thư mục D:\\backup để đảm bảo an toàn!");
  } catch (err) {
    alert("Lỗi backup: " + err.message);
  } finally {
    if (overlay) overlay.style.display = "none";
  }
}

// 1) Thêm hàm chuẩn hóa giá trị trước khi ghi
function resolveUpdateValue(colname, rawVal) {
  // 1. Trả về null nếu người dùng để trống (xóa dữ liệu cũ)
  if (rawVal === undefined || rawVal === null) return null;

  let s = rawVal.toString().trim();
  if (s === '') return null;

  // 2. Cột ngày
  if (["ngaysua", "ngaykiem", "nhapdau"].includes(colname)) {
    return normalizeDate(s);
  }

  // 3. Cột boolean
  if (["active", "quanlykichco"].includes(colname)) {
    if (s === '1' || s.toLowerCase() === 'true') return true;
    if (s === '0' || s.toLowerCase() === 'false') return false;
    return null;
  }

  // 4. Cột số (giữ nguyên, KHÔNG uppercase)
  if (["gianhap", "giale", "giasi"].includes(colname)) {
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  // 5. MẶC ĐỊNH: TEXT → CHUYỂN SANG IN HOA
  return s.toUpperCase();
}


// Tạo timestamp hiện tại (giờ máy) dạng YYYY-MM-DD HH:mm:ss
function nowLocalTimestamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

// ==== Lưu dữ liệu (PATCH từng dòng, chia chunk 100 dòng) ====
async function luuDuLieu() {
  const colSelect = document.getElementById('col-select');
  const previewEl = document.getElementById('preview');
  const nowKiem = nowLocalTimestamp(); // dùng 1 mốc thời gian cho cả lần lưu này
  if (!colSelect) return;

  const colname = colSelect.value;
  if (!colname) {
    alert("Bạn cần chọn mục cần ghi vào trước khi thực hiện thao tác này!");
    return;
  }

  const colLabel = COLS.find(c => c.name === colname)?.label || colname;

  if (!hot) return;

  // LẤY TOÀN BỘ DÒNG CÓ MÃ, KỂ CẢ Ô RỖNG (để cho phép xóa)
  const source = hot.getSourceData();
  let rows = source
    .map((r, rowIndex) => ({
      rowIndex,
      masp: (r.masp || '').toString().trim().toUpperCase(),
      rawVal: r[colname]
    }))
    .filter(r => r.masp); // chỉ cần có mã

  if (rows.length === 0) {
    alert("Không có dữ liệu hợp lệ để ghi.");
    return;
  }

  // Nhắc người dùng: sẽ GHI ĐÈ và có thể XÓA dữ liệu cũ (ghi null)
  if (!confirm(`⚠️ Hành động này sẽ ghi đè cột "${colLabel}" cho các mã đã nhập.\nNếu ô để trống, hệ thống sẽ xóa giá trị cũ (ghi NULL).\nBạn chắc chắn muốn tiếp tục?`)) {
    if (previewEl) {
      previewEl.innerHTML = `<span style="color:orange;">⏹️ Đã hủy thao tác ghi đè.</span>`;
    }
    return;
  }

  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  let success = 0, fail = 0, errorMsg = [];

  for (let i = 0; i < chunks.length; i++) {
    if (previewEl) {
      previewEl.innerHTML = `<span>⏳ Đang ghi nhóm ${i + 1}/${chunks.length}...</span>`;
    }

    const promises = chunks[i].map((row) => {
      const updateObj = {};

      // luôn cập nhật ngày kiểm khi bấm Lưu dữ liệu
      updateObj.ngaykiem = nowKiem;

      // vẫn update cột đang chọn (trừ khi chính nó là ngaykiem)
      if (colname !== 'ngaykiem') {
        updateObj[colname] = resolveUpdateValue(colname, row.rawVal); // rỗng -> null
      }

      return supabase
        .from('dmhanghoa')
        .update(updateObj)
        .eq('masp', row.masp)
        .select()
        .then(({ data, error }) => ({
          rowIndex: row.rowIndex,
          masp: row.masp,
          success: !error && data && data.length === 1,
          error: error?.message || (!data?.length && 'Không có dòng nào được cập nhật (mã không tồn tại)') || null
        }));
    });

    const results = await Promise.all(promises);

    results.forEach(res => {
      if (res.success) {
        hot.setDataAtCell(res.rowIndex, 2, "OK");     // dùng rowIndex gốc
        success++;
      } else {
        hot.setDataAtCell(res.rowIndex, 2, "LỖI");    // dùng rowIndex gốc
        fail++;
        errorMsg.push(`Dòng ${res.rowIndex + 1} (${res.masp}): ${res.error}`);
      }
    });
  }

  let html = `<span>✅ Đã lưu xong: <b style="color:#e53935">${success} OK</b> &nbsp; <b style="color:orange">${fail} lỗi</b></span>`;
  if (fail) {
    html += `<br><details><summary>Xem chi tiết lỗi</summary><div style="color:orange;text-align:left">${errorMsg.join('<br>')}</div></details>`;
  }
  if (previewEl) {
    previewEl.innerHTML = html;
  }
  hot.updateSettings({ cells: hot.getSettings().cells });
}

// ==== Tiện ích ====

// Chia mảng thành các nhóm nhỏ
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Chuyển array object sang CSV
function toCSV(data) {
  if (!data.length) return '';
  const keys = Object.keys(data[0]);
  const csvRows = [
    keys.join(','), // Tiêu đề
    ...data.map(row => keys.map(k => `"${(row[k] ?? "").toString().replace(/"/g, '""')}"`).join(','))
  ];
  return csvRows.join('\r\n');
}

// Chuẩn hóa ngày tháng (dành cho các trường ngày)
function normalizeDate(val) {
  if (!val) return null;
  let m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (m) {
    let dd = m[1].padStart(2, '0');
    let mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    let h = m[4] || '00', mi = m[5] || '00';
    return `${yyyy}-${mm}-${dd} ${h.padStart(2, '0')}:${mi.padStart(2, '0')}:00`;
  }
  if (["null", "NULL", "NaN", "undefined"].includes(val.toString().trim())) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
  return null;
}

// ==== KHỞI TẠO TRANG ====
// ==== KHỞI TẠO TRANG ====
(function initPage() {
  // Khởi tạo dropdown & bảng (ẩn phía sau, chờ đăng nhập xong sẽ hiện app-container)
  ensureDuplicateMaspStyle();
  renderColSelect();
  initTable();
  attachUIEvents();

  // Khởi tạo module đăng nhập dùng chung (mã NV + mật khẩu NV)
  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: async (nhanvien, context) => {
      // Trang này cho phép cả admin và nhân viên đăng nhập sử dụng
      console.log('Đăng nhập thành công vào suadmhanghoa_nv:', nhanvien.manv, 'is_admin=', nhanvien.is_admin);
    }
  });
})();
