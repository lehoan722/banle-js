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

// Check vị trí hiện tại có trong cửa hàng không
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

// Ghi 1 dòng chấm công vào bảng chamcong_log
async function logChamCong({ manv, diadiem, su_kien, nguon = "manual", ghi_chu = null }) {
  if (!supabase) {
    supabase = window.supabase;
  }
  if (!supabase) {
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return false;
  }

  const { error } = await supabase.from("chamcong_log").insert({
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

// Auto TANCA khi ra khỏi cửa hàng sau 3 lần check
let lastInStore = true;
let outCount = 0;
let autoTanCaLoggedToday = false;

function getTodayKeyForAuto(manv, diadiem) {
  const d = new Date();
  const dayStr = d.toISOString().slice(0, 10); // YYYY-MM-DD
  return `autoTanCa_${manv}_${diadiem}_${dayStr}`;
}

async function startAutoCheckLeave(manv, diadiem) {
  if (!manv) return;

  // Khởi tạo flag theo localStorage
  autoTanCaLoggedToday = !!localStorage.getItem(getTodayKeyForAuto(manv, diadiem));

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

    if (outCount >= 3 && !autoTanCaLoggedToday) {
      // Sau 3 lần check liên tiếp (3 * 3 phút = 9 phút) ngoài cửa hàng
      autoTanCaLoggedToday = true;
      localStorage.setItem(getTodayKeyForAuto(manv, diadiem), "1");

      const ok = await logChamCong({
        manv,
        diadiem,
        su_kien: "AUTO_TANCA",
        nguon: "auto-gps",
        ghi_chu: "Tự động tan ca do rời khỏi cửa hàng"
      });

      if (ok) {
        alert("Hệ thống ghi nhận TAN CA tự động do bạn đã rời khỏi cửa hàng.");
      }
    }
  }, AUTO_CHECK_INTERVAL_MS);
}

// Gắn sự kiện cho các nút chấm công sau khi đã login
function attachChamCongButtons(diadiem) {
  const manv = localStorage.getItem("manv");
  if (!manv) return;

  const statusManv = document.getElementById("status-manv");
  const statusMsg = document.getElementById("status-msg");
  statusManv.textContent = manv;

  const btnVaoca = document.getElementById("btn-vaoca");
  const btnNtr   = document.getElementById("btn-ntr");
  const btnNtrd  = document.getElementById("btn-ntrd");
  const btnNch   = document.getElementById("btn-nch");
  const btnNchd  = document.getElementById("btn-nchd");
  const btnTanca = document.getElementById("btn-tanca");

  async function handleClick(su_kien) {
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
      statusMsg.textContent = `Đã ghi: ${su_kien} lúc ${now.toLocaleTimeString()}`;
    }
  }

  btnVaoca.addEventListener("click", () => handleClick("VAOCA"));
  btnNtr  .addEventListener("click", () => handleClick("NTR"));
  btnNtrd .addEventListener("click", () => handleClick("NTRD"));
  btnNch  .addEventListener("click", () => handleClick("NCH"));
  btnNchd .addEventListener("click", () => handleClick("NCHD"));
  btnTanca.addEventListener("click", () => handleClick("TANCA"));
}

// Khởi tạo sau khi đăng nhập thành công
function initChamCong(diadiem) {
  supabase = window.supabase;
  if (!supabase) {
    console.error("Supabase client chưa sẵn sàng!");
    alert("Không khởi tạo được Supabase, vui lòng tải lại trang.");
    return;
  }

  // Ẩn login, hiện app – authModule đã làm giúp, nhưng ta đảm bảo lại
  const loginContainer = document.getElementById("login-container");
  const appContainer = document.getElementById("app-container");
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "";

  // Gắn nút chấm công & bắt đầu auto check
  attachChamCongButtons(diadiem);

  const manv = localStorage.getItem("manv");
  startAutoCheckLeave(manv, diadiem);
}

// ================== KHỞI ĐỘNG ==================
document.addEventListener("DOMContentLoaded", () => {
  const diadiem = getDiaDiemFromPath(); // cs1 / cs2

  const loginApiPath = diadiem === "cs1" ? "/api/login-cs1" : "/api/login-cs2";

  // Dùng cùng module đăng nhập như trang Up ảnh nhanh
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
