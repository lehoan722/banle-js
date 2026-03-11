// shortcut.js
import { luuHoaDonQuaAPI, luuHoaDonCaHaiBan } from './luuhoadon.js';
import {
  resetBangKetQua,
  getBangKetQua,
  suaDongDangChon
} from './hoadon.js';
import { capNhatSoHoaDonTuDong } from './sohoadon.js';
// ✅ Thêm flag này
let _shortcutInited = false;

// ===============================
//  Scanner special commands
//  - Quét #### => Lưu (F2)
//  - Quét **** => Thêm mới (như bấm 'Có' ở popup F1)
// ===============================
const SCAN_CMD_SAVE = '##';
const SCAN_CMD_NEW = '**';
let _scanCmdInited = false;

function khoiTaoLenhQuetDacBiet() {
  if (_scanCmdInited) return;
  _scanCmdInited = true;

  // Bắt Enter ở ô mã sản phẩm (#masp) theo chế độ capture để chặn xử lý mặc định nếu là lệnh đặc biệt
  document.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const el = document.activeElement;
    if (!el || el.id !== 'masp') return;

    const raw = (el.value || '').trim();
    if (!raw) return;

    if (raw !== SCAN_CMD_SAVE && raw !== SCAN_CMD_NEW) return;

    // Chặn các handler Enter khác (vd: thêm sản phẩm / chuyển focus)
    e.preventDefault();
    e.stopPropagation();

    // Xóa ô masp để tránh hiểu nhầm lệnh là mã sản phẩm
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    if (raw === SCAN_CMD_SAVE) {
      // Gọi đúng luồng F2 hiện có (giữ nguyên mọi kiểm tra/khóa đang lưu)
      const ev = new KeyboardEvent('keydown', { key: 'F2', code: 'F2', bubbles: true });
      document.dispatchEvent(ev);
      return;
    }

    if (raw === SCAN_CMD_NEW) {
      // Hands-free: coi như đã bấm 'Có' trong popup F1
      try {
        await taoMoiHoaDon();
      } catch (err) {
        console.error('Lỗi tạo mới hóa đơn bằng lệnh quét:', err);
      }
    }
  }, true);
}


function formatTimeHHMM(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}


export function khoiTaoShortcut() {
  // ✅ Nếu đã khởi tạo rồi thì thoát luôn, không gắn thêm listener nữa
  if (_shortcutInited) return;
  _shortcutInited = true;
  // ✅ Khởi tạo lệnh quét đặc biệt #### / ****
  khoiTaoLenhQuetDacBiet();

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

    // F5: Quay lại (duyệt hóa đơn)
    if (e.key === "F5") {
      e.preventDefault();
      const btn = document.getElementById("quaylai");
      if (btn) btn.click();
      else console.warn("Không tìm thấy nút #quaylai");
    }

    // F6: Xem in hóa đơn
    if (e.key === "F6") {
      e.preventDefault();
      const btn = document.getElementById("xemin");
      if (btn) {
        btn.click();
      } else {
        console.warn("Không tìm thấy nút #xemin");
      }
    }

    // F7: mở timkiemhanghoa333 (TAB MỚI) + truyền danh sách mã/SL theo từng dòng
    if (e.key === "F7") {
      e.preventDefault();

      // 1) Gom danh sách từ bảng kết quả:
      //    cột 0 = Mã hàng, cột 3 = SL
      const rows = Array.from(document.querySelectorAll("#bangketqua tbody tr"));

      const lines = rows.map(r => {
        const masp = (r.cells?.[0]?.innerText || "").trim().toUpperCase();
        const sl = (r.cells?.[3]?.innerText || "").trim();
        if (!masp) return "";
        return `${masp}/${sl || "0"}`;
      }).filter(Boolean);

      if (lines.length === 0) {
        alert("❌ Không có mã hàng nào trên bảng để mở tìm kiếm.");
        return;
      }

      // 2) Lưu payload vào localStorage (giữ nguyên từng dòng, KHÔNG loại trùng)
      const bulkData = lines.join("\n");
      localStorage.setItem("TKHH333_BULK", bulkData);

      // 3) Mở trang timkiemhanghoa333 trong TAB MỚI
      window.open("timkiemhanghoa333.html", "_blank");
    }

    // F8: mở trang nhập vị trí kho (theo cơ sở đích), có ngoại lệ ccn1v2/ccn2v1
    if (e.key === "F8") {
      e.preventDefault();

      // 1) Gom danh sách mã từ bảng kết quả (cột 0 = Mã hàng)
      const rows = Array.from(document.querySelectorAll("#bangketqua tbody tr"));
      const set = new Set(
        rows.map(r => (r.cells?.[0]?.innerText || "").trim().toUpperCase()).filter(Boolean)
      );
      if (set.size === 0) {
        alert("❌ Không có mã hàng nào trên bảng để mở nhập vị trí kho.");
        return;
      }

      // 2) Xác định cơ sở đang đăng nhập (origin_cs)
      const csFromLS = (localStorage.getItem('diadiem') || "").toLowerCase();
      const csFromInput = (document.getElementById('diadiem')?.value || "").toLowerCase();
      const origin_cs = (csFromLS || csFromInput || "cs1"); // fallback cs1

      // 3) Xác định trang nguồn để áp dụng ngoại lệ
      const path = (location.pathname || "").toLowerCase();
      let target_cs = origin_cs; // mặc định thuận chiều
      if (path.endsWith("ccn2v1cs2.html")) target_cs = "cs1"; // ngoại lệ: CS2 -> mở CS1
      if (path.endsWith("ccn1v2cs1.html")) target_cs = "cs2"; // ngoại lệ: CS1 -> mở CS2

      // 4) Lưu payload vào localStorage
      const payload = {
        t: Date.now(),
        origin_cs,
        target_cs,
        list: Array.from(set)
      };
      localStorage.setItem("VITRIKHO_IMPORT", JSON.stringify(payload));

      // 5) Mở trang nhập vị trí kho theo target_cs
      const targetUrl = (target_cs === "cs2") ? "nhapvitrikhocs2.html" : "nhapvitrikhocs1.html";
      window.open(targetUrl, "_blank");
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
  const diadiemVal = localStorage.getItem("diadiem") || document.getElementById("diadiem").value;
  const manvVal = localStorage.getItem("manv") || document.getElementById("manv").value;
  const tennvVal = localStorage.getItem("tennv") || document.getElementById("tennv").value;


  document.querySelectorAll("input").forEach(input => {
    if (!["diadiem", "manv", "tennv"].includes(input.id)) input.value = "";
  });

  resetBangKetQua();
  await capNhatSoHoaDonTuDong();

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
}

