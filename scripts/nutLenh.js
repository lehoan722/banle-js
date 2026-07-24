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

import {
  huyPhienChuaLuu,
  taoAuditSessionMoi
} from './banleAudit.js';

function resetTrangThaiZaloKhachHang() {
  if (typeof window.resetZaloJoinedUI === "function") {
    window.resetZaloJoinedUI();
    return;
  }

  const zaloCb = document.getElementById("zalo_da_vao_nhom");
  const zaloText = document.getElementById("zalo_joined_text");

  if (zaloCb) {
    zaloCb.checked = false;
    zaloCb.disabled = true;
  }

  if (zaloText) {
    zaloText.textContent = "chưa vào";
    zaloText.style.color = "#666";
    zaloText.style.fontWeight = "normal";
  }
}

function formatTimeHHMM(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}


export function ganSuKienNutLenh() {
  document.getElementById("them")?.addEventListener("click", async () => {

    // ===== AUDIT V2: kiểm tra hóa đơn hiện tại trước khi tạo mới =====
    const bangHienTai = getBangKetQua() || {};
    const coSanPham =
      Object.keys(bangHienTai).length > 0;

    /*
     * Cờ này được luuHoaDonEntry.js đặt thành true
     * sau khi hóa đơn đã lưu thành công.
     */
    const hoaDonVuaLuu =
      window.__AUDIT_HOA_DON_VUA_LUU === true;

    /*
     * Có sản phẩm nhưng chưa lưu:
     * bắt nhập lý do trước khi bỏ hóa đơn.
     */
    if (coSanPham && !hoaDonVuaLuu) {
      const lydo = prompt(
        "Hóa đơn hiện tại có sản phẩm nhưng chưa được lưu.\n\n" +
        "Hãy nhập lý do bỏ hóa đơn:",
        "Khách không mua"
      );

      if (!lydo || !lydo.trim()) {
        alert(
          "❌ Phải nhập lý do mới được tạo hóa đơn mới."
        );
        return;
      }

      try {
        await huyPhienChuaLuu(
          JSON.parse(
            JSON.stringify(bangHienTai)
          ),
          lydo.trim(),
          "BUTTON_THEM_MOI"
        );
      } catch (error) {
        console.error(
          "[AUDIT V2] Không ghi được phiên bỏ hóa đơn:",
          error
        );

        const tiepTuc = confirm(
          "⚠️ Chưa ghi được nhật ký bỏ hóa đơn.\n\n" +
          "Bạn vẫn muốn tạo hóa đơn mới?"
        );

        if (!tiepTuc) return;
      }
    }

    // Cờ chỉ được dùng một lần
    window.__AUDIT_HOA_DON_VUA_LUU = false;

    const diadiemVal = localStorage.getItem("diadiem") || document.getElementById("diadiem").value;
    const manvVal = localStorage.getItem("manv") || document.getElementById("manv").value;
    const tennvVal = localStorage.getItem("tennv") || document.getElementById("tennv").value;
    resetTrangThaiZaloKhachHang();

    const giuNguyenKhiThemMoi = [
      "diadiem",
      "manv",
      "tennv",
      "hd_state",

      // Khu vực thao tác nhanh - không reset
      "nhapnhanh",
      "size45",
      "bansieunhanh",
      "quanlysizetheonhom",
      "inNhanh",
      "hienthihinhanh",
      "nhapsize",
      "quanlysizetheogia"
    ];

    document.querySelectorAll("input").forEach(input => {
      if (giuNguyenKhiThemMoi.includes(input.id)) return;

      if (input.type === "checkbox") {
        input.checked = false;
        return;
      }

      input.value = "";
    });

    resetTrangThaiZaloKhachHang();

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

    // ===== AUDIT V2: tạo phiên riêng cho hóa đơn mới =====
    try {
      await taoAuditSessionMoi(
        hoaDonVuaLuu
          ? "AFTER_SAVE_NEW_INVOICE"
          : "BUTTON_NEW_INVOICE"
      );
    } catch (error) {
      console.warn(
        "[AUDIT V2] Không tạo được phiên hóa đơn mới:",
        error
      );
    }

    document.getElementById("masp").focus();

    // 🔔 Sau khi bắt đầu hóa đơn mới -> nhắc bày mẫu (nếu đang rảnh)
    if (window.triggerBayMauCheckNgay) {
      window.triggerBayMauCheckNgay();
    }

    // 🔔 Sau khi bắt đầu hóa đơn mới -> nhắc đặt hàng chuyển kho
    if (window.DatHangChuyenKho?.triggerCheck) {
      window.DatHangChuyenKho.triggerCheck();
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
    window.open("/in-hoadon.html", "_blank");
  });


  document.getElementById("xuatexcel")?.addEventListener("click", () => {
    alert("🔧 Chức năng xuất Excel sẽ được tích hợp sau.");
  });

  document.getElementById("timkiem")?.addEventListener("click", () => {
    window.open("https://app.hoantuyet.vn/xemhoadon.html", "_blank");
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
