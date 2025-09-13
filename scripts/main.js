
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

  function hienThiAnhSanPhamTuMasp(maspArg) {
    try {
      // Lấy mã SP: ưu tiên tham số, rồi tới #masp, rồi tới window.masp_last
      let maspRaw = maspArg ?? document.getElementById('masp')?.value ?? window.masp_last ?? '';
      maspRaw = String(maspRaw).trim();         // KHÔNG đổi hoa/thường, KHÔNG đổi dấu gạch
      if (!maspRaw) return;

      const fileKey = `${maspRaw}.JPG`;         // Chỉ nối .JPG (IN HOA) như yêu cầu
      const imgEl = document.querySelector('.product-image') || document.getElementById('anhsanpham');
      if (!imgEl) return;

      // Tạo URL ảnh (ưu tiên qua Supabase client nếu có)
      let url;
      if (typeof supabase !== 'undefined' && supabase?.storage) {
        url = supabase.storage.from('anhsanpham').getPublicUrl(fileKey).data.publicUrl;
      } else {
        const base = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
        url = base + encodeURIComponent(fileKey);
      }

      imgEl.src = url;

      // Fallback khi không tồn tại file
      imgEl.onerror = () => {
        imgEl.onerror = null; // tránh vòng lặp
        let fb;
        if (typeof supabase !== 'undefined' && supabase?.storage) {
          fb = supabase.storage.from('anhsanpham').getPublicUrl('NO-IMAGE.JPG').data.publicUrl;
        } else {
          fb = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/NO-IMAGE.JPG';
        }
        imgEl.src = fb;
      };
    } catch (err) {
      console.error('hienThiAnhSanPhamTuMasp error:', err);
    }
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
