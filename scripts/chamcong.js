// scripts/chamcong.js

// Dùng chung cơ chế đăng nhập như trang Up ảnh nhanh
import { khoiTaoDangNhapDungChung } from './authModule.js';

// Supabase client sẽ được gán vào window.supabase sau khi đăng nhập
let supabase = null;

// ===== CẤU HÌNH CƠ SỞ (tọa độ) =====
const CS1_COORD = { lat: 21.5525047, lng: 105.8423559 };
const CS2_COORD = { lat: 21.5843348, lng: 105.8343116 };
const MAX_DISTANCE_M = 200;                // bán kính cho phép (m)
const AUTO_CHECK_INTERVAL_MS = 180000;     // 3 phút
const BUTTON_LOCK_MS = 5 * 60 * 1000;      // 5 phút khoá nút sau khi bấm

// Bộ nhớ log chấm công trong ngày hiện tại (sau khi load từ DB)
let todayEvents = []; // mỗi phần tử: { su_kien, createdAt: Date, nguon }

function isMobileDevice() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// Tính khoảng cách 2 tọa độ (haversine)
function distanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Lấy diadiem từ URL: chamcongcs1.html / chamcongcs2.html
function getDiaDiemFromPath() {
  const path = (window.location && window.location.pathname) || "";
  if (path.includes("chamcongcs1")) return "cs1";
  if (path.includes("chamcongcs2")) return "cs2";
  return "cs1"; // mặc định
}

function getCoordForDiaDiem(diadiem) {
  if (diadiem === "cs1") return CS1_COORD;
  if (diadiem === "cs2") return CS2_COORD;
  return CS1_COORD;
}

// ==== VỊ TRÍ / GPS =====================================

async function checkInStore(diadiem) {
  if (!navigator.geolocation) {
    alert("Thiết bị không hỗ trợ định vị. Ứng dụng chấm công chỉ dùng tại cửa hàng.");
    return false;
  }

  const coord = getCoordForDiaDiem(diadiem);

  const pos = await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (err) => {
        console.error("Lỗi định vị:", err);
        if (err.code === 1) {
          alert(
            "Bạn đã từ chối quyền truy cập vị trí cho website này.\n\n" +
            "Hãy vào Cài đặt trình duyệt / ứng dụng để bật lại quyền vị trí, rồi mở lại trang chấm công."
          );
        } else {
          alert("Không lấy được vị trí. Vui lòng kiểm tra GPS/mạng rồi thử lại.");
        }
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });

  if (!pos) return false;

  const { latitude, longitude } = pos.coords;
  const dist = distanceInMeters(latitude, longitude, coord.lat, coord.lng);
  console.log("Khoảng cách tới", diadiem, "=", dist, "m");
  if (dist > MAX_DISTANCE_M) {
    alert("Bạn không đứng trong khu vực cửa hàng, không thể chấm công.");
    return false;
  }
  return true;
}

// Check trước khi chấm công một sự kiện
async function ensureInStoreBeforeAction(diadiem) {
  // Chỉ cho phép trên mobile
  if (!isMobileDevice()) {
    alert("Ứng dụng chấm công chỉ được dùng trên điện thoại.");
    return false;
  }
  const ok = await checkInStore(diadiem);
  return ok;
}

// ==== GHI & ĐỌC CSDL ====================================

async function ensureSupabase() {
  if (!supabase) {
    supabase = window.supabase;
  }
  if (!supabase) {
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return null;
  }
  return supabase;
}

// Ghi 1 dòng chấm công vào bảng chamcong_log
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

// Tải toàn bộ log chấm công của hôm nay cho nhân viên & cơ sở
async function loadTodayEvents(manv, diadiem) {
  const sp = await ensureSupabase();
  if (!sp) return [];

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

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
    return [];
  }

  return (data || []).map(row => ({
    su_kien: row.su_kien,
    nguon: row.nguon,
    createdAt: new Date(row.created_at)
  }));
}

// ==== LOGIC TÍNH GIỜ & HIỂN THỊ ========================

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

// Tính tổng giờ công từ danh sách sự kiện trong ngày
function computeTotalHours(events) {
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);

  const startEvents = new Set(["VAOCA", "NTRD", "NCHD"]);
  const endEvents = new Set(["NTR", "NCH", "TANCA", "AUTO_TANCA"]);

  let totalMs = 0;
  let currentStart = null;

  for (const ev of sorted) {
    if (startEvents.has(ev.su_kien)) {
      if (currentStart === null) {
        currentStart = ev.createdAt;
      } else {
        // nếu đang trong ca mà lại start mới -> reset mốc
        currentStart = ev.createdAt;
      }
    } else if (endEvents.has(ev.su_kien)) {
      if (currentStart !== null) {
        totalMs += ev.createdAt - currentStart;
        currentStart = null;
      }
    }
  }

  const hours = totalMs / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100; // 2 chữ số sau dấu phẩy
}

