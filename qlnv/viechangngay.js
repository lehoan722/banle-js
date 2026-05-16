import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

const supabase = getSupabaseClient();

let hot = null;
let currentTab = "templates";

const appContainer = document.getElementById("app-container");
const statusText = document.getElementById("statusText");

const btnLogout = document.getElementById("btnLogout");
const btnLoad = document.getElementById("btnLoad");
const btnAddRow = document.getElementById("btnAddRow");
const btnSave = document.getElementById("btnSave");
const btnCopy = document.getElementById("btnCopy");

const tabTemplates = document.getElementById("tabTemplates");
const tabAreas = document.getElementById("tabAreas");

const hotEl = document.getElementById("hot");

const templateColumns = [
  { data: "id", readOnly: true },
  { data: "template_code" },
  { data: "title" },
  { data: "description" },
  { data: "task_type" },
  { data: "default_priority", type: "numeric" },
  { data: "default_minutes", type: "numeric" },
  { data: "image_required", type: "checkbox" },
  { data: "is_required", type: "checkbox" },
  { data: "apply_to_area", type: "checkbox" },
  { data: "auto_assign_enabled", type: "checkbox" },
  { data: "is_active", type: "checkbox" }
];

const templateHeaders = [
  "ID",
  "Mã mẫu",
  "Tên công việc",
  "Mô tả",
  "Loại việc",
  "Ưu tiên",
  "Số phút",
  "Cần ảnh",
  "Bắt buộc",
  "Theo khu vực",
  "Tự động",
  "Đang dùng"
];

const areaColumns = [
  { data: "id", readOnly: true },
  { data: "area_code" },
  { data: "area_name" },
  { data: "diadiem" },
  { data: "area_type" },
  { data: "sort_order", type: "numeric" },
  { data: "is_active", type: "checkbox" }
];

const areaHeaders = [
  "ID",
  "Mã khu vực",
  "Tên khu vực",
  "Cơ sở",
  "Loại khu vực",
  "Thứ tự",
  "Đang dùng"
];

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",

  onLoginSuccess: async () => {
    const user = getCurrentUserInfo();

    if (!user.is_admin) {
      alert("Trang này chỉ cho phép ADMIN đăng nhập.");

      await dangXuatDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        reloadPage: false
      });

      return false;
    }

    appContainer.style.display = "";
    initHot();
    await loadData();

    return true;
  }
});

function setStatus(text, isError = false) {
  statusText.style.color = isError ? "#b91c1c" : "#166534";
  statusText.textContent = text || "";
}

function initHot() {
  if (hot) hot.destroy();

  const isTemplate = currentTab === "templates";

  hot = new Handsontable(hotEl, {
    data: [],
    columns: isTemplate ? templateColumns : areaColumns,
    colHeaders: isTemplate ? templateHeaders : areaHeaders,
    rowHeaders: true,
    stretchH: "all",
    height: "100%",
    licenseKey: "non-commercial-and-evaluation",
    manualColumnResize: true,
    manualRowResize: true,
    contextMenu: true,
    filters: true,
    dropdownMenu: true,
    minSpareRows: 1
  });
}

async function loadData() {
  setStatus("Đang tải dữ liệu...");

  const tableName = currentTab === "templates"
    ? "task_templates"
    : "work_areas";

  const orderColumn = currentTab === "templates"
    ? "id"
    : "sort_order";

  const { data, error } = await supabase
    .schema("qlnv")
    .from(tableName)
    .select("*")
    .order(orderColumn, { ascending: true });

  if (error) {
    console.error(error);
    setStatus("Lỗi tải dữ liệu.", true);
    return;
  }

  hot.loadData(data || []);
  setStatus(`Đã tải ${data?.length || 0} dòng.`);
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === true || value === false) return value;

  const s = String(value ?? "").trim().toLowerCase();

  if (["true", "1", "yes", "y", "có", "co", "x"].includes(s)) return true;
  if (["false", "0", "no", "n", "không", "khong", ""].includes(s)) return false;

  return defaultValue;
}

