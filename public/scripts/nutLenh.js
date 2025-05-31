// nutLenh.js
import { resetBangKetQua, getBangKetQua, xoaDongDangChon } from './hoadon.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { luuHoaDonQuaAPI } from './luuhoadon.js';
import { capNhatThongTinTong } from './utils.js';

export function ganSuKienNutLenh() {
  document.getElementById("them")?.addEventListener("click", async () => {
    const diadiemVal = document.getElementById("diadiem").value;
    const manvVal = document.getElementById("manv").value;
    const tennvVal = document.getElementById("tennv").value;

    document.querySelectorAll("input").forEach(input => {
      if (!["diadiem", "manv", "tennv"].includes(input.id)) input.value = "";
    });

    resetBangKetQua();
    await capNhatSoHoaDonTuDong();
    document.getElementById("diadiem").value = diadiemVal;
    document.getElementById("manv").value = manvVal;
    document.getElementById("tennv").value = tennvVal;
    document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
    document.getElementById("masp").focus();
  });

  document.getElementById("luu")?.addEventListener("click", async () => {
    const bang = getBangKetQua();
    if (Object.keys(bang).length === 0) {
      alert("❌ Không có dữ liệu để lưu hóa đơn.");
      return;
    }
    await luuHoaDonQuaAPI();
  });

  document.getElementById("luuapi")?.addEventListener("click", async () => {
    const bang = getBangKetQua();
    if (Object.keys(bang).length === 0) {
      alert("❌ Không có dữ liệu để lưu.");
      return;
    }
    await luuHoaDonQuaAPI();
  });

  document.getElementById("xemin")?.addEventListener("click", () => {
    window.open("/in-hoadon.html", "_blank");
  });

  document.getElementById("xuatexcel")?.addEventListener("click", () => {
    alert("🔧 Chức năng xuất Excel sẽ được tích hợp sau.");
  });

  document.getElementById("timkiem")?.addEventListener("click", () => {
    window.open("https://banle-js.vercel.app/xemhoadon.html", "_blank");
  });

  document.getElementById("xoa")?.addEventListener("click", () => {
    xoaDongDangChon();
  });

  document.getElementById("btnThemMoiCo")?.addEventListener("click", () => {
    document.getElementById("popupThemMoi").style.display = "none";
    document.getElementById("them").click();
  });

  document.getElementById("quaylai")?.addEventListener("click", () => {
    // sự kiện duyệt đã nằm trong duyetHoaDon.js
  });

  document.getElementById("tieptuc")?.addEventListener("click", () => {
    // sự kiện duyệt đã nằm trong duyetHoaDon.js
  });
}
