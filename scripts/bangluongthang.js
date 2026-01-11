// bangluongthang_xem.js - Bảng lương tháng (NV + Admin xem) - ẩn Doanh thu / Khoán / Tiền vượt
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

const hotLuongContainer = document.getElementById("hotLuong");
const hotBangCongContainer = document.getElementById("hotBangCong");

let hotLuong = null;
let hotBangCong = null;

// =============================
// QUYỀN TRUY CẬP: trang này cho phép cả NV + ADMIN xem
// =============================
async function kiemTraQuyenXemTrang(_pathTrang) {
  const nv = authModule.getCurrentUserInfo();
  if (!nv || !nv.manv) return false;
  return true;
}

// Hàm hiện thông báo cấm truy cập (giữ lại phòng khi bạn muốn bật lại phân quyền theo nv_page)
function hienCamTruyCap(msg) {
  document.body.innerHTML = `
    <div style="padding:24px;color:#b00020;font-size:20px;font-weight:bold">
      ⛔ Không có quyền truy cập<br>
      <div style="font-size:16px;margin-top:8px;color:#444">${msg}</div>
    </div>`;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(lastDay);
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

// =================== HELPERS ===================
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

// Lấy tên NV: dmnhanvien (nếu được) -> fallback từ bảng công tháng
async function loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr) {
  const mapTen = {};

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
  } catch (_) {}

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
  } catch (_) {}

  return mapTen;
}

// KPI chạy song song có giới hạn
async function loadDoanhThuKPIConcurrent(manvArr, tu_ngay, den_ngay, concurrency = 2) {
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

        map[manv] = kpiErr ? 0 : Number(kpiData?.[0]?.tong_doanh_thu || 0);
      } catch (_) {
        map[manv] = 0;
      } finally {
        done++;
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

// =================== HOT: BẢNG LƯƠNG (ẨN CỘT NHẠY CẢM) ===================
function renderLuongHot(data) {
  if (!hotLuongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) return;

  const colHeaders = [
    "Mã NV",
    "Tên NV",
    "Cơ sở",
    "Giờ công",
    "Giờ trừ",
    "Giờ tính lương",
    "Thưởng vượt khoán",
    "Lương cứng",
    "Tổng lương",
    "Lương/1 giờ"
  ];

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
    { data: 9, type: "numeric", numericFormat: { pattern: "0,0" } }
  ];

  const colWidths = [80, 110, 70, 90, 90, 110, 140, 110, 110, 110];

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
    licenseKey: "non-commercial-and-evaluation"
  };

  if (!hotLuong) hotLuong = new HOT(hotLuongContainer, settings);
  else hotLuong.updateSettings(settings);
}

// =================== HOT: BẢNG CÔNG (GIỮ NGUYÊN) ===================
function renderBangCongHot(colHeaders, data) {
  if (!hotBangCongContainer) return;
  const HOT = window.Handsontable;
  if (!HOT) return;

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

  if (!hotBangCong) hotBangCong = new HOT(hotBangCongContainer, settings);
  else hotBangCong.updateSettings(settings);
}

