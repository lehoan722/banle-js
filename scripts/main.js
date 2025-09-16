
import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV, getBangKetQua } from './hoadon.js';
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

// Khởi tạo âm thanh & tạo 2 helper toàn cục
function initSounds() {
  try {
    const success = new Audio('/scripts/success.wav'); 
    const waitsize = new Audio('/scripts/waitsize.wav');

    success.preload = 'auto';
    waitsize.preload = 'auto';

    // Âm lượng gợi ý (0.0 - 1.0). Điều chỉnh theo thực tế cửa hàng.
    success.volume = 0.7;
    waitsize.volume = 0.6;

    // Dùng clone để cho phép phát chồng nếu nhập rất nhanh
    window.soundSuccess = () => {
      const a = success.cloneNode(true);
      a.volume = success.volume;
      a.play().catch(() => { });
    };
    window.soundWaitSize = () => {
      const a = waitsize.cloneNode(true);
      a.volume = waitsize.volume;
      a.play().catch(() => { });
    };
  } catch (e) {
    console.warn('Không khởi tạo được âm thanh:', e);
    window.soundSuccess = () => { };
    window.soundWaitSize = () => { };
  }
}

export async function khoiTaoUngDung() {
  console.log("🚀 Khởi động hệ thống sau đăng nhập...");

  const { data: dssp, error } = await supabase.from("dmhanghoa").select("*");
  if (error) {
    alert("Lỗi khi tải danh mục hàng hóa");
    console.error(error);
    return;
  }

  window.sanPhamData = {};
  dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);

  const { data: dsnv, error: errnv } = await supabase.from("dmnhanvien").select("manv, tennv");
  if (!errnv) {
    window.nhanVienData = {};
    dsnv.forEach(nv => window.nhanVienData[nv.manv] = nv.tennv);
  }

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

  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
  await capNhatSoHoaDonTuDong();
  document.getElementById("masp").focus();
  initAutocompleteRealtimeMasp();

  // Helper: lấy mã gốc, bỏ hậu tố (xx) nếu có, chuẩn hoá IN HOA
  function layMaspGoc(str) {
    return String(str || "")
      .toUpperCase()
      .replace(/\(\d+\)\s*$/, "") // bỏ "(12)" ở cuối, nếu có
      .trim();
  }

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
    data.forEach(sp => {
      window.sanPhamData[sp.masp.toUpperCase()] = sp;
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

  initSounds(); // ✅ khởi tạo âm thanh khi app sẵn sàng

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

document.addEventListener("DOMContentLoaded", function () {
  loadQuickActionState();
  ["nhapnhanh", "size45", "inSauKhiLuu", "inKhongHoi"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveQuickActionState);
  });
});
