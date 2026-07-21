import { supabase, startSessionKeeper } from "./supabaseClient.js";

const APP_REFRESH_MS = 15000;
const HEARTBEAT_ONLINE_MS = 2 * 60 * 1000;
const VIETNAM_TZ = "Asia/Ho_Chi_Minh";

const $ = (id) => document.getElementById(id);

const el = {
  loginView: $("login-view"),
  loadingView: $("loading-view"),
  appView: $("app-view"),
  loginForm: $("admin-login-form"),
  email: $("admin-email"),
  password: $("admin-password"),
  loginButton: $("login-button"),
  loginError: $("login-error"),
  logoutButton: $("logout-button"),
  storeSelect: $("store-select"),
  refreshButton: $("refresh-button"),
  permissionError: $("permission-error"),
  dataError: $("data-error"),
  healthDot: $("health-dot"),
  healthTitle: $("health-title"),
  healthDetail: $("health-detail"),
  lastRefresh: $("last-refresh"),
  todayCount: $("today-count"),
  todayDate: $("today-date"),
  currentHourCount: $("current-hour-count"),
  currentHourLabel: $("current-hour-label"),
  peakHourCount: $("peak-hour-count"),
  peakHourLabel: $("peak-hour-label"),
  lastEventTime: $("last-event-time"),
  lastEventAge: $("last-event-age"),
  hourlyChart: $("hourly-chart"),
  hourlyEmpty: $("hourly-empty"),
  eventList: $("event-list"),
  eventsEmpty: $("events-empty"),
  eventCountBadge: $("event-count-badge"),
  adminName: $("admin-name"),
};

let currentStore = localStorage.getItem("camera_report_store") || "cs1";
let refreshTimer = null;
let refreshInProgress = false;
let currentUser = null;

function showOnly(view) {
  el.loginView.hidden = view !== "login";
  el.loadingView.hidden = view !== "loading";
  el.appView.hidden = view !== "app";
}

function setLoginError(message = "") {
  el.loginError.textContent = message;
}

function showDataError(message = "") {
  el.dataError.textContent = message;
  el.dataError.hidden = !message;
}

function vietnamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

function formatVietnamDate(date = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatVietnamTime(value) {
  if (!value) return "--:--:--";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatVietnamDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VIETNAM_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function relativeTime(value) {
  if (!value) return "Chưa có dữ liệu";
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 0) return "Vừa cập nhật";
  const seconds = Math.floor(delta / 1000);
  if (seconds < 15) return "Vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return formatVietnamDateTime(value);
}

async function checkAdmin() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const session = sessionData?.session;
  if (!session) return { session: null, isAdmin: false };

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
  if (adminError) throw adminError;

  return { session, isAdmin: isAdmin === true };
}

async function loadAdminName(userId) {
  try {
    const { data } = await supabase
      .from("admin_users")
      .select("manv, tenadmin, active")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.active === false) {
      throw new Error("Tài khoản Admin đang bị khóa.");
    }

    const name = String(data?.tenadmin || data?.manv || currentUser?.email || "Admin");
    el.adminName.textContent = name;
  } catch {
    el.adminName.textContent = currentUser?.email || "Admin";
  }
}

async function enterApp(session) {
  currentUser = session.user;
  showOnly("app");
  startSessionKeeper();
  await loadAdminName(session.user.id);
  await loadStores();
  await refreshReport(true);
  startAutoRefresh();
}

async function bootstrapAuth() {
  showOnly("loading");
  try {
    const { session, isAdmin } = await checkAdmin();

    if (!session) {
      const savedEmail = localStorage.getItem("last_login_identifier") || "";
      if (savedEmail.includes("@")) el.email.value = savedEmail;
      showOnly("login");
      el.email.focus();
      return;
    }

    if (!isAdmin) {
      await supabase.auth.signOut().catch(() => { });
      setLoginError("Tài khoản hiện tại không có quyền Admin.");
      showOnly("login");
      return;
    }

    await enterApp(session);
  } catch (error) {
    console.error(error);
    setLoginError("Không kiểm tra được phiên đăng nhập. Vui lòng đăng nhập lại.");
    showOnly("login");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginError("");

  const email = el.email.value.trim().toLowerCase();
  const password = el.password.value;

  if (!email || !password) {
    setLoginError("Vui lòng nhập đầy đủ email và mật khẩu.");
    return;
  }

  el.loginButton.disabled = true;
  el.loginButton.textContent = "Đang xác thực…";

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) throw new Error("Email hoặc mật khẩu không đúng.");

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) throw adminError;

    if (isAdmin !== true) {
      await supabase.auth.signOut().catch(() => { });
      throw new Error("Tài khoản này không có quyền Admin.");
    }

    localStorage.setItem("last_login_identifier", email);
    localStorage.setItem("is_admin", "true");
    el.password.value = "";
    await enterApp(data.session);
  } catch (error) {
    console.error(error);
    setLoginError(error?.message || "Không đăng nhập được.");
  } finally {
    el.loginButton.disabled = false;
    el.loginButton.textContent = "Đăng nhập";
  }
}

