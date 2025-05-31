import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';

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
});

import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';

window.timLaiTrongBangDM = timLaiTrongBangDM;
window.chonDongDeSua = chonDongDeSua;
window.moPopupThemMoiHangHoa = () => {
  alert("🚧 Tính năng Thêm mới chưa được triển khai.");
  // sau này sẽ gọi: moPopupNhapHangHoa({ mode: 'them' });
};

window.moPopupSuaHangHoa = (sp) => {
  alert("🚧 Sửa mã: " + sp.masp + "\nTính năng đang phát triển.");
};

import { moPopupNhapHangHoa, luuHangHoa } from './popupHanghoa.js';

window.moPopupNhapHangHoa = moPopupNhapHangHoa;
window.luuHangHoa = luuHangHoa;

