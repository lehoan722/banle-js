// bangtonghopchamcong.js
// Bảng tổng hợp chấm công theo ngày (Handsontable + lọc ở tiêu đề)

import { supabase } from "./supabaseClient.js";
import { fillNhanVienDropdown } from "./dmnhanvien.js";

let tonghopHot = null;
let tonghopData = [];

// ============ TIỆN ÍCH ============

function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "#c62828" : "#555";
}

function getTodayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

function setDefaultDates() {
  const tuInput = document.getElementById("tu_ngay");
  const denInput = document.getElementById("den_ngay");
  const today = getTodayISO();
  tuInput.value = today;
  denInput.value = today;
}

function formatDateVN(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNumber(n, decimals = 2) {
  if (n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(decimals);
}

// ============ HANDSONTABLE ============

function initTonghopGrid() {
  const container = document.getElementById("tonghopGrid");
  tonghopHot = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      "Ngày",
      "Mã NV",
      "Cơ sở",
      "Giờ công",
      "Nghỉ trưa (phút)",
      "Nghỉ chiều (phút)",
      "Số lần AUTO_TANCA",
      "Doanh số",
      "Vắng ca?",
      "TANCA theo lịch?",
      "Ghi chú"
    ],
    columns: [
      { data: "ngay_fmt", type: "text" },
      { data: "manv", type: "text" },
      { data: "diadiem", type: "text" },
      { data: "gio_cong", type: "numeric" },
      { data: "phut_nghi_trua", type: "numeric" },
      { data: "phut_nghi_chieu", type: "numeric" },
      { data: "so_lan_auto_tanca", type: "numeric" },
      { data: "doanhso", type: "numeric" },
      { data: "vang_ca_fmt", type: "text" },
      { data: "tanca_lich_fmt", type: "text" },
      { data: "ghi_chu_fmt", type: "text" }
    ],
    licenseKey: "non-commercial-and-evaluation",
    stretchH: "all",
    height: 500,
    filters: true,
    dropdownMenu: true,
    readOnly: true,
    cells: function (row, col) {
      const cellProperties = {};
      const rowData = tonghopData[row];
      if (!rowData) return cellProperties;

      // Tô màu các cảnh báo
      if (rowData.cb1_quen_vaoca) {
        cellProperties.className =
          (cellProperties.className || "") + " cb1-warning";
      }
      if (rowData.cb2_nghi_trua_qua_70p) {
        cellProperties.className =
          (cellProperties.className || "") + " cb2-warning";
      }
      if (rowData.cb3_nghi_chieu_qua_40p) {
        cellProperties.className =
          (cellProperties.className || "") + " cb3-warning";
      }
      if (rowData.vang_ca) {
        cellProperties.className =
          (cellProperties.className || "") + " vang-warning";
      }
      if (rowData.tanca_lich) {
        cellProperties.className =
          (cellProperties.className || "") + " tanca-lich-warning";
      }

      // Ghi chú: chữ nhỏ hơn
      if (col === 10) {
        cellProperties.className =
          (cellProperties.className || "") + " ghi-chu-cell";
      }

      return cellProperties;
    }
  });
}

// ============ LOAD DỮ LIỆU ============

function getFilterInputs() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  const diadiem = document.getElementById("diadiem").value || null;
  const manvRaw = document.getElementById("manv").value.trim();
  const manv = manvRaw !== "" ? manvRaw : null;

  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn đủ TỪ NGÀY và ĐẾN NGÀY.");
    return null;
  }

  return { tuNgay, denNgay, diadiem, manv };
}

function buildGhiChu(row) {
  const notes = [];
  if (row.so_lan_auto_tanca > 0) notes.push(`AUTO_TANCA x${row.so_lan_auto_tanca}`);
  if (row.cb1_quen_vaoca) notes.push("CB1 quên vào ca");
  if (row.cb2_nghi_trua_qua_70p) notes.push("CB2 trưa > 70p");
  if (row.cb3_nghi_chieu_qua_40p) notes.push("CB3 chiều > 40p");
  if (row.vang_ca) notes.push("VẮNG ca");
  if (row.tanca_lich) notes.push("TANCA_LỊCH (không bấm tan ca)");
  return notes.join(", ");
}

