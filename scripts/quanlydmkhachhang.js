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
  "da_tham_gia_congdong",
  "nguon_dangky"
];

const columns = [
  { data: "makh", title: "Mã KH", readOnly: true },
  { data: "tenkh", title: "Tên khách" },
  { data: "ngaysinh", title: "Ngày sinh", type: "date", dateFormat: "YYYY-MM-DD", correctFormat: true },
  { data: "thangsinh", title: "Tháng sinh", type: "numeric" },
  { data: "namsinh", title: "Năm sinh", type: "numeric" },
  { data: "dienthoai", title: "Điện thoại" },
  {
    data: "zalo_action",
    title: "Zalo",
    readOnly: true,
    renderer: zaloActionRenderer
  },
  {
    data: "da_tham_gia_congdong",
    title: "Đã vào nhóm",
    type: "checkbox"
  },
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
  { data: "marketing_opt_in_at", title: "Marketing lúc", readOnly: true, renderer: vnDateTimeRenderer },
  { data: "zalo_sms_opt_in", title: "Zalo/SMS", type: "checkbox" },
  { data: "nguon_dangky", title: "Nguồn đăng ký" },

  { data: "diem_hientai", title: "Điểm hiện tại", readOnly: true, type: "numeric" },
  { data: "tong_chi_tieu", title: "Tổng chi tiêu", readOnly: true, type: "numeric" },
  { data: "so_lan_mua", title: "Số lần mua", readOnly: true, type: "numeric" },
  { data: "lan_mua_cuoi", title: "Lần mua cuối", readOnly: true, renderer: vnDateTimeRenderer },
  { data: "created_at", title: "Ngày tạo", readOnly: true, renderer: vnDateTimeRenderer },
  { data: "created_by_manv", title: "NV tạo", readOnly: true },
  { data: "created_by_tennv", title: "Tên NV tạo", readOnly: true },
  { data: "created_by_diadiem", title: "CS tạo", readOnly: true }
];

let currentColumns = columns;

const compactFields = [
  "makh",
  "tenkh",
  "thangsinh",
  "namsinh",
  "dienthoai",
  "diem_hientai",
  "tong_chi_tieu",
  "so_lan_mua",
  "lan_mua_cuoi",
  "created_at",
  "created_by_manv"
];
let selectedColumnFields = [...compactFields];

function formatDateTimeVN(value) {
  if (!value) return "";

  // Ép dữ liệu DB là giờ UTC, sau đó hiển thị theo giờ Việt Nam
  const text = String(value);
  const isoText = /Z$|[+-]\d{2}:\d{2}$/.test(text) ? text : text + "Z";

  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return value;

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false
  }).formatToParts(d);

  const get = type => parts.find(p => p.type === type)?.value || "";

  return `${get("hour")}:${get("minute")}:${get("second")} ${get("day")}/${get("month")}/${get("year")}`;
}

function vnDateTimeRenderer(instance, td, row, col, prop, value, cellProperties) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = formatDateTimeVN(value);
}

function zaloActionRenderer(instance, td, row, col, prop, value, cellProperties) {
  Handsontable.dom.empty(td);

  const rowData = instance.getSourceDataAtRow(row);

  const phone = String(rowData?.dienthoai || "").trim();

  if (!phone) {
    td.innerHTML = `<span style="color:#999;">Không có SĐT</span>`;
    return td;
  }

  const btn = document.createElement("button");

  btn.textContent = "Chat Zalo";

  btn.style.background = "#0068ff";
  btn.style.color = "#fff";
  btn.style.border = "none";
  btn.style.padding = "4px 8px";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "12px";

  btn.onclick = async () => {
    const message = taoNoiDungMoiThamGia(rowData);

    await saveZaloLog(rowData, message);

    navigator.clipboard.writeText(message);

    window.open(`https://zalo.me/${phone}`, "_blank");

    setStatus(`Đã copy nội dung và mở chat Zalo cho ${rowData.tenkh}`);
  };

  td.appendChild(btn);

  return td;
}

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

function taoNoiDungMoiThamGia(rowData) {
  const ten = rowData.tenkh || "anh/chị";
  const diem = Number(rowData.diem_hientai || 0);
  const tienDiem = diem * 1000;

  return `Shop Hoàn Tuyết xin chào anh/chị ${ten}.

Cảm ơn anh/chị đã mua hàng tại shop. Hiện anh/chị đang có ${diem} điểm, tương đương ${tienDiem.toLocaleString("vi-VN")}đ ưu đãi cho lần mua tiếp theo.

Mời anh/chị tham gia cộng đồng khuyến mại của shop để nhận ưu đãi và tích điểm khi mua hàng:
https://zalo.me/g/rz31sxl6fvcidvehzvty

Shop chân thành cảm ơn!`;
}

