import {
  khoiTaoDangNhapDungChung,
  dangXuatDungChung,
  getSupabaseClient,
  getCurrentUserInfo
} from "./authModule.js";

const supabase = getSupabaseClient();

let hot = null;
let rawData = [];
let changedMakhs = new Set();
let errorRows = new Set();

const editableFields = [
  "tenkh",
  "ngaysinh",
  "diachi",
  "dienthoai",
  "email",
  "taikhoan",
  "mst",
  "cccd",
  "la_ncc",
  "hang_khach",
  "ghi_chu_chamsoc",
  "active",
  "thangsinh",
  "namsinh",
  "marketing_opt_in",
  "zalo_sms_opt_in",
  "nguon_dangky"
];

const columns = [
  { data: "makh", title: "Mã KH", readOnly: true },
  { data: "tenkh", title: "Tên khách" },
  { data: "ngaysinh", title: "Ngày sinh", type: "date", dateFormat: "YYYY-MM-DD", correctFormat: true },
  { data: "thangsinh", title: "Tháng sinh", type: "numeric" },
  { data: "namsinh", title: "Năm sinh", type: "numeric" },
  { data: "dienthoai", title: "Điện thoại" },
  { data: "diachi", title: "Địa chỉ" },
  { data: "email", title: "Email" },
  { data: "taikhoan", title: "Tài khoản" },
  { data: "mst", title: "MST" },
  { data: "cccd", title: "CCCD" },
  { data: "la_ncc", title: "Là NCC", type: "checkbox" },
  { data: "hang_khach", title: "Hạng khách", type: "dropdown", source: ["THUONG", "VIP", "VANG", "BAC", "KIMCUONG"] },
  { data: "ghi_chu_chamsoc", title: "Ghi chú chăm sóc" },
  { data: "active", title: "Active", type: "checkbox" },
  { data: "marketing_opt_in", title: "Marketing", type: "checkbox" },
  { data: "marketing_opt_in_at", title: "Marketing lúc", readOnly: true },
  { data: "zalo_sms_opt_in", title: "Zalo/SMS", type: "checkbox" },
  { data: "nguon_dangky", title: "Nguồn đăng ký" },

  { data: "diem_hientai", title: "Điểm hiện tại", readOnly: true, type: "numeric" },
  { data: "tong_chi_tieu", title: "Tổng chi tiêu", readOnly: true, type: "numeric" },
  { data: "so_lan_mua", title: "Số lần mua", readOnly: true, type: "numeric" },
  { data: "lan_mua_cuoi", title: "Lần mua cuối", readOnly: true },
  { data: "created_at", title: "Ngày tạo", readOnly: true },
  { data: "created_by_manv", title: "NV tạo", readOnly: true },
  { data: "created_by_tennv", title: "Tên NV tạo", readOnly: true },
  { data: "created_by_diadiem", title: "CS tạo", readOnly: true }
];

