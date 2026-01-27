import { supabase } from './supabaseClient.js';
import { backupAllTablesToZip, backupAllTablesToExcel } from './backup.js';
import { khoiTaoDangNhapDungChung, dangXuatDungChung } from './authModule.js';

// ==== Khai báo các trường bảng danh mục hàng hóa (giống bảng SQL) ====
const COLS = [
  { name: "masp", label: "Mã sản phẩm" },
  { name: "tensp", label: "Tên sản phẩm" },
  { name: "gianhap", label: "Giá nhập" },
  { name: "giale", label: "Giá lẻ" },
  { name: "giasi", label: "Giá sỉ" },
  { name: "mangan", label: "Mã ngắn" },
  { name: "nhomhang", label: "Nhóm hàng" },
  { name: "nhacc", label: "Nhà CC" },
  { name: "chungloai", label: "Chủng loại" },
  { name: "vitrikho1", label: "Vị trí kho 1" },
  { name: "vitrikho2", label: "Vị trí kho 2" },
  { name: "mausac", label: "Màu sắc" },
  { name: "khuyenmai", label: "Khuyến mãi" },
  { name: "quanlykichco", label: "Quản lý kích cỡ" },
  { name: "active", label: "Đang dùng?" },
  { name: "ngaysua", label: "Ngày sửa" },
  { name: "ngaykiem", label: "Ngày kiểm" },
  { name: "dvt", label: "ĐVT" },
  { name: "nhapdau", label: "Ngày nhập đầu" },
  { name: "treomaucs1", label: "treo mau cs1" },
  { name: "treomaucs2", label: "treo mau cs2" },
  { name: "vitrikho3", label: "Vị trí kho 3" },
  { name: "commission_group", label: "nhom hoa hong" },

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
      .filter(c => c.name !== "masp")
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
      // Click ở cột giá trị (cột thứ 2) khi đang ở chế độ DANH SÁCH -> đẩy vào ô điều kiện lọc
      if (currentTableMode !== 'distinct') return;
      if (!coords || coords.row < 0) return;
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
  const btnXoa = document.getElementById('btn-xoa');
  const btnBackup = document.getElementById('btn-backup');
  const btnLuu = document.getElementById('btn-luu');
  const inputFilter = document.getElementById('filter-value');
  const btnLoadFilter = document.getElementById('btn-load-filter');
  const previewEl = document.getElementById('preview');

  if (colSelect) {
    colSelect.onchange = function () {
      initTable(this.value);
      if (previewEl) previewEl.innerHTML = "";
    };
  }

  if (btnReset) {
    btnReset.onclick = function () {
      initTable(colSelect?.value || 'vitrikho1');
      if (inputFilter) inputFilter.value = "";
      if (previewEl) previewEl.innerHTML = "";
    };
  }

  if (btnKiemTra) {
    btnKiemTra.onclick = kiemTraViTri;
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

  if (inputFilter) {
    inputFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') taiDanhSachTheoDieuKien();
    });
  }
}

// ==== Kiểm tra vị trí ====
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
  hot.updateSettings({ cells: hot.getSettings().cells });

  const allRows = hot.getSourceData();
  const uniqueMasps = [];
  const uniqueRows = [];
  const seen = {};

  for (let row of allRows) {
    const masp = (row.masp || "").toString().trim().toUpperCase();
    if (masp && !seen[masp]) {
      seen[masp] = true;
      uniqueMasps.push(masp);
      uniqueRows.push({ masp, [colname]: null, trangthai: null });
    }
  }

  if (uniqueMasps.length === 0) {
    // Không có mã sản phẩm -> gợi ý tải danh sách giá trị “đơn nhất” của cột đang chọn
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

  hot.loadData(uniqueRows);

  const { data: found, error } = await supabase
    .from('dmhanghoa')
    .select(`masp,${colname}`)
    .in('masp', uniqueMasps);

  if (error) {
    alert('Lỗi kết nối Supabase!');
    return;
  }

  const maspMap = {};
  found.forEach(row => { maspMap[row.masp.toUpperCase()] = row[colname]; });

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
(function initPage() {
  // Khởi tạo dropdown & bảng (ẩn phía sau, chờ đăng nhập xong sẽ hiện app-container)
  renderColSelect();
  initTable();
  attachUIEvents();

  // Khởi tạo module đăng nhập dùng chung (mã NV + mật khẩu NV)
  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',        // mặc định cơ sở 1 (nếu cần đổi thì sửa ở đây)
    tuDongKhoaCoSo: true,         // khóa dropdown cơ sở để tránh nhầm
    loginApiPath: '/api/login-cs1', // API login backend bạn đang dùng cho các trang khác
    onLoginSuccess: async (nhanvien, context) => {
      // CHỈ CHO ADMIN VÀO TRANG NÀY
      if (!nhanvien.is_admin) {
        alert('Bạn không có quyền truy cập trang SỬA DANH MỤC HÀNG HÓA.\nChỉ admin mới được phép chỉnh sửa!');
        await dangXuatDungChung({ appContainerId: 'app-container' });
        return;
      }
      console.log('Admin đăng nhập thành công vào suadmhanghoa:', nhanvien.manv);
    }
  });
})();
