import {
  khoiTaoDangNhapDungChung,
  dangXuatDungChung,
  getCurrentUserInfo,
  getSupabaseClient,
} from "./authModule.js";

const supabase = getSupabaseClient();

const state = {
  hot: null,
  dirty: false,
  loading: false,
  saving: false,
};

const els = {};

function cacheElements() {
  els.table = document.getElementById("account-table");
  els.btnAdd = document.getElementById("btn-add");
  els.btnDelete = document.getElementById("btn-delete");
  els.btnReload = document.getElementById("btn-reload");
  els.btnSave = document.getElementById("btn-save");
  els.btnLogout = document.getElementById("btn-logout");
  els.status = document.getElementById("save-status");
  els.adminName = document.getElementById("admin-name");
}

function setStatus(text, type = "saved") {
  els.status.textContent = text;
  els.status.className = type;
}

function setBusy(isBusy) {
  state.loading = isBusy;
  els.btnAdd.disabled = isBusy;
  els.btnDelete.disabled = isBusy;
  els.btnReload.disabled = isBusy;
  els.btnSave.disabled = isBusy || !state.dirty;
}

function markDirty(value = true) {
  state.dirty = value;
  els.btnSave.disabled = state.loading || state.saving || !value;
  setStatus(value ? "Có thay đổi chưa lưu" : "Dữ liệu đã đồng bộ", value ? "dirty" : "saved");
}

function textValidator(value, callback) {
  callback(String(value ?? "").trim().length > 0);
}

function lastDigitValidator(value, callback) {
  if (value === null || value === undefined || value === "") return callback(true);
  const n = Number(value);
  callback(Number.isInteger(n) && n >= 0 && n <= 9);
}

function createHot(data) {
  if (state.hot) {
    state.hot.destroy();
    state.hot = null;
  }

  state.hot = new Handsontable(els.table, {
    data,
    licenseKey: "non-commercial-and-evaluation",
    rowHeaders: true,
    colHeaders: [
      "ID",
      "Địa điểm",
      "Loại hóa đơn",
      "Số cuối HĐ",
      "Số tài khoản",
      "Tên hiển thị",
      "Tên tài khoản",
      "Bank BIN",
      "Bank Label",
      "TK chính",
      "Ghi chú",
      "Cập nhật lúc",
    ],
    columns: [
      { data: "id", readOnly: true, type: "numeric", width: 65 },
      { data: "dia_diem", type: "dropdown", source: ["cs1", "cs2"], strict: true, allowInvalid: false, width: 90 },
      { data: "loai_hoa_don", type: "dropdown", source: ["thuong", "dac_biet"], strict: true, allowInvalid: false, width: 125 },
      { data: "so_cuoi_hd", type: "numeric", validator: lastDigitValidator, allowInvalid: false, width: 95 },
      { data: "so_tk", type: "text", validator: textValidator, allowInvalid: false, width: 145 },
      { data: "ten_hien_thi", type: "text", width: 160 },
      { data: "ten_tk", type: "text", validator: textValidator, allowInvalid: false, width: 165 },
      { data: "bank_bin", type: "text", validator: textValidator, allowInvalid: false, width: 105 },
      { data: "bank_label", type: "text", validator: textValidator, allowInvalid: false, width: 135 },
      { data: "tk_chinh", type: "checkbox", width: 85 },
      { data: "ghi_chu", type: "text", width: 190 },
      { data: "updated_at", readOnly: true, type: "text", width: 175 },
    ],
    stretchH: "all",
    height: "100%",
    width: "100%",
    fixedColumnsStart: 2,
    manualColumnResize: true,
    manualRowResize: true,
    columnSorting: true,
    filters: true,
    dropdownMenu: true,
    contextMenu: ["copy", "cut", "---------", "undo", "redo", "---------", "remove_row"],
    undo: true,
    copyPaste: true,
    fillHandle: true,
    outsideClickDeselects: false,
    autoWrapRow: true,
    afterChange(changes, source) {
      if (!changes || source === "loadData") return;
      markDirty(true);
    },
    afterCreateRow() {
      markDirty(true);
    },
    afterRemoveRow() {
      markDirty(true);
    },
  });
}

