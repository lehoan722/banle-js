
import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV, xoaDongDangChon, getBangKetQua, napLaiChiTietHoaDon } from './hoadon.js';
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { ganSuKienDuyetHoaDon, napHoaDonVaoTrang } from './duyetHoaDon.js';
import { ganSuKienNutLenh } from './nutLenh.js';
import { khoiTaoShortcut } from './shortcut.js';
import { xacNhanSuaHoaDon, luuHoaDonQuaAPI, luuHoaDonCaHaiBan } from './luuhoadon.js';
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';
import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
import { initAutocompleteRealtimeMasp } from "./autocompleteSPRealtime.js";
import { setupBeepUnlockOnce, playSuccessBeep, playWaitSizeBeep, playAlertBeep } from './soundBeep.js';
setupBeepUnlockOnce(document);
import { setupScanner } from './scanner.js';
import { showFlash, showToast } from './feedback.js';
import { ensureAccess } from './auth_guard.js';
import { startSessionKeeper } from "./supabaseClient.js";
import { initPopupChuyenKhoContext, triggerChuyenKhoCheckNgay } from './popupchuyenkho.js';
import { showPageLoading, hidePageLoading, setPageLoadingText } from './pageLoading.js';
import { initDatHangChuyenKho } from './datHangChuyenKho.js';
import { initYeuCauBayMau } from './yeuCauBayMau.js';
// ===== tam ngung kiem tra vi tri =====
const ENABLE_LOCATION_GUARD = false;
//const ENABLE_LOCATION_GUARD = true;

// ===== GUARD THEO THIẾT BỊ & VỊ TRÍ CỬA HÀNG =====
function isMobileDevice() {
  //const ua = navigator.userAgent || navigator.vendor || window.opera;
  // Các từ khoá phổ biến trên điện thoại / tablet
  //return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function khoaOsoHoaDonVaTaoPopupDungChung() {
  const sohdEl = document.getElementById("sohd");

  // 1) Khóa ô số hóa đơn nếu có trên trang
  if (sohdEl) {
    sohdEl.readOnly = true;
    sohdEl.style.background = "#f5f5f5";
    sohdEl.style.cursor = "pointer";
    sohdEl.title = "Nhấn F11 để mở hóa đơn cũ";
  }

  // 2) Nếu popup đã có rồi thì thôi
  if (document.getElementById("popupMoHoaDonCu")) return;

  // 3) Tạo popup bằng JS để khỏi phải sửa từng HTML
  const popup = document.createElement("div");
  popup.id = "popupMoHoaDonCu";
  popup.style.cssText = `
    display:none;
    position:fixed;
    top:35%;
    left:50%;
    transform:translate(-50%,-50%);
    background:#fff;
    border:1px solid #999;
    box-shadow:0 0 12px rgba(0,0,0,.35);
    padding:16px;
    z-index:10001;
    min-width:320px;
  `;

  popup.innerHTML = `
    <div style="font-weight:bold; margin-bottom:10px; font-size:18px;">
      Mở hóa đơn cũ (F11)
    </div>

    <div style="margin-bottom:8px; color:#333;">
      Số hóa đơn hiện tại:
      <span id="popupSoHdHienTai" style="font-weight:bold; color:#c00;"></span>
    </div>

    <input id="popupNhapSoHdCu"
           type="text"
           placeholder="Nhập số hóa đơn cần mở"
           style="width:100%; padding:8px; font-size:18px; box-sizing:border-box;" />

    <div style="margin-top:10px; text-align:right;">
      <button type="button" id="btnDongPopupMoHdCu">Đóng</button>
    </div>
  `;

  document.body.appendChild(popup);

  const input = document.getElementById("popupNhapSoHdCu");
  const spanCurrent = document.getElementById("popupSoHdHienTai");
  const btnDong = document.getElementById("btnDongPopupMoHdCu");

  window.moPopupMoHoaDonCu = function () {
    const sohdNow = document.getElementById("sohd")?.value || "";
    spanCurrent.textContent = sohdNow || "(trống)";

    // Đổ luôn số HĐ hiện tại vào ô nhập để người dùng sửa đuôi cho nhanh
    input.value = sohdNow || "";

    popup.style.display = "block";

    setTimeout(() => {
      input.focus();

      // Chỉ đặt con trỏ ở CUỐI chuỗi, không bôi đen
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }, 30);
  };

  window.dongPopupMoHoaDonCu = function () {
    popup.style.display = "none";
    const masp = document.getElementById("masp");
    if (masp) {
      setTimeout(() => {
        masp.focus();
        masp.select?.();
      }, 30);
    }
  };

  btnDong?.addEventListener("click", () => {
    window.dongPopupMoHoaDonCu?.();
  });

  // Enter ngay trong ô popup => mở hóa đơn
  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;

    e.preventDefault();
    e.stopPropagation();

    const sohd = String(input.value || "").trim();
    if (!sohd) {
      alert("❌ Bạn chưa nhập số hóa đơn.");
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
      return;
    }

    // Đẩy trước lên ô số HĐ trên form
    const sohdEl = document.getElementById("sohd");
    if (sohdEl) {
      sohdEl.value = sohd;
      sohdEl.dispatchEvent(new Event("input", { bubbles: true }));
      sohdEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    moHoaDonTrucTiepTrenTrang(sohd);
  });

  document.addEventListener("keydown", function (e) {
    if (popup.style.display !== "block") return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      window.dongPopupMoHoaDonCu?.();
    }
  }, true);
}

