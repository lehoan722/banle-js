
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

   async function hienThiAnhSanPhamTuMasp() {
  const masp = document.getElementById('masp').value.trim().toUpperCase();
  if (!masp) return;

  const imgEl = document.querySelector('.product-image');
  const url = `https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/${masp}.jpg`;
  imgEl.src = url;
  imgEl.onerror = () => {
    imgEl.src = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/no-image.jpg';
  };
 }

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
  soluongInput.addEventListener("input", () => {
    // Chỉ giữ lại chữ số
    let val = soluongInput.value.replace(/[^0-9]/g, "");

    if (val === "") return;

    // Giới hạn tối đa 100
    let num = parseInt(val, 10);
    if (num > 100) num = 100;

    soluongInput.value = num;
  });

  soluongInput.addEventListener("blur", () => {
    let val = soluongInput.value.trim();
    if (val === "" || parseInt(val, 10) === 0) {
      soluongInput.value = "1";
    }
  });
 }


}
