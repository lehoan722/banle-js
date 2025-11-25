// scripts/chamcong_admin.js
// Trang CHẤM CÔNG ADMIN: cho phép nhập mã NV khác để chấm hộ

import { khoiTaoDangNhapDungChung } from "./authModule.js";

let supabase = null;

// Bộ nhớ log chấm công trong ngày cho NHÂN VIÊN ĐANG CHỌN
let todayEvents = [];
let currentTargetManv = "";   // nhân viên mà admin đang thao tác
let currentDiaDiem = "cs1";   // cs1 / cs2

// =============== TIỆN ÍCH CHUNG ===================

async function ensureSupabase() {
  if (!supabase) supabase = window.supabase;
  if (!supabase) {
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return null;
  }
  return supabase;
}

function getDiaDiemFromPath() {
  const path = (window.location && window.location.pathname) || "";
  if (path.includes("chamcongadmincs1")) return "cs1";
  if (path.includes("chamcongadmincs2")) return "cs2";
  // fallback: giống trang thường
  if (path.includes("chamcongcs1")) return "cs1";
  if (path.includes("chamcongcs2")) return "cs2";
  return "cs1";
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function labelSuKien(su_kien) {
  switch (su_kien) {
    case "VAOCA": return "Vào ca";
    case "NTR": return "Nghỉ trưa";
    case "NTRD": return "Nghỉ trưa đến";
    case "NCH": return "Nghỉ chiều";
    case "NCHD": return "Nghỉ chiều đến";
    case "TANCA": return "Tan ca";
    case "AUTO_TANCA": return "Tan ca (tự động)";
    default: return su_kien;
  }
}

// Tính tổng giờ từ todayEvents
function computeTotalHours(events) {
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);

  const startEvents = new Set(["VAOCA", "NTRD", "NCHD"]);
  const endEvents = new Set(["NTR", "NCH", "TANCA", "AUTO_TANCA"]);

  let totalMs = 0;
  let currentStart = null;

  for (const ev of sorted) {
    if (startEvents.has(ev.su_kien)) {
      currentStart = ev.createdAt;
    } else if (endEvents.has(ev.su_kien)) {
      if (currentStart) {
        totalMs += ev.createdAt - currentStart;
        currentStart = null;
      }
    }
  }

  const hours = totalMs / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

function renderTodayLog() {
  const logList = document.getElementById("log-list");
  const logTotal = document.getElementById("log-total");
  const targetLabel = document.getElementById("target-info");

  if (targetLabel) {
    targetLabel.textContent = currentTargetManv
      ? `Đang thao tác cho mã NV: ${currentTargetManv}`
      : "Chưa chọn mã nhân viên cần thao tác";
  }

  if (!logList || !logTotal) return;

  logList.innerHTML = "";

  todayEvents
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach(ev => {
      const li = document.createElement("li");
      li.textContent =
        `Đã ghi: ${labelSuKien(ev.su_kien)} (${ev.su_kien}) lúc ${formatTime(
          ev.createdAt
        )}`;
      logList.appendChild(li);
    });

  const total = computeTotalHours(todayEvents);
  logTotal.textContent =
    `Tổng công hôm nay (mã ${currentTargetManv || "?"}): ${total.toFixed(2)} giờ`;
}

// ================== DB: LOAD / GHI LOG ===================

async function loadTodayEvents(manv, diadiem) {
  const sp = await ensureSupabase();
  if (!sp) return [];

  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0, 0, 0
  );
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23, 59, 59, 999
  );

  const { data, error } = await sp
    .from("chamcong_log")
    .select("su_kien, nguon, created_at")
    .eq("manv", manv)
    .eq("diadiem", diadiem)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Lỗi load log hôm nay:", error);
    alert("Không đọc được log chấm công hôm nay.");
    return [];
  }

  return (data || []).map(row => ({
    su_kien: row.su_kien,
    nguon: row.nguon,
    createdAt: new Date(row.created_at)
  }));
}

async function logChamCong({ manv, diadiem, su_kien, nguon = "manual", ghi_chu = null }) {
  const sp = await ensureSupabase();
  if (!sp) return false;

  const { error } = await sp.from("chamcong_log").insert({
    manv,
    diadiem,
    su_kien,
    nguon,
    ghi_chu
  });
  if (error) {
    console.error("Lỗi ghi chấm công:", error);
    alert("Lỗi ghi chấm công, vui lòng thử lại.");
    return false;
  }
  return true;
}

// ============= LUỒNG / THỨ TỰ SỰ KIỆN ===============

const SHIFT_RESTART_LIMIT_HOUR = 22;

