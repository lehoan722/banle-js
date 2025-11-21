// baocaochamcong.js
// Báo cáo chấm công & lương nhân viên
// Sử dụng Supabase RPC: chamcong_tinhcong_monthly, chamcong_tinhcong_daily

import { supabase } from "./supabaseClient.js";

let summaryHot = null;
let detailHot = null;
let summaryData = [];
let detailData = [];

// ====== TIỆN ÍCH CHUNG ======

function getDateInputs() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn đủ TỪ NGÀY và ĐẾN NGÀY.");
    return null;
  }
  return { tuNgay, denNgay };
}

function getLuongConfig() {
  const luongGioInput = document.getElementById("luong_gio");
  const pctThuongInput = document.getElementById("pct_thuong");
  const luong_gio = parseFloat(luongGioInput.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput.value || "0") || 0;
  return { luong_gio, pct_thuong };
}

function formatDate(str) {
  if (!str) return "";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNumber(n, decimals = 2) {
  if (n == null || Number.isNaN(n)) return "";
  return Number(n).toFixed(decimals);
}

function exportToCsv(filename, rows) {
  if (!rows || !rows.length) {
    alert("Không có dữ liệu để xuất.");
    return;
  }
  const processCell = (v) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvContent = rows.map(row => row.map(processCell).join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ====== KHỞI TẠO HANDSONTABLE ======

function initSummaryGrid() {
  const container = document.getElementById("summaryGrid");
  summaryHot = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      "Tháng",
      "Mã NV",
      "Cơ sở",
      "Số ngày công",
      "Tổng giờ công",
      "Tổng doanh số",
      "Số lần AUTO_TANCA",
      "Ngày CB1",
      "Ngày CB2",
      "Ngày CB3",
      "CB4 >5 AUTO_TANCA?",
      "Lương giờ (tháng)",
      "Thưởng doanh số",
      "Tổng lương"
    ],
    columns: [
      { data: "thang_fmt", type: "text" },
      { data: "manv", type: "text" },
      { data: "diadiem", type: "text" },
      { data: "so_ngay_cong", type: "numeric" },
      { data: "tong_gio_cong", type: "numeric" },
      { data: "tong_doanhso", type: "numeric" },
      { data: "so_lan_auto_tanca", type: "numeric" },
      { data: "so_ngay_cb1", type: "numeric" },
      { data: "so_ngay_cb2", type: "numeric" },
      { data: "so_ngay_cb3", type: "numeric" },
      { data: "cb4_auto_tanca_qua_nhieu_fmt", type: "text" },
      { data: "luong_gio_thang", type: "numeric" },
      { data: "thuong_doanhso", type: "numeric" },
      { data: "tong_luong", type: "numeric" }
    ],
    licenseKey: "non-commercial-and-evaluation",
    stretchH: "all",
    height: 400,
    filters: true,
    dropdownMenu: true,
    readOnly: true,
    cells: function (row, col) {
      const cellProperties = {};
      const rowData = summaryData[row];
      if (!rowData) return cellProperties;

      // Tô màu cảnh báo CB4
      if (rowData.cb4_auto_tanca_qua_nhieu) {
        cellProperties.className = (cellProperties.className || "") + " cb4-warning";
      }
      return cellProperties;
    },
    afterOnCellMouseDown: function (event, coords) {
      if (coords.row >= 0) {
        const rowData = summaryData[coords.row];
        if (rowData) {
          loadDetailDataFor(rowData.manv, rowData.diadiem);
        }
      }
    }
  });
}

function initDetailGrid() {
  const container = document.getElementById("detailGrid");
  detailHot = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      "Ngày",
      "Mã NV",
      "Cơ sở",
      "Giờ công",
      "Doanh số",
      "Nghỉ trưa (phút)",
      "Nghỉ chiều (phút)",
      "AUTO_TANCA/ngày",
      "CB1 quên vào ca",
      "CB2 trưa >70p",
      "CB3 chiều >40p",
      "Lương giờ (ngày)",
      "Thưởng doanh số (ngày)",
      "Tổng lương (ngày)"
    ],
    columns: [
      { data: "ngay_fmt", type: "text" },
      { data: "manv", type: "text" },
      { data: "diadiem", type: "text" },
      { data: "gio_cong", type: "numeric" },
      { data: "doanhso", type: "numeric" },
      { data: "phut_nghi_trua", type: "numeric" },
      { data: "phut_nghi_chieu", type: "numeric" },
      { data: "so_lan_auto_tanca", type: "numeric" },
      { data: "cb1_fmt", type: "text" },
      { data: "cb2_fmt", type: "text" },
      { data: "cb3_fmt", type: "text" },
      { data: "luong_gio_ngay", type: "numeric" },
      { data: "thuong_doanhso_ngay", type: "numeric" },
      { data: "tong_luong_ngay", type: "numeric" }
    ],
    licenseKey: "non-commercial-and-evaluation",
    stretchH: "all",
    height: 400,
    filters: true,
    dropdownMenu: true,
    readOnly: true,
    cells: function (row, col) {
      const cellProperties = {};
      const rowData = detailData[row];
      if (!rowData) return cellProperties;

      // Tô màu các dòng có cảnh báo
      if (rowData.cb1_quen_vaoca) {
        cellProperties.className = (cellProperties.className || "") + " cb1-warning";
      }
      if (rowData.cb2_nghi_trua_qua_70p) {
        cellProperties.className = (cellProperties.className || "") + " cb2-warning";
      }
      if (rowData.cb3_nghi_chieu_qua_40p) {
        cellProperties.className = (cellProperties.className || "") + " cb3-warning";
      }

      return cellProperties;
    }
  });
}

function addWarningStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .cb1-warning {
      background-color: #fff9c4 !important; /* vàng nhạt */
    }
    .cb2-warning {
      background-color: #ffe0b2 !important; /* cam nhạt */
    }
    .cb3-warning {
      background-color: #ffccbc !important; /* đỏ nhạt */
    }
    .cb4-warning {
      background-color: #ffcdd2 !important; /* đỏ hồng cho tổng hợp */
    }
  `;
  document.head.appendChild(style);
}

// ====== LOAD DỮ LIỆU TỪ SUPABASE ======

async function loadSummaryData() {
  const dateRange = getDateInputs();
  if (!dateRange) return;
  const { tuNgay, denNgay } = dateRange;

  const diadiemVal = document.getElementById("diadiem").value || null;
  const manvValRaw = document.getElementById("manv").value.trim();
  const manvVal = manvValRaw !== "" ? manvValRaw : null;

  const { luong_gio, pct_thuong } = getLuongConfig();

  const { data, error } = await supabase.rpc("chamcong_tinhcong_monthly", {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    p_diadiem: diadiemVal,
    p_manv: manvVal
  });

  if (error) {
    console.error("Lỗi gọi chamcong_tinhcong_monthly:", error);
    alert("Lỗi tải báo cáo tổng hợp. Xem console để biết thêm chi tiết.");
    return;
  }

  summaryData = (data || []).map(row => {
    const thang_fmt = formatDate(row.thang);
    const tong_gio_cong = Number(row.tong_gio_cong || 0);
    const tong_doanhso = Number(row.tong_doanhso || 0);

    const luong_gio_thang = tong_gio_cong * luong_gio;
    const thuong_doanhso = tong_doanhso * (pct_thuong / 100.0);
    const tong_luong = luong_gio_thang + thuong_doanhso;

    return {
      ...row,
      thang_fmt,
      tong_gio_cong,
      tong_doanhso,
      cb4_auto_tanca_qua_nhieu_fmt: row.cb4_auto_tanca_qua_nhieu ? "⚠ >5" : "",
      luong_gio_thang,
      thuong_doanhso,
      tong_luong
    };
  });

  summaryHot.loadData(summaryData);

  // Nếu có dữ liệu, tự load chi tiết theo dòng đầu tiên
  if (summaryData.length > 0) {
    const first = summaryData[0];
    await loadDetailDataFor(first.manv, first.diadiem);
  } else {
    detailData = [];
    detailHot.loadData(detailData);
  }
}

async function loadDetailDataFor(manv, diadiem) {
  const dateRange = getDateInputs();
  if (!dateRange) return;
  const { tuNgay, denNgay } = dateRange;

  const { luong_gio, pct_thuong } = getLuongConfig();

  const { data, error } = await supabase.rpc("chamcong_tinhcong_daily", {
    tu_ngay: tuNgay,
    den_ngay: denNgay,
    p_diadiem: diadiem,
    p_manv: manv
  });

  if (error) {
    console.error("Lỗi gọi chamcong_tinhcong_daily:", error);
    alert("Lỗi tải báo cáo chi tiết. Xem console để biết thêm chi tiết.");
    return;
  }

  detailData = (data || []).map(row => {
    const ngay_fmt = formatDate(row.ngay);
    const gio_cong = Number(row.gio_cong || 0);
    const doanhso = Number(row.doanhso || 0);
    const phut_nghi_trua = row.phut_nghi_trua != null ? Number(row.phut_nghi_trua) : 0;
    const phut_nghi_chieu = row.phut_nghi_chieu != null ? Number(row.phut_nghi_chieu) : 0;

    const luong_gio_ngay = gio_cong * luong_gio;
    const thuong_doanhso_ngay = doanhso * (pct_thuong / 100.0);
    const tong_luong_ngay = luong_gio_ngay + thuong_doanhso_ngay;

    return {
      ...row,
      ngay_fmt,
      gio_cong,
      doanhso,
      phut_nghi_trua,
      phut_nghi_chieu,
      cb1_fmt: row.cb1_quen_vaoca ? "⚠" : "",
      cb2_fmt: row.cb2_nghi_trua_qua_70p ? "⚠" : "",
      cb3_fmt: row.cb3_nghi_chieu_qua_40p ? "⚠" : "",
      luong_gio_ngay,
      thuong_doanhso_ngay,
      tong_luong_ngay
    };
  });

  detailHot.loadData(detailData);
}

// ====== XUẤT EXCEL (CSV) ======

function exportSummaryCsv() {
  if (!summaryData || summaryData.length === 0) {
    alert("Không có dữ liệu tổng hợp để xuất.");
    return;
  }

  const rows = [];
  rows.push([
    "Tháng",
    "Mã NV",
    "Cơ sở",
    "Số ngày công",
    "Tổng giờ công",
    "Tổng doanh số",
    "Số lần AUTO_TANCA",
    "Số ngày CB1 (quên vào ca)",
    "Số ngày CB2 (trưa >70p)",
    "Số ngày CB3 (chiều >40p)",
    "CB4 >5 AUTO_TANCA?",
    "Lương giờ (tháng)",
    "Thưởng doanh số",
    "Tổng lương"
  ]);

  summaryData.forEach(r => {
    rows.push([
      r.thang_fmt,
      r.manv,
      r.diadiem,
      r.so_ngay_cong,
      formatNumber(r.tong_gio_cong),
      formatNumber(r.tong_doanhso),
      r.so_lan_auto_tanca,
      r.so_ngay_cb1,
      r.so_ngay_cb2,
      r.so_ngay_cb3,
      r.cb4_auto_tanca_qua_nhieu ? ">5" : "",
      formatNumber(r.luong_gio_thang),
      formatNumber(r.thuong_doanhso),
      formatNumber(r.tong_luong)
    ]);
  });

  exportToCsv("baocao_chamcong_tonghop.csv", rows);
}

function exportDetailCsv() {
  if (!detailData || detailData.length === 0) {
    alert("Không có dữ liệu chi tiết để xuất.");
    return;
  }

  const rows = [];
  rows.push([
    "Ngày",
    "Mã NV",
    "Cơ sở",
    "Giờ công",
    "Doanh số",
    "Nghỉ trưa (phút)",
    "Nghỉ chiều (phút)",
    "AUTO_TANCA/ngày",
    "CB1 quên vào ca",
    "CB2 trưa >70p",
    "CB3 chiều >40p",
    "Lương giờ (ngày)",
    "Thưởng doanh số (ngày)",
    "Tổng lương (ngày)"
  ]);

  detailData.forEach(r => {
    rows.push([
      r.ngay_fmt,
      r.manv,
      r.diadiem,
      formatNumber(r.gio_cong),
      formatNumber(r.doanhso),
      formatNumber(r.phut_nghi_trua, 0),
      formatNumber(r.phut_nghi_chieu, 0),
      r.so_lan_auto_tanca,
      r.cb1_quen_vaoca ? "⚠" : "",
      r.cb2_nghi_trua_qua_70p ? "⚠" : "",
      r.cb3_nghi_chieu_qua_40p ? "⚠" : "",
      formatNumber(r.luong_gio_ngay),
      formatNumber(r.thuong_doanhso_ngay),
      formatNumber(r.tong_luong_ngay)
    ]);
  });

  exportToCsv("baocao_chamcong_chitiet.csv", rows);
}

// ====== KHỞI ĐỘNG ======

function setDefaultDates() {
  const tuNgayInput = document.getElementById("tu_ngay");
  const denNgayInput = document.getElementById("den_ngay");
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const toIso = d => d.toISOString().slice(0, 10);
  tuNgayInput.value = toIso(firstDay);
  denNgayInput.value = toIso(today);
}

document.addEventListener("DOMContentLoaded", () => {
  addWarningStyles();
  initSummaryGrid();
  initDetailGrid();
  setDefaultDates();

  document.getElementById("btn-load").addEventListener("click", loadSummaryData);
  document.getElementById("btn-export-summary").addEventListener("click", exportSummaryCsv);
  document.getElementById("btn-export-detail").addEventListener("click", exportDetailCsv);
});