function cleanRows(rows) {
  if (currentTab === "templates") {
    return rows
      .filter(r => r.template_code || r.title)
      .map(r => ({
        id: r.id || undefined,
        template_code: String(r.template_code || "").trim().toUpperCase(),
        title: String(r.title || "").trim(),
        description: String(r.description || "").trim() || null,
        task_type: String(r.task_type || "khac").trim(),
        default_priority: Number(r.default_priority || 2),
        default_minutes: Number(r.default_minutes || 30),
        image_required: normalizeBoolean(r.image_required),
        is_required: normalizeBoolean(r.is_required),
        apply_to_area: normalizeBoolean(r.apply_to_area),
        auto_assign_enabled: normalizeBoolean(r.auto_assign_enabled),
        is_active: normalizeBoolean(r.is_active, true)
      }));
  }

  return rows
    .filter(r => r.area_code || r.area_name)
    .map(r => ({
      id: r.id || undefined,
      area_code: String(r.area_code || "").trim().toUpperCase(),
      area_name: String(r.area_name || "").trim(),
      diadiem: String(r.diadiem || "cs1").trim().toLowerCase(),
      area_type: String(r.area_type || "").trim() || null,
      sort_order: Number(r.sort_order || 0),
      is_active: normalizeBoolean(r.is_active, true)
    }));
}

function validateRows(rows) {
  if (currentTab === "templates") {
    for (const r of rows) {
      if (!r.template_code) return "Thiếu mã mẫu công việc.";
      if (!r.title) return `Mẫu ${r.template_code} thiếu tên công việc.`;
      if (!r.task_type) return `Mẫu ${r.template_code} thiếu loại việc.`;
      if (r.default_minutes <= 0) return `Mẫu ${r.template_code} có số phút không hợp lệ.`;
    }
  } else {
    for (const r of rows) {
      if (!r.area_code) return "Thiếu mã khu vực.";
      if (!r.area_name) return `Khu vực ${r.area_code} thiếu tên khu vực.`;
      if (!["cs1", "cs2"].includes(r.diadiem)) {
        return `Khu vực ${r.area_code} có cơ sở không hợp lệ. Chỉ dùng cs1 hoặc cs2.`;
      }
    }
  }

  return "";
}

async function saveData() {
  const rows = cleanRows(hot.getSourceData());
  const errMsg = validateRows(rows);

  if (errMsg) {
    alert(errMsg);
    return;
  }

  if (!rows.length) {
    alert("Không có dữ liệu để lưu.");
    return;
  }

  const tableName = currentTab === "templates"
    ? "task_templates"
    : "work_areas";

  const conflictKey = currentTab === "templates"
    ? "template_code"
    : "area_code";

  setStatus("Đang lưu dữ liệu...");

  const { error } = await supabase
    .schema("qlnv")
    .from(tableName)
    .upsert(rows, { onConflict: conflictKey });

  if (error) {
    console.error(error);
    alert("Lưu dữ liệu thất bại. Xem Console để kiểm tra lỗi.");
    setStatus("Lỗi lưu dữ liệu.", true);
    return;
  }

  setStatus("Đã lưu dữ liệu thành công.");
  await loadData();
}

function addRow() {
  const data = hot.getSourceData();

  if (currentTab === "templates") {
    data.push({
      template_code: "",
      title: "",
      description: "",
      task_type: "vesinh",
      default_priority: 2,
      default_minutes: 30,
      image_required: false,
      is_required: false,
      apply_to_area: false,
      auto_assign_enabled: false,
      is_active: true
    });
  } else {
    data.push({
      area_code: "",
      area_name: "",
      diadiem: "cs1",
      area_type: "",
      sort_order: 0,
      is_active: true
    });
  }

  hot.loadData(data);
}

async function copyTable() {
  const rows = hot.getSourceData();
  const headers = currentTab === "templates" ? templateHeaders : areaHeaders;
  const cols = currentTab === "templates" ? templateColumns : areaColumns;

  const lines = [
    headers.join("\t"),
    ...rows.map(row =>
      cols.map(c => row[c.data] ?? "").join("\t")
    )
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
  setStatus("Đã copy bảng vào clipboard.");
}

function switchTab(tab) {
  currentTab = tab;

  tabTemplates.classList.toggle("active", tab === "templates");
  tabAreas.classList.toggle("active", tab === "areas");

  initHot();
  loadData();
}

btnLoad.addEventListener("click", loadData);
btnAddRow.addEventListener("click", addRow);
btnSave.addEventListener("click", saveData);
btnCopy.addEventListener("click", copyTable);

tabTemplates.addEventListener("click", () => switchTab("templates"));
tabAreas.addEventListener("click", () => switchTab("areas"));

btnLogout.addEventListener("click", () => {
  dangXuatDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container"
  });
});