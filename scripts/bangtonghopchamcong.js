// bangtonghopchamcong.js
// Bảng tổng hợp chấm công: NGÀY, NV, VAOCA, NTR, NTRD, NCH, NCHD, TANCA, GIỜ CÔNG, GHI CHÚ
// Lấy trực tiếp từ chamcong_log, không dùng RPC khác.

import { supabase } from "./supabaseClient.js";
import { fillNhanVienDropdown } from "./dmnhanvien.js";

let hot = null;
let tableData = [];

// ========== TIỆN ÍCH ==========

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
  updateHeaderRange(today, today);
}

function updateHeaderRange(tuNgay, denNgay) {
  const fmt = (s) => {
    if (!s) return "";
    const [y, m, d] = s.split("-");
    return `${d}-${m}-${String(y).slice(-2)}`;
  };
  document.getElementById("lbl-tungay").textContent = fmt(tuNgay);
  document.getElementById("lbl-denngay").textContent = fmt(denNgay);
}

function toShortDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function toTimeStr(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toMinutes(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

// ========== HANDSONTABLE ==========

function initGrid() {
  const container = document.getElementById("tonghopGrid");
  hot = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      "NGÀY",
      "NV",
      "Cơ sở",
      "VAOCA",
      "NTR",
      "NTRD",
      "NCH",
      "NCHD",
      "TANCA",
      "GIỜ CÔNG",
      "GHI CHÚ"
    ],
    columns: [
      { data: "ngay", type: "text" },
      { data: "manv", type: "text" },
      { data: "diadiem", type: "text" },
      { data: "vaoca", type: "text" },
      { data: "ntr", type: "text" },
      { data: "ntrd", type: "text" },
      { data: "nch", type: "text" },
      { data: "nchd", type: "text" },
      { data: "tanca", type: "text" },
      { data: "gio_cong", type: "numeric", numericFormat: { pattern: "0.00" } },
      { data: "ghi_chu", type: "text" }
    ],
    licenseKey: "non-commercial-and-evaluation",
    stretchH: "all",
    height: 520,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    readOnly: true,
    cells(row, col) {
      const props = {};
      const r = tableData[row];
      if (!r) return props;

      if (col === 9) {
        props.className = (props.className || "") + " giocon-cell";
      }
      if (col === 10) {
        props.className = (props.className || "") + " ghi-chu-cell";
      }
      return props;
    }
  });
}

// ========== LẤY & GOM DỮ LIỆU TỪ chamcong_log ==========

function getFilters() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  const diadiem = document.getElementById("diadiem").value || null;
  const manvVal = document.getElementById("manv").value.trim();
  const manv = manvVal !== "" ? manvVal : null;

  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn đủ TỪ NGÀY và ĐẾN NGÀY.");
    return null;
  }
  return { tuNgay, denNgay, diadiem, manv };
}

async function loadData() {
  const f = getFilters();
  if (!f) return;
  const { tuNgay, denNgay, diadiem, manv } = f;

  updateHeaderRange(tuNgay, denNgay);
  setStatus("Đang tải dữ liệu...");

  // Tạo khoảng thời gian theo giờ VN
  const from = `${tuNgay}T00:00:00+07:00`;
  const to = `${denNgay}T23:59:59.999+07:00`;

  try {
    let query = supabase
      .from("chamcong_log")
      .select("manv, diadiem, su_kien, ghi_chu, created_at")
      .gte("created_at", from)
      .lte("created_at", to);

    if (diadiem) query = query.eq("diadiem", diadiem);
    if (manv) query = query.eq("manv", manv);

    const { data, error } = await query;

    if (error) {
      console.error("Lỗi đọc chamcong_log:", error);
      setStatus("Lỗi đọc dữ liệu chấm công. Xem console.", true);
      return;
    }

    const aggregated = aggregateLogs(data || []);
    tableData = aggregated;
    hot.loadData(tableData);

    if (tableData.length === 0) {
      setStatus("Không có dữ liệu trong khoảng đã chọn.");
    } else {
      setStatus(`Đã tải ${tableData.length} dòng dữ liệu.`);
    }
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    setStatus("Lỗi không mong muốn khi tải dữ liệu.", true);
  }
}

/**
 * Gom log theo (ngày, manv, diadiem) và lấy mốc VAOCA, NTR, NTRD, NCH, NCHD, TANCA
 * Tính GIỜ CÔNG = (TANCA - VAOCA) - (NTRD - NTR) - (NCHD - NCH)
 */