async function loadTonghopData() {
  const filters = getFilterInputs();
  if (!filters) return;

  const { tuNgay, denNgay, diadiem, manv } = filters;

  setStatus("Đang tải dữ liệu...");
  try {
    const { data, error } = await supabase.rpc("chamcong_tinhcong_daily", {
      tu_ngay: tuNgay,
      den_ngay: denNgay,
      p_diadiem: diadiem,
      p_manv: manv
    });

    if (error) {
      console.error("Lỗi gọi chamcong_tinhcong_daily:", error);
      setStatus("Lỗi tải dữ liệu. Xem console để biết chi tiết.", true);
      return;
    }

    tonghopData = (data || []).map((row) => {
      const gio_cong = Number(row.gio_cong || 0);
      const phut_nghi_trua =
        row.phut_nghi_trua != null ? Number(row.phut_nghi_trua) : 0;
      const phut_nghi_chieu =
        row.phut_nghi_chieu != null ? Number(row.phut_nghi_chieu) : 0;
      const doanhso = Number(row.doanhso || 0);

      return {
        ...row,
        ngay_fmt: formatDateVN(row.ngay),
        gio_cong,
        phut_nghi_trua,
        phut_nghi_chieu,
        doanhso,
        vang_ca_fmt: row.vang_ca ? "VẮNG" : "",
        tanca_lich_fmt: row.tanca_lich ? "✓" : "",
        ghi_chu_fmt: buildGhiChu(row)
      };
    });

    tonghopHot.loadData(tonghopData);

    if (tonghopData.length === 0) {
      setStatus("Không có dữ liệu trong khoảng đã chọn.");
    } else {
      setStatus(`Đã tải ${tonghopData.length} dòng dữ liệu.`);
    }
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    setStatus("Lỗi không mong muốn khi tải dữ liệu.", true);
  }
}

// ============ XUẤT CSV ============

function exportCsv() {
  if (!tonghopData || tonghopData.length === 0) {
    alert("Không có dữ liệu để xuất.");
    return;
  }

  const rows = [];

  rows.push([
    "Ngày",
    "Mã NV",
    "Cơ sở",
    "Giờ công",
    "Nghỉ trưa (phút)",
    "Nghỉ chiều (phút)",
    "Số lần AUTO_TANCA",
    "Doanh số",
    "Vắng ca?",
    "TANCA theo lịch?",
    "Ghi chú"
  ]);

  tonghopData.forEach((r) => {
    rows.push([
      r.ngay_fmt,
      r.manv,
      r.diadiem,
      formatNumber(r.gio_cong, 2),
      formatNumber(r.phut_nghi_trua, 0),
      formatNumber(r.phut_nghi_chieu, 0),
      r.so_lan_auto_tanca,
      formatNumber(r.doanhso, 0),
      r.vang_ca ? "VẮNG" : "",
      r.tanca_lich ? "✓" : "",
      r.ghi_chu_fmt
    ]);
  });

  const csvContent = rows.map((row) =>
    row
      .map((v) => {
        const s = String(v ?? "").replace(/"/g, '""');
        return `"${s}"`;
      })
      .join(",")
  ).join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bang_tonghop_chamcong.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ KHỞI ĐỘNG ============

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Khởi tạo Handsontable
  initTonghopGrid();

  // 2. Ngày mặc định = hôm nay
  setDefaultDates();

  // 3. Load danh mục nhân viên cho datalist (dùng chung module dmnhanvien.js)
  const manvDatalist = document.getElementById("ds-manv");
  if (manvDatalist) {
    try {
      await fillNhanVienDropdown(manvDatalist, { showName: true });
    } catch (err) {
      console.error("Lỗi load danh mục nhân viên cho bảng tổng hợp:", err);
    }
  }

  // 4. Gán event
  document.getElementById("btn-load").addEventListener("click", loadTonghopData);
  document.getElementById("btn-export").addEventListener("click", exportCsv);

  // 5. Tự động tải dữ liệu ngày hiện tại khi mở trang
  await loadTonghopData();
});