async function checkInStoreLocation(pointsOverride) {
  // Nếu truyền vào mảng tọa độ thì dùng, không thì dùng mặc định (CS1)
  const STORE_POINTS = pointsOverride || [
    { lat: 21.5525047, lng: 105.8423559 }  // CS1 – Tích Lương
  ];
  const MAX_DISTANCE_M = 1000; // bán kính cho phép (m) – muốn chặt hơn thì giảm xuống

  // Nếu thiết bị không hỗ trợ định vị
  if (!navigator.geolocation) {
    alert("Thiết bị không hỗ trợ định vị. Ứng dụng này chỉ dùng trong cửa hàng.");
    return false;
  }

  // Lấy vị trí hiện tại (promise wrapper)
  const pos = await new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      (err) => {
        console.error("Lỗi định vị:", err);
        if (err.code === 1) { // PERMISSION_DENIED
          alert(
            "Bạn đã chọn KHÔNG cho phép truy cập vị trí cho website này.\n\n" +
            "Để dùng lại, hãy vào Cài đặt trình duyệt > Vị trí (Location) " +
            "và bật 'Cho phép' cho website, rồi mở lại ứng dụng."
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

  // Hàm tính khoảng cách 2 toạ độ (haversine)
  function distanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // bán kính trái đất (m)
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

  let ok = false;
  for (const p of STORE_POINTS) {
    const dist = distanceInMeters(latitude, longitude, p.lat, p.lng);
    console.log("Khoảng cách tới điểm", p, "=", dist, "m");
    if (dist <= MAX_DISTANCE_M) {
      ok = true;
      break;
    }
  }

  if (!ok) {
    alert("Bạn không ở trong khu vực cửa hàng, ứng dụng không cho phép sử dụng.");
  }
  return ok;
}

// ===== HẾT PHẦN GUARD THEO THIẾT BỊ & VỊ TRÍ =====


// Khởi tạo âm thanh & tạo 2 helper toàn cục '/scripts/success.wav'

async function moHoaDonTrucTiepTrenTrang(sohdCanMo) {
  const sohd = String(sohdCanMo || "").trim();
  if (!sohd) {
    alert("❌ Bạn chưa nhập số hóa đơn.");
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("hoadon_banle")
      .select("*")
      .eq("sohd", sohd)
      .maybeSingle();

    if (error || !data) {
      alert("❌ Không tìm thấy hóa đơn " + sohd);
      return false;
    }

    // 👉 GỌI LUỒNG CHUẨN DUY NHẤT
    await napHoaDonVaoTrang(data);

    window.dongPopupMoHoaDonCu?.();
    return true;

  } catch (e) {
    console.error("Lỗi mở hóa đơn:", e);
    alert("Có lỗi khi mở hóa đơn " + sohd);
    return false;
  }
}

export async function khoiTaoUngDung() {
  showPageLoading("Đang tải dữ liệu...");

  try {

    window.danhMucNhom = window.danhMucNhom instanceof Map ? window.danhMucNhom : new Map();

    console.log("🚀 Khởi động hệ thống sau đăng nhập...");



    // Xác định đang ở trang nào (dựa theo URL)
    const path = (window.location && window.location.pathname) || "";
    const isBannvcs1Page = path.includes("bannvcs1");
    const isBannvcs2Page = path.includes("bannvcs2");

    // === 1. NẾU LÀ TRANG BÁN NHÂN VIÊN CS1 HOẶC CS2 THÌ MỚI CHẠY GUARD MOBILE + VỊ TRÍ ===

    if (ENABLE_LOCATION_GUARD && (isBannvcs1Page || isBannvcs2Page)) {
      // Chỉ cho phép trên điện thoại / tablet
      if (!isMobileDevice()) {
        alert("Ứng dụng bán hàng nhân viên chỉ được dùng trên điện thoại tại cửa hàng.");
        try {
          const app = document.getElementById("app-container");
          const login = document.getElementById("login-container");
          if (app) app.style.display = "none";
          if (login) login.style.display = "";
        } catch (e) {
          console.warn("Không ẩn/hiện được container sau khi chặn thiết bị:", e);
        }
        //return;
      }

      // Chọn tọa độ tùy theo trang
      let inStore = false;
      if (isBannvcs1Page) {
        // CS1 – dùng tọa độ Tích Lương
        inStore = await checkInStoreLocation([
          { lat: 21.5525047, lng: 105.8423559 }
        ]);
      } else if (isBannvcs2Page) {
        // CS2 – dùng tọa độ Lương Ngọc Quyến
        inStore = await checkInStoreLocation([
          { lat: 21.5843348, lng: 105.8343116 }
        ]);
      }

      if (!inStore) {
        try {
          const app = document.getElementById("app-container");
          const login = document.getElementById("login-container");
          if (app) app.style.display = "none";
          if (login) login.style.display = "";
        } catch (e) {
          console.warn("Không ẩn/hiện được container sau khi chặn vị trí:", e);
        }
        return;
      }

    }

    // === TỰ ĐỘNG KIỂM TRA LẠI VỊ TRÍ ĐỊNH KỲ ===  tam ngung
    if (ENABLE_LOCATION_GUARD && (isBannvcs1Page || isBannvcs2Page)) {
      setInterval(async () => {
        let stillInStore = false;

        if (isBannvcs1Page) {
          stillInStore = await checkInStoreLocation([
            { lat: 21.5525047, lng: 105.8423559 }  // CS1
          ]);
        } else if (isBannvcs2Page) {
          stillInStore = await checkInStoreLocation([
            { lat: 21.5843348, lng: 105.8343116 }  // CS2
          ]);
        }

        if (!stillInStore) {
          alert("Bạn đã rời khỏi cửa hàng hoặc tắt GPS! Ứng dụng sẽ thoát.");

          // Tắt app + logout bắt buộc
          try {
            localStorage.removeItem("manv"); // xoá đăng nhập
            const app = document.getElementById("app-container");
            const login = document.getElementById("login-container");
            if (app) app.style.display = "none";
            if (login) login.style.display = "";
          } catch (e) { }

          location.reload(); // tải lại trang → yêu cầu định vị lại
        }
      }, 180000); // kiểm tra mỗi 60 giây (60000 ms)  5 PHUT
    }


    // === 2. GUARD QUYỀN TRUY CẬP TRANG (DÙNG CHUNG CHO TẤT CẢ CÁC TRANG) ===
    const manvDangNhap = localStorage.getItem('manv');           // bạn đã set sau khi login
    const ok = await ensureAccess({ supabase, manv: manvDangNhap });
    if (!ok) return; // bị chặn thì dừng khởi tạo còn lại
    // === HẾT GUARD ===
    // Chỉ bật session-keeper cho nhân viên (warehouse account). 
    // ADMIN đăng nhập bằng tài khoản riêng thì KHÔNG cần gọi /api/login-cs1 => tránh lỗi 401 không cần thiết.
    try {
      const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
      const isAdmin = !!(cu && cu.is_admin);
      if (!isAdmin) startSessionKeeper();
    } catch (e) {
      // nếu localStorage lỗi/parsing lỗi thì vẫn bật như cũ
      startSessionKeeper();
    }

    // === 3. BẮT ĐẦU NHẮC BÀY MẪU (CS1 + CS2, MT + NV) ===
    const isBanLeMTcs1Page = path.includes("banlemtcs1");
    const isBanLeMTcs2Page = path.includes("banlemtcs2");
    const isBanNvcs1Page = path.includes("bannvcs1");
    const isBanNvcs2Page = path.includes("bannvcs2");

    const isBanLePage = isBanLeMTcs1Page || isBanLeMTcs2Page;
    const isBanNvPage = isBanNvcs1Page || isBanNvcs2Page;

    if (isBanLePage || isBanNvPage) {
      // diadiem: cs1 hay cs2 theo trang
      const diadiem =
        (isBanLeMTcs2Page || isBanNvcs2Page) ? "cs2" : "cs1";

      // YÊU CẦU BÀY MẪU: main chỉ khởi tạo module độc lập.
      // Toàn bộ giao diện, dữ liệu, toggle BM, lưu ảnh/ghi chú... nằm trong yeuCauBayMau.js.
      initYeuCauBayMau({
        supabase,
        diadiem,
        manvDangNhap
      });

      initDatHangChuyenKho({
        supabase,
        diadiem,
        manvDangNhap
      });

      // Đặt hàng chuyển kho KHẨN CẤP không khởi tạo tại main.js nữa.
      // Module này được stockQuickPopup tự nạp và tự khởi tạo để chỉ có MỘT nguồn điều khiển.

    }

    if (isBanLePage || isBanNvPage) {
      const pageKind =
        (isBanLeMTcs2Page || isBanNvcs2Page) ? "cs2" : "cs1";

      initPopupChuyenKhoContext({
        pageKind,
        manvDangNhap
      });
    }
    // === HẾT PHẦN NHẮC BÀY MẪU ===



    const { data: dssp, error } = await supabase.from("dmhanghoa").select("*");
    if (error) {
      alert("Lỗi khi tải danh mục hàng hóa");
      console.error(error);
      // KHÔNG return; vẫn tiếp tục để còn nạp dmnhomhang
      window.sanPhamData = {};  // vẫn thiết lập biến rỗng để phần khác không vấp
    } else {
      window.sanPhamData = {};
      dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);
    }

    window.sanPhamData = {};
    dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);

    const { data: dsnv, error: errnv } = await supabase.from("dmnhanvien").select("manv, tennv");
    if (!errnv) {
      window.nhanVienData = {};
      dsnv.forEach(nv => window.nhanVienData[nv.manv] = nv.tennv);
    }

    // Cache danh mục nhóm hàng
    window.danhMucNhom = new Map();

    async function loadDanhMucNhom() {
      try {
        const { data, error } = await supabase
          .from("dmnhomhang")
          .select("manhom, quanlysize, diadiem");
        if (error) {
          console.error("Lỗi tải dmnhomhang:", error);
          return;
        }
        data.forEach(row => {
          window.danhMucNhom.set(String(row.manhom).toUpperCase(), {
            quanlysize: row.quanlysize,
            diadiem: (row.diadiem || "").toUpperCase()
          });
        });
        console.log("✅ Đã load dmnhomhang:", window.danhMucNhom.size, "nhóm");
      } catch (e) {
        console.error("Exception loadDanhMucNhom:", e);
      }
    }

    await loadDanhMucNhom();

    //khoiTaoTimMaSP(window.sanPhamData);

    window.luuMaSanPhamMoi = () => luuMaSanPhamMoi(window.sanPhamData);
    window.moCauHinhTruong = moCauHinhTruong;
    window.luuCauHinhTruong = luuCauHinhTruong;
    window.moBangDanhMucHangHoa = moBangDanhMucHangHoa;
    window.timLaiTrongBangDM = timLaiTrongBangDM;
    window.chonDongDeSua = chonDongDeSua;
    window.moPopupNhapHangHoa = moPopupNhapHangHoa;
    window.luuHangHoa = luuHangHoa;
    window.themTiepSanPham = themTiepSanPham;
    window.luuHoaDonQuaAPI = luuHoaDonQuaAPI;
    window.luuHoaDonCaHaiBan = luuHoaDonCaHaiBan;
    window.xacNhanSuaHoaDon = xacNhanSuaHoaDon;

    khoiTaoShortcut();
    ganSuKienDuyetHoaDon();
    ganSuKienNutLenh();
    khoaOsoHoaDonVaTaoPopupDungChung();

    ["masp", "soluong", "size"].forEach(id => {
      const input = document.getElementById(id);
      if (input) input.addEventListener("keydown", chuyenFocus);
    });

    const manvInput = document.getElementById("manv");
    if (manvInput) manvInput.addEventListener("change", ganTenNV);

    document.getElementById("chietkhau")?.addEventListener("blur", () => {
      capNhatThongTinTong(getBangKetQua());
    });

    document.getElementById("khachtra")?.addEventListener("input", (e) => {
      e.target.dataset.modified = true;
      capNhatThongTinTong(getBangKetQua());
    });

    // ================== MỚI: đọc tham số trên URL để auto mở hóa đơn ==================
    const urlParams = new URLSearchParams(window.location.search || "");
    const sohdUrl = urlParams.get("sohd");
    const diadiemUrl = urlParams.get("diadiem");

    // Nếu link truyền sẵn địa điểm (cs1/cs2) thì khóa lại luôn cho đúng
    if (diadiemUrl) {
      const csSelect = document.getElementById("diadiem");
      if (csSelect) {
        csSelect.value = diadiemUrl;
        csSelect.disabled = true;
      }
      localStorage.setItem("diadiem", diadiemUrl);
    }

    if (sohdUrl) {
      const okMoHd = await moHoaDonTrucTiepTrenTrang(sohdUrl);

      if (!okMoHd) {
        document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
        await capNhatSoHoaDonTuDong();
      }
    } else {
      // ===== TRƯỜNG HỢP HÓA ĐƠN MỚI (luồng cũ) =====
      window.dangXemHoaDon = false;
      document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
      await capNhatSoHoaDonTuDong();

      const st = document.getElementById("hd_state");
      if (st) st.value = "moi";
      window.HD_CTX = { mode: "NEW", version: null };
      window.choPhepSua = true;
      window.dangSuaHoaDon = false;

    }

    // Focus + autocomplete luôn dùng cho cả 2 trường hợp
    document.getElementById("masp").focus();
    initAutocompleteRealtimeMasp();

    // Gắn nút chuyển dạng bảng
    const btnChuyen = document.getElementById("btnChuyenBang");
    if (btnChuyen) {
      import('./bangketqua.js').then(mod => {
        btnChuyen.addEventListener("click", () => mod.toggleBangKetQua());
      });
    }

    // ===== NÚT CCN: gọi popup chuyển kho thủ công =====
    const btnCCN = document.getElementById("btnCCN");
    if (btnCCN && !btnCCN.dataset.boundPopupCcn) {
      btnCCN.dataset.boundPopupCcn = "1";
      btnCCN.addEventListener("click", () => {
        try {
          console.log("[CK Popup] trigger từ nút CCN");
          triggerChuyenKhoCheckNgay();
        } catch (e) {
          console.error("[CK Popup] lỗi khi bấm nút CCN:", e);
        }
      });
    }

    // Helper: lấy mã gốc, bỏ hậu tố (xx) nếu có, chuẩn hoá IN HOA
    function layMaspGoc(str) {
      return String(str || "")
        .toUpperCase()
        .replace(/\(\d+\)\s*$/, "") // bỏ "(12)" ở cuối, nếu có
        .trim();
    }

    // === OPEN BÁO CÁO CHI TIẾT 111 THEO MÃ SP (dùng chung) ===
    window.openBaoCaoChiTiet111ByMasp = function (masp) {
      const maspClean = layMaspGoc(masp);
      if (!maspClean) return;

      // mở cùng domain hiện tại
      const url = `${window.location.origin}/baocaochitiet111.html?masp=${encodeURIComponent(maspClean)}`;
      window.open(url, "_blank");
    };

    async function hienThiAnhSanPhamTuMasp() {
      const imgEl = document.querySelector(".product-image");
      if (!imgEl) return;

      // Ưu tiên lấy từ ô masp; nếu rỗng thì fallback masp_last
      const rawInput = document.getElementById("masp")?.value || "";
      const raw = rawInput.trim() || (window.masp_last || "");
      if (!raw) return;

      const masp = layMaspGoc(raw);       // ✅ dùng mã gốc, không dính (xx)
      const extension = ".JPG";            // ✅ luôn IN HOA như quy ước của bạn
      const base =
        "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham";

      const url = `${base}/${masp}${extension}`;

      // Tránh reload ảnh không cần thiết nếu cùng URL
      if (imgEl.getAttribute("src") !== url) {
        imgEl.src = url;
      }

      imgEl.onerror = () => {
        imgEl.onerror = null; // tránh vòng lặp nếu fallback cũng lỗi
        imgEl.src = `${base}/NO-IMAGE.JPG`;
      };
    }

    // Đảm bảo cho biến global dùng được ở bangketqua.js
    window.hienThiAnhSanPhamTuMasp = hienThiAnhSanPhamTuMasp;

    // Gán sự kiện khi nhập xong
    const maspInput = document.getElementById("masp");
    if (maspInput) {
      maspInput.addEventListener("blur", hienThiAnhSanPhamTuMasp);
      maspInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          hienThiAnhSanPhamTuMasp();
        }
      });
    }

    const soluongInput = document.getElementById("soluong");

    if (soluongInput) {
      soluongInput.addEventListener("input", (e) => {
        const val = soluongInput.value;

        // Nếu không phải số hoặc số > 100
        if (!/^\d*$/.test(val) || parseInt(val, 10) > 100) {
          alert("Chỉ được phép nhập số nhỏ hơn 100!");
          soluongInput.focus();
          soluongInput.select(); // Bôi đen toàn bộ nội dung để nhập lại
          return;
        }
      });

      // Nếu người dùng bỏ trống khi blur → gán mặc định 1
      soluongInput.addEventListener("blur", () => {
        const val = soluongInput.value.trim();
        if (val === "" || parseInt(val, 10) === 0) {
          soluongInput.value = "1";
        }
      });
    }


    // Đảm bảo ô cơ sở luôn hiển thị đúng và bị khóa không đổi
    const cs = localStorage.getItem("diadiem");
    const csSelect = document.getElementById("diadiem");
    if (cs && csSelect) {
      csSelect.value = cs;
      csSelect.disabled = true; // Không cho đổi
    }

    // 1. Hàm tải lại danh mục sản phẩm
    window.taiLaiSanPhamData = async function () {
      const { data, error } = await window.supabase
        .from('dmhanghoa')
        .select('*');
      if (error) {
        alert('Không tải được danh mục hàng hóa!');
        return;
      }
      window.sanPhamData = {};
      dssp.forEach(sp => {
        const key = String(sp.masp || "").toUpperCase().trim();
        window.sanPhamData[key] = sp;
      });
      //alert('✅ Đã tải lại danh mục sản phẩm!');
    };

    // 2. Gắn F1 toàn trang (hoặc giới hạn theo vùng nhập liệu tuỳ ý)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'F1') {
        e.preventDefault();
        window.taiLaiSanPhamData();
      }
    });

    document.getElementById('btnReloadSP').onclick = window.taiLaiSanPhamData;
    // Chèn cuối khoiTaoUngDung()
    loadQuickActionState();
    ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", saveQuickActionState);
    });

    // Tải danh sách size từ Supabase về cache global
    const { data: dsSize, error: errSize } = await supabase.from("dm_size").select("size");
    if (!errSize && dsSize) {
      // Lưu danh sách size (toàn bộ giá trị, ép về string)
      window.danhMucSize = dsSize.map(row => String(row.size).trim());
    } else {
      window.danhMucSize = []; // fallback rỗng nếu có lỗi
    }

    // Gán 3 hàm toàn cục để các module khác gọi như cũ
    window.soundSuccess = playSuccessBeep;
    window.soundWaitSize = playWaitSizeBeep;
    window.soundAlert = playAlertBeep;


    // Tạo scanner, gắn callback khi đọc được mã
    const videoEl = document.getElementById("scanVideo");
    const statusEl = document.getElementById("scanStatus");
    const selectEl = document.getElementById("cameraSelect");
    const flashBtn = document.getElementById("flashBtn");
    const fileInput = document.getElementById("pickImage");

    const { startScan, stopScan, toggleTorch, changeCamera, decodeFromFile } = setupScanner({
      videoEl, statusEl, selectEl,
      onResult: (code) => {
        if (!code) return;
        showFlash();
        showToast(`✅ Đã quét: ${code}`, "info");
        try { window.soundSuccess?.(); } catch { }

        const maspInput = document.getElementById("masp");
        maspInput.value = code;
        maspInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        document.getElementById("popupScan").style.display = "none";
        stopScan();
      }
    });

    // mở popup & mặc định chọn Ultra-Wide/0.5x nếu có
    // mở popup & mặc định chọn Ultra-Wide/0.5x nếu có
    const btnScan = document.createElement("button");

    btnScan.innerHTML = "📷 QUÉT";

    btnScan.type = "button";
    btnScan.id = "btnScanQuick";

    btnScan.style.cssText = `
background:#2196f3;
color:white;
font-weight:bold;
border:none;
border-radius:8px;
padding:0 12px;
font-size:18px;
height:34px;
`;
    btnScan.onclick = () => {
      document.getElementById("popupScan").style.display = "block";
      startScan();
    };

    // Gắn nút quét vào giao diện mới nếu có
    const scanHost =
      document.querySelector(".mobile-mini-actions") ||
      document.querySelector(".top-inputs");

    if (scanHost) {
      scanHost.appendChild(btnScan);
    } else {
      console.warn("Không tìm thấy chỗ để gắn nút quét.");
    }

    document.getElementById("btnCloseScan").onclick = () => {
      document.getElementById("popupScan").style.display = "none";
      stopScan();
    };

    // bật/tắt đèn
    flashBtn.onclick = async () => {
      const on = await toggleTorch();
      flashBtn.textContent = on ? "🔦 Tắt đèn" : "🔦 Đèn";
    };

    // đổi camera từ dropdown
    selectEl.onchange = () => changeCamera(selectEl.value);

    // ảnh có sẵn
    fileInput.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) decodeFromFile(f);
    };

    // === TỒN KHO TỨC THÌ: Observer + batch RPC (KHÔNG đụng code render cũ) ===
    {
      const tbody = document.querySelector('#bangketqua tbody');
      if (!tbody) {
        console.warn('Không thấy #bangketqua tbody');
        return; // tránh lỗi ở các trang không có bảng này
      }

      // === DOUBLE CLICK CỘT MÃ SP (CỘT 1) => MỞ BÁO CÁO 111 ===
      tbody.addEventListener("dblclick", (e) => {
        const td = e.target.closest("td");
        if (!td) return;

        const tr = td.closest("tr");
        if (!tr) return;

        // kiểm tra đúng cột đầu tiên (cột Mã hàng)
        const cellIndex = Array.from(tr.children).indexOf(td);
        if (cellIndex !== 0) return;

        const masp = td.textContent?.trim();
        if (!masp) return;

        // tránh “ăn” vào các click khác của dòng
        e.preventDefault();
        e.stopPropagation();

        window.openBaoCaoChiTiet111ByMasp(masp);
      });

      const memo = new Map(); // cache theo key "MASP|SIZE"
      let queue = new Map();
      let batchTimer = null;

      function keyOf(masp, size) {
        return (String(masp || '').toUpperCase() + '|' + String(size || '').trim());
      }

      function scheduleBatch() {
        if (batchTimer) return;
        batchTimer = setTimeout(async () => {
          const items = Array.from(queue.values());
          queue.clear(); batchTimer = null;
          if (!items.length) return;

          // Lấy mảng MASP (upper) cho RPC (giữ đúng format que hàm cũ/wrapper)
          const maspSet = new Set(items.map(it => String(it.masp || '').toUpperCase()));
          const masp_list = Array.from(maspSet);

          // Gọi RPC gọn cột (wrapper mới)
          const { data, error } = await window.supabase.rpc('timton_hientai_v2', { masp_list });
          if (error) {
            console.error('RPC ton nhanh lỗi:', error);
            // Đổ lỗi nhẹ vào ô
            items.forEach(({ row }) => {
              const cs1 = row.querySelector('td[data-col="ton_cs1"]'); if (cs1) cs1.textContent = '…';
              const cs2 = row.querySelector('td[data-col="ton_cs2"]'); if (cs2) cs2.textContent = '…';
            });
            return;
          }

          // Map kết quả theo key "MASP|SIZE"
          const resultMap = new Map();
          (data || []).forEach(r => {
            const k = keyOf(r.masp, r.size);
            resultMap.set(k, { ton_cs1: r.ton_cs1 || 0, ton_cs2: r.ton_cs2 || 0 });
          });

          // Điền số vào từng dòng; ghi memo
          items.forEach(({ masp, size, row }) => {
            const k = keyOf(masp, size);
            const val = resultMap.get(k) || { ton_cs1: 0, ton_cs2: 0 };
            memo.set(k, val);

            const cs1 = row.querySelector('td[data-col="ton_cs1"]');
            const cs2 = row.querySelector('td[data-col="ton_cs2"]');
            if (cs1) cs1.textContent = val.ton_cs1;
            if (cs2) cs2.textContent = val.ton_cs2;
          });
        }, 80); // gom trong ~80ms cho 1-3 mã/lượt
      }

      function ensureTds(row) {
        // Nếu chưa có 2 ô tồn → append vào cuối hàng
        if (!row.querySelector('td[data-col="ton_cs1"]')) {
          const td1 = document.createElement('td'); td1.dataset.col = 'ton_cs1'; td1.textContent = '…';
          row.appendChild(td1);
        }
        if (!row.querySelector('td[data-col="ton_cs2"]')) {
          const td2 = document.createElement('td'); td2.dataset.col = 'ton_cs2'; td2.textContent = '…';
          row.appendChild(td2);
        }
      }

      function pickCellText(row, idx) {
        const c = row.cells[idx];
        return c ? c.textContent.trim() : '';
      }

      function handleRow(row) {
        // Cột hiện có theo thead: 0 Mã hàng, 1 Tên, 2 Kích cỡ, 3 SL, 4 ĐVT, 5 Đơn giá, 6 KM, 7 Thành tiền, 8 Vị trí
        const masp = pickCellText(row, 0).toUpperCase();
        const size = pickCellText(row, 2);
        if (!masp) return;

        const cardCell = row.cells[0] || row; // ưu tiên ô "Mã hàng"

        // 🔹 GẮN POPUP TỒN/BÁN NHANH THEO MÃ – chỉ gắn 1 lần/dòng
        if (
          window.StockQuick &&
          typeof window.StockQuick.attach === "function" &&
          !row.dataset.stockQuickBound
        ) {
          cardCell.classList.add("card");
          window.StockQuick.attach(cardCell, masp);
          row.dataset.stockQuickBound = "1";
        }

        // 🔹 Phần tồn kho tức thì – GIỮ NGUYÊN như cũ
        ensureTds(row);
        const k = keyOf(masp, size);

        if (memo.has(k)) {
          const val = memo.get(k);
          const cs1 = row.querySelector('td[data-col="ton_cs1"]');
          const cs2 = row.querySelector('td[data-col="ton_cs2"]');
          if (cs1) cs1.textContent = val.ton_cs1;
          if (cs2) cs2.textContent = val.ton_cs2;
          return;
        }

        queue.set(k, { masp, size, row });
        scheduleBatch();
      }


      document.addEventListener("keydown", (e) => {
        // tránh xóa khi đang gõ trong input
        const tag = (e.target.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || e.isComposing) return;

        if (e.key === "Delete") {
          e.preventDefault();
          try { xoaDongDangChon(); } catch (err) { console.warn(err); }
        }
      });

      // Quan sát thêm dòng mới hoặc cập nhật nội dung dòng
      if (tbody) {
        const mo = new MutationObserver(muts => {
          muts.forEach(m => {
            m.addedNodes.forEach(node => {
              if (node.nodeType === 1 && node.tagName === 'TR') handleRow(node);
            });
            if (m.type === 'childList' && m.target && m.target.tagName === 'TBODY') return;
            // Nếu cell thay đổi (vd sửa size sau khi add)
            if (m.type === 'characterData') {
              const row = m.target.parentElement?.parentElement;
              if (row && row.tagName === 'TR') handleRow(row);
            }
          });
        });
        mo.observe(tbody, { childList: true, subtree: true, characterData: true });
      }
    }

  } finally {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    hidePageLoading();
  }
}


