// nutLenh.js
import {
  resetBangKetQua,
  getBangKetQua,
  xoaDongDangChon
} from './hoadon.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
import { luuHoaDonQuaAPI } from './luuhoadon.js';
import { capNhatThongTinTong } from './utils.js';
import { napLaiChiTietHoaDon } from './hoadon.js';

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
  

  // Gắn lại sự kiện cho nút "xemin"
  document.getElementById("xemin")?.addEventListener("click", async () => {
    const sohd = document.getElementById("sohd").value.trim();
    if (!sohd) {
      alert("❌ Bạn chưa nhập số hóa đơn cần in.");
      return;
    }
    // Truy vấn chi tiết hóa đơn từ Supabase về
    await napLaiChiTietHoaDon(sohd);

    // Lấy lại dữ liệu vừa nạp
    const { getBangKetQua } = await import('./hoadon.js');
    const bang = getBangKetQua();

    // Lấy các thông tin hóa đơn (đầy đủ nhất từ DB nếu cần)
    // Nếu cần truy vấn thêm bảng hoadon_banle thì làm như sau:
    const { data: hoadon } = await window.supabase
      .from("hoadon_banle")
      .select("*")
      .eq("sohd", sohd)
      .maybeSingle();

    // Lấy chi tiết:
    const chitiet = [];
    Object.values(bang).forEach(item => {
      item.sizes.forEach((sz, i) => {
        chitiet.push({
          sohd,
          masp: item.masp,
          tensp: item.tensp,
          size: sz,
          soluong: item.soluongs[i],
          gia: item.gia,
          km: item.km,
          thanhtien: (item.gia - item.km) * item.soluongs[i],
          dvt: item.dvt || '',
          diadiem: hoadon?.diadiem || "",
        });
      });
    });

    // Lưu vào localStorage như logic in bình thường
    localStorage.setItem("data_hoadon_in", JSON.stringify({ hoadon, chitiet }));

    // Mở tab in hóa đơn (hoặc reload lại nếu đã mở)
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
    // đã gán trong duyetHoaDon.js
  });

  document.getElementById("tieptuc")?.addEventListener("click", () => {
    // đã gán trong duyetHoaDon.js
  });
}