// =================== TẢI BẢNG LƯƠNG ===================
async function taiBangLuong() {
  const tu_ngay = tuNgayInput.value;
  const den_ngay = denNgayInput.value;
  const diadiem = diadiemSelect?.value || null;
  const luong_gio = parseFloat(luongGioInput.value || "0") || 0;
  const khoan_gio = parseFloat(khoanGioInput.value || "0") || 0;
  const pct_thuong = parseFloat(pctThuongInput.value || "0") || 0;

  setStatus("Đang tải dữ liệu lương...");
  tbodyLuong.innerHTML = `<tr><td colspan="10">Đang tải...</td></tr>`;

  try {
    const { data: congData, error: congErr } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      { tu_ngay, den_ngay, p_diadiem: diadiem, p_manv: null }
    );

    if (congErr) {
      setStatus("Lỗi lấy dữ liệu chấm công.", true);
      tbodyLuong.innerHTML = `<tr><td colspan="10" style="color:red;">Lỗi chamcong_tinhcong_monthly.</td></tr>`;
      renderLuongHot([]);
      return;
    }
    if (!congData || congData.length === 0) {
      setStatus("Không có dữ liệu chấm công trong khoảng này.");
      tbodyLuong.innerHTML = `<tr><td colspan="10">Không có dữ liệu.</td></tr>`;
      renderLuongHot([]);
      return;
    }

    const manvArr = Array.from(new Set(congData.map(r => normalizeManv(r.manv)))).filter(Boolean);

    setStatus(`Đang lấy tên nhân viên... (${manvArr.length} NV)`);
    const mapTen = await loadTenNhanVienForRange(tu_ngay, den_ngay, manvArr);

    setStatus(`Đang tải doanh thu KPI... (0/${manvArr.length})`);
    const mapDoanhThuKPI = await loadDoanhThuKPIConcurrent(manvArr, tu_ngay, den_ngay, 6);

    const byManv = {};
    congData.forEach(r => {
      const k = normalizeManv(r.manv);
      if (!k) return;
      if (!byManv[k]) byManv[k] = [];
      byManv[k].push({ ...r, manv: k });
    });

    tbodyLuong.innerHTML = "";
    const bangLuongData = [];

    let sum_gio_cong = 0;
    let sum_gio_phat = 0;
    let sum_gio_tinh = 0;
    let sum_tien_thuong = 0;
    let sum_luong_cung = 0;
    let sum_tong_luong = 0;

    const manvKeys = Object.keys(byManv).sort();

    for (const manv of manvKeys) {
      const rows = byManv[manv];
      const ten = mapTen[manv] || "";
      const dia = rows?.[0]?.diadiem || "";

      let gio_cong = 0;
      let so_ngay_tanca_lich = 0;
      rows.forEach(r => {
        gio_cong += Number(r.tong_gio_cong || 0);
        so_ngay_tanca_lich += Number(r.so_ngay_tanca_lich || 0);
      });

      const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
      const gio_tinh = Math.max(gio_cong - gio_phat_tanca_lich, 0);

      // ✅ vẫn tính nội bộ để ra lương (chỉ ẩn cột hiển thị)
      const doanhthu = Number(mapDoanhThuKPI[manv] || 0);
      const khoan_thang = gio_tinh * khoan_gio;
      const tien_vuot = doanhthu - khoan_thang;
      const tien_thuong = tien_vuot * (pct_thuong / 100.0);

      const luong_cung = gio_tinh * luong_gio;
      const tong_luong = luong_cung + tien_thuong;
      const luong_1_gio = gio_cong > 0 ? tong_luong / gio_cong : 0;

      sum_gio_cong += gio_cong;
      sum_gio_phat += gio_phat_tanca_lich;
      sum_gio_tinh += gio_tinh;
      sum_tien_thuong += tien_thuong;
      sum_luong_cung += luong_cung;
      sum_tong_luong += tong_luong;

      const tr = document.createElement("tr");
      const add = (txt) => {
        const td = document.createElement("td");
        td.textContent = txt;
        tr.appendChild(td);
      };

      // ✅ chỉ render các cột được phép xem
      add(manv);
      add(ten);
      add(dia);
      add(fmt(gio_cong, 2));
      add(fmt(gio_phat_tanca_lich, 2));
      add(fmt(gio_tinh, 2));
      add(fmt(tien_thuong, 0));
      add(fmt(luong_cung, 0));
      add(fmt(tong_luong, 0));
      add(fmt(luong_1_gio, 0));
      tbodyLuong.appendChild(tr);

      bangLuongData.push([
        manv,
        ten,
        dia,
        Number(gio_cong.toFixed(2)),
        Number(gio_phat_tanca_lich.toFixed(2)),
        Number(gio_tinh.toFixed(2)),
        Math.round(tien_thuong),
        Math.round(luong_cung),
        Math.round(tong_luong),
        Math.round(luong_1_gio)
      ]);
    }

    // Total row (HTML)
    const trTotal = document.createElement("tr");
    trTotal.className = "table-secondary fw-bold";
    const addTotal = (txt, colspan = 1) => {
      const td = document.createElement("td");
      if (colspan > 1) td.colSpan = colspan;
      td.textContent = txt;
      trTotal.appendChild(td);
    };

    addTotal("TỔNG", 3);
    addTotal(fmt(sum_gio_cong, 2));
    addTotal(fmt(sum_gio_phat, 2));
    addTotal(fmt(sum_gio_tinh, 2));
    addTotal(fmt(sum_tien_thuong, 0));
    addTotal(fmt(sum_luong_cung, 0));
    addTotal(fmt(sum_tong_luong, 0));

    const luong1hTong = sum_gio_cong > 0 ? sum_tong_luong / sum_gio_cong : 0;
    addTotal(fmt(luong1hTong, 0));

    tbodyLuong.appendChild(trTotal);

    // Total row (HOT)
    bangLuongData.push([
      "TỔNG",
      "",
      "",
      Number(sum_gio_cong.toFixed(2)),
      Number(sum_gio_phat.toFixed(2)),
      Number(sum_gio_tinh.toFixed(2)),
      Math.round(sum_tien_thuong),
      Math.round(sum_luong_cung),
      Math.round(sum_tong_luong),
      Math.round(luong1hTong)
    ]);

    renderLuongHot(bangLuongData);

    setStatus(`Đã tải ${congData.length} dòng. Tổng lương: ${fmt(sum_tong_luong, 0)} đ.`);
  } catch (err) {
    console.error(err);
    setStatus("Có lỗi xảy ra khi tải bảng lương.", true);
    tbodyLuong.innerHTML = `<tr><td colspan="10" style="color:red;">Có lỗi xảy ra.</td></tr>`;
    renderLuongHot([]);
  }
}

