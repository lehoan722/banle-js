
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

  // Thay thế NGUYÊN hàm hienThiAnhSanPhamTuMasp hiện có bằng bản vá an toàn sau:
async function hienThiAnhSanPhamTuMasp(maspArg) {
  try {
    // 1) Lấy masp từ tham số / #masp / masp_last, rồi chuẩn hóa in hoa
    let masp = (maspArg ?? document.getElementById('masp')?.value ?? window.masp_last ?? '').trim();
    if (!masp) return;
    masp = masp.toUpperCase();

    // 2) Xác định phần tử <img> để hiển thị
    const imgEl = document.querySelector('.product-image') || document.getElementById('anhsanpham');
    if (!imgEl) return;

    // 3) Cache nhẹ để hạn chế HEAD lặp lại
    window._anhSPCache = window._anhSPCache || {};
    const bucket = 'anhsanpham';

    // 4) Các biến thể tên file thử lần lượt (đủ .jpg/.jpeg/.png và -AP)
    const candidates = [
      `${masp}-AP.jpg`, `${masp}-AP.JPG`,
      `${masp}.jpg`, `${masp}.JPG`,
      `${masp}-AP.jpeg`, `${masp}.jpeg`,
      `${masp}-AP.png`, `${masp}.png`,
    ];

    // 5) Fallback ảnh mặc định (thử vài biến thể tên)
    const fallbacks = ['NO-IMAGE.JPG', 'no-image.jpg', 'no-image.png'];

    // Helper: kiểm tra tồn tại URL bằng HEAD; nếu bucket private, thử signed URL
    const checkUrl = async (key) => {
      // Ưu tiên URL public
      const pub = supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl;
      try {
        const r = await fetch(pub, { method: 'HEAD' });
        if (r.ok) return pub;

        // Nếu private (401/403), thử tạo signed url (yêu cầu policy storage cho phép)
        if ([401, 403].includes(r.status)) {
          const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(key, 60);
          if (signed?.signedUrl) {
            const r2 = await fetch(signed.signedUrl, { method: 'HEAD' });
            if (r2.ok) return signed.signedUrl;
          }
        }
      } catch (_) { /* bỏ qua lỗi mạng tạm thời */ }
      return null;
    };

    // 6) Dùng cache nếu có
    for (const key of candidates) {
      if (window._anhSPCache[key]) {
        imgEl.src = window._anhSPCache[key];
        return;
      }
    }

    // 7) Thử lần lượt các biến thể file
    for (const key of candidates) {
      const url = await checkUrl(key);
      if (url) {
        window._anhSPCache[key] = url;
        imgEl.src = url;
        return;
      }
    }

    // 8) Không thấy → thử fallback mặc định
    for (const fb of fallbacks) {
      const url = await checkUrl(fb);
      if (url) {
        imgEl.src = url;
        return;
      }
    }

    // 9) Chốt hạ: nếu vẫn không có gì, thôi bỏ onerror để tránh vòng lặp
    imgEl.onerror = null;
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
