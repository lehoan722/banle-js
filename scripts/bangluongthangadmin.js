// bangluongthang.js - Bảng lương tháng tất cả nhân viên (đã tối ưu & hỗ trợ login dùng chung)
// - Fix hiển thị Tên NV (fallback lấy từ bảng công nếu dmnhanvien bị RLS)
// - Tăng tốc tải KPI (doanh thu) bằng chạy song song có giới hạn
// - Tích hợp authModule.khoiTaoDangNhapDungChung + kiểm tra quyền trang
import { supabase } from "./supabaseClient.js";
import * as authModule from "./authModule.js";

const tuNgayInput = document.getElementById("tu_ngay");
const denNgayInput = document.getElementById("den_ngay");
const diadiemSelect = document.getElementById("diadiem");
const luongGioInput = document.getElementById("luong_gio");
const khoanGioInput = document.getElementById("khoan_gio");
const pctThuongInput = document.getElementById("pct_thuong");

const btnTai = document.getElementById("btn-tai");
const tbodyLuong = document.getElementById("tbody-bangluong");
const statusEl = document.getElementById("status");

// Container Handsontable
const hotLuongContainer = document.getElementById("hotLuong");
const hotBangCongContainer = document.getElementById("hotBangCong");

// Biến lưu instance Handsontable
let hotLuong = null;
let hotBangCong = null;

// =============================
// KIỂM SOÁT QUYỀN TRUY CẬP TRANG
// =============================
async function kiemTraQuyenXemTrang(pathTrang) {
  const nv = authModule.getCurrentUserInfo();

  // Chưa login: để authModule giữ overlay đăng nhập
  if (!nv || !nv.manv) return false;

  const { data, error } = await supabase.rpc("get_pages_for_manv", {
    p_manv: nv.manv
  });

  if (error) {
    hienCamTruyCap("Lỗi kiểm tra phân quyền: " + error.message);
    return false;
  }

  const dsTrang = (data || []).map(r => r.path);

  // Không phải admin và không nằm trong danh sách → CẤM
  if (!nv.is_admin && !dsTrang.includes(pathTrang)) {
    hienCamTruyCap(
      `Không có quyền truy cập trang này.<br> Mã NV: ${nv.manv} – ${nv.tennv}`
    );
    return false;
  }

  return true;
}

// Hàm hiện thông báo cấm truy cập
function hienCamTruyCap(msg) {
  document.body.innerHTML = `
        <div style="padding:24px;color:#b00020;font-size:20px;font-weight:bold">
            ⛔ Không có quyền truy cập<br>
            <div style="font-size:16px;margin-top:8px;color:#444">${msg}</div>
        </div>
    `;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  if (tuNgayInput) tuNgayInput.value = toIsoDate(firstDay);
  if (denNgayInput) denNgayInput.value = toIsoDate(lastDay);
}

function fmt(n, d = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: d,
    maximumFractionDigits: d
  });
}

function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
  statusEl.style.color = isError ? "#b00020" : "#222";
}

// =================== HELPERS (tối ưu & normalize) ===================
function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