function blankRow() {
  return {
    id: null,
    dia_diem: "cs1",
    loai_hoa_don: "thuong",
    so_cuoi_hd: null,
    so_tk: "",
    ten_hien_thi: "",
    ten_tk: "",
    bank_bin: "",
    bank_label: "",
    tk_chinh: false,
    ghi_chu: "",
    created_at: null,
    updated_at: null,
  };
}

function normalizeRow(row) {
  const isMain = row?.tk_chinh === true || row?.tk_chinh === "true" || row?.tk_chinh === 1;
  const rawDigit = row?.so_cuoi_hd;

  return {
    id: row?.id === null || row?.id === undefined || row?.id === "" ? null : Number(row.id),
    dia_diem: String(row?.dia_diem ?? "").trim().toLowerCase(),
    loai_hoa_don: String(row?.loai_hoa_don ?? "").trim().toLowerCase(),
    so_cuoi_hd: isMain || rawDigit === null || rawDigit === undefined || rawDigit === "" ? null : Number(rawDigit),
    so_tk: String(row?.so_tk ?? "").trim(),
    ten_hien_thi: String(row?.ten_hien_thi ?? "").trim() || null,
    ten_tk: String(row?.ten_tk ?? "").trim(),
    bank_bin: String(row?.bank_bin ?? "").trim(),
    bank_label: String(row?.bank_label ?? "").trim(),
    tk_chinh: isMain,
    ghi_chu: String(row?.ghi_chu ?? "").trim() || null,
  };
}

function getRowsForSave() {
  const source = state.hot?.getSourceData() || [];
  return source
    .map(normalizeRow)
    .filter((row) => {
      return row.id !== null || row.so_tk || row.ten_tk || row.bank_bin || row.bank_label || row.ten_hien_thi || row.ghi_chu;
    });
}

function validateRows(rows) {
  if (!rows.length) throw new Error("Không được lưu danh sách trống.");

  const mainByPair = new Map();
  const rowsByPair = new Map();
  const digitKeys = new Set();
  const ids = new Set();

  rows.forEach((row, index) => {
    const line = index + 1;

    if (row.id !== null) {
      if (!Number.isInteger(row.id) || row.id <= 0) throw new Error(`Dòng ${line}: ID không hợp lệ.`);
      if (ids.has(row.id)) throw new Error(`Dòng ${line}: ID ${row.id} bị trùng.`);
      ids.add(row.id);
    }

    if (!["cs1", "cs2"].includes(row.dia_diem)) throw new Error(`Dòng ${line}: Địa điểm phải là cs1 hoặc cs2.`);
    if (!["thuong", "dac_biet"].includes(row.loai_hoa_don)) throw new Error(`Dòng ${line}: Loại hóa đơn không hợp lệ.`);
    if (!row.so_tk) throw new Error(`Dòng ${line}: Chưa nhập số tài khoản.`);
    if (!row.ten_tk) throw new Error(`Dòng ${line}: Chưa nhập tên tài khoản.`);
    if (!row.bank_bin) throw new Error(`Dòng ${line}: Chưa nhập Bank BIN.`);
    if (!row.bank_label) throw new Error(`Dòng ${line}: Chưa nhập Bank Label.`);

    const pair = `${row.dia_diem}|${row.loai_hoa_don}`;
    rowsByPair.set(pair, (rowsByPair.get(pair) || 0) + 1);

    if (row.tk_chinh) {
      if (row.so_cuoi_hd !== null) throw new Error(`Dòng ${line}: Tài khoản chính phải để trống số cuối hóa đơn.`);
      mainByPair.set(pair, (mainByPair.get(pair) || 0) + 1);
    } else {
      if (!Number.isInteger(row.so_cuoi_hd) || row.so_cuoi_hd < 0 || row.so_cuoi_hd > 9) {
        throw new Error(`Dòng ${line}: Tài khoản phụ phải có số cuối hóa đơn từ 0 đến 9.`);
      }
      const digitKey = `${pair}|${row.so_cuoi_hd}`;
      if (digitKeys.has(digitKey)) throw new Error(`Dòng ${line}: Trùng địa điểm, loại hóa đơn và số cuối ${row.so_cuoi_hd}.`);
      digitKeys.add(digitKey);
    }
  });

  for (const pair of rowsByPair.keys()) {
    const count = mainByPair.get(pair) || 0;
    if (count !== 1) {
      const [diaDiem, loai] = pair.split("|");
      throw new Error(`${diaDiem} / ${loai} phải có đúng một tài khoản chính. Hiện có ${count}.`);
    }
  }
}