export function setHoaDonState(state) {
  const el = document.getElementById("hd_state");
  if (!el) return;
  const s = String(state || "").toLowerCase();
  el.value = (s === "sua" || s === "xem" || s === "moi") ? s : "moi";
}

export function getHoaDonState() {
  const el = document.getElementById("hd_state");
  return (el?.value || "moi").trim().toLowerCase();
}

// --- Đặt ở cuối file main.js ---
function saveQuickActionState() {
  const states = {
    nhapnhanh: document.getElementById("nhapnhanh")?.checked,
    size45: document.getElementById("size45")?.checked,
    inSauKhiLuu: document.getElementById("inSauKhiLuu")?.checked,
    inKhongHoi: document.getElementById("inKhongHoi")?.checked
  };
  localStorage.setItem("quickActions", JSON.stringify(states));
}

function loadQuickActionState() {
  const states = JSON.parse(localStorage.getItem("quickActions") || '{}');
  if ("nhapnhanh" in states && document.getElementById("nhapnhanh"))
    document.getElementById("nhapnhanh").checked = states.nhapnhanh;
  if ("size45" in states && document.getElementById("size45"))
    document.getElementById("size45").checked = states.size45;
  if ("inSauKhiLuu" in states && document.getElementById("inSauKhiLuu"))
    document.getElementById("inSauKhiLuu").checked = states.inSauKhiLuu;
  if ("inKhongHoi" in states && document.getElementById("inKhongHoi"))
    document.getElementById("inKhongHoi").checked = states.inKhongHoi;
}

// ===== YÊU CẦU BÀY MẪU =====
// Đã tách hoàn toàn sang module /scripts/yeuCauBayMau.js.
// main.js chỉ gọi initYeuCauBayMau(...) trong khoiTaoUngDung().
// Không tạo popup, timer, RPC hay xử lý ảnh bày mẫu trực tiếp tại main nữa.


document.addEventListener("DOMContentLoaded", function () {
  loadQuickActionState();
  ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveQuickActionState);
  });
});
