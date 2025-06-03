// main.js
import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV, getBangKetQua } from './hoadon.js';
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { ganSuKienDuyetHoaDon } from './duyetHoaDon.js';
import { ganSuKienNutLenh } from './nutLenh.js';
import { khoiTaoShortcut } from './shortcut.js';
import { xacNhanSuaHoaDon } from './luuhoadon.js';
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';
import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
import { luuHoaDonQuaAPI } from './luuhoadon.js';

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

// 👨‍💼 Debug: Thống kê danh sách nhân viên
if (danhSachNhanVien && Array.isArray(danhSachNhanVien)) {
  console.group("👨‍💼 Dữ liệu nhân viên đã tải");
  console.log("Tổng số nhân viên:", danhSachNhanVien.length);
  console.groupEnd();
}
