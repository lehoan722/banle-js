
import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV, xoaDongDangChon, getBangKetQua, napLaiChiTietHoaDon } from './hoadon.js';
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { ganSuKienDuyetHoaDon } from './duyetHoaDon.js';
import { ganSuKienNutLenh } from './nutLenh.js';
import { khoiTaoShortcut } from './shortcut.js';
import { xacNhanSuaHoaDon, luuHoaDonQuaAPI, luuHoaDonCaHaiBan } from './luuhoadon.js';
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';
import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
import { initAutocompleteRealtimeMasp } from "./autocompleteSPRealtime.js";
import { setupBeepUnlockOnce, playSuccessBeep, playWaitSizeBeep, playAlertBeep } from './soundBeep.js';
import { setupScanner } from './scanner.js';
import { showFlash, showToast } from './feedback.js';
import { ensureAccess } from './auth_guard.js';
import { startSessionKeeper } from "./supabaseClient.js";
import { initPopupChuyenKhoContext, triggerChuyenKhoCheckNgay } from './popupchuyenkho.js';

// ===== GUARD THEO THIẾT BỊ & VỊ TRÍ CỬA HÀNG =====
function isMobileDevice() {
  //const ua = navigator.userAgent || navigator.vendor || window.opera;
  // Các từ khoá phổ biến trên điện thoại / tablet
  //return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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

export async function khoiTaoUngDung() {

  window.danhMucNhom = window.danhMucNhom instanceof Map ? window.danhMucNhom : new Map();

  console.log("🚀 Khởi động hệ thống sau đăng nhập...");



  // Xác định đang ở trang nào (dựa theo URL)
  const path = (window.location && window.location.pathname) || "";
  const isBannvcs1Page = path.includes("bannvcs1");
  const isBannvcs2Page = path.includes("bannvcs2");

  // === 1. NẾU LÀ TRANG BÁN NHÂN VIÊN CS1 HOẶC CS2 THÌ MỚI CHẠY GUARD MOBILE + VỊ TRÍ ===
  if (isBannvcs1Page || isBannvcs2Page) {
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
  if (isBannvcs1Page || isBannvcs2Page) {
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
    }, 300000); // kiểm tra mỗi 60 giây (60000 ms)  5 PHUT
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
    // mode: mt = bán lẻ MT, nv = bán lẻ nhân viên
    const mode = isBanNvPage ? "nv" : "mt";

    // diadiem: cs1 hay cs2 theo trang
    const diadiem =
      (isBanLeMTcs2Page || isBanNvcs2Page) ? "cs2" : "cs1";

    startBayMauReminderLoop({
      diadiem,
      mode,
      manvDangNhap,
    });
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
    // ===== TRƯỜNG HỢP MỞ HÓA ĐƠN CŨ TỪ BÁO CÁO =====
    try {
      // 1. Lấy thông tin header hóa đơn
      const { data: hd, error: errHd } = await supabase
        .from("hoadon_banle")
        .select("*")
        .eq("sohd", sohdUrl)
        .single();

      if (errHd) {
        console.error("Không tìm thấy hóa đơn:", errHd);
        alert("Không tìm thấy hóa đơn " + sohdUrl + ". Hệ thống sẽ tạo hóa đơn mới.");
        // fallback về luồng cũ
        document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
        await capNhatSoHoaDonTuDong();
      } else if (hd) {
        // 2. Đổ dữ liệu header lên form (chỉ set những ô nào có trên trang)
        const ngayInput = document.getElementById("ngay");
        if (ngayInput) {
          if (hd.ngay) ngayInput.value = String(hd.ngay).slice(0, 10);
          else ngayInput.value = new Date().toISOString().slice(0, 10);
        }

        const sohdInput = document.getElementById("sohd");
        if (sohdInput) sohdInput.value = hd.sohd || sohdUrl;

        const ghichuInput = document.getElementById("ghichu");
        if (ghichuInput) ghichuInput.value = hd.ghichu || "";

        const hinhthucttSelect = document.getElementById("hinhthuctt");
        if (hinhthucttSelect && hd.hinhthuctt) hinhthucttSelect.value = hd.hinhthuctt;

        const chietkhauInput = document.getElementById("chietkhau");
        if (chietkhauInput && hd.chietkhau != null) chietkhauInput.value = hd.chietkhau;

        const tongkmInput = document.getElementById("tongkm");
        if (tongkmInput && hd.tongkm != null) tongkmInput.value = hd.tongkm;

        const mathangInput = document.getElementById("mathang");
        if (mathangInput && hd.mathang != null) mathangInput.value = hd.mathang;

        const tongslInput = document.getElementById("tongsl");
        if (tongslInput && hd.tongsl != null) tongslInput.value = hd.tongsl;

        const vitriInput = document.getElementById("vitri");
        if (vitriInput && hd.vitri != null) vitriInput.value = hd.vitri;

        const makhInput = document.getElementById("makh");
        if (makhInput && hd.makh) makhInput.value = hd.makh;

        const khachhangInput = document.getElementById("khachhang");
        if (khachhangInput && hd.khachhang) khachhangInput.value = hd.khachhang;

        const phaithanhtoanInput = document.getElementById("phaithanhtoan");
        if (phaithanhtoanInput && hd.phaithanhtoan != null)
          phaithanhtoanInput.value = hd.phaithanhtoan;

        const khachtraInput = document.getElementById("khachtra");
        if (khachtraInput && hd.khachtra != null)
          khachtraInput.value = hd.khachtra;

        const conlaiInput = document.getElementById("conlai");
        if (conlaiInput && hd.conlai != null)
          conlaiInput.value = hd.conlai;
      }

      // 3. Nạp chi tiết hóa đơn vào bảng
      await napLaiChiTietHoaDon(sohdUrl);

      // ✅ Nếu mở hóa đơn từ URL => luôn là trạng thái XEM
      const st = document.getElementById("hd_state");
      if (st) st.value = "xem";

      // ✅ Đồng bộ cờ chặn sửa (giống duyetHoaDon.js) để tránh vô tình sửa
      window.HD_CTX = { mode: "VIEW", version: hd?.updated_at || null };
      window.choPhepSua = false;
      window.dangSuaHoaDon = false;


    } catch (e) {
      console.error("Lỗi nạp hóa đơn từ URL:", e);
      alert("Có lỗi khi nạp hóa đơn. Hệ thống sẽ tạo hóa đơn mới.");
      document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
      await capNhatSoHoaDonTuDong();
    }
  } else {
    // ===== TRƯỜNG HỢP HÓA ĐƠN MỚI (luồng cũ) =====
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

    // ===== POPUP CHUYỂN KHO: chỉ chạy khi bấm THÊM MỚI -> CÓ =====
  const btnThemMoiCo = document.getElementById("btnThemMoiCo");
  if (btnThemMoiCo && !btnThemMoiCo.dataset.ckPopupBound) {
    btnThemMoiCo.dataset.ckPopupBound = "1";
    btnThemMoiCo.addEventListener("click", () => {
      // để logic thêm mới gốc chạy xong trước rồi mới kiểm tra popup
      setTimeout(() => {
        try {
          triggerChuyenKhoCheckNgay();
        } catch (e) {
          console.error("Lỗi trigger popup chuyển kho:", e);
        }
      }, 500);
    });
  }


  // Gắn nút chuyển dạng bảng
  const btnChuyen = document.getElementById("btnChuyenBang");
  if (btnChuyen) {
    import('./bangketqua.js').then(mod => {
      btnChuyen.addEventListener("click", () => mod.toggleBangKetQua());
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

  // Mở khóa audio trên iOS sau tương tác đầu tiên
  setupBeepUnlockOnce(document);

  // Gán 3 hàm toàn cục để các module khác gọi như cũ
  window.soundSuccess = playSuccessBeep;
  window.soundWaitSize = playWaitSizeBeep;
  window.soundAlert = playAlertBeep;


  // Phát âm cảnh báo mỗi khi gọi alert()
  // Phát âm cảnh báo TRƯỚC, rồi mới mở alert ở tick kế tiếp
  // ✅ Patch alert() CHỈ 1 LẦN để tránh bị bọc lồng nhiều lớp sau mỗi lần logout/login
  (function patchAlertOnce() {
    if (window.__alertBeepPatched) return;         // đã patch rồi thì thôi
    window.__alertBeepPatched = true;

    // lưu alert gốc đúng 1 lần
    if (!window.__nativeAlert) {
      window.__nativeAlert = window.alert.bind(window);
    }
    const nativeAlert = window.__nativeAlert;

    window.alert = function (message) {
      try { window.soundAlert?.(); } catch { }
      setTimeout(() => nativeAlert(String(message ?? "")), 300);
    };
  })();

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
  const btnScan = document.createElement("button");
  btnScan.textContent = "📷 Quét";
  btnScan.onclick = () => {
    document.getElementById("popupScan").style.display = "block";
    startScan(); // startScan() sẽ tự điền dropdown & chọn default Ultra-Wide
  };
  document.querySelector(".top-inputs").appendChild(btnScan);

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

        // PC: cho phép click CẢ DÒNG thì cũng mở popup
        const isTouch =
          "ontouchstart" in window || (navigator && navigator.maxTouchPoints > 0);

        if (!isTouch && typeof window.StockQuick.showFor === "function" &&
          !row.dataset.stockQuickRowClickBound) {

          row.addEventListener("click", () => {
            // chỉ gọi showFor, không toggle, để luôn hiện popup theo dòng đang chọn
            window.StockQuick.showFor(cardCell, masp);
          });

          row.dataset.stockQuickRowClickBound = "1";
        }
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

// =================== BẮT ĐẦU: POPUP NHẮC BÀY MẪU ===================

let bayMauTimer = null;
let bayMauPopupDangMo = false;
// Lưu context hiện tại để dùng lại trong các lần kiểm tra sau
window.__bayMauContext = window.__bayMauContext || null;

/**
 * Gọi RPC lấy danh sách cần bày mẫu
 */
async function fetchBayMauTasks({ diadiem, mode, manvDangNhap }) {
  try {

    const modeForRpc = (mode === "nv") ? "mt" : mode; // NV cũng lấy danh sách kiểu máy tính
    const { data, error } = await supabase.rpc("baymau_get_tasks", {
      p_diadiem: diadiem,
      p_mode: modeForRpc,
      p_manv: null, // không lọc theo nhân viên
    });

    //const { data, error } = await supabase.rpc("baymau_get_tasks", {
    //p_diadiem: diadiem,
    //p_mode: mode,
    // p_manv: mode === "nv" ? manvDangNhap : null, // lọc theo nhân viên
    //});

    if (error) {
      console.error("Lỗi RPC baymau_get_tasks:", error);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error("Lỗi fetchBayMauTasks:", e);
    return [];
  }
}

/**
 * Hiển thị popup nhắc bày mẫu
 * - tasks: danh sách bản ghi từ RPC
 * - context: { diadiem, mode, manvDangNhap }
 */
/**
 * Hiển thị popup nhắc bày mẫu
 * - tasks: danh sách bản ghi từ RPC baymau_get_tasks
 *   (có thêm các field: baymau_note, baymau_admin_confirm_by)
 * - context: { diadiem, mode, manvDangNhap }
 */
function showBayMauPopup(tasks, context) {
  if (!tasks || !tasks.length) return;
  if (bayMauPopupDangMo) return;
  bayMauPopupDangMo = true;

  const rawIsAdmin = (localStorage.getItem("is_admin") || "").toLowerCase();
  const rawSua = (localStorage.getItem("sua_hoadon") || "").toLowerCase();
  const rawXoa = (localStorage.getItem("xoa_hoadon") || "").toLowerCase();
  const rawRole = (localStorage.getItem("role") || "").toLowerCase();

  const isAdmin =
    rawIsAdmin === "true" || rawIsAdmin === "1" ||
    rawSua === "true" || rawSua === "1" ||
    rawXoa === "true" || rawXoa === "1" ||
    rawRole === "admin";



  const currentManv =
    localStorage.getItem("manv") || context.manvDangNhap || "";

  // Tạo overlay mờ để bắt sự kiện click ra ngoài
  const overlay = document.createElement("div");
  overlay.id = "baymau-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.05)",
    zIndex: "9998",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    pointerEvents: "auto",
  });

  // Khối popup chính (ở gần cuối màn hình)
  const box = document.createElement("div");
  box.id = "baymau-popup";
  Object.assign(box.style, {
    marginBottom: "12px",
    minWidth: "320px",
    maxWidth: "650px",
    maxHeight: "60vh",
    background: "#f7e0b3",   // vàng nhạt
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    padding: "8px 10px",
    fontSize: "13px",
    overflow: "auto",
  });

  // Header
  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "4px",
    fontWeight: "600",
  });
  header.innerHTML = `<span>YÊU CẦU BÀY MẪU SP</span>`;

  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";
  Object.assign(btnClose.style, {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
  });
  header.appendChild(btnClose);

  // Bảng nội dung
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";

  const thead = document.createElement("thead");

  const trHead = document.createElement("tr");
  trHead.style.background = "#f4c985";

  function mkTh(text) {
    const th = document.createElement("th");
    th.textContent = text;
    th.style.border = "1px solid #ccc";
    th.style.padding = "4px 6px";
    return th;
  }

  trHead.appendChild(mkTh("bày mẫu"));
  trHead.appendChild(mkTh("mã sp"));
  trHead.appendChild(mkTh("nv bán"));
  trHead.appendChild(mkTh("GHI CHÚ"));

  // Cột X.NHẬN với checkbox tổng
  const thConfirm = mkTh("");
  const chkAllConfirm = document.createElement("input");
  chkAllConfirm.type = "checkbox";
  if (!isAdmin) chkAllConfirm.disabled = true;
  thConfirm.appendChild(chkAllConfirm);
  trHead.appendChild(thConfirm);

  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  // Lưu lại để dùng khi bấm Đóng
  const bayMauCheckboxes = [];
  const noteInputs = [];
  const confirmCheckboxes = [];

  tasks.forEach((row) => {
    const tr = document.createElement("tr");
    tr.style.background = "#fdf1d6";

    // 1. checkbox BÀY MẪU
    const tdCheck = document.createElement("td");
    tdCheck.style.border = "1px solid #ccc";
    tdCheck.style.padding = "4px 6px";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.idCt = row.id_ct;
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);
    bayMauCheckboxes.push(cb);

    // 2. MÃ SP (click = mở popup nhanh)
    const tdMasp = document.createElement("td");
    tdMasp.style.border = "1px solid #ccc";
    tdMasp.style.padding = "4px 6px";
    tdMasp.style.cursor = "pointer";
    tdMasp.style.textAlign = "left";
    tdMasp.textContent = row.masp;
    tdMasp.addEventListener("click", (e) => {
      e.stopPropagation();
      try {
        if (typeof window.stockQuickPopup === "function") {
          window.stockQuickPopup(String(row.masp).toUpperCase());
        } else {
          console.warn("stockQuickPopup chưa được khai báo trên window.");
        }
      } catch (err) {
        console.error("Lỗi gọi stockQuickPopup:", err);
      }
    });
    tr.appendChild(tdMasp);

    // 3. NV BÁN
    const tdNvBan = document.createElement("td");
    tdNvBan.style.border = "1px solid #ccc";
    tdNvBan.style.padding = "4px 6px";
    tdNvBan.textContent = row.nvban || "";
    tr.appendChild(tdNvBan);

    // 4. GHI CHÚ
    const tdNote = document.createElement("td");
    tdNote.style.border = "1px solid #ccc";
    tdNote.style.padding = "2px 4px";
    const inpNote = document.createElement("input");
    inpNote.type = "text";
    inpNote.style.width = "100%";
    inpNote.style.boxSizing = "border-box";
    inpNote.value = row.baymau_note || "";
    inpNote.dataset.idCt = row.id_ct;
    tdNote.appendChild(inpNote);
    tr.appendChild(tdNote);
    noteInputs.push({ input: inpNote, old: row.baymau_note || "" });

    // 5. X.NHẬN (chỉ admin được tick)
    const tdConfirm = document.createElement("td");
    tdConfirm.style.border = "1px solid #ccc";
    tdConfirm.style.textAlign = "center";
    const chkConfirm = document.createElement("input");
    chkConfirm.type = "checkbox";
    chkConfirm.dataset.idCt = row.id_ct;
    chkConfirm.checked = !!row.baymau_admin_confirm_by;
    if (!isAdmin) chkConfirm.disabled = true;
    tdConfirm.appendChild(chkConfirm);
    tr.appendChild(tdConfirm);
    confirmCheckboxes.push(chkConfirm);

    tbody.appendChild(tr);
  });

  // Checkbox tổng cho cột xác nhận
  chkAllConfirm.addEventListener("change", () => {
    if (!isAdmin) return;
    confirmCheckboxes.forEach((chk) => {
      if (!chk.disabled) chk.checked = chkAllConfirm.checked;
    });
  });

  box.appendChild(header);
  box.appendChild(table);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // === Hàm đóng popup: lưu bày mẫu + ghi chú + xác nhận ===
  async function closePopup() {
    try {
      // 1. GHI NHẬN BÀY MẪU (baymau_set_done)
      const idsBayMau = bayMauCheckboxes
        .filter((c) => c.checked)
        .map((c) => Number(c.dataset.idCt))
        .filter((v) => Number.isFinite(v));

      if (idsBayMau.length > 0 && context.manvDangNhap) {
        const { error } = await supabase.rpc("baymau_set_done", {
          p_ids: idsBayMau,
          p_manv: context.manvDangNhap,
        });
        if (error) {
          console.error("Lỗi RPC baymau_set_done:", error);
        }
      }

      // 2. GHI NHẬN GHI CHÚ + XÁC NHẬN ADMIN
      const noteUpdates = [];
      noteInputs.forEach(({ input, old }) => {
        const note = input.value.trim();
        if (note !== (old || "")) {
          noteUpdates.push({
            id_ct: Number(input.dataset.idCt),
            note,
          });
        }
      });

      let confirmIds = [];
      if (isAdmin) {
        confirmIds = confirmCheckboxes
          .filter((c) => c.checked)
          .map((c) => Number(c.dataset.idCt))
          .filter((v) => Number.isFinite(v));
      }

      if (noteUpdates.length > 0 || confirmIds.length > 0) {
        const { error: errNote } = await supabase.rpc(
          "baymau_update_note_and_confirm",
          {
            p_note_updates: noteUpdates,
            p_confirm_ids: confirmIds,
            p_admin: isAdmin ? currentManv : null,
          }
        );
        if (errNote) {
          console.error("Lỗi RPC baymau_update_note_and_confirm:", errNote);
        }
      }
    } catch (e) {
      console.error("Lỗi khi đóng popup bày mẫu:", e);
      alert("Có lỗi khi lưu thông tin bày mẫu, vui lòng thử lại.");
    } finally {
      bayMauPopupDangMo = false;
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }
  }

  // Đóng bằng nút X
  btnClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closePopup();
  });

  // Click ra ngoài box thì đóng
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });
}


