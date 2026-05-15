import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

const SUPABASE_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let hot;
let allData = [];
let changedMap = new Map();

const COLUMNS = [
  { data: "masp", title: "Mã SP", type: "text" },
  { data: "tenhang", title: "Tên hàng", type: "text" },
  { data: "dvt", title: "ĐVT", type: "text" },
  { data: "giale", title: "Giá lẻ", type: "numeric", numericFormat: { pattern: "0,0" } },
  { data: "nhom", title: "Nhóm", type: "text" },
  { data: "chungloai", title: "Chủng loại", type: "text" },
  { data: "mausac", title: "Màu sắc", type: "text" },
  { data: "chatlieu", title: "Chất liệu", type: "text" },
  { data: "vitri", title: "Vị trí", type: "text" },
  { data: "quanlykichco", title: "QL size", type: "checkbox" },
  { data: "active", title: "Active", type: "checkbox" },
  { data: "created_at", title: "Ngày tạo", readOnly: true }
];

const FIELD_KEYS = COLUMNS.map(c => c.data);

function setStatus(text) {
  document.getElementById("status").innerText = text;
}

function initHot() {
  const container = document.getElementById("hot");

  hot = new Handsontable(container, {
    data: [],
    columns: COLUMNS,
    colHeaders: COLUMNS.map(c => c.title),
    rowHeaders: true,
    width: "100%",
    height: "100%",
    licenseKey: "non-commercial-and-evaluation",
    stretchH: "all",
    filters: true,
    dropdownMenu: true,
    contextMenu: true,
    manualColumnResize: true,
    manualRowResize: true,
    columnSorting: true,
    hiddenColumns: {
      indicators: true
    },
    afterChange(changes, source) {
      if (!changes || source === "loadData") return;

      changes.forEach(([row, prop, oldValue, newValue]) => {
        if (oldValue === newValue) return;

        const rowData = hot.getSourceDataAtRow(row);
        if (!rowData) return;

        const key = rowData.masp || `NEW_${row}`;
        rowData.__changed = true;
        changedMap.set(key, rowData);
      });

      capNhatStatus();
    }
  });
}