// =================== TẢI BẢNG CÔNG (GIỮ NGUYÊN) ===================
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
    tbody.innerHTML = `<tr><td colspan="3">Không có nhân viên nào phát sinh công.</td></tr>`;
    renderBangCongHot([], []);
    return;
  }

  let header = `<th>Ngày</th><th>Thứ</th>`;
  nhanvien.forEach(n => {
    const [, tennv] = n.split("|");
    header += `<th>${tennv}</th>`;
  });
  header += `<th>Tổng</th>`;
  thead.innerHTML = `<tr>${header}</tr>`;

  const groupByNgay = {};
  data.forEach(d => {
    groupByNgay[d.ngay] = groupByNgay[d.ngay] || [];
    groupByNgay[d.ngay].push(d);
  });

  const colHeaders = ["Ngày", "Thứ"];
  nhanvien.forEach(n => colHeaders.push(n.split("|")[1]));
  colHeaders.push("Tổng");

  const hotData = [];
  const tongTheoNhanVien = {};
  nhanvien.forEach(n => (tongTheoNhanVien[normalizeManv(n.split("|")[0])] = 0));
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

  renderBangCongHot(colHeaders, hotData);
}

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", () => {
  // tương thích id app/app-container
  const legacyApp = document.getElementById("app");
  if (legacyApp && !document.getElementById("app-container")) legacyApp.id = "app-container";

  setDefaultDates();
  setStatus("Chọn tháng, lương/giờ, khoán/giờ và % thưởng rồi bấm Tải bảng lương.");

  btnTai?.addEventListener("click", taiBangLuong);
  document.getElementById("btn-bangcong")?.addEventListener("click", taiBangCong);

  const today = new Date();
  const thangEl = document.getElementById("bc-thang");
  const namEl = document.getElementById("bc-nam");
  if (thangEl && namEl) {
    thangEl.value = today.getMonth() + 1;
    namEl.value = today.getFullYear();
  }

  authModule.khoiTaoDangNhapDungChung({
    appContainerId: "app-container",
    onLoginSuccess: async () => {
      const ok = await kiemTraQuyenXemTrang(window.location.pathname);
      return ok;
    }
  });
});

window.taiBangLuong = taiBangLuong;
window.taiBangCong = taiBangCong;
