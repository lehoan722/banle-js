import { khoiTaoTimMaSP, luuMaSanPhamMoi, moCauHinhTruong, luuCauHinhTruong } from './sanpham.js';
import { chuyenFocus, ganTenNV } from './hoadon.js';
import { capNhatBangHTML, resetFormBang } from './bangketqua.js';
import { capNhatThongTinTong } from './utils.js';
import { supabase } from './supabaseClient.js';
import { moBangDanhMucHangHoa, timLaiTrongBangDM, chonDongDeSua } from './banghanghoa.js';
import { moPopupNhapHangHoa, luuHangHoa, themTiepSanPham } from './popupHanghoa.js';
import { luuHoaDonQuaAPI, xacNhanSuaHoaDon } from './luuhoadon.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { khoiTaoShortcut } from './shortcut.js';
import { ganSuKienDuyetHoaDon } from './duyetHoaDon.js';


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
  window.moBangDanhMucHangHoa = moBangDanhMucHangHoa;
  window.timLaiTrongBangDM = timLaiTrongBangDM;
  window.chonDongDeSua = chonDongDeSua;
  window.moPopupNhapHangHoa = moPopupNhapHangHoa;
  window.luuHangHoa = luuHangHoa;
  window.themTiepSanPham = themTiepSanPham;
  window.luuHoaDonQuaAPI = luuHoaDonQuaAPI;
window.xacNhanSuaHoaDon = xacNhanSuaHoaDon;

 
const btnXacNhanSua = document.getElementById("xacNhanSuaHoaDon");
if (btnXacNhanSua) {
  btnXacNhanSua.addEventListener("click", xacNhanSuaHoaDon);
}

await capNhatSoHoaDonTuDong();
document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);

  // ✅ Gán Enter chuyển focus cho các input chính
  ["masp", "soluong", "size"].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("keydown", chuyenFocus);
    }
  });

  // ✅ Gán tên NV khi đổi mã
  const manvInput = document.getElementById("manv");
  if (manvInput) {
    manvInput.addEventListener("change", ganTenNV);
  }
  khoiTaoShortcut(); //
  ganSuKienDuyetHoaDon();

});


