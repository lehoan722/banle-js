import { supabase } from "./cafe_supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "./cafe_config.js";

const SCHEMA = CAFE_SCHEMA || "cafe";
const PAGE_SIZE = 1000;
const TIME_ZONE = "Asia/Ho_Chi_Minh";

const el = {
  tuNgay: document.getElementById("tuNgay"),
  denNgay: document.getElementById("denNgay"),
  locThu: document.getElementById("locThu"),
  locKhuVuc: document.getElementById("locKhuVuc"),
  locLoaiDon: document.getElementById("locLoaiDon"),
  bucketMinutes: document.getElementById("bucketMinutes"),
  timeBasis: document.getElementById("timeBasis"),
  rankBasis: document.getElementById("rankBasis"),
  btnXemBaoCao: document.getElementById("btnXemBaoCao"),
  btnCopyTable: document.getElementById("btnCopyTable"),
  reportMessage: document.getElementById("reportMessage"),
  reportMeta: document.getElementById("reportMeta"),
  hourlyTableBody: document.getElementById("hourlyTableBody"),
  kpiRevenue: document.getElementById("kpiRevenue"),
  kpiInvoices: document.getElementById("kpiInvoices"),
  kpiItems: document.getElementById("kpiItems"),
  kpiAvgBill: document.getElementById("kpiAvgBill"),
  kpiPeak: document.getElementById("kpiPeak"),
  kpiPeakValue: document.getElementById("kpiPeakValue"),
  kpiLow: document.getElementById("kpiLow"),
  kpiLowValue: document.getElementById("kpiLowValue"),
  heatmapContainer: document.getElementById("heatmapContainer"),
  revenueCanvas: document.getElementById("revenueChart"),
  workloadCanvas: document.getElementById("workloadChart"),
  detailOverlay: document.getElementById("detailOverlay"),
  detailTitle: document.getElementById("detailTitle"),
  detailSubtitle: document.getElementById("detailSubtitle"),
  detailLoading: document.getElementById("detailLoading"),
  detailTableBody: document.getElementById("detailTableBody"),
  btnCloseDetail: document.getElementById("btnCloseDetail"),
};

let rawRows = [];
let aggregatedRows = [];
let revenueChart = null;
let workloadChart = null;
let fallbackInvoiceCache = null;
let detailInvoiceCache = null;
let detailInvoiceCacheKey = "";
let lastDataSource = "";

const fmtInt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function money(value) {
  return `${fmtMoney.format(Number(value || 0))} đ`;
}

function shortMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${fmt1.format(n / 1_000_000_000)} tỷ`;
  if (Math.abs(n) >= 1_000_000) return `${fmt1.format(n / 1_000_000)} tr`;
  if (Math.abs(n) >= 1_000) return `${fmt1.format(n / 1_000)}k`;
  return fmtInt.format(n);
}

function showMessage(message = "", type = "info") {
  if (!message) {
    el.reportMessage.hidden = true;
    el.reportMessage.textContent = "";
    el.reportMessage.className = "report-message";
    return;
  }
  el.reportMessage.hidden = false;
  el.reportMessage.textContent = message;
  el.reportMessage.className = `report-message ${type}`;
}

function parseDateParts(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  return { y, m, d };
}

function addDaysDateString(dateStr, days) {
  const { y, m, d } = parseDateParts(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function getDateBounds(dateStr) {
  return `${dateStr}T00:00:00+07:00`;
}

function getLocalParts(isoValue) {
  if (!isoValue) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoValue));
  const obj = {};
  for (const p of parts) if (p.type !== "literal") obj[p.type] = Number(p.value);
  const dow = new Date(Date.UTC(obj.year, obj.month - 1, obj.day)).getUTCDay();
  return { ...obj, dow };
}

function formatDateTime(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoValue));
}

function formatDateOnly(isoValue) {
  if (!isoValue) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoValue));
}

function weekdayMatches(dow, filter) {
  if (filter === "all") return true;
  if (filter === "weekday") return dow >= 1 && dow <= 5;
  if (filter === "weekend") return dow === 0 || dow === 6;
  return Number(filter) === Number(dow);
}

function selectedDows(filter) {
  if (filter === "weekday") return [1, 2, 3, 4, 5];
  if (filter === "weekend") return [6, 0];
  if (filter === "all") return [1, 2, 3, 4, 5, 6, 0];
  return [Number(filter)];
}

function countDaysByDow(startStr, endStr) {
  const result = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const s = parseDateParts(startStr);
  const e = parseDateParts(endStr);
  let current = new Date(Date.UTC(s.y, s.m - 1, s.d));
  const end = new Date(Date.UTC(e.y, e.m - 1, e.d));
  while (current <= end) {
    result[current.getUTCDay()] += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

function countSelectedDays(startStr, endStr, filter) {
  const byDow = countDaysByDow(startStr, endStr);
  return selectedDows(filter).reduce((sum, dow) => sum + byDow[dow], 0);
}

function dayName(dow) {
  return ({ 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" })[Number(dow)] || "";
}

function bucketLabel(bucketMinute, bucketSize) {
  const end = bucketMinute + bucketSize;
  const f = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return `${f(bucketMinute)}–${f(end)}`;
}

function getRankMetric(row, basis) {
  if (basis === "item") return row.itemsPerDay;
  if (basis === "revenue") return row.revenuePerDay;
  return row.invoicesPerDay;
}

function getRankLabel(basis) {
  if (basis === "item") return "món/ngày";
  if (basis === "revenue") return "doanh thu/ngày";
  return "HĐ/ngày";
}

function getRankValueText(row, basis) {
  if (basis === "item") return `${fmt1.format(row.itemsPerDay)} món/ngày`;
  if (basis === "revenue") return `${money(row.revenuePerDay)}/ngày`;
  return `${fmt1.format(row.invoicesPerDay)} HĐ/ngày`;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function classifyLevels(rows, basis) {
  const values = rows.map((r) => getRankMetric(r, basis)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const q1 = percentile(values, 0.25);
  const q2 = percentile(values, 0.50);
  const q3 = percentile(values, 0.75);
  rows.forEach((r) => {
    const v = getRankMetric(r, basis);
    if (v <= q1) r.level = { text: "Thấp", cls: "level-low" };
    else if (v <= q2) r.level = { text: "Trung bình", cls: "level-normal" };
    else if (v <= q3) r.level = { text: "Cao", cls: "level-high" };
    else r.level = { text: "Cao điểm", cls: "level-peak" };
  });
}

async function loadKhuVuc() {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(CAFE_TABLES.KHUVUC || "cafe_khuvuc")
    .select("id, ten_khuvuc")
    .order("thu_tu", { ascending: true });

  if (error) {
    console.warn("Không tải được khu vực:", error);
    return;
  }

  (data || []).forEach((kv) => {
    const opt = document.createElement("option");
    opt.value = String(kv.id);
    opt.textContent = kv.ten_khuvuc || `Khu vực ${kv.id}`;
    el.locKhuVuc.appendChild(opt);
  });
}

function normalizeRpcRows(data) {
  return (data || []).map((r) => ({
    dow: Number(r.dow),
    bucketMinute: Number(r.bucket_minute),
    invoiceCount: Number(r.invoice_count || 0),
    itemQty: Number(r.item_qty || 0),
    revenue: Number(r.revenue || 0),
  }));
}

async function loadByRpc(filters) {
  const params = {
    p_tu_ngay: filters.tuNgay,
    p_den_ngay: filters.denNgay,
    p_bucket_minutes: filters.bucketMinutes,
    p_time_basis: filters.timeBasis,
    p_loai_don: filters.loaiDon || null,
    p_khuvuc_id: filters.khuVuc || null,
  };

  const { data, error } = await supabase
    .schema(SCHEMA)
    .rpc("bao_cao_theo_gio", params);

  if (error) throw error;
  return normalizeRpcRows(data);
}

async function fetchInvoicesPaged(filters, includeDetail = false) {
  const timeField = filters.timeBasis === "gio_thanh_toan" ? "gio_thanh_toan" : "gio_vao";
  const startIso = getDateBounds(filters.tuNgay);
  const endIso = getDateBounds(addDaysDateString(filters.denNgay, 1));
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    let selectFields;
    if (includeDetail) {
      selectFields = `
        id, so_hoadon, ban_id, khuvuc_id, loai_don, trang_thai,
        gio_vao, gio_thanh_toan, thanh_toan, tong_tien, manv, tennv,
        cafe_ban:ban_id (ten_ban),
        cafe_khuvuc:khuvuc_id (ten_khuvuc),
        cafe_hoadon_ct (id, so_luong, trang_thai)
      `;
    } else {
      selectFields = `
        id, khuvuc_id, loai_don, trang_thai, gio_vao, gio_thanh_toan,
        thanh_toan, tong_tien,
        cafe_hoadon_ct (id, so_luong, trang_thai)
      `;
    }

    let query = supabase
      .schema(SCHEMA)
      .from(CAFE_TABLES.HOADON || "cafe_hoadon")
      .select(selectFields)
      .eq("trang_thai", "da_thanh_toan")
      .gte(timeField, startIso)
      .lt(timeField, endIso)
      .order(timeField, { ascending: true })
      .range(from, to);

    if (filters.loaiDon) query = query.eq("loai_don", filters.loaiDon);
    if (filters.khuVuc) query = query.eq("khuvuc_id", filters.khuVuc);

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function aggregateFallbackInvoices(invoices, filters) {
  const map = new Map();
  const timeField = filters.timeBasis === "gio_thanh_toan" ? "gio_thanh_toan" : "gio_vao";

  for (const hd of invoices) {
    const p = getLocalParts(hd[timeField]);
    if (!p) continue;
    const minuteOfDay = p.hour * 60 + p.minute;
    const bucketMinute = Math.floor(minuteOfDay / filters.bucketMinutes) * filters.bucketMinutes;
    const key = `${p.dow}|${bucketMinute}`;
    if (!map.has(key)) {
      map.set(key, { dow: p.dow, bucketMinute, invoiceCount: 0, itemQty: 0, revenue: 0 });
    }
    const row = map.get(key);
    row.invoiceCount += 1;
    row.itemQty += (hd.cafe_hoadon_ct || [])
      .filter((ct) => ct.trang_thai !== "da_huy")
      .reduce((s, ct) => s + Number(ct.so_luong || 0), 0);
    row.revenue += Number(hd.thanh_toan ?? hd.tong_tien ?? 0);
  }

  return Array.from(map.values());
}

async function loadReportRows(filters) {
  fallbackInvoiceCache = null;
  detailInvoiceCache = null;
  detailInvoiceCacheKey = "";
  try {
    const rows = await loadByRpc(filters);
    lastDataSource = "rpc";
    showMessage("");
    return rows;
  } catch (rpcError) {
    console.warn("RPC bao_cao_theo_gio chưa sẵn sàng, chuyển sang phân trang trực tiếp:", rpcError);
    const invoices = await fetchInvoicesPaged(filters, false);
    fallbackInvoiceCache = invoices;
    lastDataSource = "fallback";
    showMessage("Đang dùng chế độ tương thích (phân trang trực tiếp). Trang vẫn tính đủ dữ liệu; để chạy nhanh hơn khi dữ liệu lớn, hãy chạy file SQL RPC đi kèm gói cập nhật.", "info");
    return aggregateFallbackInvoices(invoices, filters);
  }
}

function getFilters() {
  return {
    tuNgay: el.tuNgay.value,
    denNgay: el.denNgay.value,
    thu: el.locThu.value,
    khuVuc: el.locKhuVuc.value,
    loaiDon: el.locLoaiDon.value,
    bucketMinutes: Number(el.bucketMinutes.value || 60),
    timeBasis: el.timeBasis.value,
    rankBasis: el.rankBasis.value,
  };
}

function aggregateForSelectedDays(rows, filters) {
  const filtered = rows.filter((r) => weekdayMatches(r.dow, filters.thu));
  const days = Math.max(1, countSelectedDays(filters.tuNgay, filters.denNgay, filters.thu));
  const map = new Map();

  for (const r of filtered) {
    if (!map.has(r.bucketMinute)) {
      map.set(r.bucketMinute, { bucketMinute: r.bucketMinute, invoiceCount: 0, itemQty: 0, revenue: 0 });
    }
    const out = map.get(r.bucketMinute);
    out.invoiceCount += r.invoiceCount;
    out.itemQty += r.itemQty;
    out.revenue += r.revenue;
  }

  const result = Array.from(map.values()).sort((a, b) => a.bucketMinute - b.bucketMinute);
  const totalRevenue = result.reduce((s, r) => s + r.revenue, 0);
  result.forEach((r) => {
    r.invoicesPerDay = r.invoiceCount / days;
    r.itemsPerDay = r.itemQty / days;
    r.revenuePerDay = r.revenue / days;
    r.avgBill = r.invoiceCount ? r.revenue / r.invoiceCount : 0;
    r.share = totalRevenue ? (r.revenue / totalRevenue) * 100 : 0;
  });

  classifyLevels(result, filters.rankBasis);
  return { rows: result, days };
}

function renderKpis(rows, filters) {
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const totalItems = rows.reduce((s, r) => s + r.itemQty, 0);

  el.kpiRevenue.textContent = money(totalRevenue);
  el.kpiInvoices.textContent = fmtInt.format(totalInvoices);
  el.kpiItems.textContent = fmtInt.format(totalItems);
  el.kpiAvgBill.textContent = money(totalInvoices ? totalRevenue / totalInvoices : 0);

  if (!rows.length) {
    el.kpiPeak.textContent = "--";
    el.kpiPeakValue.textContent = "--";
    el.kpiLow.textContent = "--";
    el.kpiLowValue.textContent = "--";
    return;
  }

  const ranked = [...rows].sort((a, b) => getRankMetric(b, filters.rankBasis) - getRankMetric(a, filters.rankBasis));
  const peak = ranked[0];
  const low = ranked[ranked.length - 1];
  el.kpiPeak.textContent = bucketLabel(peak.bucketMinute, filters.bucketMinutes);
  el.kpiPeakValue.textContent = getRankValueText(peak, filters.rankBasis);
  el.kpiLow.textContent = bucketLabel(low.bucketMinute, filters.bucketMinutes);
  el.kpiLowValue.textContent = getRankValueText(low, filters.rankBasis);
}

function renderTable(rows, filters) {
  if (!rows.length) {
    el.hourlyTableBody.innerHTML = `<tr><td colspan="10">Không có hóa đơn đã thanh toán trong điều kiện đã chọn.</td></tr>`;
    return;
  }

  el.hourlyTableBody.innerHTML = rows.map((r) => `
    <tr data-bucket="${r.bucketMinute}" title="Nhấn để xem hóa đơn">
      <td><b>${bucketLabel(r.bucketMinute, filters.bucketMinutes)}</b></td>
      <td class="text-right">${fmtInt.format(r.invoiceCount)}</td>
      <td class="text-right">${fmt1.format(r.invoicesPerDay)}</td>
      <td class="text-right">${fmtInt.format(r.itemQty)}</td>
      <td class="text-right">${fmt1.format(r.itemsPerDay)}</td>
      <td class="text-right">${money(r.revenue)}</td>
      <td class="text-right">${money(r.revenuePerDay)}</td>
      <td class="text-right">${money(r.avgBill)}</td>
      <td class="text-right">${fmt1.format(r.share)}%</td>
      <td><span class="level-badge ${r.level.cls}">${r.level.text}</span></td>
    </tr>
  `).join("");

  el.hourlyTableBody.querySelectorAll("tr[data-bucket]").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(Number(tr.dataset.bucket)));
  });
}

function destroyCharts() {
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  if (workloadChart) { workloadChart.destroy(); workloadChart = null; }
}

function renderCharts(rows, filters) {
  destroyCharts();
  if (!window.Chart || !rows.length) return;

  const labels = rows.map((r) => bucketLabel(r.bucketMinute, filters.bucketMinutes));

  revenueChart = new window.Chart(el.revenueCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Doanh thu TB/ngày",
        data: rows.map((r) => Math.round(r.revenuePerDay)),
        backgroundColor: "rgba(5, 115, 217, 0.72)",
        borderColor: "rgba(5, 115, 217, 1)",
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: { callbacks: { label: (ctx) => ` ${money(ctx.raw)}/ngày` } },
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => shortMoney(v) } },
        x: { ticks: { maxRotation: 60, minRotation: 0, autoSkip: filters.bucketMinutes === 30 } },
      },
    },
  });

  workloadChart = new window.Chart(el.workloadCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Hóa đơn/ngày",
          data: rows.map((r) => Number(r.invoicesPerDay.toFixed(2))),
          borderColor: "rgba(220, 38, 38, 0.95)",
          backgroundColor: "rgba(220, 38, 38, 0.10)",
          tension: 0.25,
          pointRadius: 3,
        },
        {
          label: "Món/ngày",
          data: rows.map((r) => Number(r.itemsPerDay.toFixed(2))),
          borderColor: "rgba(22, 163, 74, 0.95)",
          backgroundColor: "rgba(22, 163, 74, 0.10)",
          tension: 0.25,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true },
        x: { ticks: { maxRotation: 60, minRotation: 0, autoSkip: filters.bucketMinutes === 30 } },
      },
    },
  });
}

function heatValue(row, dowDays, basis) {
  const days = Math.max(1, dowDays);
  if (basis === "item") return row.itemQty / days;
  if (basis === "revenue") return row.revenue / days;
  return row.invoiceCount / days;
}

function renderHeatmap(raw, filters) {
  const dows = selectedDows(filters.thu);
  const dayCounts = countDaysByDow(filters.tuNgay, filters.denNgay);
  const filteredRaw = raw.filter((r) => dows.includes(Number(r.dow)));
  const bucketSet = new Set(filteredRaw.map((r) => r.bucketMinute));
  const buckets = Array.from(bucketSet).sort((a, b) => a - b);

  if (!buckets.length) {
    el.heatmapContainer.innerHTML = `<div>Không có dữ liệu để tạo heatmap.</div>`;
    return;
  }

  const map = new Map(filteredRaw.map((r) => [`${r.dow}|${r.bucketMinute}`, r]));
  const vals = [];
  for (const dow of dows) {
    for (const bucket of buckets) {
      const r = map.get(`${dow}|${bucket}`) || { invoiceCount: 0, itemQty: 0, revenue: 0 };
      vals.push(heatValue(r, dayCounts[dow], filters.rankBasis));
    }
  }
  const max = Math.max(...vals, 0);

  const getHeatClass = (v) => {
    if (!max || v <= 0) return "heat-0";
    const ratio = v / max;
    if (ratio <= 0.25) return "heat-1";
    if (ratio <= 0.50) return "heat-2";
    if (ratio <= 0.75) return "heat-3";
    return "heat-4";
  };

  const cellText = (r, dow) => {
    const v = heatValue(r, dayCounts[dow], filters.rankBasis);
    return filters.rankBasis === "revenue" ? shortMoney(v) : fmt1.format(v);
  };

  const cellTitle = (r, dow, bucket) => {
    const days = Math.max(1, dayCounts[dow]);
    return `${dayName(dow)} ${bucketLabel(bucket, filters.bucketMinutes)}\n` +
      `TB ${fmt1.format(r.invoiceCount / days)} HĐ | ${fmt1.format(r.itemQty / days)} món | ${money(r.revenue / days)}/ngày`;
  };

  el.heatmapContainer.innerHTML = `
    <table class="heatmap-table">
      <thead><tr><th>Thứ</th>${buckets.map((b) => `<th>${bucketLabel(b, filters.bucketMinutes).replace("–", "<br>–")}</th>`).join("")}</tr></thead>
      <tbody>
        ${dows.map((dow) => `
          <tr>
            <th>${dayName(dow)}<br><small>${dayCounts[dow]} ngày</small></th>
            ${buckets.map((bucket) => {
              const r = map.get(`${dow}|${bucket}`) || { invoiceCount: 0, itemQty: 0, revenue: 0 };
              const v = heatValue(r, dayCounts[dow], filters.rankBasis);
              return `<td class="${getHeatClass(v)}" title="${cellTitle(r, dow, bucket)}">${cellText(r, dow)}</td>`;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderMeta(filters, days) {
  const dayLabel = el.locThu.options[el.locThu.selectedIndex]?.textContent || "Tất cả";
  const khuLabel = el.locKhuVuc.options[el.locKhuVuc.selectedIndex]?.textContent || "Tất cả";
  const loaiLabel = el.locLoaiDon.options[el.locLoaiDon.selectedIndex]?.textContent || "Tất cả";
  const source = lastDataSource === "rpc" ? "RPC tổng hợp" : "phân trang trực tiếp";
  el.reportMeta.textContent = `${filters.tuNgay} → ${filters.denNgay} • ${days} ngày tính TB • ${dayLabel} • ${khuLabel} • ${loaiLabel} • ${getRankLabel(filters.rankBasis)} • ${source}`;
}

async function runReport() {
  const filters = getFilters();
  if (!filters.tuNgay || !filters.denNgay) {
    showMessage("Vui lòng chọn đủ từ ngày và đến ngày.", "error");
    return;
  }
  if (filters.tuNgay > filters.denNgay) {
    showMessage("Từ ngày không được lớn hơn đến ngày.", "error");
    return;
  }

  el.btnXemBaoCao.disabled = true;
  el.btnXemBaoCao.textContent = "⏳ Đang tải...";
  el.hourlyTableBody.innerHTML = `<tr><td colspan="10">Đang tổng hợp dữ liệu...</td></tr>`;
  showMessage("");

  try {
    rawRows = await loadReportRows(filters);
    const result = aggregateForSelectedDays(rawRows, filters);
    aggregatedRows = result.rows;
    renderKpis(aggregatedRows, filters);
    renderTable(aggregatedRows, filters);
    renderCharts(aggregatedRows, filters);
    renderHeatmap(rawRows, filters);
    renderMeta(filters, result.days);
  } catch (error) {
    console.error(error);
    showMessage(`Không tải được báo cáo: ${error.message || error}`, "error");
    el.hourlyTableBody.innerHTML = `<tr><td colspan="10">Lỗi tải dữ liệu.</td></tr>`;
  } finally {
    el.btnXemBaoCao.disabled = false;
    el.btnXemBaoCao.textContent = "🔍 Xem báo cáo";
  }
}

function copyTable() {
  const table = document.getElementById("hourlyTable");
  const rows = Array.from(table.querySelectorAll("tr"));
  const text = rows.map((tr) => Array.from(tr.cells).map((c) => c.innerText.replace(/\n/g, " ")).join("\t")).join("\n");
  navigator.clipboard.writeText(text).then(() => showMessage("Đã copy bảng báo cáo vào clipboard.", "info"));
}

function setupViewTabs() {
  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".report-view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`)?.classList.add("active");
      if (btn.dataset.view === "revenue" && revenueChart) revenueChart.resize();
      if (btn.dataset.view === "workload" && workloadChart) workloadChart.resize();
    });
  });
}

