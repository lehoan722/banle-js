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

function formatTimeHHMM(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}


export function ganSuKienNutLenh() {
  document.getElementById("them")?.addEventListener("click", async () => {
    const diadiemVal = localStorage.getItem("diadiem") || document.getElementById("diadiem").value;
    const manvVal = localStorage.getItem("manv") || document.getElementById("manv").value;
    const tennvVal = localStorage.getItem("tennv") || document.getElementById("tennv").value;


    document.querySelectorAll("input").forEach(input => {
      // ✅ Giữ lại cả ô trạng thái hóa đơn
      if (!["diadiem", "manv", "tennv", "hd_state"].includes(input.id)) input.value = "";
    });

    // ✅ Bắt đầu hóa đơn mới => set trạng thái "moi"
    const st = document.getElementById("hd_state");
    if (st) st.value = "moi";

    // ✅ reset cờ sửa để tránh còn sót chế độ sửa từ hóa đơn trước
    window.HD_CTX = { mode: "NEW", version: null };
    window.choPhepSua = false;
    window.dangSuaHoaDon = false;


    resetBangKetQua();
    await capNhatSoHoaDonTuDong();

    // ✅ Sau khi cấp số mới xong, đảm bảo vẫn ở trạng thái "moi"
    const st2 = document.getElementById("hd_state");
    if (st2) st2.value = "moi";

    const now = new Date();

    document.getElementById("diadiem").value = diadiemVal;
    document.getElementById("manv").value = manvVal;
    document.getElementById("tennv").value = tennvVal;
    document.getElementById("ngay").value = now.toISOString().slice(0, 10);

    const gioEl = document.getElementById("gio");
    if (gioEl) {
      gioEl.value = formatTimeHHMM(now);
    }

    document.getElementById("masp").focus();

    // 🔔 Sau khi bắt đầu hóa đơn mới -> nhắc bày mẫu (nếu đang rảnh)
    if (window.triggerBayMauCheckNgay) {
      window.triggerBayMauCheckNgay();
    }

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
    window.open("/in-hoadon-db.html", "_blank");
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
