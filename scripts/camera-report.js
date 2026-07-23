import { supabase, startSessionKeeper } from "./supabaseClient.js";

const APP_REFRESH_MS = 15000;
const HEARTBEAT_ONLINE_MS = 2 * 60 * 1000;
const VIETNAM_TZ = "Asia/Ho_Chi_Minh";
const INVOICE_BATCH_SIZE = 1000;
const CAMERA_BATCH_SIZE = 1000;
const IMAGE_BATCH_SIZE = 500;
const CAMERA_IMAGE_BUCKET = "anhvaocua";
const CHART_BAR_MAX_HEIGHT_PX = 150;

const $ = (id) => document.getElementById(id);
const el = {
  loginView: $("login-view"), loadingView: $("loading-view"), appView: $("app-view"),
  loginForm: $("admin-login-form"), email: $("admin-email"), password: $("admin-password"),
  loginButton: $("login-button"), loginError: $("login-error"), logoutButton: $("logout-button"),
  storeSelect: $("store-select"), refreshButton: $("refresh-button"), permissionError: $("permission-error"),
  dataError: $("data-error"), healthDot: $("health-dot"), healthTitle: $("health-title"),
  healthDetail: $("health-detail"), lastRefresh: $("last-refresh"), todayCount: $("today-count"),
  todayDate: $("today-date"), invoiceCount: $("invoice-count"), productCount: $("product-count"),
  revenueTotal: $("revenue-total"), conversionRate: $("conversion-rate"), averageInvoice: $("average-invoice"),
  hourlyChart: $("hourly-chart"), hourlyEmpty: $("hourly-empty"),
  eventList: $("event-list"), eventsEmpty: $("events-empty"), eventCountBadge: $("event-count-badge"),
  adminName: $("admin-name"), reportDate: $("report-date"), timelineFilter: $("timeline-filter"),
  timelinePageSize: $("timeline-page-size"), timelinePrev: $("timeline-prev"), timelineNext: $("timeline-next"),
  timelinePageInfo: $("timeline-page-info"), timelineSummary: $("timeline-summary"),
  chartTitle: $("chart-title"), chartDescription: $("chart-description"),
  chartBackDay: $("chart-back-day"), chartBreadcrumb: $("chart-breadcrumb"),
  timelineContext: $("timeline-context"),
};

let currentStore = localStorage.getItem("camera_report_store") || "cs1";
let selectedDate = localStorage.getItem("camera_report_date") || vietnamDateKey();
let refreshTimer = null;
let refreshInProgress = false;
let currentUser = null;
let timelineAll = [];
let timelinePage = 1;
let selectedHour = null;
let highlightedFiveMinuteStart = null;
let cameraImageModal = null;

function vietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function vietnamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: +map.year, month: +map.month, day: +map.day, hour: +map.hour,
    minute: +map.minute, second: +map.second, dateKey: `${map.year}-${map.month}-${map.day}` };
}

function dateBoundsForVietnam(dateKey) {
  return {
    start: `${dateKey}T00:00:00+07:00`,
    end: `${addDays(dateKey, 1)}T00:00:00+07:00`,
  };
}

function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function showOnly(view) {
  el.loginView.hidden = view !== "login";
  el.loadingView.hidden = view !== "loading";
  el.appView.hidden = view !== "app";
}
function setLoginError(message = "") { el.loginError.textContent = message; }
function showDataError(message = "") { el.dataError.textContent = message; el.dataError.hidden = !message; }

function formatVietnamDateFromKey(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}
function formatVietnamTime(value) {
  if (!value) return "--:--:--";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VIETNAM_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
}
function formatVietnamDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VIETNAM_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
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

function vietnamTimeParts(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second),
  };
}

function fiveMinuteBucketStart(value) {
  const parts = vietnamTimeParts(value);
  if (!parts) return null;
  return Math.floor(parts.minute / 5) * 5;
}

function isItemInSelectedHour(item) {
  if (selectedHour == null) return true;
  const parts = vietnamTimeParts(item.time);
  return parts?.dateKey === selectedDate && parts.hour === selectedHour;
}

function isItemInHighlightedBucket(item) {
  if (selectedHour == null || highlightedFiveMinuteStart == null) return false;
  const parts = vietnamTimeParts(item.time);
  return parts?.dateKey === selectedDate && parts.hour === selectedHour &&
    Math.floor(parts.minute / 5) * 5 === highlightedFiveMinuteStart;
}

