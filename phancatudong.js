// Trang này dùng authModule chung của dự án.
// Yêu cầu: chỉ ADMIN được phép đăng nhập / sử dụng.
import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  dangXuatDungChung,
} from "scripts/authModule.js";

let supabase = null;
let _bound = false;

// 2) DOM
const elFrom = document.getElementById("fromDate");
const elTo = document.getElementById("toDate");
const btnRun = document.getElementById("btnRun");
const btnRefresh = document.getElementById("btnRefresh");
const statusEl = document.getElementById("status");
const shortageWrap = document.getElementById("shortageWrap");
const assignWrap = document.getElementById("assignWrap");
const appContainer = document.getElementById("appContainer");

// 3) tiện ích
function setStatus(msg, type = "muted") {
  statusEl.className = type === "err" ? "err" : type === "ok" ? "ok" : "muted";
  statusEl.textContent = msg;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function renderTable(rows, columns) {
  if (!rows || rows.length === 0) return `<div class="muted">Không có dữ liệu</div>`;
  const thead = `<tr>${columns.map(c => `<th>${c.label}</th>`).join("")}</tr>`;
  const tbody = rows.map(r => {
    return `<tr>${columns.map(c => `<td>${(r[c.key] ?? "")}</td>`).join("")}</tr>`;
  }).join("");
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

// 4) load views
async function loadShortageSuggestions(fromISO, toISO) {
  if (!supabase) throw new Error("Chưa đăng nhập / chưa khởi tạo Supabase client");
  setStatus("Đang tải shortage & suggestions...");
  const { data, error } = await supabase
    .from("v_shift_shortage_suggestions")
    .select("*")
    .gte("ngay", fromISO)
    .lte("ngay", toISO)
    .order("ngay", { ascending: true })
    .order("coso", { ascending: true })
    .order("slot", { ascending: true });

  if (error) throw error;

  shortageWrap.innerHTML = renderTable(data, [
    { key: "ngay", label: "ngày" },
    { key: "coso", label: "cơ sở" },
    { key: "slot", label: "slot" },
    { key: "required_count", label: "cần" },
    { key: "assigned_count", label: "đã xếp" },
    { key: "shortage", label: "thiếu" },
    { key: "assigned_list", label: "đã xếp (list)" },
    { key: "recommended_candidates", label: "gợi ý" },
  ]);
}

async function loadAssignments(fromISO, toISO) {
  if (!supabase) throw new Error("Chưa đăng nhập / chưa khởi tạo Supabase client");
  setStatus("Đang tải shift_assignments...");
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("ngay, coso, slot, manv, source_used, score, reason, created_at")
    .gte("ngay", fromISO)
    .lte("ngay", toISO)
    .order("ngay", { ascending: true })
    .order("coso", { ascending: true })
    .order("slot", { ascending: true })
    .order("manv", { ascending: true });

  if (error) throw error;

  assignWrap.innerHTML = renderTable(data, [
    { key: "ngay", label: "ngày" },
    { key: "coso", label: "cơ sở" },
    { key: "slot", label: "slot" },
    { key: "manv", label: "mã NV" },
    { key: "source_used", label: "nguồn" },
    { key: "score", label: "score" },
    { key: "reason", label: "reason" },
    { key: "created_at", label: "created_at" },
  ]);
}

async function refreshAll() {
  const fromISO = elFrom.value;
  const toISO = elTo.value;
  if (!fromISO || !toISO) {
    setStatus("Bạn cần chọn từ ngày và đến ngày.", "err");
    return;
  }

  try {
    await loadShortageSuggestions(fromISO, toISO);
    await loadAssignments(fromISO, toISO);
    setStatus("Tải dữ liệu xong.", "ok");
  } catch (e) {
    console.error(e);
    setStatus(`Lỗi load dữ liệu: ${e.message || e}`, "err");
  }
}

// 5) chạy auto schedule
async function runAutoSchedule() {
  if (!supabase) {
    setStatus("Bạn cần đăng nhập admin trước.", "err");
    return;
  }
  const fromISO = elFrom.value;
  const toISO = elTo.value;
  if (!fromISO || !toISO) {
    setStatus("Bạn cần chọn từ ngày và đến ngày.", "err");
    return;
  }

  try {
    setStatus("Đang chạy auto_schedule...");
    btnRun.disabled = true;

    // RPC: auto_schedule(p_from date, p_to date)
    const { data, error } = await supabase.rpc("auto_schedule", {
      p_from: fromISO,
      p_to: toISO,
    });

    if (error) throw error;

    setStatus(`Chạy xong auto_schedule. (return rows: ${data?.length ?? 0})`, "ok");
    await refreshAll();
  } catch (e) {
    console.error(e);
    setStatus(`Lỗi chạy auto_schedule: ${e.message || e}`, "err");
  } finally {
    btnRun.disabled = false;
  }
}

// 6) init
function initDefaultDates() {
  const t = todayISO();
  elFrom.value = t;
  elTo.value = addDaysISO(t, 6); // mặc định 7 ngày
}

function bindEventsOnce() {
  if (_bound) return;
  btnRun.addEventListener("click", runAutoSchedule);
  btnRefresh.addEventListener("click", refreshAll);
  _bound = true;
}

async function afterAdminLogin() {
  supabase = getSupabaseClient();
  bindEventsOnce();
  initDefaultDates();
  await refreshAll();
}

// Khởi tạo đăng nhập chung + chặn non-admin
khoiTaoDangNhapDungChung({
  authContainerId: "authContainer",
  appContainerId: "appContainer",
  onLoginSuccess: async ({ profile }) => {
    // profile lấy từ bảng dmnhanvien (theo authModule)
    if (!profile?.is_admin) {
      if (appContainer) appContainer.style.display = "none";
      setStatus("Tài khoản này KHÔNG phải admin. Bạn không có quyền sử dụng trang này.", "err");
      await dangXuatDungChung();
      return;
    }
    await afterAdminLogin();
  },
  onLogout: () => {
    supabase = null;
    if (shortageWrap) shortageWrap.innerHTML = "";
    if (assignWrap) assignWrap.innerHTML = "";
    setStatus("Đã đăng xuất.", "muted");
  },
});