function parseYMD(s) {
  const [y, m, d] = String(s || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function listMonthsBetween(tu_ngay, den_ngay) {
  const a = parseYMD(tu_ngay);
  const b = parseYMD(den_ngay);
  const start = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth(), 1);

  const out = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/**
 * Lấy map {MANV: TENNV}
 * - Ưu tiên: dmnhanvien (nhanh)
 * - Fallback: chamcong_bangcong_monthly (để admin login vẫn có Tên NV dù dmnhanvien bị RLS)
 */
async function loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr) {
  const mapTen = {};

  // (A) Thử lấy từ dmnhanvien
  try {
    const { data: nvData, error: nvErr } = await supabase
      .from("dmnhanvien")
      .select("manv, tennv")
      .in("manv", manvArr);

    if (!nvErr && Array.isArray(nvData) && nvData.length) {
      nvData.forEach(n => {
        const k = normalizeManv(n.manv);
        if (k) mapTen[k] = String(n.tennv || "").trim();
      });
      return mapTen;
    }
  } catch (e) {
    console.warn("Không lấy được dmnhanvien (có thể do RLS):", e);
  }

  // (B) Fallback: lấy từ bảng công tháng
  try {
    const months = listMonthsBetween(tu_ngay, den_ngay);
    for (const { year, month } of months) {
      const { data, error } = await supabase.rpc("chamcong_bangcong_monthly", {
        p_month: month,
        p_year: year
      });
      if (error || !Array.isArray(data)) continue;

      for (const r of data) {
        const k = normalizeManv(r.manv);
        if (k && !mapTen[k]) mapTen[k] = String(r.tennv || "").trim();
      }
    }
  } catch (e) {
    console.warn("Fallback lấy tên từ chamcong_bangcong_monthly bị lỗi:", e);
  }

  return mapTen;
}

/**
 * Lấy doanh thu KPI theo nhân viên (RPC nv_match2h_summary_all)
 * - Chạy song song có giới hạn để nhanh (mặc định 6 luồng)
 */
async function loadDoanhThuKPIConcurrent(manvArr, tu_ngay, den_ngay, concurrency = 6) {
  const map = {};
  const list = [...manvArr];
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < list.length) {
      const manv = list[idx++];
      try {
        const { data: kpiData, error: kpiErr } = await supabase.rpc(
          "nv_match2h_summary_all",
          {
            tu_ngay,
            den_ngay,
            p_manv: manv,
            p_masp_list: null,
            p_min_price: 0,
            p_size: null
          }
        );

        if (kpiErr) {
          console.error(`Lỗi nv_match2h_summary_all cho NV ${manv}:`, kpiErr);
          map[manv] = 0;
        } else {
          map[manv] = Number(kpiData?.[0]?.tong_doanh_thu || 0);
        }
      } catch (e) {
        console.error(`KPI exception cho ${manv}:`, e);
        map[manv] = 0;
      } finally {
        done++;
        // cập nhật nhẹ trạng thái (không spam quá nhiều)
        if (done % 5 === 0 || done === list.length) {
          setStatus(`Đang tải doanh thu KPI... (${done}/${list.length})`);
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, list.length || 1) },
    () => worker()
  );
  await Promise.all(workers);
  return map;
}

function renderLuongHot(data) {
  if (!hotLuongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) {
    console.error("Handsontable chưa được nạp.");
    return;
  }

  // Tiêu đề có xuống dòng (\n)
  const colHeaders = [
    "Mã NV",
    "Tên NV",
    "Cơ sở",
    "Giờ công ",
    "Giờ trừ ",
    "Giờ tính lương",
    "Doanh thu",
    "Khoán /g",
    "Khoán tháng",
    "Tiền vượt",
    "Thưởng vượt kh",
    "Lương cứng",
    "Tổng lương",
    "Lương/1 giờ"
  ];

  // Kiểu dữ liệu từng cột
  const columns = [
    { data: 0, type: "text" },
    { data: 1, type: "text" },
    { data: 2, type: "text" },
    { data: 3, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 4, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 5, type: "numeric", numericFormat: { pattern: "0.00" } },
    { data: 6, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 7, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 8, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 9, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 10, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 11, type: "numeric", numericFormat: { pattern: "0,0" } },
    { data: 12, type: "numeric", numericFormat: { pattern: "0,0" } },
    // Lương/1 giờ
    { data: 13, type: "numeric", numericFormat: { pattern: "0,0" } }
  ];

  // 👇 Độ rộng từng cột (bạn muốn chỉnh thì chỉ sửa mảng này)
  const colWidths = [
    70,   // Mã NV
    90,  // Tên NV
    80,   // Cơ sở
    90,   // Giờ công (thực)
    100,   // Giờ trừ TANCA_LỊCH
    100,   // Giờ tính lương
    70,   // Doanh thu
    70,   // Khoán / giờ
    70,   // Khoán theo giờ công
    110,   // Doanh thu vượt khoán
    110,   // Thưởng vượt khoán
    90,   // Lương cứng
    90,   // Tổng lương
    90    // Lương/1 giờ
  ];

  // Ẩn cột tự động (nếu muốn)
  const hiddenColsConfig = {
    columns: [],
    indicators: true
  };

  const settings = {
    data,
    colHeaders,
    columns,
    colWidths,
    rowHeaders: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    wordWrap: true,
    // ✅ QUAN TRỌNG: đặt chiều cao header đủ cho 2 dòng
  columnHeaderHeight: 44,  // bạn có thể chỉnh 40/44/48 tuỳ header dài

  // (khuyến nghị) chiều cao dòng dữ liệu ổn định
  rowHeights: 26,
    hiddenColumns: hiddenColsConfig,
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotLuong) {
    hotLuong = new HOT(hotLuongContainer, settings);
  } else {
    hotLuong.updateSettings(settings);
    hotLuong.render();
  }
}