function getAllowedNextEvents() {
  if (todayEvents.length === 0) return ["VAOCA"];

  const last = [...todayEvents]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-1)[0];
  const lastCode = last.su_kien;

  const now = new Date();
  const currentHour = now.getHours();

  switch (lastCode) {
    case "VAOCA":
      return ["NTR", "NCH", "TANCA"];
    case "NTR":
      return ["NTRD", "TANCA"];
    case "NTRD":
      return ["NCH", "TANCA"];
    case "NCH":
      return ["NCHD", "TANCA"];
    case "NCHD":
      return ["TANCA"];
    case "TANCA":
    case "AUTO_TANCA":
      if (currentHour < SHIFT_RESTART_LIMIT_HOUR) return ["VAOCA"];
      return [];
    default:
      return ["VAOCA"];
  }
}

// ============= UI: NÚT & CHỌN MÃ NHÂN VIÊN ===========

function attachButtonsAndTargetInput() {
  const loginManv = localStorage.getItem("manv") || "";
  const statusManv = document.getElementById("status-manv");
  if (statusManv) {
    statusManv.textContent = loginManv
      ? `Admin đăng nhập: ${loginManv}`
      : "(chưa tìm thấy mã NV đăng nhập)";
  }

  const inputTarget = document.getElementById("target-manv");
  const btnApplyTarget = document.getElementById("btn-apply-target");
  const statusMsg = document.getElementById("status-msg");

  const btnVaoca = document.getElementById("btn-vaoca");
  const btnNtr = document.getElementById("btn-ntr");
  const btnNtrd = document.getElementById("btn-ntrd");
  const btnNch = document.getElementById("btn-nch");
  const btnNchd = document.getElementById("btn-nchd");
  const btnTanca = document.getElementById("btn-tanca");

  // Chọn / đổi nhân viên mục tiêu
  async function applyTarget() {
    const manv = (inputTarget.value || "").trim();
    if (!manv) {
      alert("Nhập mã nhân viên cần thao tác.");
      return;
    }
    currentTargetManv = manv.toUpperCase();
    todayEvents = await loadTodayEvents(currentTargetManv, currentDiaDiem);
    renderTodayLog();
  }

  if (btnApplyTarget) {
    btnApplyTarget.addEventListener("click", applyTarget);
  }
  if (inputTarget) {
    inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyTarget();
      }
    });
  }

  async function handleClick(su_kien) {
    if (!currentTargetManv) {
      alert("Hãy nhập mã nhân viên cần thao tác và bấm Áp dụng trước.");
      return;
    }

    const allowed = getAllowedNextEvents();
    if (!allowed.includes(su_kien)) {
      alert("Thứ tự chấm công không hợp lý với log hiện tại. Kiểm tra lại.");
      return;
    }

    // TRANG ADMIN: KHÔNG KIỂM TRA GPS, KHÔNG KIỂM TRA ĐĂNG KÝ CA
    const ok = await logChamCong({
      manv: currentTargetManv,
      diadiem: currentDiaDiem,
      su_kien,
      nguon: "admin"
    });

    if (ok) {
      const now = new Date();
      todayEvents.push({
        manv: currentTargetManv,
        diadiem: currentDiaDiem,
        su_kien,
        nguon: "admin",
        createdAt: now
      });
      if (statusMsg) {
        statusMsg.textContent =
          `Admin đã ghi ${labelSuKien(su_kien)} cho ${currentTargetManv} lúc ${formatTime(now)}`;
      }
      renderTodayLog();
    }
  }

  btnVaoca && btnVaoca.addEventListener("click", () => handleClick("VAOCA"));
  btnNtr && btnNtr.addEventListener("click", () => handleClick("NTR"));
  btnNtrd && btnNtrd.addEventListener("click", () => handleClick("NTRD"));
  btnNch && btnNch.addEventListener("click", () => handleClick("NCH"));
  btnNchd && btnNchd.addEventListener("click", () => handleClick("NCHD"));
  btnTanca && btnTanca.addEventListener("click", () => handleClick("TANCA"));

  renderTodayLog();
}

// ============= KHỞI TẠO SAU KHI ĐĂNG NHẬP ============

async function initChamCongAdmin(diadiem) {
  currentDiaDiem = diadiem;
  supabase = window.supabase;

  if (!supabase) {
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return;
  }

  const loginContainer = document.getElementById("login-container");
  const appContainer = document.getElementById("app-container");
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "";

  attachButtonsAndTargetInput();
}

// =============== STARTUP =======================

document.addEventListener("DOMContentLoaded", () => {
  const diadiem = getDiaDiemFromPath();
  const loginApiPath = diadiem === "cs1" ? "/api/login-cs1" : "/api/login-cs2";

  khoiTaoDangNhapDungChung({
    loginContainerId: "login-container",
    appContainerId: "app-container",
    macDinhDiaDiem: diadiem,
    tuDongKhoaCoSo: true,
    loginApiPath,
    onLoginSuccess: () => {
      initChamCongAdmin(diadiem);
    }
  });
});