function $(id) {
  return document.getElementById(id);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function setStatus(msg) {
  $("status").textContent = msg;
}

function normalizeRow(row) {
  const info = getCurrentUserInfo();

  return {
    makh: String(row.makh || "").trim().toUpperCase(),
    tenkh: String(row.tenkh || "").trim(),
    ngaysinh: row.ngaysinh || null,
    diachi: row.diachi || null,
    dienthoai: row.dienthoai || null,
    email: row.email || null,
    taikhoan: row.taikhoan || null,
    mst: row.mst || null,
    cccd: row.cccd || null,
    la_ncc: !!row.la_ncc,
    hang_khach: row.hang_khach || "THUONG",
    ghi_chu_chamsoc: row.ghi_chu_chamsoc || null,
    active: row.active !== false,
    thangsinh: row.thangsinh === "" || row.thangsinh == null ? null : Number(row.thangsinh),
    namsinh: row.namsinh === "" || row.namsinh == null ? null : Number(row.namsinh),
    marketing_opt_in: !!row.marketing_opt_in,
    zalo_sms_opt_in: !!row.zalo_sms_opt_in,
    nguon_dangky: row.nguon_dangky || null,

    created_by_manv: row.created_by_manv || info.manv || null,
    created_by_tennv: row.created_by_tennv || info.tennv || null,
    created_by_diadiem: row.created_by_diadiem || info.diadiem || null
  };
}

function validateRow(row, rowIndex) {
  const errors = [];

  if (!String(row.makh || "").trim()) {
    errors.push("Thiếu mã khách hàng");
  }

  if (!String(row.tenkh || "").trim()) {
    errors.push("Thiếu tên khách hàng");
  }

  if (row.thangsinh !== null && row.thangsinh !== "" && row.thangsinh !== undefined) {
    const m = Number(row.thangsinh);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      errors.push("Tháng sinh phải từ 1 đến 12");
    }
  }

  if (row.namsinh !== null && row.namsinh !== "" && row.namsinh !== undefined) {
    const y = Number(row.namsinh);
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(y) || y < 1900 || y > currentYear) {
      errors.push(`Năm sinh phải từ 1900 đến ${currentYear}`);
    }
  }

  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email).trim())) {
    errors.push("Email không hợp lệ");
  }

  if (errors.length) {
    errorRows.add(rowIndex);
    return errors;
  }

  errorRows.delete(rowIndex);
  return [];
}

function createHot(data) {
  const container = $("hot");

  if (!container) {
    alert("Không tìm thấy vùng hiển thị bảng #hot");
    return;
  }

  container.innerHTML = "";
  container.style.display = "block";
  container.style.width = "100%";
  container.style.height = "650px";
  container.style.minHeight = "650px";
  container.style.background = "#fff";

  if (hot) {
    hot.destroy();
    hot = null;
  }

  hot = new Handsontable(container, {
    data: data,
    columns: columns,
    rowHeaders: true,
    colHeaders: columns.map(c => c.title),
    licenseKey: "non-commercial-and-evaluation",

    width: "100%",
    height: 650,
    stretchH: "all",

    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    manualColumnResize: true,
    manualColumnMove: true,
    contextMenu: true,
    fixedColumnsStart: 2,

    cells(row, col) {
      const props = {};
      const rowData = hot?.getSourceDataAtRow(row);
      const field = columns[col]?.data;

      if (!rowData) return props;

      if (rowData.active === false) {
        props.className = "cell-inactive";
      }

      if (errorRows.has(row)) {
        props.className = "cell-error";
      }

      if (changedMakhs.has(rowData.makh)) {
        props.className = "cell-edited";
      }

      if (columns[col]?.readOnly) {
        props.readOnly = true;
        props.className = `${props.className || ""} readonly-cell`;
      }

      if (field === "makh" && rowData.created_at) {
        props.readOnly = true;
        props.editor = false;
        props.className = `${props.className || ""} readonly-cell`;
      }

      return props;
    },

    afterChange(changes, source) {
      if (!changes || source === "loadData") return;

      changes.forEach(([rowIndex, prop, oldValue, newValue]) => {
        if (oldValue === newValue) return;

        const row = hot.getSourceDataAtRow(rowIndex);
        if (!row) return;

        if (!editableFields.includes(prop) && prop !== "makh") {
          setStatus(`Cột ${prop} không cho phép sửa trực tiếp.`);
          return;
        }

        if (prop === "makh") {
          row.makh = String(newValue || "").trim().toUpperCase();
        }

        changedMakhs.add(row.makh || `__row_${rowIndex}`);
      });

      setStatus(`Đã sửa ${changedMakhs.size} dòng, chưa lưu.`);
      hot.render();
    }
  });

  setTimeout(() => {
    hot.refreshDimensions();
    hot.render();
  }, 500);
}