async function getDetailInvoices(filters) {
  const key = JSON.stringify({
    tuNgay: filters.tuNgay,
    denNgay: filters.denNgay,
    timeBasis: filters.timeBasis,
    loaiDon: filters.loaiDon,
    khuVuc: filters.khuVuc,
  });
  if (detailInvoiceCache && detailInvoiceCacheKey === key) return detailInvoiceCache;
  detailInvoiceCache = await fetchInvoicesPaged(filters, true);
  detailInvoiceCacheKey = key;
  return detailInvoiceCache;
}

async function openDetail(bucketMinute) {
  const filters = getFilters();
  el.detailOverlay.hidden = false;
  el.detailLoading.hidden = false;
  el.detailTableBody.innerHTML = "";
  el.detailTitle.textContent = `Chi tiết ${bucketLabel(bucketMinute, filters.bucketMinutes)}`;
  el.detailSubtitle.textContent = `${filters.tuNgay} → ${filters.denNgay}`;

  try {
    let invoices = await getDetailInvoices(filters);
    const timeField = filters.timeBasis === "gio_thanh_toan" ? "gio_thanh_toan" : "gio_vao";
    invoices = invoices.filter((hd) => {
      const p = getLocalParts(hd[timeField]);
      if (!p || !weekdayMatches(p.dow, filters.thu)) return false;
      const b = Math.floor((p.hour * 60 + p.minute) / filters.bucketMinutes) * filters.bucketMinutes;
      return b === bucketMinute;
    });

    invoices.sort((a, b) => new Date(a[timeField]) - new Date(b[timeField]));
    el.detailSubtitle.textContent = `${filters.tuNgay} → ${filters.denNgay} • ${fmtInt.format(invoices.length)} hóa đơn`;

    if (!invoices.length) {
      el.detailTableBody.innerHTML = `<tr><td colspan="9">Không có hóa đơn.</td></tr>`;
    } else {
      el.detailTableBody.innerHTML = invoices.map((hd) => {
        const itemQty = (hd.cafe_hoadon_ct || [])
          .filter((ct) => ct.trang_thai !== "da_huy")
          .reduce((s, ct) => s + Number(ct.so_luong || 0), 0);
        const area = hd.loai_don === "mang_ve"
          ? "Mang về"
          : [hd.cafe_khuvuc?.ten_khuvuc, hd.cafe_ban?.ten_ban].filter(Boolean).join(" / ");
        return `
          <tr>
            <td>${formatDateOnly(hd[timeField])}</td>
            <td>${hd.so_hoadon || ""}</td>
            <td>${formatDateTime(hd.gio_vao)}</td>
            <td>${formatDateTime(hd.gio_thanh_toan)}</td>
            <td>${area || ""}</td>
            <td>${hd.loai_don === "mang_ve" ? "Mang về" : "Tại bàn"}</td>
            <td>${hd.tennv || hd.manv || ""}</td>
            <td class="text-right">${fmtInt.format(itemQty)}</td>
            <td class="text-right">${money(hd.thanh_toan ?? hd.tong_tien ?? 0)}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (error) {
    console.error(error);
    el.detailTableBody.innerHTML = `<tr><td colspan="9">❌ ${error.message || error}</td></tr>`;
  } finally {
    el.detailLoading.hidden = true;
  }
}

function closeDetail() {
  el.detailOverlay.hidden = true;
}

function setDefaultDates() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { y, m } = parseDateParts(today);
  el.tuNgay.value = `${y}-${String(m).padStart(2, "0")}-01`;
  el.denNgay.value = today;
}

el.btnXemBaoCao.addEventListener("click", runReport);
el.btnCopyTable.addEventListener("click", copyTable);
el.rankBasis.addEventListener("change", () => {
  if (!rawRows.length) return;
  const filters = getFilters();
  const result = aggregateForSelectedDays(rawRows, filters);
  aggregatedRows = result.rows;
  renderKpis(aggregatedRows, filters);
  renderTable(aggregatedRows, filters);
  renderCharts(aggregatedRows, filters);
  renderHeatmap(rawRows, filters);
  renderMeta(filters, result.days);
});
el.locThu.addEventListener("change", () => {
  if (!rawRows.length) return;
  const filters = getFilters();
  const result = aggregateForSelectedDays(rawRows, filters);
  aggregatedRows = result.rows;
  renderKpis(aggregatedRows, filters);
  renderTable(aggregatedRows, filters);
  renderCharts(aggregatedRows, filters);
  renderHeatmap(rawRows, filters);
  renderMeta(filters, result.days);
});
el.btnCloseDetail.addEventListener("click", closeDetail);
el.detailOverlay.addEventListener("click", (e) => { if (e.target === el.detailOverlay) closeDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

setupViewTabs();
setDefaultDates();
await loadKhuVuc();
await runReport();