async function verifyAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw error;
  return data === true;
}

async function loadData() {
  if (state.dirty) {
    const ok = window.confirm("Các thay đổi chưa lưu sẽ bị mất. Anh có chắc muốn tải lại dữ liệu không?");
    if (!ok) return;
  }

  setBusy(true);
  setStatus("Đang tải dữ liệu…", "dirty");

  try {
    const { data, error } = await supabase.rpc("admin_get_tai_khoan_nhan_tien");
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    createHot(rows);
    markDirty(false);
  } catch (error) {
    console.error(error);
    setStatus(`Lỗi tải dữ liệu: ${error.message || error}`, "error");
    alert(`Không tải được dữ liệu tài khoản nhận tiền.\n${error.message || error}`);
  } finally {
    setBusy(false);
  }
}

async function saveData() {
  if (state.saving || !state.dirty) return;

  try {
    const rows = getRowsForSave();
    validateRows(rows);

    const ok = window.confirm(`Lưu toàn bộ ${rows.length} dòng cấu hình tài khoản nhận tiền?`);
    if (!ok) return;

    state.saving = true;
    setBusy(true);
    setStatus("Đang lưu dữ liệu…", "dirty");

    const { data, error } = await supabase.rpc("admin_save_tai_khoan_nhan_tien", {
      p_rows: rows,
    });
    if (error) throw error;

    createHot(Array.isArray(data) ? data : []);
    markDirty(false);
    setStatus("Đã lưu thành công", "saved");
  } catch (error) {
    console.error(error);
    setStatus(`Lưu thất bại: ${error.message || error}`, "error");
    alert(`Không lưu được dữ liệu.\n${error.message || error}`);
  } finally {
    state.saving = false;
    setBusy(false);
  }
}

function addRow() {
  const data = state.hot?.getSourceData() || [];
  createHot([...data, blankRow()]);
  state.hot.selectCell(data.length, 1);
  markDirty(true);
}

function deleteSelectedRows() {
  const selected = state.hot?.getSelectedLast();
  if (!selected) return alert("Hãy chọn ít nhất một ô thuộc dòng cần xóa.");

  const [r1, , r2] = selected;
  const start = Math.min(r1, r2);
  const amount = Math.abs(r2 - r1) + 1;

  const ok = window.confirm(`Loại ${amount} dòng khỏi bảng? Dữ liệu chỉ bị xóa trong database sau khi bấm “Lưu thay đổi”.`);
  if (!ok) return;

  state.hot.alter("remove_row", start, amount);
  markDirty(true);
}

function bindEvents() {
  els.btnAdd.addEventListener("click", addRow);
  els.btnDelete.addEventListener("click", deleteSelectedRows);
  els.btnReload.addEventListener("click", loadData);
  els.btnSave.addEventListener("click", saveData);
  els.btnLogout.addEventListener("click", async () => {
    if (state.dirty && !window.confirm("Anh có thay đổi chưa lưu. Vẫn đăng xuất?")) return;
    await dangXuatDungChung();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function initializeAdminPage() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    const errorEl = document.getElementById("login-error");
    if (errorEl) errorEl.textContent = "Trang này chỉ dành cho tài khoản ADMIN.";
    await supabase.auth.signOut().catch(() => {});
    return false;
  }

  const info = getCurrentUserInfo();
  els.adminName.textContent = `${info.tennv || "ADMIN"}${info.manv ? ` (${info.manv})` : ""}`;
  await loadData();
  return true;
}

cacheElements();
bindEvents();

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",
  tuDongKhoaCoSo: false,
  onLoginSuccess: initializeAdminPage,
});