async function handleLogout() {
  stopAutoRefresh();
  await supabase.auth.signOut().catch(() => { });
  ["manv", "tennv", "is_admin", "quyen_sua_hoadon"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  currentUser = null;
  showOnly("login");
  el.password.value = "";
  el.email.focus();
}

async function loadStores() {

  let stores = ["cs1", "cs2"];

  try {

    const { data, error } = await supabase
      .from("camera_devices")
      .select("store_code")
      .eq("is_active", true);

    if (!error && data) {

      data.forEach(r => {

        if (
          r.store_code &&
          !stores.includes(r.store_code)
        ) {
          stores.push(r.store_code);
        }

      });

    }

  } catch (e) {
    console.log(e);
  }

  if (!stores.includes(currentStore)) {
    currentStore = stores[0];
  }

  el.storeSelect.innerHTML = stores
    .map(store =>
      `<option value="${escapeHtml(store)}">${storeLabel(store)}</option>`
    )
    .join("");

  el.storeSelect.value = currentStore;

}

function storeLabel(store) {
  const match = String(store).match(/^cs(\d+)$/i);
  return match ? `Cơ sở ${match[1]}` : String(store).toUpperCase();
}

function hourKeyFromView(value) {
  if (!value) return null;
  const raw = String(value);
  const match = raw.match(/(?:T|\s)(\d{2}):/);
  return match ? Number(match[1]) : null;
}

async function fetchReportData() {
  const nowParts = vietnamParts();
  const todayKey = nowParts.dateKey;

  const [dailyRes, hourlyRes, eventsRes, statusRes] = await Promise.all([
    supabase
      .from("camera_daily_summary")
      .select("crossing_count")
      .eq("store_code", currentStore)
      .eq("day_local", todayKey),

    supabase
      .from("camera_hourly_summary")
      .select("hour_local, crossing_count")
      .eq("store_code", currentStore)
      .gte("hour_local", `${todayKey} 00:00:00`)
      .lt("hour_local", `${todayKey} 23:59:59`)
      .order("hour_local"),

    supabase
      .from("camera_events")
      .select("id, event_key, camera_code, event_type, event_time, created_at")
      .eq("store_code", currentStore)
      .order("event_time", { ascending: false })
      .limit(2000),

    supabase
      .from("camera_status")
      .select("store_code, camera_code, connection_status, last_heartbeat, last_event_time, updated_at")
      .eq("store_code", currentStore),
  ]);

  for (const result of [dailyRes, hourlyRes, eventsRes, statusRes]) {
    if (result.error) throw result.error;
  }

  return {
    nowParts,
    daily: dailyRes.data || [],
    hourly: hourlyRes.data || [],
    events: eventsRes.data || [],
    statuses: statusRes.data || [],
  };
}

async function refreshReport(showLoading = false) {
  if (refreshInProgress) return;
  refreshInProgress = true;
  el.refreshButton.classList.add("spinning");
  showDataError("");

  try {
    const data = await fetchReportData();
    renderReport(data);
  } catch (error) {
    console.error("Camera report refresh error:", error);
    const message = String(error?.message || "");
    if (/permission|policy|row-level|rls/i.test(message)) {
      showDataError("Không có quyền đọc dữ liệu Camera. Hãy kiểm tra RLS dành cho Admin.");
    } else {
      showDataError("Không tải được dữ liệu báo cáo. Vui lòng thử lại.");
    }
  } finally {
    el.lastRefresh.textContent = formatVietnamTime(new Date());
    el.refreshButton.classList.remove("spinning");
    refreshInProgress = false;
  }
}

function renderReport({ nowParts, daily, hourly, events, statuses }) {
  const todayCount = daily.reduce((sum, row) => sum + Number(row.crossing_count || 0), 0);

  const hourMap = new Map();
  for (const row of hourly) {
    const hour = hourKeyFromView(row.hour_local);
    if (hour == null) continue;
    hourMap.set(hour, (hourMap.get(hour) || 0) + Number(row.crossing_count || 0));
  }

  const currentHourCount = hourMap.get(nowParts.hour) || 0;
  let peakHour = null;
  let peakCount = 0;
  for (const [hour, count] of hourMap.entries()) {
    if (count > peakCount) {
      peakHour = hour;
      peakCount = count;
    }
  }

  const lastEvent = events[0] || null;

  el.todayCount.textContent = todayCount.toLocaleString("vi-VN");
  el.todayDate.textContent = formatVietnamDate();
  el.currentHourCount.textContent = currentHourCount.toLocaleString("vi-VN");
  el.currentHourLabel.textContent =
    `${String(nowParts.hour).padStart(2, "0")}:00–${String((nowParts.hour + 1) % 24).padStart(2, "0")}:00`;
  el.peakHourCount.textContent = peakCount.toLocaleString("vi-VN");
  el.peakHourLabel.textContent =
    peakHour == null
      ? "Chưa có dữ liệu"
      : `${String(peakHour).padStart(2, "0")}:00–${String((peakHour + 1) % 24).padStart(2, "0")}:00`;
  el.lastEventTime.textContent = lastEvent ? formatVietnamTime(lastEvent.event_time) : "--:--:--";
  el.lastEventAge.textContent = lastEvent ? relativeTime(lastEvent.event_time) : "Chưa có sự kiện";

  renderHealth(statuses, lastEvent);
  renderHourlyChart(hourMap, nowParts.hour);
  renderEvents(events);
}

function renderHealth(statuses, lastEvent) {
  const latestHeartbeat = statuses
    .map((row) => row.last_heartbeat)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  const hasConnected = statuses.some((row) => row.connection_status === "connected");
  const heartbeatAge = latestHeartbeat ? Date.now() - new Date(latestHeartbeat).getTime() : Infinity;
  const online = hasConnected && heartbeatAge <= HEARTBEAT_ONLINE_MS;

  el.healthDot.className = `health-dot ${online ? "online" : "offline"}`;

  if (online) {
    el.healthTitle.textContent = "Camera Sync đang hoạt động";
    el.healthDetail.textContent =
      `Heartbeat ${relativeTime(latestHeartbeat)}${lastEvent ? ` • Sự kiện cuối ${relativeTime(lastEvent.event_time)}` : ""}`;
  } else if (latestHeartbeat) {
    el.healthTitle.textContent = "Camera Sync có thể đang ngoại tuyến";
    el.healthDetail.textContent = `Heartbeat cuối ${relativeTime(latestHeartbeat)}`;
  } else {
    el.healthTitle.textContent = "Chưa nhận được trạng thái Camera";
    el.healthDetail.textContent = "Không tìm thấy heartbeat cho cơ sở này";
  }
}

function renderHourlyChart(hourMap, currentHour) {
  const startHour = 7;
  const endHour = 22;
  const values = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    values.push({ hour, count: hourMap.get(hour) || 0 });
  }

  const max = Math.max(...values.map((item) => item.count), 0);
  el.hourlyChart.innerHTML = "";
  el.hourlyEmpty.hidden = max > 0;

  for (const item of values) {
    const column = document.createElement("div");
    column.className = `chart-column${item.hour === currentHour ? " current" : ""}`;

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = item.count ? String(item.count) : "";

    const track = document.createElement("div");
    track.className = "chart-track";

    const bar = document.createElement("div");
    bar.className = "chart-bar";
    const percent = max ? Math.max(4, Math.round((item.count / max) * 100)) : 0;
    bar.style.height = `${percent}%`;
    bar.title = `${String(item.hour).padStart(2, "0")}:00 — ${item.count} lượt`;

    const label = document.createElement("span");
    label.className = "chart-label";
    label.textContent = String(item.hour).padStart(2, "0");

    track.appendChild(bar);
    column.append(value, track, label);
    el.hourlyChart.appendChild(column);
  }
}