function renderBangCongHot(colHeaders, data) {
  if (!hotBangCongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) {
    console.error("Handsontable chưa được nạp.");
    return;
  }

  const settings = {
    data,
    colHeaders,
    rowHeaders: true,
    width: "100%",
    height: 430,
    stretchH: "all",
    manualColumnResize: true,
    manualRowResize: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotBangCong) {
    hotBangCong = new HOT(hotBangCongContainer, settings);
  } else {
    hotBangCong.updateSettings(settings);
  }
}

async function taiBangLuong() {
  const tu_ngay = tuNgayInput?.value;
  const den_ngay = denNgayInput?.value;
  const diadiem = diadiemSelect?.value || null;
  const luong_gio = parseFloat(luongGioInput?.value || "0") || 0;
  const khoan_gio = parseFloat(khoanGioInput?.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput?.value || "0") || 0;

  if (!tu_ngay || !den_ngay) {
    alert("Vui lòng chọn khoảng Từ ngày - Đến ngày.");
    return;
  }

  setStatus("Đang tải dữ liệu lương...");
  if (tbodyLuong) tbodyLuong.innerHTML = `<tr><td colspan="14">Đang tải...</td></tr>`;

  try {
    // 1) Lấy chấm công tháng tất cả NV
    const { data: congData, error: congErr } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      {
        tu_ngay,
        den_ngay,
        p_diadiem: diadiem,
        p_manv: null
      }
    );

    if (congErr) {
      console.error("Lỗi chamcong_tinhcong_monthly:", congErr);
      setStatus("Lỗi lấy dữ liệu chấm công.", true);
      if (tbodyLuong) {
        tbodyLuong.innerHTML = `<tr><td colspan="14" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      }
      renderLuongHot([]); // clear HOT
      return;
    }

    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu.");
      if (tbodyLuong) tbodyLuong.innerHTML = `<tr><td colspan="14">Không có dữ liệu.</td></tr>`;
      renderLuongHot([]); // clear HOT
      return;
    }

    // 2) Danh sách MANV
    const manvSet = new Set(congData.map(r => normalizeManv(r.manv)));
    const manvArr = Array.from(manvSet).filter(Boolean);

    // 2a) Tên NV (2 tầng)
    setStatus(`Đang lấy tên nhân viên... (${manvArr.length} NV)`);
    const mapTen = await loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr);

    // 2b) Doanh thu KPI (song song)
    setStatus(`Đang tải doanh thu KPI... (0/${manvArr.length})`);
    const mapDoanhThuKPI = await loadDoanhThuKPIConcurrent(
      manvArr,
      tu_ngay,
      den_ngay,
      2
    );

    // 3) Gom dữ liệu theo MANV
    const byManv = {};
    congData.forEach(r => {
      const k = normalizeManv(r.manv);
      if (!k) return;
      if (!byManv[k]) byManv[k] = [];
      byManv[k].push({ ...r, manv: k });
    });

    // Reset bảng HTML
    if (tbodyLuong) tbodyLuong.innerHTML = "";

    // Dữ liệu cho Handsontable
    const bangLuongData = [];

    // Cộng dồn tổng
    let sum_gio_cong = 0;
    let sum_gio_phat = 0;
    let sum_gio_tinh = 0;
    let sum_doanhthu = 0;
    let sum_khoan_thang = 0;
    let sum_tien_vuot = 0;
    let sum_tien_thuong = 0;
    let sum_luong_cung = 0;
    let sum_tong_luong = 0;

    // 4) Tính theo nhân viên
    const manvKeys = Object.keys(byManv).sort();
    for (const manv of manvKeys) {
      const rows = byManv[manv];
      const ten = mapTen[normalizeManv(manv)] || "";
      const dia = rows?.[0]?.diadiem || "";

      let gio_cong = 0;
      let so_ngay_tanca_lich = 0;
      rows.forEach(r => {
        gio_cong += Number(r.tong_gio_cong || 0);
        so_ngay_tanca_lich += Number(r.so_ngay_tanca_lich || 0);
      });

      const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
      const gio_tinh = Math.max(gio_cong - gio_phat_tanca_lich, 0);

      const doanhthu = Number(mapDoanhThuKPI[normalizeManv(manv)] || 0);

      const khoan_thang = gio_tinh * khoan_gio;
      const tien_vuot = doanhthu - khoan_thang;              // cho phép âm
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);  // thưởng/phạt

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong;
      const luong_1_gio = gio_cong > 0 ? tong_luong / gio_cong : 0;

      // Cộng dồn
      sum_gio_cong += gio_cong;
      sum_gio_phat += gio_phat_tanca_lich;
      sum_gio_tinh += gio_tinh;
      sum_doanhthu += doanhthu;
      sum_khoan_thang += khoan_thang;
      sum_tien_vuot += tien_vuot;
      sum_tien_thuong += tien_thuong;
      sum_luong_cung += luong_cung;
      sum_tong_luong += tong_luong;

      // HTML row
      if (tbodyLuong) {
        const tr = document.createElement("tr");
        const add = (txt) => {
          const td = document.createElement("td");
          td.textContent = txt;
          tr.appendChild(td);
        };
        add(manv);
        add(ten);
        add(dia);
        add(fmt(gio_cong, 2));
        add(fmt(gio_phat_tanca_lich, 2));
        add(fmt(gio_tinh, 2));
        add(fmt(doanhthu, 0));
        add(fmt(khoan_gio, 0));
        add(fmt(khoan_thang, 0));
        add(fmt(tien_vuot, 0));
        add(fmt(tien_thuong, 0));
        add(fmt(luong_cung, 0));
        add(fmt(tong_luong, 0));
        add(fmt(luong_1_gio, 0));
        tbodyLuong.appendChild(tr);
      }

      // Handsontable row
      bangLuongData.push([
        manv,
        ten,
        dia,
        Number(gio_cong.toFixed(2)),
        Number(gio_phat_tanca_lich.toFixed(2)),
        Number(gio_tinh.toFixed(2)),
        Math.round(doanhthu),
        Math.round(khoan_gio),
        Math.round(khoan_thang),
        Math.round(tien_vuot),
        Math.round(tien_thuong),
        Math.round(luong_cung),
        Math.round(tong_luong),
        Math.round(luong_1_gio)
      ]);
    }

    // 5) Dòng tổng
    if (tbodyLuong) {
      const trTotal = document.createElement("tr");
      trTotal.className = "table-secondary fw-bold";
      const addTotal = (txt, colspan = 1) => {
        const td = document.createElement("td");
        if (colspan > 1) td.colSpan = colspan;
        td.textContent = txt;
        trTotal.appendChild(td);
      };

      addTotal("TỔNG");
      addTotal("", 2); // Tên NV + Cơ sở
      addTotal(fmt(sum_gio_cong, 2));
      addTotal(fmt(sum_gio_phat, 2));
      addTotal(fmt(sum_gio_tinh, 2));
      addTotal(fmt(sum_doanhthu, 0));
      addTotal(fmt(khoan_gio, 0));
      addTotal(fmt(sum_khoan_thang, 0));
      addTotal(fmt(sum_tien_vuot, 0));
      addTotal(fmt(sum_tien_thuong, 0));
      addTotal(fmt(sum_luong_cung, 0));
      addTotal(fmt(sum_tong_luong, 0));

      // Lương/1 giờ tổng: lấy theo tổng giờ công để tránh lệch
      const luong1hTong = sum_gio_cong > 0 ? sum_tong_luong / sum_gio_cong : 0;
      addTotal(fmt(luong1hTong, 0));

      tbodyLuong.appendChild(trTotal);
    }

    // Thêm dòng tổng vào HOT
    bangLuongData.push([
      "TỔNG",
      "",
      "",
      Number(sum_gio_cong.toFixed(2)),
      Number(sum_gio_phat.toFixed(2)),
      Number(sum_gio_tinh.toFixed(2)),
      Math.round(sum_doanhthu),
      Math.round(khoan_gio),
      Math.round(sum_khoan_thang),
      Math.round(sum_tien_vuot),
      Math.round(sum_tien_thuong),
      Math.round(sum_luong_cung),
      Math.round(sum_tong_luong),
      Math.round(sum_gio_cong > 0 ? sum_tong_luong / sum_gio_cong : 0)
    ]);

    // Render HOT
    renderLuongHot(bangLuongData);

    setStatus(`Đã tải xong. Tổng lương: ${fmt(sum_tong_luong, 0)} đ`);
  } catch (e) {
    console.error(e);
    setStatus("Có lỗi xảy ra khi tải bảng lương.", true);
    if (tbodyLuong) {
      tbodyLuong.innerHTML = `<tr><td colspan="14" style="color:red;">Có lỗi xảy ra.</td></tr>`;
    }
    renderLuongHot([]);
  }
}

async function taiBangCong() {
  const thang = parseInt(document.getElementById("bc-thang")?.value || "0");
  const nam = parseInt(document.getElementById("bc-nam")?.value || "0");
  const tbody = document.getElementById("tbody-bangcong");
  const thead = document.getElementById("thead-bangcong");

  tbody.innerHTML = `<tr><td colspan="50">Đang tải...</td></tr>`;

  const { data, error } = await supabase.rpc("chamcong_bangcong_monthly", {
    p_month: thang,
    p_year: nam
  });

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="50">Lỗi tải dữ liệu</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="50">Không có dữ liệu.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  const nhanvien = [
    ...new Set(
      data
        .filter(d => Number(d.gio_cong || 0) > 0)
        .map(d => `${normalizeManv(d.manv)}|${d.tennv}`)
    )
  ];

  if (nhanvien.length === 0) {
    thead.innerHTML = `<tr><th>Ngày</th><th>Thứ</th><th>Tổng</th></tr>`;
    tbody.innerHTML = `<tr><td colspan="3">Không có nhân viên nào phát sinh công trong tháng này.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  // Header HTML dự phòng
  let header = `<th>Ngày</th><th>Thứ</th>`;
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    header += `<th>${tennv}</th>`;
  });
  header += `<th>Tổng</th>`;
  thead.innerHTML = `<tr>${header}</tr>`;

  // Group theo ngày
  const groupByNgay = {};
  data.forEach(d => {
    groupByNgay[d.ngay] = groupByNgay[d.ngay] || [];
    groupByNgay[d.ngay].push(d);
  });

  // Header cho Handsontable
  const colHeaders = ["Ngày", "Thứ"];
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    colHeaders.push(tennv);
  });
  colHeaders.push("Tổng");

  const hotData = [];
  const tongTheoNhanVien = {};
  nhanvien.forEach(n => {
    const manv = normalizeManv(n.split("|")[0]);
    tongTheoNhanVien[manv] = 0;
  });
  let tongTatCa = 0;

  const ngayList = Object.keys(groupByNgay).sort((a, b) => Number(a) - Number(b));

  let html = "";

  ngayList.forEach(ng => {
    const row = groupByNgay[ng];
    const thu = row[0].thu;
    let sum = 0;

    const rowData = [Number(ng), thu];

    let cellsHtml = "";

    nhanvien.forEach(n => {
      const manv = normalizeManv(n.split("|")[0]);
      const found = row.find(r => normalizeManv(r.manv) === manv);
      const gioCong = found ? Number(found.gio_cong || 0) : 0;

      sum += gioCong;
      tongTheoNhanVien[manv] += gioCong;

      rowData.push(Number(gioCong.toFixed(2)));
      cellsHtml += `<td>${gioCong ? gioCong.toFixed(2) : ""}</td>`;
    });

    tongTatCa += sum;
    rowData.push(Number(sum.toFixed(2)));

    hotData.push(rowData);
    html += `<tr><td>${ng}</td><td>${thu}</td>${cellsHtml}<td>${sum ? sum.toFixed(2) : ""}</td></tr>`;
  });

  // Total row
  let totalHtml = `<tr style="font-weight:bold;background:#f3f3f3"><td colspan="2">Tổng</td>`;
  const totalRow = ["Tổng", ""];
  nhanvien.forEach(n => {
    const manv = normalizeManv(n.split("|")[0]);
    totalRow.push(Number(tongTheoNhanVien[manv].toFixed(2)));
    totalHtml += `<td>${tongTheoNhanVien[manv] ? tongTheoNhanVien[manv].toFixed(2) : ""}</td>`;
  });
  totalRow.push(Number(tongTatCa.toFixed(2)));
  totalHtml += `<td>${tongTatCa ? tongTatCa.toFixed(2) : ""}</td></tr>`;

  hotData.push(totalRow);

  tbody.innerHTML = html + totalHtml;

  // Render Handsontable
  renderBangCongHot(colHeaders, hotData);
}

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", () => {
  // Tương thích: nếu HTML cũ dùng id="app" thì đổi sang app-container
  const legacyApp = document.getElementById("app");
  if (legacyApp && !document.getElementById("app-container")) {
    legacyApp.id = "app-container";
  }

  setDefaultDates();
  setStatus("Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương.");

  if (btnTai) btnTai.addEventListener("click", taiBangLuong);

  const btnBangCong = document.getElementById("btn-bangcong");
  if (btnBangCong) btnBangCong.addEventListener("click", taiBangCong);

  // Default tháng/năm bảng công
  const today = new Date();
  const thangEl = document.getElementById("bc-thang");
  const namEl = document.getElementById("bc-nam");
  if (thangEl && namEl) {
    thangEl.value = today.getMonth() + 1;
    namEl.value = today.getFullYear();
  }

  // Đăng nhập dùng chung (NV: mã + mật khẩu; Admin: email + mật khẩu)
  authModule.khoiTaoDangNhapDungChung({
    appContainerId: "app-container",
    onLoginSuccess: async () => {
      const ok = await kiemTraQuyenXemTrang(window.location.pathname);
      // Nếu OK, bạn có thể tự động tải dữ liệu ở đây nếu muốn:
      // if (ok) taiBangLuong();
      return ok;
    }
  });
});

// Cho phép gọi từ bên ngoài
window.taiBangLuong = taiBangLuong;
window.taiBangCong = taiBangCong;