async function loadData() {
  const tuNgay = $("tuNgay").value;
  const denNgay = $("denNgay").value;
  const includeInactive = $("includeInactive").checked;

  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn từ ngày và đến ngày.");
    return;
  }

  setStatus("Đang tải dữ liệu khách hàng...");

  const { data, error } = await supabase.rpc("rpc_dmkhachhang_load", {
    p_tu_ngay: tuNgay,
    p_den_ngay: denNgay,
    p_include_inactive: includeInactive
  });

  if (error) {
    console.error(error);
    alert("Lỗi tải dữ liệu: " + error.message);
    setStatus("Lỗi tải dữ liệu.");
    return;
  }

  rawData = Array.isArray(data) ? data : [];
  changedMakhs.clear();
  errorRows.clear();

  createHot(rawData);
  setStatus(`Đã tải ${rawData.length} khách hàng.`);
}

function addRow() {
  if (!hot) return;

  const info = getCurrentUserInfo();

  const newRow = {
    makh: "",
    tenkh: "",
    ngaysinh: null,
    diachi: "",
    dienthoai: "",
    email: "",
    taikhoan: "",
    mst: "",
    cccd: "",
    la_ncc: false,
    hang_khach: "THUONG",
    ghi_chu_chamsoc: "",
    active: true,
    thangsinh: null,
    namsinh: null,
    marketing_opt_in: false,
    zalo_sms_opt_in: false,
    nguon_dangky: "ADMIN",
    created_by_manv: info.manv,
    created_by_tennv: info.tennv,
    created_by_diadiem: info.diadiem
  };

  hot.alter("insert_row_below", hot.countRows() - 1, 1);
  const lastRow = hot.countRows() - 1;
  Object.keys(newRow).forEach(key => {
    hot.setDataAtRowProp(lastRow, key, newRow[key], "addRow");
  });

  changedMakhs.add(`__row_${lastRow}`);
  hot.selectCell(lastRow, 0);
  setStatus("Đã thêm dòng mới. Nhập thông tin rồi bấm Lưu thay đổi.");
}

async function saveChanges() {
  if (!hot) return;

  const allRows = hot.getSourceData();
  const rowsToSave = [];

  errorRows.clear();

  allRows.forEach((row, index) => {
    const isNew = !row.created_at && String(row.makh || "").trim();
    const isChanged = changedMakhs.has(row.makh) || changedMakhs.has(`__row_${index}`);

    if (!isNew && !isChanged) return;

    const normalized = normalizeRow(row);
    const errors = validateRow(normalized, index);

    if (errors.length) {
      console.warn(`Dòng ${index + 1}:`, errors);
      return;
    }

    rowsToSave.push(normalized);
  });

  hot.render();

  if (errorRows.size > 0) {
    alert(`Có ${errorRows.size} dòng lỗi. Vui lòng kiểm tra các dòng màu đỏ.`);
    setStatus(`Có ${errorRows.size} dòng lỗi.`);
    return;
  }

  if (rowsToSave.length === 0) {
    alert("Không có dữ liệu thay đổi để lưu.");
    return;
  }

  if (!confirm(`Bạn có chắc muốn lưu ${rowsToSave.length} dòng khách hàng?`)) {
    return;
  }

  setStatus("Đang lưu dữ liệu...");

  const { data, error } = await supabase.rpc("rpc_dmkhachhang_upsert_batch", {
    p_rows: rowsToSave
  });

  if (error) {
    console.error(error);
    alert("Lỗi lưu dữ liệu: " + error.message);
    setStatus("Lỗi lưu dữ liệu.");
    return;
  }

  alert(`Đã lưu thành công. Thêm mới: ${data?.inserted || 0}, cập nhật: ${data?.updated || 0}`);
  changedMakhs.clear();
  await loadData();
}

function getSelectedMakhs() {
  if (!hot) return [];

  const selected = hot.getSelectedRangeLast();
  if (!selected) return [];

  const from = Math.min(selected.from.row, selected.to.row);
  const to = Math.max(selected.from.row, selected.to.row);

  const makhs = [];
  for (let r = from; r <= to; r++) {
    const row = hot.getSourceDataAtRow(r);
    if (row?.makh) makhs.push(row.makh);
  }

  return [...new Set(makhs)];
}