function renderTodayLog() {
  const logList = document.getElementById("log-list");
  const logTotal = document.getElementById("log-total");
  if (!logList || !logTotal) return;

  logList.innerHTML = "";

  todayEvents
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach(ev => {
      const li = document.createElement("li");
      li.textContent = `Đã ghi: ${ev.su_kien} (${labelSuKien(ev.su_kien)}) lúc ${formatTime(ev.createdAt)}` +
        (ev.nguon === "auto-gps" ? " [tự động]" : "");
      logList.appendChild(li);
    });

  const total = computeTotalHours(todayEvents);
  logTotal.textContent = `Tổng công hôm nay: ${total.toFixed(2)} giờ`;
}

// Giờ giới hạn cho phép bắt đầu ca thứ 2 (22h)
const SHIFT_RESTART_LIMIT_HOUR = 22;

function getAllowedNextEvents() {
  // Chưa có sự kiện nào trong ngày -> chỉ được VÀO CA
  if (todayEvents.length === 0) {
    return ["VAOCA"];
  }

  const last = [...todayEvents]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-1)[0];
  const lastCode = last.su_kien;

  // Lấy giờ hiện tại để quyết định có cho phép VÀO CA lần 2 không
  const now = new Date();
  const currentHour = now.getHours();

  switch (lastCode) {
    case "VAOCA":
      // Sau VÀO CA: có thể nghỉ trưa, nghỉ chiều, hoặc tan ca luôn
      return ["NTR", "NCH", "TANCA"];

    case "NTR":
      // Sau NGHỈ TRƯA: chỉ được NGHỈ TRƯA ĐẾN hoặc TAN CA
      return ["NTRD", "TANCA"];

    case "NTRD":
      // Sau NGHỈ TRƯA ĐẾN: được NGHỈ CHIỀU hoặc TAN CA
      return ["NCH", "TANCA"];

    case "NCH":
      // Sau NGHỈ CHIỀU: chỉ được NGHỈ CHIỀU ĐẾN hoặc TAN CA
      return ["NCHD", "TANCA"];

    case "NCHD":
      // Sau NGHỈ CHIỀU ĐẾN: chỉ còn TAN CA
      return ["TANCA"];

    case "TANCA":
    case "AUTO_TANCA":
      // Đã tan ca xong 1 ca:
      // - Nếu TRƯỚC 22h: cho phép VÀO CA lại (ca 2)
      // - Nếu SAU 22h: không cho chấm thêm
      if (currentHour < SHIFT_RESTART_LIMIT_HOUR) {
        return ["VAOCA"];
      }
      return [];

    default:
      // Nếu vì lý do gì đó chuỗi lạ -> bắt buộc quay lại từ VÀO CA
      return ["VAOCA"];
  }
}

// Kiểm tra từ lần VAOCA gần nhất tới hiện tại đã có TANCA/AUTO_TANCA chưa
function hasTancaAfterLastVaoca() {
  if (todayEvents.length === 0) return false;

  const sorted = [...todayEvents].sort((a, b) => a.createdAt - b.createdAt);
  let lastVaocaIndex = -1;

  // Tìm VAOCA gần nhất
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].su_kien === "VAOCA") {
      lastVaocaIndex = i;
      break;
    }
  }

  const startIndex = lastVaocaIndex === -1 ? 0 : lastVaocaIndex;

  for (let i = startIndex; i < sorted.length; i++) {
    const code = sorted[i].su_kien;
    if (code === "TANCA" || code === "AUTO_TANCA") {
      return true; // ca hiện tại đã tan ca
    }
  }

  return false;
}



function hasTancaToday() {
  return todayEvents.some(ev => ev.su_kien === "TANCA" || ev.su_kien === "AUTO_TANCA");
}

// Khoá nút tạm thời sau khi bấm để tránh click liên tiếp
function disableButtonTemporarily(btn, ms = BUTTON_LOCK_MS) {
  if (!btn) return;
  btn.disabled = true;
  const unlockAt = Date.now() + ms;
  btn.dataset.disabledUntil = String(unlockAt);

  setTimeout(() => {
    const stored = parseInt(btn.dataset.disabledUntil || "0", 10);
    if (Date.now() >= stored) {
      btn.disabled = false;
    }
  }, ms);
}

// ==== AUTO TANCA (GPS 3 lần liên tiếp) ==================

let lastInStore = true;
let outCount = 0;

function getTodayKeyForAuto(manv, diadiem) {
  const d = new Date();
  const dayStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return `autoTanCa_${manv}_${diadiem}_${dayStr}`;
}

