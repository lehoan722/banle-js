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
  // Gắn sự kiện cho nút "Xem in"
  // Dùng được cho:
  // 1. Hóa đơn mới đã có snapshot tài khoản
  // 2. Hóa đơn cũ chưa có snapshot: tự tìm lại cấu hình tài khoản
  document.getElementById("xemin")?.addEventListener("click", async () => {
    try {
      const sohd = String(
        document.getElementById("sohd")?.value || ""
      ).trim();

      if (!sohd) {
        alert("❌ Bạn chưa nhập số hóa đơn cần in.");
        return;
      }

      if (!window.supabase) {
        alert("❌ Chưa kết nối được cơ sở dữ liệu.");
        return;
      }

      // =====================================================
      // 1. NẠP CHI TIẾT HÓA ĐƠN VÀO BẢNG GIAO DIỆN
      // =====================================================
      await napLaiChiTietHoaDon(sohd);

      const { getBangKetQua } = await import("./hoadon.js");
      const bang = getBangKetQua() || {};

      // =====================================================
      // 2. ĐỌC HÓA ĐƠN GỐC TỪ DATABASE
      // =====================================================
      const { data: hoadon, error: hdError } = await window.supabase
        .from("hoadon_banle")
        .select("*")
        .eq("sohd", sohd)
        .maybeSingle();

      if (hdError) {
        console.error("❌ Lỗi đọc hóa đơn:", hdError);
        alert("❌ Không đọc được dữ liệu hóa đơn.");
        return;
      }

      if (!hoadon) {
        alert("❌ Không tìm thấy hóa đơn " + sohd);
        return;
      }

      // =====================================================
      // 3. TẠO OBJECT TÀI KHOẢN TỪ SNAPSHOT TRÊN HÓA ĐƠN
      // =====================================================
      let taiKhoanNhanTien = null;

      const snapshotDayDu =
        hoadon.qr_so_tk &&
        hoadon.qr_ten_tk &&
        hoadon.qr_bank_bin &&
        hoadon.qr_bank_label;

      if (snapshotDayDu) {
        taiKhoanNhanTien = {
          id: hoadon.tai_khoan_nhan_id || null,
          dia_diem: hoadon.diadiem || "",
          loai_hoa_don: hoadon.qr_loai_hoa_don || "thuong",
          so_cuoi_hd: null,

          so_tk: hoadon.qr_so_tk,
          ten_hien_thi: hoadon.qr_ten_hien_thi || "",
          ten_tk: hoadon.qr_ten_tk,
          bank_bin: hoadon.qr_bank_bin,
          bank_label: hoadon.qr_bank_label,

          tk_chinh:
            hoadon.qr_nguon_chon === "tai_khoan_chinh",

          nguon_chon:
            hoadon.qr_nguon_chon || "snapshot_hoa_don"
        };
      }

      // =====================================================
      // 4. HÓA ĐƠN CŨ CHƯA CÓ SNAPSHOT:
      //    TỰ XÁC ĐỊNH LOẠI TÀI KHOẢN
      // =====================================================
      if (!taiKhoanNhanTien) {
        const hinhThucTT = String(
          hoadon.hinhthuctt || ""
        ).toLowerCase();

        const laHoaDonDacBiet =
          hoadon.external_send === true ||
          hoadon.save_2_ban === true ||
          hinhThucTT === "tmt";

        const loaiHoaDon = laHoaDonDacBiet
          ? "dac_biet"
          : "thuong";

        const diaDiem = String(
          hoadon.diadiem || ""
        ).trim().toLowerCase();

        const chuoiSo = String(sohd).replace(/\D/g, "");
        const soCuoiHoaDon = chuoiSo
          ? Number(chuoiSo.slice(-1))
          : 0;

        // ===================================================
        // 4A. TÌM TÀI KHOẢN ĐÚNG SỐ CUỐI
        // ===================================================
        const { data: tkTheoSo, error: tkTheoSoError } =
          await window.supabase
            .from("tai_khoan_nhan_tien")
            .select(`
            id,
            dia_diem,
            loai_hoa_don,
            so_cuoi_hd,
            so_tk,
            ten_hien_thi,
            ten_tk,
            bank_bin,
            bank_label,
            tk_chinh,
            ghi_chu
          `)
            .eq("dia_diem", diaDiem)
            .eq("loai_hoa_don", loaiHoaDon)
            .eq("so_cuoi_hd", soCuoiHoaDon)
            .maybeSingle();

        if (tkTheoSoError) {
          console.warn(
            "⚠️ Không tìm được tài khoản theo số cuối:",
            tkTheoSoError
          );
        }

        if (tkTheoSo) {
          taiKhoanNhanTien = {
            ...tkTheoSo,
            nguon_chon: "theo_so_cuoi"
          };
        }

        // ===================================================
        // 4B. KHÔNG CÓ SỐ CUỐI → LẤY TÀI KHOẢN CHÍNH
        // ===================================================
        if (!taiKhoanNhanTien) {
          const { data: tkChinh, error: tkChinhError } =
            await window.supabase
              .from("tai_khoan_nhan_tien")
              .select(`
              id,
              dia_diem,
              loai_hoa_don,
              so_cuoi_hd,
              so_tk,
              ten_hien_thi,
              ten_tk,
              bank_bin,
              bank_label,
              tk_chinh,
              ghi_chu
            `)
              .eq("dia_diem", diaDiem)
              .eq("loai_hoa_don", loaiHoaDon)
              .eq("tk_chinh", true)
              .maybeSingle();

          if (tkChinhError) {
            console.error(
              "❌ Lỗi tìm tài khoản chính:",
              tkChinhError
            );
          }

          if (tkChinh) {
            taiKhoanNhanTien = {
              ...tkChinh,
              nguon_chon: "tai_khoan_chinh"
            };
          }
        }
      }

      // =====================================================
      // 5. KIỂM TRA TÀI KHOẢN TRƯỚC KHI MỞ TRANG IN
      // =====================================================
      if (
        !taiKhoanNhanTien ||
        !taiKhoanNhanTien.so_tk ||
        !taiKhoanNhanTien.ten_tk ||
        !taiKhoanNhanTien.bank_bin ||
        !taiKhoanNhanTien.bank_label
      ) {
        console.error(
          "❌ Không xác định được tài khoản nhận tiền:",
          {
            sohd,
            hoadon,
            taiKhoanNhanTien
          }
        );

        alert(
          "❌ Không tìm thấy tài khoản nhận tiền phù hợp cho hóa đơn này."
        );
        return;
      }

      // =====================================================
      // 6. TẠO CHI TIẾT HÓA ĐƠN ĐỂ IN
      // =====================================================
      const chitiet = [];

      Object.values(bang).forEach((item) => {
        const sizes = Array.isArray(item.sizes)
          ? item.sizes
          : [];

        const soluongs = Array.isArray(item.soluongs)
          ? item.soluongs
          : [];

        sizes.forEach((size, i) => {
          const soluong = Number(soluongs[i] || 0);
          const gia = Number(item.gia || 0);
          const km = Number(item.km || 0);

          chitiet.push({
            sohd,
            masp: item.masp || "",
            tensp: item.tensp || "",
            size,
            soluong,
            gia,
            km,
            thanhtien: (gia - km) * soluong,
            dvt: item.dvt || "",
            diadiem: hoadon.diadiem || ""
          });
        });
      });

      // =====================================================
      // 7. GHÉP TÀI KHOẢN VÀO DỮ LIỆU TRANG IN
      // =====================================================
      const hoadonDeIn = {
        ...hoadon,
        tai_khoan_nhan_tien: taiKhoanNhanTien
      };

      const dataIn = {
        hoadon: hoadonDeIn,
        chitiet
      };

      console.log(
        "✅ Dữ liệu xem in hóa đơn cũ:",
        dataIn
      );

      localStorage.setItem(
        "data_hoadon_in",
        JSON.stringify(dataIn)
      );

      // =====================================================
      // 8. MỞ CÙNG MỘT TRANG IN
      // =====================================================
      const url = `${location.origin}/in-hoadon.html`;

      if (typeof window.openPrintOverlay === "function") {
        window.openPrintOverlay(url, {
          autoPrint: false
        });
        return;
      }

      window.open(url, "_blank");

    } catch (error) {
      console.error(
        "❌ Lỗi xem in hóa đơn:",
        error
      );

      alert(
        "❌ Không mở được hóa đơn để in: " +
        (error?.message || error)
      );
    }
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