function aggregateLogs(rows) {
  const map = new Map();

  for (const row of rows) {
    const d = new Date(row.created_at);
    // Giả sử trình duyệt đang ở VN, dùng thời gian local
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
    const shortDate = toShortDate(d);

    const key = `${dateKey}|${row.manv}|${row.diadiem}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        dateKey,
        ngay: shortDate,
        manv: row.manv,
        diadiem: row.diadiem,
        // giữ phút để tính toán
        vaocaMin: null,
        ntrMin: null,
        ntrdMin: null,
        nchMin: null,
        nchdMin: null,
        tancaMin: null,
        vaoca: "",
        ntr: "",
        ntrd: "",
        nch: "",
        nchd: "",
        tanca: "",
        ghiChuList: []
      };
      map.set(key, agg);
    }

    const sukien = row.su_kien;
    const ghiChu = row.ghi_chu;
    if (ghiChu) {
      agg.ghiChuList.push(String(ghiChu));
    }

    // Chỉ xử lý các mốc chính
    const dMin = toMinutes(d);
    const timeStr = toTimeStr(d);

    if (sukien === "VAOCA") {
      if (agg.vaocaMin == null || dMin < agg.vaocaMin) {
        agg.vaocaMin = dMin;
        agg.vaoca = timeStr;
      }
    } else if (sukien === "NTR") {
      if (agg.ntrMin == null || dMin < agg.ntrMin) {
        agg.ntrMin = dMin;
        agg.ntr = timeStr;
      }
    } else if (sukien === "NTRD") {
      if (agg.ntrdMin == null || dMin < agg.ntrdMin) {
        agg.ntrdMin = dMin;
        agg.ntrd = timeStr;
      }
    } else if (sukien === "NCH") {
      if (agg.nchMin == null || dMin < agg.nchMin) {
        agg.nchMin = dMin;
        agg.nch = timeStr;
      }
    } else if (sukien === "NCHD") {
      if (agg.nchdMin == null || dMin < agg.nchdMin) {
        agg.nchdMin = dMin;
        agg.nchd = timeStr;
      }
    } else if (sukien === "TANCA") {
      // TANCA lấy mốc muộn nhất trong ngày
      if (agg.tancaMin == null || dMin > agg.tancaMin) {
        agg.tancaMin = dMin;
        agg.tanca = timeStr;
      }
    }
    // các su_kien khác (AUTO_TANCA, ...) chỉ dùng ghi_chu
  }

  const result = [];

  for (const agg of map.values()) {
    let gioCong = 0;

    if (agg.vaocaMin != null && agg.tancaMin != null) {
      const total = agg.tancaMin - agg.vaocaMin;

      const nghiTrua =
        agg.ntrMin != null && agg.ntrdMin != null
          ? Math.max(agg.ntrdMin - agg.ntrMin, 0)
          : 0;

      const nghiChieu =
        agg.nchMin != null && agg.nchdMin != null
          ? Math.max(agg.nchdMin - agg.nchMin, 0)
          : 0;

      const workMin = Math.max(total - nghiTrua - nghiChieu, 0);
      gioCong = Number((workMin / 60).toFixed(2));
    }

    result.push({
      ngay: agg.ngay,
      manv: agg.manv,
      diadiem: agg.diadiem,
      vaoca: agg.vaoca,
      ntr: agg.ntr,
      ntrd: agg.ntrd,
      nch: agg.nch,
      nchd: agg.nchd,
      tanca: agg.tanca,
      gio_cong: gioCong,
      ghi_chu: agg.ghiChuList.join(", ")
    });
  }

  // Sắp xếp: ngày tăng dần, NV tăng dần, cơ sở
  result.sort((a, b) => {
    if (a.ngay === b.ngay) {
      if (a.manv === b.manv) {
        return a.diadiem.localeCompare(b.diadiem);
      }
      return a.manv.localeCompare(b.manv);
    }
    // dd-mm-yy → sort lại theo dateKey better, nhưng ở đây chấp nhận đơn giản:
    const [da, ma, ya] = a.ngay.split("-").map(Number);
    const [db, mb, yb] = b.ngay.split("-").map(Number);
    const va = ya * 10000 + ma * 100 + da;
    const vb = yb * 10000 + mb * 100 + db;
    return va - vb;
  });

  return result;
}

// ========== XUẤT CSV ==========

function exportCsv() {
  if (!tableData || tableData.length === 0) {
    alert("Không có dữ liệu để xuất.");
    return;
  }

  const rows = [
    [
      "NGÀY",
      "NV",
      "Cơ sở",
      "VAOCA",
      "NTR",
      "NTRD",
      "NCH",
      "NCHD",
      "TANCA",
      "GIỜ CÔNG",
      "GHI CHÚ"
    ]
  ];

  tableData.forEach((r) => {
    rows.push([
      r.ngay,
      r.manv,
      r.diadiem,
      r.vaoca,
      r.ntr,
      r.ntrd,
      r.nch,
      r.nchd,
      r.tanca,
      r.gio_cong != null ? r.gio_cong.toFixed(2) : "",
      r.ghi_chu || ""
    ]);
  });

  const csv = rows
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "").replace(/"/g, '""');
          return `"${s}"`;
        })
        .join(",")
    )
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bang_tonghop_chamcong.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== KHỞI ĐỘNG ==========

document.addEventListener("DOMContentLoaded", async () => {
  initGrid();
  setDefaultDates();

  // Load dropdown nhân viên dùng chung module dmnhanvien.js
  const manvDatalist = document.getElementById("ds-manv");
  if (manvDatalist) {
    try {
      await fillNhanVienDropdown(manvDatalist, { showName: true });
    } catch (err) {
      console.error("Lỗi load danh mục nhân viên:", err);
    }
  }

  document.getElementById("btn-load").addEventListener("click", loadData);
  document.getElementById("btn-export").addEventListener("click", exportCsv);

  // Khi mở trang: tự tải dữ liệu ngày hiện tại
  await loadData();
});
