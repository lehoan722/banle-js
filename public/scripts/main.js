import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV } from './hoadon.js';

import { supabase } from './supabaseClient.js';

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

  // Gắn các hàm cần gọi từ HTML
  window.luuMaSanPhamMoi = () => luuMaSanPhamMoi(window.sanPhamData);
  window.moCauHinhTruong = moCauHinhTruong;
  window.luuCauHinhTruong = luuCauHinhTruong;
    // ✅ Gán Enter chuyển focus cho các input chính
  ["masp", "soluong", "size"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keydown", chuyenFocus);
    }
  });

  // ✅ Tự động gán tên nhân viên khi đổi mã
  const manvInput = document.getElementById("manv");
  if (manvInput) {
    manvInput.addEventListener("change", ganTenNV);
  }

});

import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';

window.timLaiTrongBangDM = timLaiTrongBangDM;
window.chonDongDeSua = chonDongDeSua;



import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
window.moPopupNhapHangHoa = moPopupNhapHangHoa;
window.luuHangHoa = luuHangHoa;
window.themTiepSanPham = themTiepSanPham;