async function setActiveForSelected(activeValue) {
  const makhs = getSelectedMakhs();

  if (!makhs.length) {
    alert("Vui lòng chọn ít nhất một dòng khách hàng.");
    return;
  }

  const actionText = activeValue ? "khôi phục" : "ẩn";

  if (!confirm(`Bạn có chắc muốn ${actionText} ${makhs.length} khách hàng đã chọn?`)) {
    return;
  }

  const { data, error } = await supabase.rpc("rpc_dmkhachhang_set_active_batch", {
    p_makhs: makhs,
    p_active: activeValue
  });

  if (error) {
    console.error(error);
    alert("Lỗi cập nhật trạng thái: " + error.message);
    return;
  }

  alert(`Đã ${actionText} ${data?.affected || 0} khách hàng.`);
  await loadData();
}

function quickSearch() {
  if (!hot) return;

  const keyword = String($("quickSearch").value || "").trim().toLowerCase();

  if (!keyword) {
    hot.loadData(rawData);
    return;
  }

  const filtered = rawData.filter(row => {
    return [
      row.makh,
      row.tenkh,
      row.dienthoai,
      row.email,
      row.diachi
    ].some(v => String(v || "").toLowerCase().includes(keyword));
  });

  hot.loadData(filtered);
  setStatus(`Tìm thấy ${filtered.length}/${rawData.length} khách hàng.`);
}

function exportCsv() {
  if (!hot) return;

  const exportPlugin = hot.getPlugin("exportFile");

  exportPlugin.downloadFile("csv", {
    bom: true,
    columnDelimiter: ",",
    columnHeaders: true,
    rowHeaders: false,
    exportHiddenColumns: true,
    fileExtension: "csv",
    filename: `dmkhachhang_[YYYY]-[MM]-[DD]`
  });
}

async function copyAllTableToClipboard() {
  if (!hot) return;

  const headers = columns.map(c => c.title);

  const rows = hot.getSourceData().map(row => {
    return columns.map(c => {
      const value = row?.[c.data];
      return value === null || value === undefined ? "" : String(value);
    });
  });

  const text = [
    headers.join("\t"),
    ...rows.map(r => r.join("\t"))
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    alert(`Đã copy ${rows.length} dòng vào clipboard. Bạn có thể dán vào Excel hoặc Google Sheet.`);
  } catch (err) {
    console.error(err);
    alert("Không copy được vào clipboard. Hãy dùng Ctrl + A trong bảng rồi Ctrl + C.");
  }
}

function bindEvents() {
  $("btnLoad").addEventListener("click", loadData);
  $("btnSave").addEventListener("click", saveChanges);
  $("btnAddRow").addEventListener("click", addRow);
  $("btnHide").addEventListener("click", () => setActiveForSelected(false));
  $("btnRestore").addEventListener("click", () => setActiveForSelected(true));
  $("btnExport").addEventListener("click", exportCsv);
  $("btnCopyAll").addEventListener("click", copyAllTableToClipboard);
  $("quickSearch").addEventListener("input", quickSearch);

  $("btnLogout").addEventListener("click", async () => {
    await dangXuatDungChung({
      loginContainerId: "login-container",
      appContainerId: "app-container",
      reloadPage: true
    });
  });
}

async function khoiTaoTrangQuanLyKhachHang() {
  const info = getCurrentUserInfo();

  $("adminInfo").textContent = `ADMIN: ${info.tennv || info.manv || ""}`;
  $("tuNgay").value = firstDayOfMonthISO();
  $("denNgay").value = todayISO();

  bindEvents();
  await loadData();
}

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",

  onLoginSuccess: async () => {
    const info = getCurrentUserInfo();

    if (!info.is_admin) {
      alert("Trang này chỉ dành cho ADMIN.");
      await dangXuatDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        reloadPage: true
      });
      return false;
    }

    setTimeout(async () => {
      await khoiTaoTrangQuanLyKhachHang();

      setTimeout(() => {
        if (hot) {
          hot.refreshDimensions();
          hot.render();
        }
      }, 300);
    }, 300);

    return true;
  }
});