async function saveZaloLog(rowData, message) {
  try {

    const info = getCurrentUserInfo();

    await supabase
      .from("zalo_message_logs")
      .insert({
        makh: rowData.makh,
        tenkh: rowData.tenkh,
        dienthoai: rowData.dienthoai,

        noi_dung: message,

        nguoi_gui_manv: info.manv,
        nguoi_gui_tennv: info.tennv,
        nguoi_gui_diadiem: info.diadiem,

        loai_gui: "ZALO_WEB"
      });

  } catch (err) {
    console.error("Lỗi lưu log zalo:", err);
  }
}

async function saveZaloStatus(rowData, patch = {}) {
  const info = getCurrentUserInfo();

  const payload = {
    makh: rowData.makh,
    tenkh: rowData.tenkh,
    dienthoai: rowData.dienthoai,

    updated_by_manv: info.manv,
    updated_by_tennv: info.tennv,
    updated_at: new Date().toISOString(),

    ...patch
  };

  const { error } = await supabase
    .from("zalo_customer_status")
    .upsert(payload, { onConflict: "makh" });

  if (error) {
    console.error(error);
    alert("Lỗi lưu trạng thái Zalo: " + error.message);
    return false;
  }

  return true;
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
  container.style.height = "calc(100vh - 230px)";
  container.style.minHeight = "460px";
  container.style.background = "#fff";

  if (hot) {
    hot.destroy();
    hot = null;
  }

  hot = new Handsontable(container, {
    data: data,
    columns: currentColumns,
    rowHeaders: true,
    colHeaders: currentColumns.map(c => c.title),
    licenseKey: "non-commercial-and-evaluation",

    width: "100%",
    height: "100%",
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
      const field = currentColumns[col]?.data;

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

      if (currentColumns[col]?.readOnly) {
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
        if (prop === "da_tham_gia_congdong") {
          const row = hot.getSourceDataAtRow(rowIndex);

          saveZaloStatus(row, {
            da_tham_gia_congdong: !!newValue
          }).then(ok => {
            if (ok) {
              setStatus(`${row.tenkh || row.makh} đã được cập nhật trạng thái nhóm Zalo.`);
            }
          });

          return;
        }

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

  const makhs = rawData.map(r => r.makh).filter(Boolean);

  if (makhs.length) {
    const { data: zaloStatus, error: zaloError } = await supabase
      .from("zalo_customer_status")
      .select("makh, da_tham_gia_congdong, da_gui_loi_moi, lan_gui_cuoi")
      .in("makh", makhs);

    if (!zaloError && Array.isArray(zaloStatus)) {
      const statusMap = new Map(zaloStatus.map(s => [s.makh, s]));

      rawData = rawData.map(row => ({
        ...row,
        da_tham_gia_congdong: !!statusMap.get(row.makh)?.da_tham_gia_congdong,
        da_gui_loi_moi: !!statusMap.get(row.makh)?.da_gui_loi_moi,
        lan_gui_zalo_cuoi: statusMap.get(row.makh)?.lan_gui_cuoi || null
      }));
    }
  }
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

  const headers = currentColumns.map(c => c.title);

  const rows = hot.getSourceData().map(row => {
    return currentColumns.map(c => {
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

function openColumnPopup() {
  renderColumnCheckboxList();
  $("columnPopupOverlay").style.display = "block";
}

function closeColumnPopup() {
  $("columnPopupOverlay").style.display = "none";
}

function renderColumnCheckboxList() {
  const box = $("columnCheckboxList");
  box.innerHTML = "";

  columns.forEach(col => {
    const label = document.createElement("label");
    label.style.display = "block";
    label.style.padding = "4px 6px";

    label.innerHTML = `
      <input type="checkbox" class="column-check" value="${col.data}" ${selectedColumnFields.includes(col.data) ? "checked" : ""}>
      ${col.title}
    `;

    box.appendChild(label);
  });

  updateCheckAllState();
}

function updateCheckAllState() {
  const chkAll = $("chkAllColumns");
  if (!chkAll) return;

  chkAll.checked = selectedColumnFields.length === columns.length;
}

function applySelectedColumns() {
  const checked = [...document.querySelectorAll(".column-check:checked")]
    .map(chk => chk.value);

  if (checked.length === 0) {
    alert("Vui lòng chọn ít nhất 1 cột để hiển thị.");
    return;
  }

  selectedColumnFields = checked;

  currentColumns = columns.filter(c => selectedColumnFields.includes(c.data));

  if (hot) {
    hot.updateSettings({
      columns: currentColumns,
      colHeaders: currentColumns.map(c => c.title),
      fixedColumnsStart: Math.min(2, currentColumns.length)
    });

    hot.refreshDimensions();
    hot.render();
  }

  closeColumnPopup();
  setStatus(`Đang hiển thị ${currentColumns.length}/${columns.length} cột.`);
}

function selectFullColumns() {
  selectedColumnFields = columns.map(c => c.data);
  renderColumnCheckboxList();
}

function selectCompactColumns() {
  selectedColumnFields = [...compactFields];
  renderColumnCheckboxList();
}

function toggleAllColumnsByCheckbox() {
  const checked = $("chkAllColumns").checked;

  selectedColumnFields = checked
    ? columns.map(c => c.data)
    : [];

  renderColumnCheckboxList();
}

let zaloSendQueue = [];
let zaloCurrentIndex = 0;

function openZaloMultiPopup() {
  const makhs = getSelectedMakhs();

  if (!makhs.length) {
    alert("Vui lòng chọn khách hàng.");
    return;
  }

  zaloSendQueue = hot.getSourceData()
    .filter(r => makhs.includes(r.makh))
    .filter(r => !r.da_tham_gia_congdong);

  if (!zaloSendQueue.length) {
    alert("Các khách đã chọn đều đã được đánh dấu là đã vào nhóm Zalo.");
    return;
  }

  zaloCurrentIndex = 0;
  $("zaloPopupOverlay").style.display = "block";
  renderZaloAssistant();
}

function renderZaloAssistant() {
  const row = zaloSendQueue[zaloCurrentIndex];
  const box = $("zaloCustomerList");

  if (!row) {
    $("zaloMessageContent").value = "";
    box.innerHTML = `
      <div style="padding:12px;">
        <b>Đã xử lý hết danh sách khách đã chọn.</b>
      </div>
    `;
    return;
  }

  const msg = taoNoiDungMoiThamGia(row);
  $("zaloMessageContent").value = msg;

  box.innerHTML = `
    <div style="padding:12px; border:1px solid #ddd; border-radius:8px;">
      <p><b>Khách hiện tại:</b> ${row.tenkh || ""} - ${row.dienthoai || ""}</p>
      <p><b>Điểm hiện tại:</b> ${row.diem_hientai || 0}</p>
      <p><b>Tiến độ:</b> ${zaloCurrentIndex + 1}/${zaloSendQueue.length}</p>

      <button id="btnOpenCurrentZalo" style="background:#0068ff;color:white;border:none;padding:8px 12px;border-radius:5px;">
        Copy nội dung + mở Zalo
      </button>

      <button id="btnMarkJoinedZalo" style="background:#16a34a;color:white;border:none;padding:8px 12px;border-radius:5px;margin-left:6px;">
        Đánh dấu đã vào nhóm
      </button>

      <button id="btnNextZaloCustomer" style="padding:8px 12px;border-radius:5px;margin-left:6px;">
        Khách tiếp theo
      </button>
    </div>
  `;

  $("btnOpenCurrentZalo").addEventListener("click", async () => {
    const currentMsg = $("zaloMessageContent").value;

    await navigator.clipboard.writeText(currentMsg);
    await saveZaloLog(row, currentMsg);
    await saveZaloStatus(row, {
      da_gui_loi_moi: true,
      lan_gui_cuoi: new Date().toISOString()
    });

    window.open(`https://zalo.me/${row.dienthoai}`, "_blank");
    setStatus(`Đã copy nội dung và mở Zalo cho ${row.tenkh || row.dienthoai}`);
  });

  $("btnMarkJoinedZalo").addEventListener("click", async () => {
    const ok = await saveZaloStatus(row, {
      da_tham_gia_congdong: true
    });

    if (ok) {
      row.da_tham_gia_congdong = true;
      hot.render();
      alert("Đã đánh dấu khách này đã vào nhóm Zalo.");
    }
  });

  $("btnNextZaloCustomer").addEventListener("click", () => {
    zaloCurrentIndex++;
    renderZaloAssistant();
  });
}

function closeZaloPopup() {
  $("zaloPopupOverlay").style.display = "none";
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
  $("btnOpenColumnPopup").addEventListener("click", openColumnPopup);
  $("btnCloseColumnPopup").addEventListener("click", closeColumnPopup);
  $("btnColumnFull").addEventListener("click", selectFullColumns);
  $("btnColumnCompact").addEventListener("click", selectCompactColumns);
  $("btnApplyColumns").addEventListener("click", applySelectedColumns);
  $("chkAllColumns").addEventListener("change", toggleAllColumnsByCheckbox);
  $("btnZaloMulti").addEventListener("click", openZaloMultiPopup);

  $("btnCloseZaloPopup").addEventListener("click", closeZaloPopup);

  $("columnCheckboxList").addEventListener("change", () => {
    selectedColumnFields = [...document.querySelectorAll(".column-check:checked")]
      .map(chk => chk.value);
    updateCheckAllState();
  });

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
  currentColumns = columns.filter(c => compactFields.includes(c.data));
  selectedColumnFields = [...compactFields];
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