async function startAutoCheckLeave(manv, diadiem) {
  if (!manv) return;

  setInterval(async () => {
    const inStore = await checkInStore(diadiem);

    if (inStore) {
      lastInStore = true;
      outCount = 0;
      return;
    }

    // Không ở trong cửa hàng
    if (!lastInStore) {
      outCount++;
    } else {
      lastInStore = false;
      outCount = 1;
    }

    console.log("outCount =", outCount);

    if (outCount >= 3) {
      // Sau 3 lần check liên tiếp (3 * 3 phút = 9 phút) ngoài cửa hàng
      if (hasTancaToday()) {
        console.log("Đã có TANCA hôm nay, không ghi AUTO_TANCA nữa.");
        return;
      }

      const already = localStorage.getItem(getTodayKeyForAuto(manv, diadiem));
      if (already) {
        console.log("AUTO_TANCA hôm nay đã được ghi trong localStorage.");
        return;
      }

      const ok = await logChamCong({
        manv,
        diadiem,
        su_kien: "AUTO_TANCA",
        nguon: "auto-gps",
        ghi_chu: "Tự động tan ca do rời khỏi cửa hàng"
      });

      if (ok) {
        localStorage.setItem(getTodayKeyForAuto(manv, diadiem), "1");
        todayEvents.push({
          manv,
          diadiem,
          su_kien: "AUTO_TANCA",
          nguon: "auto-gps",
          createdAt: new Date()
        });
        renderTodayLog();
        alert("Hệ thống ghi nhận TAN CA tự động do bạn đã rời khỏi cửa hàng.");
      }
    }
  }, AUTO_CHECK_INTERVAL_MS);
}

// ==== GIAO DIỆN CHẤM CÔNG =============================

function attachChamCongButtons(diadiem) {
  const manv = localStorage.getItem("manv");
  if (!manv) return;

  const statusManv = document.getElementById("status-manv");
  const statusMsg = document.getElementById("status-msg");
  statusManv.textContent = manv;

  const btnVaoca = document.getElementById("btn-vaoca");
  const btnNtr = document.getElementById("btn-ntr");
  const btnNtrd = document.getElementById("btn-ntrd");
  const btnNch = document.getElementById("btn-nch");
  const btnNchd = document.getElementById("btn-nchd");
  const btnTanca = document.getElementById("btn-tanca");

  async function handleClick(su_kien, btn) {
    const allowed = getAllowedNextEvents();
    if (!allowed.includes(su_kien)) {
      alert("Thứ tự chấm công không hợp lý. Vui lòng chấm đúng quy trình trong ngày.");
      return;
    }

    const okInStore = await ensureInStoreBeforeAction(diadiem);
    if (!okInStore) return;

    const ok = await logChamCong({
      manv,
      diadiem,
      su_kien,
      nguon: "manual"
    });
    if (ok) {
      const now = new Date();
      todayEvents.push({
        manv,
        diadiem,
        su_kien,
        nguon: "manual",
        createdAt: now
      });
      if (statusMsg) {
        statusMsg.textContent = `Đã ghi: ${su_kien} lúc ${formatTime(now)}`;
      }
      renderTodayLog();
      disableButtonTemporarily(btn);
    }
  }

  btnVaoca.addEventListener("click", () => handleClick("VAOCA", btnVaoca));
  btnNtr.addEventListener("click", () => handleClick("NTR", btnNtr));
  btnNtrd.addEventListener("click", () => handleClick("NTRD", btnNtrd));
  btnNch.addEventListener("click", () => handleClick("NCH", btnNch));
  btnNchd.addEventListener("click", () => handleClick("NCHD", btnNchd));
  btnTanca.addEventListener("click", () => handleClick("TANCA", btnTanca));

  // Render log ngay khi gắn nút
  renderTodayLog();
}

// Khởi tạo sau khi đăng nhập thành công
async function initChamCong(diadiem) {
  supabase = window.supabase;
  if (!supabase) {
    console.error("Supabase client chưa sẵn sàng!");
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return;
  }

  const loginContainer = document.getElementById("login-container");
  const appContainer = document.getElementById("app-container");
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "";

  const manv = localStorage.getItem("manv");
  if (!manv) {
    alert("Không tìm thấy mã nhân viên trong phiên đăng nhập, vui lòng đăng nhập lại.");
    location.reload();
    return;
  }

  // Tải log hôm nay và hiển thị
  todayEvents = await loadTodayEvents(manv, diadiem);
  attachChamCongButtons(diadiem);

  // Bắt đầu auto check rời khỏi cửa hàng
  startAutoCheckLeave(manv, diadiem);
}

// ================== KHỞI ĐỘNG ==================
document.addEventListener("DOMContentLoaded", () => {
  const diadiem = getDiaDiemFromPath(); // cs1 / cs2
  const loginApiPath = diadiem === "cs1" ? "/api/login-cs1" : "/api/login-cs2";

  khoiTaoDangNhapDungChung({
    loginContainerId: 'login-container',
    appContainerId: 'app-container',
    macDinhDiaDiem: diadiem,
    tuDongKhoaCoSo: true,
    loginApiPath,
    onLoginSuccess: () => {
      initChamCong(diadiem);
    }
  });
});
