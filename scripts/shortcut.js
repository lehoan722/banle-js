// shortcut.js
import { luuHoaDonQuaAPI, luuHoaDonCaHaiBan } from './luuhoadon.js';
import {
  resetBangKetQua,
  getBangKetQua,
  suaDongDangChon
} from './hoadon.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';

export function khoiTaoShortcut() {
  document.addEventListener("keydown", async function (e) {
    // F1: popup thêm mới
    if (e.key === "F1") {
      e.preventDefault();
      const popup = document.getElementById("popupThemMoi");
      popup.style.display = "block";
      setTimeout(() => document.getElementById("btnThemMoiCo")?.focus(), 50);
      document.getElementById("btnThemMoiCo").onclick = async () => {
        popup.style.display = "none";
        await taoMoiHoaDon();
      };
    }

    // F2: lưu hóa đơn thường

    // Đặt biến dangLuu phía trên file hoặc dùng chung với btn-luu
    if (e.key === "F2") {
      if (window.CHAN_F2) {
        e.preventDefault();
        alert("⛔ Chức năng chưa được cài đặt.");
        return;
      }
      e.preventDefault();
      if (window.dangLuu) return;
      const bang = getBangKetQua();
      if (Object.keys(bang).length === 0) {
        alert("❌ Không có dữ liệu để lưu hóa đơn.");
        return;
      }
      window.dangLuu = true;
      const btnLuu = document.getElementById('btn-luu');
      if (btnLuu) {
        btnLuu.disabled = true;
        btnLuu.innerText = "Đang lưu...";
      }

      try {
        if (typeof window.LUU_HOADON_F2 === "function") {
          await window.LUU_HOADON_F2();
        } else {
          await luuHoaDonQuaAPI();
        }
      } catch (e) {
        alert("Lỗi lưu hóa đơn: " + e.message);
      }

      window.dangLuu = false;
      if (btnLuu) {
        btnLuu.disabled = false;
        btnLuu.innerText = "💾 Lưu";
      }
    }



    // F3: xóa dòng đang chọn
    if (e.key === "F3") {
      e.preventDefault();
      suaDongDangChon();
    }

    // F4: nhảy tới ô khách trả và xử lý Enter
    if (e.key === "F4") {
      e.preventDefault();
      const khachtra = document.getElementById("khachtra");
      khachtra?.focus();
      khachtra?.select();
      khachtra?.addEventListener("keydown", async function onEnter(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          khachtra.removeEventListener("keydown", onEnter);
          const bang = getBangKetQua();
          if (Object.keys(bang).length === 0) {
            alert("❌ Không có dữ liệu để lưu.");
            return;
          }
          await luuHoaDonQuaAPI();
        }
      }, { once: true });
    }

    // F5: toggle nhập nhanh
    if (e.key === "F5") {
      e.preventDefault();
      const box = document.getElementById("nhapnhanh");
      if (box) {
        box.checked = !box.checked;
        console.log("Toggle Nhập Nhanh:", box.checked);
      }
    }

    // F6: toggle size 45
    if (e.key === "F6") {
      e.preventDefault();
      const box = document.getElementById("size45");
      if (box) {
        box.checked = !box.checked;
        console.log("Toggle Size 45:", box.checked);
      }
    }

    if (e.key === "F8") {
      e.preventDefault();

      const rows = Array.from(document.querySelectorAll("#bangketqua tbody tr"));
      const set = new Set(
        rows.map(r => (r.cells?.[0]?.innerText || "").trim().toUpperCase()).filter(Boolean)
      );
      if (set.size === 0) {
        alert("Không có mã hàng nào trên bảng để mở XNT17.");
        return;
      }

      // --- Ghi mã sản phẩm như hiện tại (localStorage vì mở tab mới)
      const payload = { t: Date.now(), list: Array.from(set) };
      localStorage.setItem("XNT17_MASPS_LS", JSON.stringify(payload));

      // --- THÊM MỚI: Ghi “từ ngày / đến ngày”
      const tuNgay = "2025-06-01";
      const todayLocal = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
      localStorage.setItem("XNT17_TUNGAY", tuNgay);
      localStorage.setItem("XNT17_DENNGAY", todayLocal);

      // Mở XNT17 trong TAB MỚI
      window.open("baocaoxnt17.html", "_blank");
    }


    // Ctrl + T: lưu hóa đơn vào cả 2 bảng
    if (e.ctrlKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      const bang = getBangKetQua();
      if (Object.keys(bang).length === 0) {
        alert("❌ Không có dữ liệu để lưu.");
        return;
      }
      await luuHoaDonCaHaiBan();
    }
  });
}

async function taoMoiHoaDon() {
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
}