function renderEvents(events) {
  el.eventList.innerHTML = "";
  el.eventsEmpty.hidden = events.length > 0;
  el.eventCountBadge.textContent = `${events.length} sự kiện`;

  for (const event of events) {
    const item = document.createElement("article");
    item.className = "event-item";

    const icon = document.createElement("div");
    icon.className = "event-icon";
    icon.textContent = "↔";

    const content = document.createElement("div");
    content.className = "event-content";

    const title = document.createElement("strong");
    title.textContent = "Lượt qua cửa";

    const meta = document.createElement("span");
    meta.textContent = `${formatVietnamDateTime(event.event_time)} • ${event.camera_code || "Camera"}`;

    const time = document.createElement("time");
    time.textContent = formatVietnamTime(event.event_time);
    time.dateTime = event.event_time;

    content.append(title, meta);
    item.append(icon, content, time);
    el.eventList.appendChild(item);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = window.setInterval(() => refreshReport(false), APP_REFRESH_MS);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

el.loginForm.addEventListener("submit", handleLogin);
el.logoutButton.addEventListener("click", handleLogout);
el.refreshButton.addEventListener("click", () => refreshReport(true));
el.storeSelect.addEventListener("change", () => {
  currentStore = el.storeSelect.value;
  localStorage.setItem("camera_report_store", currentStore);
  refreshReport(true);
});

window.addEventListener("focus", () => {
  if (!el.appView.hidden) refreshReport(false);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !el.appView.hidden) {
    refreshReport(false);
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    stopAutoRefresh();
    if (!el.loginView.hidden) return;
    showOnly("login");
  }
});

bootstrapAuth();