async function taiDuLieu() {
  setStatus("Đang tải dữ liệu...");

  let from = 0;
  const pageSize = 1000;
  let result = [];

  while (true) {
    const { data, error } = await supabase
      .from("dmhanghoa")
      .select("*")
      .order("masp", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(error);
      alert("Lỗi tải danh mục hàng hóa: " + error.message);
      setStatus("Lỗi tải dữ liệu.");
      return;
    }

    result = result.concat(data || []);

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  allData = result.map(r => ({
    ...r,
    quanlykichco: !!r.quanlykichco,
    active: r.active !== false
  }));

  changedMap.clear();
  hot.loadData(allData);
  capNhatStatus();
}

function capNhatStatus() {
  setStatus(
    `Tổng: ${hot.countRows()} dòng | Đã sửa: ${changedMap.size} dòng`
  );
}

function locDuLieu() {
  const kw = String(document.getElementById("txtSearch").value || "").trim().toUpperCase();

  if (!kw) {
    hot.loadData(allData);
    capNhatStatus();
    return;
  }

  const filtered = allData.filter(r => {
    return [
      r.masp,
      r.tenhang,
      r.nhom,
      r.chungloai,
      r.vitri
    ].some(v => String(v || "").toUpperCase().includes(kw));
  });

  hot.loadData(filtered);
  setStatus(`Đang lọc: ${filtered.length}/${allData.length} dòng | Đã sửa: ${changedMap.size} dòng`);
}

function chuanHoaMasp() {
  const data = hot.getSourceData();

  data.forEach((r, idx) => {
    if (r.masp) {
      const old = r.masp;
      r.masp = String(r.masp).trim().toUpperCase();
      if (old !== r.masp) {
        r.__changed = true;
        changedMap.set(r.masp || `ROW_${idx}`, r);
      }
    }
  });

  hot.render();
  capNhatStatus();
  alert("Đã chuẩn hóa mã sản phẩm về chữ in hoa.");
}

function kiemTraLoi() {
  const data = hot.getSourceData();
  const seen = new Set();
  const errors = [];

  data.forEach((r, idx) => {
    const rowNum = idx + 1;
    const masp = String(r.masp || "").trim().toUpperCase();

    if (!masp) errors.push(`Dòng ${rowNum}: thiếu mã sản phẩm.`);
    if (!r.tenhang) errors.push(`Dòng ${rowNum}: thiếu tên hàng.`);

    if (masp) {
      if (seen.has(masp)) errors.push(`Dòng ${rowNum}: trùng mã sản phẩm ${masp}.`);
      seen.add(masp);
    }

    if (r.giale !== null && r.giale !== undefined && r.giale !== "") {
      const gia = Number(String(r.giale).replace(/[^\d.-]/g, ""));
      if (Number.isNaN(gia)) errors.push(`Dòng ${rowNum}: giá lẻ không hợp lệ.`);
    }
  });

  if (errors.length) {
    alert("Có lỗi:\n\n" + errors.slice(0, 30).join("\n"));
    setStatus(`Có ${errors.length} lỗi cần sửa.`);
    return false;
  }

  alert("Không phát hiện lỗi cơ bản.");
  return true;
}

function cleanRowForSave(row) {
  const obj = {};

  FIELD_KEYS.forEach(key => {
    if (key === "created_at") return;

    let val = row[key];

    if (key === "masp") val = String(val || "").trim().toUpperCase();
    if (key === "giale") val = val === "" || val == null ? null : Number(String(val).replace(/[^\d.-]/g, ""));
    if (key === "quanlykichco") val = !!val;
    if (key === "active") val = val !== false;

    obj[key] = val;
  });

  return obj;
}

async function luuThayDoi() {
  if (!changedMap.size) {
    alert("Không có dòng nào thay đổi.");
    return;
  }

  if (!kiemTraLoi()) return;

  const rows = Array.from(changedMap.values())
    .map(cleanRowForSave)
    .filter(r => r.masp);

  if (!rows.length) {
    alert("Không có dòng hợp lệ để lưu.");
    return;
  }

  if (!confirm(`Bạn muốn lưu ${rows.length} dòng đã thay đổi?`)) return;

  setStatus("Đang lưu dữ liệu...");

  const { error } = await supabase
    .from("dmhanghoa")
    .upsert(rows, { onConflict: "masp" });

  if (error) {
    console.error(error);
    alert("Lỗi lưu dữ liệu: " + error.message);
    setStatus("Lỗi lưu dữ liệu.");
    return;
  }

  alert("Đã lưu thành công.");
  changedMap.clear();
  await taiDuLieu();
}

function sapXep(asc = true) {
  const field = document.getElementById("sortField").value;
  if (!field) {
    alert("Chưa chọn cột sắp xếp.");
    return;
  }

  const data = hot.getSourceData();

  data.sort((a, b) => {
    const va = a[field] ?? "";
    const vb = b[field] ?? "";

    if (field === "giale") {
      return asc ? Number(va || 0) - Number(vb || 0) : Number(vb || 0) - Number(va || 0);
    }

    return asc
      ? String(va).localeCompare(String(vb), "vi")
      : String(vb).localeCompare(String(va), "vi");
  });

  hot.loadData(data);
  setStatus(`Đã sắp xếp theo ${field}.`);
}

function xuatExcel() {
  const data = hot.getSourceData();
  const ws = XLSX.utils.json_to_sheet(data.map(r => {
    const obj = {};
    COLUMNS.forEach(c => obj[c.title] = r[c.data]);
    return obj;
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "dmhanghoa");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `dmhanghoa_${today}.xlsx`);
}

function nhapExcel(file) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const workbook = XLSX.read(e.target.result, { type: "binary" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const mapped = rows.map(r => {
      const obj = {};

      COLUMNS.forEach(c => {
        obj[c.data] = r[c.title] ?? r[c.data] ?? "";
      });

      if (obj.masp) obj.masp = String(obj.masp).trim().toUpperCase();
      obj.__changed = true;

      return obj;
    });

    const current = hot.getSourceData();
    const merged = [...current, ...mapped];

    hot.loadData(merged);

    mapped.forEach((r, i) => {
      changedMap.set(r.masp || `IMPORT_${i}`, r);
    });

    capNhatStatus();
    alert(`Đã nhập ${mapped.length} dòng từ Excel. Bấm "Lưu thay đổi" để ghi vào Supabase.`);
  };

  reader.readAsBinaryString(file);
}

function themDong() {
  const data = hot.getSourceData();
  data.push({
    masp: "",
    tenhang: "",
    dvt: "cái",
    giale: 0,
    nhom: "",
    chungloai: "",
    mausac: "",
    chatlieu: "",
    vitri: "",
    quanlykichco: true,
    active: true,
    __changed: true
  });

  hot.loadData(data);
  capNhatStatus();
}

function xoaDongKhoiBang() {
  const selected = hot.getSelectedLast();
  if (!selected) return;

  const [row] = selected;
  const data = hot.getSourceData();
  data.splice(row, 1);
  hot.loadData(data);
  capNhatStatus();
}

document.addEventListener("DOMContentLoaded", () => {
  initHot();

  document.getElementById("btnTai").onclick = taiDuLieu;
  document.getElementById("btnLuu").onclick = luuThayDoi;
  document.getElementById("btnKiemTra").onclick = kiemTraLoi;
  document.getElementById("btnChuanHoa").onclick = chuanHoaMasp;
  document.getElementById("txtSearch").oninput = locDuLieu;

  document.getElementById("btnSortAsc").onclick = () => sapXep(true);
  document.getElementById("btnSortDesc").onclick = () => sapXep(false);

  document.getElementById("btnExport").onclick = xuatExcel;

  document.getElementById("btnImport").onclick = () => {
    document.getElementById("fileExcel").click();
  };

  document.getElementById("fileExcel").onchange = e => {
    const file = e.target.files?.[0];
    if (file) nhapExcel(file);
  };

  document.getElementById("btnThemDong").onclick = themDong;
  document.getElementById("btnXoaDong").onclick = xoaDongKhoiBang;

  taiDuLieu();
});