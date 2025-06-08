
// main.js
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

// Xử lý đăng nhập
async function dangNhap() {
  const username = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value.trim();
  const errBox = document.getElementById("login-error");

  if (!username || !password) {
    errBox.textContent = "Vui lòng nhập đầy đủ!";
    return;
  }

  const { data, error } = await supabase
    .from("dmnhanvien")
    .select("*")
    .eq("manv", username)
    .eq("matkhau", password)
    .single();

  if (error || !data) {
    errBox.textContent = "Sai tên đăng nhập hoặc mật khẩu!";
    return;
  }

  // Ẩn form đăng nhập, hiển thị nội dung chính
  document.getElementById("login-container").style.display = "none";
  document.getElementById("app-container").style.display = "block";

  // Khởi động ứng dụng
  await khoiTaoUngDung();
}


window.addEventListener('DOMContentLoaded', async () => {
  // Tải danh mục sản phẩm từ Supabase
  const { data: dssp, error } = await supabase.from("dmhanghoa").select("*");
  if (error) {
    alert("Lỗi khi tải danh mục hàng hóa");
    console.error(error);
    return;
  }

  window.sanPhamData = {};
  dssp.forEach(sp => window.sanPhamData[sp.masp] = sp);

  // Tải danh sách nhân viên và gán vào window
  const { data: dsnv, error: errnv } = await supabase.from("dmnhanvien").select("manv, tennv");
  if (!errnv) {
    window.nhanVienData = {};
    dsnv.forEach(nv => window.nhanVienData[nv.manv] = nv.tennv);
  }

  khoiTaoTimMaSP(window.sanPhamData);

  // Gán các hàm cho HTML
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

  // Gán phím tắt và sự kiện các nút bấm
  khoiTaoShortcut();
  ganSuKienDuyetHoaDon();
  ganSuKienNutLenh();

  // Gán Enter chuyển focus cho các input chính
  ["masp", "soluong", "size"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keydown", chuyenFocus);
    }
  });

  // Gán tên NV khi đổi mã
  const manvInput = document.getElementById("manv");
  if (manvInput) {
    manvInput.addEventListener("change", ganTenNV);
  }

  // Gán sự kiện tính toán tổng khi blur chiết khấu hoặc nhập khách trả
  document.getElementById("chietkhau")?.addEventListener("blur", () => {
    capNhatThongTinTong(getBangKetQua());
  });

  document.getElementById("khachtra")?.addEventListener("input", (e) => {
    e.target.dataset.modified = true;
    capNhatThongTinTong(getBangKetQua());
  });

  // Gán ngày mặc định và số hóa đơn đầu tiên
  document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
  await capNhatSoHoaDonTuDong();
  document.getElementById("masp").focus();
});
