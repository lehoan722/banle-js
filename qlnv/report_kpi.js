import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

const supabase = getSupabaseClient();

const filterDiadiem = document.getElementById("filterDiadiem");
const filterDate = document.getElementById("filterDate");
const filterManv = document.getElementById("filterManv");
const btnReloadKpi = document.getElementById("btnReloadKpi");
const btnToday = document.getElementById("btnToday");
const kpiBody = document.getElementById("kpiBody");

const sumStaff = document.getElementById("sumStaff");
const sumTasks = document.getElementById("sumTasks");
const sumDone = document.getElementById("sumDone");
const sumRate = document.getElementById("sumRate");

function todayVNString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function secondsToHour(seconds) {
  const total = Number(seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

function safeRate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

async function loadKpi() {
  const diadiem = filterDiadiem.value;
  const dateStr = filterDate.value || todayVNString();
  const manv = filterManv.value;

  let query = supabase
    .schema("qlnv")
    .from("v_report_kpi_daily")
    .select("*")
    .eq("diadiem", diadiem)
    .eq("work_date", dateStr)
    .order("working_rate", { ascending: false });

  if (manv) {
    query = query.eq("manv", manv);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Lỗi load KPI:", error);
    kpiBody.innerHTML = `<tr><td colspan="11">Lỗi tải dữ liệu KPI</td></tr>`;
    return;
  }

  renderStaffOptions(data || []);
  renderSummary(data || []);
  renderKpi(data || []);
}

function renderStaffOptions(rows) {
  const current = filterManv.value;
  const map = new Map();

  rows.forEach(row => {
    if (row.manv) {
      map.set(row.manv, row.tennv || row.manv);
    }
  });

  filterManv.innerHTML = `<option value="">Tất cả nhân viên</option>` +
    [...map.entries()]
      .map(([manv, tennv]) => `
        <option value="${escapeHtml(manv)}">
          ${escapeHtml(manv)} - ${escapeHtml(tennv)}
        </option>
      `)
      .join("");

  filterManv.value = current;
}

function renderSummary(rows) {
  const totalTask = rows.reduce((s, r) => s + Number(r.total_tasks || 0), 0);
  const totalDone = rows.reduce((s, r) => s + Number(r.done_tasks || 0), 0);

  const avgRate = rows.length
    ? rows.reduce((s, r) => s + Number(r.working_rate || 0), 0) / rows.length
    : 0;

  sumStaff.innerText = rows.length;
  sumTasks.innerText = totalTask;
  sumDone.innerText = totalDone;
  sumRate.innerText = `${avgRate.toFixed(1)}%`;
}

function renderKpi(rows) {
  if (!rows.length) {
    kpiBody.innerHTML = `<tr><td colspan="11">Không có dữ liệu</td></tr>`;
    return;
  }

  kpiBody.innerHTML = rows.map(row => {
    const unfinished =
      Number(row.pending_tasks || 0) +
      Number(row.doing_tasks || 0);

    const doneRate = safeRate(row.done_rate);
    const workingRate = safeRate(row.working_rate);

    return `
      <tr>
        <td>${escapeHtml(row.work_date || "")}</td>

        <td>
          <b>${escapeHtml(row.manv || "")}</b><br>
          <span style="color:#64748b">${escapeHtml(row.tennv || "")}</span>
        </td>

        <td class="num">${secondsToHour(row.shift_seconds)}</td>
        <td class="num">${secondsToHour(row.task_seconds)}</td>
        <td class="num">${secondsToHour(row.idle_seconds)}</td>

        <td class="num">${Number(row.total_tasks || 0)}</td>
        <td class="num">${Number(row.done_tasks || 0)}</td>
        <td class="num">${unfinished}</td>
        <td class="num">${Number(row.abnormal_tasks || 0)}</td>

        <td class="num">
          ${doneRate.toFixed(1)}%
          <div class="rate-bar"><i style="width:${doneRate}%"></i></div>
        </td>

        <td class="num">
          ${workingRate.toFixed(1)}%
          <div class="rate-bar"><i style="width:${workingRate}%"></i></div>
        </td>
      </tr>
    `;
  }).join("");
}

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",

  onLoginSuccess: async () => {
    const user = getCurrentUserInfo();

    if (!user.is_admin) {
      alert("Báo cáo chỉ cho phép ADMIN đăng nhập.");

      await dangXuatDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        reloadPage: false
      });

      return false;
    }

    filterDate.value = todayVNString();
    await loadKpi();

    return true;
  }
});

btnReloadKpi?.addEventListener("click", loadKpi);
filterDiadiem?.addEventListener("change", loadKpi);
filterDate?.addEventListener("change", loadKpi);
filterManv?.addEventListener("change", loadKpi);

btnToday?.addEventListener("click", async () => {
  filterDate.value = todayVNString();
  await loadKpi();
});