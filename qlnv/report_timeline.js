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
const filterTaskType = document.getElementById("filterTaskType");
const btnReloadTimeline = document.getElementById("btnReloadTimeline");
const btnToday = document.getElementById("btnToday");
const timelineBody = document.getElementById("timelineBody");

const sumEvents = document.getElementById("sumEvents");
const sumStarted = document.getElementById("sumStarted");
const sumDone = document.getElementById("sumDone");
const sumPauseResume = document.getElementById("sumPauseResume");

function todayVNString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function actionText(action) {
  const map = {
    task_created: "Tạo task",
    task_started: "Bắt đầu",
    task_paused: "Tạm dừng",
    task_resumed: "Làm tiếp",
    task_done: "Hoàn thành",
    task_cancelled: "Hủy task",
    task_status_changed: "Đổi trạng thái",
    unplanned_task_started: "Bắt đầu việc bất thường",
    unplanned_task_done: "Hoàn thành việc bất thường"
  };

  return map[action] || action || "";
}

function actionClass(action) {
  if (action === "task_done" || action === "unplanned_task_done") return "done";
  if (action === "task_paused" || action === "task_resumed") return "pause";
  if (action === "task_cancelled") return "bad";
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadTimeline() {
  const diadiem = filterDiadiem.value;
  const dateStr = filterDate.value || todayVNString();
  const manv = filterManv.value;
  const taskType = filterTaskType.value;

  const { startIso, endIso } = getDayRange(dateStr);

  let query = supabase
    .schema("qlnv")
    .from("v_report_timeline")
    .select("*")
    .eq("diadiem", diadiem)
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });

  if (manv) {
    query = query.eq("manv", manv);
  }

  if (taskType) {
    query = query.eq("task_type", taskType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Lỗi load timeline:", error);
    timelineBody.innerHTML = `<tr><td colspan="8">Lỗi tải dữ liệu timeline</td></tr>`;
    return;
  }

  renderStaffOptions(data || []);
  renderSummary(data || []);
  renderTimeline(data || []);
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
  sumEvents.innerText = rows.length;

  sumStarted.innerText = rows.filter(r =>
    r.action === "task_started" ||
    r.action === "unplanned_task_started"
  ).length;

  sumDone.innerText = rows.filter(r =>
    r.action === "task_done" ||
    r.action === "unplanned_task_done"
  ).length;

  sumPauseResume.innerText = rows.filter(r =>
    r.action === "task_paused" ||
    r.action === "task_resumed"
  ).length;
}

function renderTimeline(rows) {
  if (!rows.length) {
    timelineBody.innerHTML = `<tr><td colspan="8">Không có dữ liệu</td></tr>`;
    return;
  }

  timelineBody.innerHTML = rows.map(row => `
    <tr>
      <td class="time-col">${formatTime(row.created_at)}</td>
      <td>
        <b>${escapeHtml(row.manv || "")}</b><br>
        <span style="color:#64748b">${escapeHtml(row.tennv || "")}</span>
      </td>
      <td>
        <span class="badge-action ${actionClass(row.action)}">
          ${escapeHtml(actionText(row.action))}
        </span>
      </td>
      <td>
        <b>${escapeHtml(row.title || "")}</b><br>
        <span style="color:#64748b">${escapeHtml(row.description || "")}</span>
      </td>
      <td>${escapeHtml(row.task_type || "")}</td>
      <td>${escapeHtml(row.area || "")}</td>
      <td>${escapeHtml(row.source || "")}</td>
      <td>${escapeHtml(row.note || "")}</td>
    </tr>
  `).join("");
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
    await loadTimeline();

    return true;
  }
});

btnReloadTimeline?.addEventListener("click", loadTimeline);
filterDiadiem?.addEventListener("change", loadTimeline);
filterDate?.addEventListener("change", loadTimeline);
filterTaskType?.addEventListener("change", loadTimeline);
filterManv?.addEventListener("change", loadTimeline);

btnToday?.addEventListener("click", async () => {
  filterDate.value = todayVNString();
  await loadTimeline();
});