/**
 * Hàm kiểm tra 1 lần:
 * - Nếu bảng kết quả đang có dữ liệu => KHÔNG popup
 * - Nếu rảnh => gọi RPC & hiện popup nếu có việc
 */
async function runBayMauCheck(contextOverride) {
  const ctx = contextOverride || window.__bayMauContext;
  if (!ctx) return;

  const { diadiem, mode, manvDangNhap } = ctx;

  // Trang nhân viên mà chưa có mã NV -> bỏ qua
  if (mode === "nv" && !manvDangNhap) return;

  // 1. Nếu bảng kết quả đang có dữ liệu thì KHÔNG nhắc
  try {
    if (typeof getBangKetQua === "function") {
      const bang = getBangKetQua();
      if (bang && Object.keys(bang).length > 0) {
        // đang bán dở -> không gây phiền
        return;
      }
    }
  } catch (e) {
    console.error("Lỗi kiểm tra bảng kết quả trước khi nhắc bày mẫu:", e);
  }

  // 2. Nếu rảnh tay -> gọi RPC
  const tasks = await fetchBayMauTasks({ diadiem, mode, manvDangNhap });
  if (tasks && tasks.length) {
    showBayMauPopup(tasks, ctx);
  }
}

/**
 * Bắt đầu vòng lặp 5 phút kiểm tra bày mẫu
 */
function startBayMauReminderLoop({ diadiem, mode, manvDangNhap }) {
  // Lưu context global
  window.__bayMauContext = { diadiem, mode, manvDangNhap };

  // Chạy 1 lần ngay lập tức
  runBayMauCheck();

  // Clear timer cũ nếu có
  if (bayMauTimer) clearInterval(bayMauTimer);

  // Lặp lại mỗi 5 phút
  bayMauTimer = setInterval(() => runBayMauCheck(), 5 * 60 * 1000);
}

/**
 * Cho phép nơi khác (nút Thêm mới, v.v.) gọi check ngay lập tức
 */
window.triggerBayMauCheckNgay = function () {
  runBayMauCheck();
};

// =================== HẾT: POPUP NHẮC BÀY MẪU ===================


document.addEventListener("DOMContentLoaded", function () {
  loadQuickActionState();
  ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveQuickActionState);
  });
});