function hourFromTimestamp(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: VIETNAM_TZ, hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return Number(parts.find((p) => p.type === "hour")?.value);
}
function hourKeyFromView(value) {
  if (!value) return null;
  const match = String(value).match(/(?:T|\s)(\d{2}):/);
  return match ? Number(match[1]) : null;
}
function storeLabel(store) {
  const match = String(store).match(/^cs(\d+)$/i);
  return match ? `Cơ sở ${match[1]}` : String(store).toUpperCase();
}
function invoiceTypeForStore(store) { return String(store).toLowerCase() === "cs2" ? "bancs2" : "bancs1"; }

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
    const { data } = await supabase.from("admin_users").select("manv, tenadmin, active").eq("user_id", userId).maybeSingle();
    if (data?.active === false) throw new Error("Tài khoản Admin đang bị khóa.");
    el.adminName.textContent = String(data?.tenadmin || data?.manv || currentUser?.email || "Admin");
  } catch { el.adminName.textContent = currentUser?.email || "Admin"; }
}

async function enterApp(session) {
  currentUser = session.user;
  showOnly("app");
  startSessionKeeper();
  el.reportDate.value = selectedDate;
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
      showOnly("login"); el.email.focus(); return;
    }
    if (!isAdmin) {
      await supabase.auth.signOut().catch(() => {});
      setLoginError("Tài khoản hiện tại không có quyền Admin."); showOnly("login"); return;
    }
    await enterApp(session);
  } catch (error) {
    console.error(error); setLoginError("Không kiểm tra được phiên đăng nhập. Vui lòng đăng nhập lại."); showOnly("login");
  }
}

async function handleLogin(event) {
  event.preventDefault(); setLoginError("");
  const email = el.email.value.trim().toLowerCase(); const password = el.password.value;
  if (!email || !password) { setLoginError("Vui lòng nhập đầy đủ email và mật khẩu."); return; }
  el.loginButton.disabled = true; el.loginButton.textContent = "Đang xác thực…";
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) throw new Error("Email hoặc mật khẩu không đúng.");
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) throw adminError;
    if (isAdmin !== true) { await supabase.auth.signOut().catch(() => {}); throw new Error("Tài khoản này không có quyền Admin."); }
    localStorage.setItem("last_login_identifier", email); localStorage.setItem("is_admin", "true");
    el.password.value = ""; await enterApp(data.session);
  } catch (error) { console.error(error); setLoginError(error?.message || "Không đăng nhập được."); }
  finally { el.loginButton.disabled = false; el.loginButton.textContent = "Đăng nhập"; }
}

async function handleLogout() {
  stopAutoRefresh(); await supabase.auth.signOut().catch(() => {});
  ["manv", "tennv", "is_admin", "quyen_sua_hoadon"].forEach((key) => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
  currentUser = null; showOnly("login"); el.password.value = ""; el.email.focus();
}

async function loadStores() {
  const stores = ["cs1", "cs2"];
  try {
    const { data, error } = await supabase.from("camera_devices").select("store_code").eq("is_active", true);
    if (!error) (data || []).forEach((r) => { if (r.store_code && !stores.includes(r.store_code)) stores.push(r.store_code); });
  } catch (error) { console.warn(error); }
  if (!stores.includes(currentStore)) currentStore = stores[0];
  el.storeSelect.innerHTML = stores.map((store) => `<option value="${escapeHtml(store)}">${storeLabel(store)}</option>`).join("");
  el.storeSelect.value = currentStore;
}


async function fetchCameraEventImages(eventKeys) {
  const keys = [...new Set((eventKeys || []).filter(Boolean))];
  const imageMap = new Map();
  if (!keys.length) return imageMap;

  for (let from = 0; from < keys.length; from += IMAGE_BATCH_SIZE) {
    const batch = keys.slice(from, from + IMAGE_BATCH_SIZE);
    const { data, error } = await supabase
      .from("camera_event_images")
      .select("event_key, image_path, image_url, uploaded_at")
      .in("event_key", batch);

    if (error) throw error;

    for (const row of data || []) {
      if (row.event_key) imageMap.set(row.event_key, row);
    }
  }

  return imageMap;
}

async function fetchAllCameraEvents(dateKey) {
  const { start, end } = dateBoundsForVietnam(dateKey);
  const all = [];
  for (let from = 0; ; from += CAMERA_BATCH_SIZE) {
    const { data, error } = await supabase.from("camera_events")
      .select("id, event_key, camera_code, event_type, event_time, created_at")
      .eq("store_code", currentStore).gte("event_time", start).lt("event_time", end)
      .order("event_time", { ascending: false }).range(from, from + CAMERA_BATCH_SIZE - 1);
    if (error) throw error;
    const rows = data || []; all.push(...rows);
    if (rows.length < CAMERA_BATCH_SIZE) break;
  }
  try {
    const imageMap = await fetchCameraEventImages(all.map((row) => row.event_key));
    return all.map((row) => ({
      ...row,
      image: imageMap.get(row.event_key) || null,
    }));
  } catch (error) {
    console.warn("Không tải được ảnh lượt qua cửa:", error);
    return all.map((row) => ({
      ...row,
      image: null,
    }));
  }
}

function invoiceRpcParams(dateKey) {
  return {
    p_tu_ngay: dateKey, p_den_ngay: dateKey,
    p_loaihd_list: [invoiceTypeForStore(currentStore)], p_manv: null, p_khachhang: null,
    p_ghichu: null, p_sohd: null, p_tien_tu: null, p_tien_den: null,
    p_masp_list: null, p_must_contain_all: false,
  };
}

async function fetchAllInvoices(dateKey) {
  const params = invoiceRpcParams(dateKey);
  const { data: countData, error: countError } = await supabase.rpc("xemhoadon111_v2_count", params);
  if (countError) throw countError;
  const totalRows = Number(countData?.[0]?.total_rows || 0);
  const all = [];
  for (let offset = 0; offset < totalRows; offset += INVOICE_BATCH_SIZE) {
    const { data, error } = await supabase.rpc("xemhoadon111_v2_paged", {
      ...params, p_limit: Math.min(INVOICE_BATCH_SIZE, totalRows - offset), p_offset: offset,
    });
    if (error) throw error;
    const rows = data || []; all.push(...rows);
    if (!rows.length) break;
  }
  return { rows: all, totalRows, totalAmount: Number(countData?.[0]?.total_thanhtoan_v2 || 0) };
}

async function fetchReportData() {
  const nowParts = vietnamParts();
  const todayKey = selectedDate;
  const [dailyRes, hourlyRes, events, statusRes, invoiceResult] = await Promise.all([
    supabase.from("camera_daily_summary").select("crossing_count").eq("store_code", currentStore).eq("day_local", todayKey),
    supabase.from("camera_hourly_summary").select("hour_local, crossing_count").eq("store_code", currentStore)
      .gte("hour_local", `${todayKey} 00:00:00`).lt("hour_local", `${todayKey} 23:59:59`).order("hour_local"),
    fetchAllCameraEvents(todayKey),
    supabase.from("camera_status").select("store_code, camera_code, connection_status, last_heartbeat, last_event_time, updated_at").eq("store_code", currentStore),
    fetchAllInvoices(todayKey),
  ]);
  for (const result of [dailyRes, hourlyRes, statusRes]) if (result.error) throw result.error;
  return { nowParts, daily: dailyRes.data || [], hourly: hourlyRes.data || [], events, statuses: statusRes.data || [], invoices: invoiceResult.rows };
}

async function refreshReport() {
  if (refreshInProgress) return;
  refreshInProgress = true; el.refreshButton.classList.add("spinning"); showDataError("");
  try { renderReport(await fetchReportData()); }
  catch (error) {
    console.error("Camera report refresh error:", error);
    const message = String(error?.message || "");
    showDataError(/permission|policy|row-level|rls|quyền/i.test(message)
      ? "Không có quyền đọc dữ liệu Camera hoặc hóa đơn. Hãy kiểm tra RLS/RPC dành cho Admin."
      : `Không tải được dữ liệu báo cáo: ${message || "Vui lòng thử lại."}`);
  } finally {
    el.lastRefresh.textContent = formatVietnamTime(new Date()); el.refreshButton.classList.remove("spinning"); refreshInProgress = false;
  }
}

function renderReport({ nowParts, daily, hourly, events, statuses, invoices }) {
  const todayCount = daily.reduce((sum, row) => sum + Number(row.crossing_count || 0), 0);
  const invoiceCount = invoices.length;
  const productCount = invoices.reduce((sum, row) => sum + Number(row.sl_detail || 0), 0);
  const revenueTotal = invoices.reduce((sum, row) => sum + Number(row.thanhtoan_v2 || 0), 0);
  const conversionRate = todayCount > 0 ? (invoiceCount / todayCount) * 100 : 0;
  const averageInvoice = invoiceCount > 0 ? revenueTotal / invoiceCount : 0;

  const crossingHourMap = new Map();
  for (const row of hourly) {
    const hour = hourKeyFromView(row.hour_local); if (hour == null) continue;
    crossingHourMap.set(hour, (crossingHourMap.get(hour) || 0) + Number(row.crossing_count || 0));
  }

  const invoiceHourMap = new Map();
  const productHourMap = new Map();
  const amountHourMap = new Map();
  for (const invoice of invoices) {
    const hour = hourFromTimestamp(invoice.created_at); if (hour == null) continue;
    invoiceHourMap.set(hour, (invoiceHourMap.get(hour) || 0) + 1);
    productHourMap.set(hour, (productHourMap.get(hour) || 0) + Number(invoice.sl_detail || 0));
    amountHourMap.set(hour, (amountHourMap.get(hour) || 0) + Number(invoice.thanhtoan_v2 || 0));
  }

  const viewingToday = selectedDate === nowParts.dateKey;
  const lastEvent = events[0] || null;

  el.todayCount.textContent = todayCount.toLocaleString("vi-VN");
  el.todayDate.textContent = formatVietnamDateFromKey(selectedDate);
  el.invoiceCount.textContent = invoiceCount.toLocaleString("vi-VN");
  el.productCount.textContent = productCount.toLocaleString("vi-VN");
  el.revenueTotal.textContent = `${Math.round(revenueTotal).toLocaleString("vi-VN")}đ`;
  el.conversionRate.textContent = `${conversionRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  el.averageInvoice.textContent = `${Math.round(averageInvoice).toLocaleString("vi-VN")}đ`;

  renderHealth(statuses, lastEvent);
  timelineAll = buildTimeline(events, invoices);
  renderActiveChart(crossingHourMap, invoiceHourMap, productHourMap, amountHourMap, viewingToday ? nowParts.hour : null);
  timelinePage = 1;
  renderTimeline();
}
function renderHealth(statuses, lastEvent) {
  const latestHeartbeat = statuses.map((row) => row.last_heartbeat).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0];
  const hasConnected = statuses.some((row) => row.connection_status === "connected");
  const online = hasConnected && (latestHeartbeat ? Date.now() - new Date(latestHeartbeat).getTime() : Infinity) <= HEARTBEAT_ONLINE_MS;
  el.healthDot.className = `health-dot ${online ? "online" : "offline"}`;
  if (online) {
    el.healthTitle.textContent = "Camera Sync đang hoạt động";
    el.healthDetail.textContent = `Heartbeat ${relativeTime(latestHeartbeat)}${lastEvent ? ` • Sự kiện cuối ${relativeTime(lastEvent.event_time)}` : ""}`;
  } else if (latestHeartbeat) {
    el.healthTitle.textContent = "Camera Sync có thể đang ngoại tuyến"; el.healthDetail.textContent = `Heartbeat cuối ${relativeTime(latestHeartbeat)}`;
  } else {
    el.healthTitle.textContent = "Chưa nhận được trạng thái Camera"; el.healthDetail.textContent = "Không tìm thấy heartbeat cho cơ sở này";
  }
}

function renderActiveChart(crossingMap, invoiceMap, productMap, amountMap, currentHour) {
  if (selectedHour == null) {
    renderHourlyChart(crossingMap, invoiceMap, productMap, amountMap, currentHour);
  } else {
    renderFiveMinuteChart(selectedHour);
  }
}

function warningClass(crossings, invoices) {
  if (crossings <= 0) return "status-empty";
  if (invoices > 0) return "status-good";
  if (crossings >= 10) return "status-danger";
  return "status-warning";
}

function renderHourlyChart(crossingMap, invoiceMap, productMap, amountMap, currentHour) {
  el.chartTitle.textContent = "Hóa đơn / lượt khách theo giờ";
  el.chartDescription.textContent = "Xám: không có khách; xanh: có hóa đơn; vàng: có khách nhưng chưa có hóa đơn; đỏ: từ 10 lượt trở lên nhưng không có hóa đơn. Bấm cột giờ để xem chi tiết 5 phút.";
  el.chartBackDay.hidden = true;
  el.chartBreadcrumb.hidden = true;
  const values = [];
  for (let hour = 7; hour <= 22; hour++) values.push({ hour, crossings: crossingMap.get(hour) || 0, invoices: invoiceMap.get(hour) || 0, products: productMap.get(hour) || 0, amount: amountMap.get(hour) || 0 });
  const max = Math.max(...values.map((item) => item.crossings), 0);
  el.hourlyChart.classList.remove("five-minute-chart");
  el.hourlyChart.innerHTML = "";
  el.hourlyEmpty.hidden = values.some((item) => item.crossings || item.invoices);
  for (const item of values) {
    const column = document.createElement("button");
    column.type = "button";
    column.className = `chart-column chart-column-button ${warningClass(item.crossings, item.invoices)}${item.hour === currentHour ? " current" : ""}`;
    column.setAttribute("aria-label", `Xem chi tiết giờ ${String(item.hour).padStart(2, "0")}:00`);
    const value = document.createElement("span"); value.className = "chart-value ratio-value";
    value.textContent = `${item.invoices}/${item.crossings}`;
    if (item.invoices === 0 && item.crossings > 0) {
      const alert = document.createElement("span");
      alert.className = "chart-alert";
      alert.textContent = item.crossings >= 10 ? "!" : "•";
      value.prepend(alert);
    }
    const track = document.createElement("div"); track.className = "chart-track";
    const bar = document.createElement("div"); bar.className = "chart-bar";
    bar.style.height = `${max && item.crossings ? Math.max(6, Math.round((item.crossings / max) * CHART_BAR_MAX_HEIGHT_PX)) : 0}px`;
    const rate = item.crossings > 0 ? ((item.invoices / item.crossings) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "0";
    bar.title = `${String(item.hour).padStart(2, "0")}:00–${String((item.hour + 1) % 24).padStart(2, "0")}:00
${item.crossings} lượt qua cửa
${item.invoices} hóa đơn
${item.products} sản phẩm
${item.amount.toLocaleString("vi-VN")}đ
Chuyển đổi ${rate}%`;
    const label = document.createElement("span"); label.className = "chart-label"; label.textContent = String(item.hour).padStart(2, "0");
    track.appendChild(bar); column.append(value, track, label);
    column.addEventListener("click", () => enterHourDetail(item.hour));
    el.hourlyChart.appendChild(column);
  }
}

function enterHourDetail(hour) {
  selectedHour = hour;
  highlightedFiveMinuteStart = null;
  timelinePage = 1;
  renderFiveMinuteChart(hour);
  renderTimeline();
  el.hourlyChart.scrollIntoView({ behavior: "smooth", block: "start" });
}

function leaveHourDetail() {
  selectedHour = null;
  highlightedFiveMinuteStart = null;
  timelinePage = 1;
  const crossingMap = new Map();
  const invoiceMap = new Map();
  const productMap = new Map();
  const amountMap = new Map();
  for (const item of timelineAll) {
    const hour = hourFromTimestamp(item.time);
    if (hour == null) continue;
    if (item.kind === "invoice") {
      invoiceMap.set(hour, (invoiceMap.get(hour) || 0) + 1);
      productMap.set(hour, (productMap.get(hour) || 0) + Number(item.quantity || 0));
      amountMap.set(hour, (amountMap.get(hour) || 0) + Number(item.amount || 0));
    } else {
      crossingMap.set(hour, (crossingMap.get(hour) || 0) + 1);
    }
  }
  const now = vietnamParts();
  renderHourlyChart(crossingMap, invoiceMap, productMap, amountMap, selectedDate === now.dateKey ? now.hour : null);
  renderTimeline();
}

function renderFiveMinuteChart(hour) {
  el.chartTitle.textContent = `Chi tiết ${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
  el.chartDescription.textContent = "Mỗi cột là 5 phút và hiển thị hóa đơn/lượt qua cửa. Bấm một cột để cuộn tới các dòng tương ứng.";
  el.chartBackDay.hidden = false;
  el.chartBreadcrumb.hidden = false;
  el.chartBreadcrumb.textContent = `${formatVietnamDateFromKey(selectedDate)} › ${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;

  const buckets = Array.from({ length: 12 }, (_, index) => ({ start: index * 5, crossings: 0, invoices: 0, products: 0, amount: 0 }));
  for (const item of timelineAll) {
    if (!isItemInSelectedHour(item)) continue;
    const start = fiveMinuteBucketStart(item.time);
    if (start == null) continue;
    const bucket = buckets[Math.floor(start / 5)];
    if (item.kind === "invoice") {
      bucket.invoices += 1;
      bucket.products += Number(item.quantity || 0);
      bucket.amount += Number(item.amount || 0);
    } else bucket.crossings += 1;
  }

  const max = Math.max(...buckets.map((item) => item.crossings), 0);
  el.hourlyChart.classList.add("five-minute-chart");
  el.hourlyChart.innerHTML = "";
  el.hourlyEmpty.hidden = buckets.some((item) => item.crossings || item.invoices);

  for (const bucket of buckets) {
    const column = document.createElement("button");
    column.type = "button";
    column.className = `chart-column chart-column-button ${warningClass(bucket.crossings, bucket.invoices)}${highlightedFiveMinuteStart === bucket.start ? " selected-bucket" : ""}`;
    const end = bucket.start + 5;
    column.setAttribute("aria-label", `Xem ${String(hour).padStart(2, "0")}:${String(bucket.start).padStart(2, "0")} đến ${String(hour).padStart(2, "0")}:${String(end).padStart(2, "0")}`);
    const value = document.createElement("span"); value.className = "chart-value ratio-value";
    value.textContent = `${bucket.invoices}/${bucket.crossings}`;
    if (bucket.invoices === 0 && bucket.crossings > 0) {
      const alert = document.createElement("span");
      alert.className = "chart-alert";
      alert.textContent = bucket.crossings >= 10 ? "!" : "•";
      value.prepend(alert);
    }
    const track = document.createElement("div"); track.className = "chart-track";
    const bar = document.createElement("div"); bar.className = "chart-bar";
    bar.style.height = `${max && bucket.crossings ? Math.max(6, Math.round((bucket.crossings / max) * CHART_BAR_MAX_HEIGHT_PX)) : 0}px`;
    const rate = bucket.crossings > 0 ? ((bucket.invoices / bucket.crossings) * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "0";
    bar.title = `${String(hour).padStart(2, "0")}:${String(bucket.start).padStart(2, "0")}–${String(hour).padStart(2, "0")}:${String(end).padStart(2, "0")}
${bucket.crossings} lượt qua cửa
${bucket.invoices} hóa đơn
${bucket.products} sản phẩm
${bucket.amount.toLocaleString("vi-VN")}đ
Chuyển đổi ${rate}%`;
    const label = document.createElement("span"); label.className = "chart-label"; label.textContent = String(bucket.start).padStart(2, "0");
    track.appendChild(bar); column.append(value, track, label);
    column.addEventListener("click", () => selectFiveMinuteBucket(bucket.start));
    el.hourlyChart.appendChild(column);
  }
}

function selectFiveMinuteBucket(bucketStart) {
  highlightedFiveMinuteStart = bucketStart;
  const filtered = filteredTimeline();
  const firstIndex = filtered.findIndex(isItemInHighlightedBucket);
  const pageSizeValue = el.timelinePageSize.value;
  const pageSize = pageSizeValue === "all" ? Math.max(filtered.length, 1) : Number(pageSizeValue || 100);
  timelinePage = firstIndex >= 0 ? Math.floor(firstIndex / pageSize) + 1 : 1;
  renderFiveMinuteChart(selectedHour);
  renderTimeline();
  requestAnimationFrame(() => {
    const target = el.eventList.querySelector(".bucket-highlight");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    else el.eventList.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function buildTimeline(events, invoices) {
  const cameraItems = events.map((event) => ({
    kind: "camera",
    time: event.event_time,
    id: event.id,
    eventKey: event.event_key,
    cameraCode: event.camera_code,
    eventType: event.event_type,
    image: event.image || null,
  }));

  const invoiceItems = invoices.map((invoice) => ({
    kind: "invoice",
    time: invoice.created_at,
    sohd: invoice.sohd,
    manv: invoice.manv,
    tennv: invoice.tennv,
    khachhang: invoice.khachhang,
    quantity: Number(invoice.sl_detail || 0),
    amount: Number(invoice.thanhtoan_v2 || 0),
  }));

  return [...cameraItems, ...invoiceItems].sort((a, b) => new Date(b.time) - new Date(a.time));
}

function filteredTimeline() {
  const filter = el.timelineFilter.value;
  return timelineAll.filter((item) => isItemInSelectedHour(item) && (filter === "all" || item.kind === filter));
}

function renderTimeline() {
  const filtered = filteredTimeline();
  const scopedAll = timelineAll.filter(isItemInSelectedHour);
  const cameraCount = scopedAll.filter((x) => x.kind === "camera").length;
  const invoiceCount = scopedAll.filter((x) => x.kind === "invoice").length;
  const productCount = scopedAll.filter((x) => x.kind === "invoice").reduce((sum, x) => sum + Number(x.quantity || 0), 0);
  const amountTotal = scopedAll.filter((x) => x.kind === "invoice").reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const pageSizeValue = el.timelinePageSize.value;
  const pageSize = pageSizeValue === "all" ? Math.max(filtered.length, 1) : Number(pageSizeValue || 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  timelinePage = Math.min(Math.max(timelinePage, 1), totalPages);
  const start = (timelinePage - 1) * pageSize;
  const rows = filtered.slice(start, start + pageSize);

  el.eventList.innerHTML = "";
  el.eventsEmpty.hidden = rows.length > 0;
  el.eventCountBadge.textContent = `${filtered.length.toLocaleString("vi-VN")} dòng`;
  el.timelineSummary.textContent = `${cameraCount.toLocaleString("vi-VN")} lượt qua cửa • ${invoiceCount.toLocaleString("vi-VN")} hóa đơn • ${productCount.toLocaleString("vi-VN")} sản phẩm • ${amountTotal.toLocaleString("vi-VN")}đ • ${scopedAll.length.toLocaleString("vi-VN")} dòng`;
  if (selectedHour == null) {
    el.timelineContext.hidden = true;
    el.timelineContext.textContent = "";
  } else {
    el.timelineContext.hidden = false;
    const hourLabel = `${String(selectedHour).padStart(2, "0")}:00–${String((selectedHour + 1) % 24).padStart(2, "0")}:00`;
    if (highlightedFiveMinuteStart == null) {
      el.timelineContext.textContent = `Đang xem dòng thời gian ${hourLabel}`;
    } else {
      const end = highlightedFiveMinuteStart + 5;
      el.timelineContext.textContent = `Đang làm nổi bật ${String(selectedHour).padStart(2, "0")}:${String(highlightedFiveMinuteStart).padStart(2, "0")}–${String(selectedHour).padStart(2, "0")}:${String(end).padStart(2, "0")}`;
    }
  }
  el.timelinePageInfo.textContent = `Trang ${timelinePage}/${totalPages}`;
  el.timelinePrev.disabled = timelinePage <= 1;
  el.timelineNext.disabled = timelinePage >= totalPages;

  for (const item of rows) {
    const node = item.kind === "invoice" ? createInvoiceItem(item) : createCameraItem(item);
    if (isItemInHighlightedBucket(item)) node.classList.add("bucket-highlight");
    el.eventList.appendChild(node);
  }
}

function createCameraItem(cameraEvent) {
  const item = document.createElement("article");
  item.className = "event-item camera-item";

  const hasImage = Boolean(cameraEvent.image?.image_path || cameraEvent.image?.image_url);
  if (hasImage) {
    item.classList.add("has-image");
    item.tabIndex = 0;
    item.title = "Bấm để xem ảnh lượt qua cửa";
  }

  const icon = document.createElement("div");
  icon.className = "event-icon";
  icon.textContent = hasImage ? "📷" : "↔";

  const content = document.createElement("div");
  content.className = "event-content";

  const title = document.createElement("strong");
  title.textContent = "Lượt qua cửa";

  const meta = document.createElement("span");
  meta.textContent = `${formatVietnamDateTime(cameraEvent.time)} • ${cameraEvent.cameraCode || "Camera"}${hasImage ? " • Có ảnh" : ""}`;

  const time = document.createElement("time");
  time.textContent = formatVietnamTime(cameraEvent.time);
  time.dateTime = cameraEvent.time;

  if (hasImage) {
    const openImage = () => openCameraImage(cameraEvent);
    item.addEventListener("click", openImage);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openImage();
      }
    });
  }

  content.append(title, meta);
  item.append(icon, content, time);
  return item;
}


function ensureCameraImageModal() {
  if (cameraImageModal) return cameraImageModal;

  const overlay = document.createElement("div");
  overlay.className = "camera-image-modal";
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="camera-image-card" role="dialog" aria-modal="true" aria-labelledby="camera-image-title">
      <button class="camera-image-close" type="button" aria-label="Đóng">×</button>
      <div class="camera-image-header">
        <h3 id="camera-image-title">Ảnh lượt qua cửa</h3>
        <p class="camera-image-meta"></p>
      </div>
      <div class="camera-image-frame">
        <div class="camera-image-message">Đang tải ảnh…</div>
        <img class="camera-image-preview" alt="Ảnh lượt qua cửa" hidden />
      </div>
      <div class="camera-image-actions">
        <a class="camera-image-open" href="#" target="_blank" rel="noopener" hidden>Mở ảnh ở tab mới</a>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  cameraImageModal = {
    overlay,
    card: overlay.querySelector(".camera-image-card"),
    closeButton: overlay.querySelector(".camera-image-close"),
    title: overlay.querySelector("#camera-image-title"),
    meta: overlay.querySelector(".camera-image-meta"),
    message: overlay.querySelector(".camera-image-message"),
    image: overlay.querySelector(".camera-image-preview"),
    openLink: overlay.querySelector(".camera-image-open"),
  };

  const close = () => closeCameraImageModal();
  cameraImageModal.closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  return cameraImageModal;
}

function closeCameraImageModal() {
  if (!cameraImageModal) return;
  cameraImageModal.overlay.hidden = true;
  cameraImageModal.image.removeAttribute("src");
}

async function resolveCameraImageUrl(image) {
  if (!image) return "";

  if (image.image_path) {
    const { data, error } = await supabase
      .storage
      .from(CAMERA_IMAGE_BUCKET)
      .createSignedUrl(image.image_path, 60 * 60);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    console.warn("Không tạo được signed URL cho ảnh lượt qua cửa:", error);
  }

  return image.image_url || "";
}

async function openCameraImage(cameraEvent) {
  const modal = ensureCameraImageModal();

  modal.title.textContent = "Ảnh lượt qua cửa";
  modal.meta.textContent = `${formatVietnamDateTime(cameraEvent.time)} • ${cameraEvent.cameraCode || "Camera"}`;
  modal.message.textContent = "Đang tải ảnh…";
  modal.message.hidden = false;
  modal.image.hidden = true;
  modal.openLink.hidden = true;
  modal.image.removeAttribute("src");
  modal.overlay.hidden = false;

  try {
    const imageUrl = await resolveCameraImageUrl(cameraEvent.image);
    if (!imageUrl) throw new Error("Không có đường dẫn ảnh.");

    modal.image.onload = () => {
      modal.message.hidden = true;
      modal.image.hidden = false;
    };

    modal.image.onerror = () => {
      modal.image.hidden = true;
      modal.message.hidden = false;
      modal.message.textContent = "Không tải được ảnh. Hãy kiểm tra quyền đọc Storage hoặc mở ảnh ở Supabase.";
    };

    modal.image.src = imageUrl;
    modal.openLink.href = imageUrl;
    modal.openLink.hidden = false;
  } catch (error) {
    modal.message.hidden = false;
    modal.message.textContent = `Không mở được ảnh: ${error?.message || error}`;
  }
}


function createInvoiceItem(invoice) {
  const item = document.createElement("article"); item.className = "event-item invoice-item"; item.tabIndex = 0;
  item.title = "Bấm để mở hóa đơn";
  const icon = document.createElement("div"); icon.className = "event-icon invoice-icon"; icon.textContent = "HĐ";
  const content = document.createElement("div"); content.className = "event-content";
  const title = document.createElement("strong"); title.textContent = invoice.sohd || "Hóa đơn bán hàng";
  const employee = invoice.tennv || invoice.manv || "Chưa ghi nhân viên";
  const customer = invoice.khachhang ? ` • ${invoice.khachhang}` : "";
  const meta = document.createElement("span");
  meta.textContent = `${employee}${customer} • ${invoice.quantity.toLocaleString("vi-VN")} SP • ${invoice.amount.toLocaleString("vi-VN")}đ`;
  const time = document.createElement("time"); time.textContent = formatVietnamTime(invoice.time); time.dateTime = invoice.time;
  const open = () => window.open(`./xemhoadon111.html?sohd=${encodeURIComponent(invoice.sohd)}`, "_blank", "noopener");
  item.addEventListener("click", open);
  item.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  content.append(title, meta); item.append(icon, content, time); return item;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function startAutoRefresh() { stopAutoRefresh(); refreshTimer = window.setInterval(() => { if (selectedDate === vietnamDateKey()) refreshReport(); }, APP_REFRESH_MS); }
function stopAutoRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }

el.loginForm.addEventListener("submit", handleLogin);
el.logoutButton.addEventListener("click", handleLogout);
el.refreshButton.addEventListener("click", () => refreshReport());
el.storeSelect.addEventListener("change", () => { currentStore = el.storeSelect.value; localStorage.setItem("camera_report_store", currentStore); selectedHour = null; highlightedFiveMinuteStart = null; timelinePage = 1; refreshReport(); });
el.reportDate.addEventListener("change", () => { selectedDate = el.reportDate.value || vietnamDateKey(); localStorage.setItem("camera_report_date", selectedDate); selectedHour = null; highlightedFiveMinuteStart = null; timelinePage = 1; refreshReport(); });
el.timelineFilter.addEventListener("change", () => { timelinePage = 1; renderTimeline(); });
el.timelinePageSize.addEventListener("change", () => { timelinePage = 1; renderTimeline(); });
el.timelinePrev.addEventListener("click", () => { if (timelinePage > 1) { timelinePage--; renderTimeline(); } });
el.timelineNext.addEventListener("click", () => { timelinePage++; renderTimeline(); });
el.chartBackDay.addEventListener("click", leaveHourDetail);
window.addEventListener("focus", () => { if (!el.appView.hidden && selectedDate === vietnamDateKey()) refreshReport(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !el.appView.hidden && selectedDate === vietnamDateKey()) refreshReport(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCameraImageModal(); });
supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_OUT" || !session) { stopAutoRefresh(); if (!el.loginView.hidden) return; showOnly("login"); } });

bootstrapAuth();
