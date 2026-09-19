// baocaoluong.js
// Tính lương tháng: giờ công (chamcong_tinhcong_monthly)
// + thưởng doanh thu vượt khoán (nv_match2h_summary_all)

import { supabase } from "./supabaseClient.js";
import { fillNhanVienDropdown } from "./dmnhanvien.js"; // <-- dùng chung dropdown NV 

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isFirstDayOfMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T00:00:00");
  return d.getDate() === 1;
}

function getLastDayOfMonth(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();

  // ngày 0 của tháng sau = ngày cuối tháng hiện tại
  const lastDay = new Date(y, m + 1, 0);
  return toIsoDate(lastDay);
}

function setDefaultDates() {
  const tuNgayInput = document.getElementById("tu_ngay");
  const denNgayInput = document.getElementById("den_ngay");
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  tuNgayInput.value = toIsoDate(firstDay);
  denNgayInput.value = toIsoDate(today);
}

function fmtNumber(n, decimals = 0) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function normalizeManv(v) {
  return String(v || "").trim().toUpperCase();
}

async function loadKhoanTruForNhanVien(tu_ngay, den_ngay, manv) {
  const k = normalizeManv(manv);
  if (!k) return 0;

  const { data, error } = await supabase
    .from("cackhoantru")
    .select("so_tien")
    .gte("ngay_phatsinh", tu_ngay)
    .lte("ngay_phatsinh", den_ngay)
    .eq("manv", k);

  if (error) {
    console.error("Lỗi lấy các khoản trừ:", error);
    return 0;
  }

  return (data || []).reduce((sum, r) => {
    return sum + Number(r.so_tien || 0);
  }, 0);
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
}

function setResultFields(values) {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText("kq-manv", values.manv || "-");
  setText("kq-range", values.range || "-");

  setText("kq-so-ngay-cong", fmtNumber(values.so_ngay_cong, 0));
  setText("kq-tong-gio-cong", fmtNumber(values.tong_gio_cong, 2));
  setText("kq-gio-cong-tinh-luong", fmtNumber(values.gio_cong_tinh_luong, 2));
  setText("kq-gio-phat-tanca-lich", fmtNumber(values.gio_phat_tanca_lich, 2));

  setText("kq-auto-tanca", fmtNumber(values.so_lan_auto_tanca, 0));
  setText("kq-cb1", fmtNumber(values.so_ngay_cb1, 0));
  setText("kq-cb2", fmtNumber(values.so_ngay_cb2, 0));
  setText("kq-cb3", fmtNumber(values.so_ngay_cb3, 0));
  setText("kq-so-ngay-vang", fmtNumber(values.so_ngay_vang, 0));
  setText("kq-so-ngay-tanca-lich", fmtNumber(values.so_ngay_tanca_lich, 0));

  setText("kq-khoan-gio", fmtNumber(values.khoan_gio, 0));
  setText("kq-khoan-thang", fmtNumber(values.khoan_thang, 0));
  setText("kq-doanhso", fmtNumber(values.tong_doanh_thu, 0));
  setText("kq-hoa-hong", fmtNumber(values.tong_hoa_hong, 0));
  setText("kq-tien-vuot", fmtNumber(values.tien_vuot, 0));
  setText("kq-thuong-doanhso", fmtNumber(values.tien_thuong, 0));
  setText("kq-luong-gio", fmtNumber(values.luong_gio_thang, 0));
  setText("kq-tong-luong", fmtNumber(values.tong_luong, 0));
  setText("kq-khoan-tru", fmtNumber(values.khoan_tru, 0));
  setText("kq-thuc-linh", fmtNumber(values.thuc_linh, 0));
  setText("kq-luong-1-gio", fmtNumber(values.luong_1_gio, 0));

  const warns = [];

  if (values.so_ngay_cb1 > 0) {
    warns.push(`- Có ${values.so_ngay_cb1} ngày bán hàng nhưng không vào ca đúng quy trình (CB1).`);
  }
  if (values.so_ngay_cb2 > 0) {
    warns.push(`- Có ${values.so_ngay_cb2} ngày nghỉ trưa quá 70 phút (CB2).`);
  }
  if (values.so_ngay_cb3 > 0) {
    warns.push(`- Có ${values.so_ngay_cb3} ngày nghỉ chiều quá 40 phút (CB3).`);
  }
  if (values.so_lan_auto_tanca > 5) {
    warns.push(`- AUTO_TANCA ${values.so_lan_auto_tanca} lần trong kỳ (>5 lần) – cần xem lại ý thức chấm công.`);
  }
  if (values.so_ngay_vang > 0) {
    warns.push(`- Có ${values.so_ngay_vang} ca VẮNG (vào ca muộn > 15 phút hoặc không vào ca).`);
  }
  if (values.so_ngay_tanca_lich > 0) {
    warns.push(
      `- Có ${values.so_ngay_tanca_lich} ca tan ca theo LỊCH (không bấm TANCA sau giờ đăng ký + 15p) – đã trừ `
      + fmtNumber(values.gio_phat_tanca_lich, 2) + ` giờ công.`
    );
  }

  // --- Cảnh báo doanh thu so với khoán: cho phép âm (thiếu khoán) ---
  if (values.tien_vuot > 0) {
    // Vượt khoán: thưởng dương
    warns.push(
      `- Doanh thu VƯỢT khoán: ${fmtNumber(values.tien_vuot, 0)} đ, thưởng vượt khoán: ${fmtNumber(values.tien_thuong, 0)} đ.`
    );
  } else if (values.tien_vuot < 0) {
    // Thiếu khoán: phạt / giảm lương (thưởng âm)
    warns.push(
      `- Doanh thu THIẾU khoán: ${fmtNumber(Math.abs(values.tien_vuot), 0)} đ, tiền phạt/giảm thưởng: ${fmtNumber(values.tien_thuong, 0)} đ (âm nghĩa là trừ vào lương).`
    );
  } else {
    // Bằng khoán: không thưởng, không phạt
    warns.push(
      "- Doanh thu đúng bằng mức khoán, thưởng vượt khoán = 0, không thưởng cũng không bị trừ."
    );
  }

  const warnEl = document.getElementById("warning-section");
  warnEl.innerHTML = warns.length
    ? warns.join("<br>")
    : "Không có cảnh báo vi phạm đáng chú ý trong kỳ (CB1/CB2/CB3/AUTO_TANCA/VẮNG/TANCA_LỊCH) và doanh thu đang đạt đúng mức khoán.";
}


// ===================== BẢNG CÔNG CHI TIẾT 1 NHÂN VIÊN =====================
const hotBangCongNhanVienContainer = document.getElementById("hotBangCongNhanVien");
const bangCongMsgEl = document.getElementById("bangcong-msg");
const bangCongTitleEl = document.getElementById("bc-detail-title");
const bangCongOnlyAbnormalEl = document.getElementById("bc-only-abnormal");
const btnReloadBangCong = document.getElementById("btn-reload-bangcong");

let hotBangCongNhanVien = null;
let bangCongNhanVienCache = null;
let bangCongNhanVienCellMeta = [];

function setBangCongNhanVienMessage(text, isError = false) {
  if (!bangCongMsgEl) return;
  bangCongMsgEl.textContent = text || "";
  bangCongMsgEl.style.color = isError ? "#b00020" : "#555";
}

function bcParseYMD(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function bcMakeYMD(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function bcAddDays(ymd, days) {
  const p = bcParseYMD(ymd);
  if (!p) return "";
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + Number(days || 0)));
  return bcMakeYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function bcListDates(startYmd, endYmd) {
  const out = [];
  if (!startYmd || !endYmd || startYmd > endYmd) return out;
  let cur = startYmd;
  let guard = 0;
  while (cur <= endYmd && guard < 800) {
    out.push(cur);
    cur = bcAddDays(cur, 1);
    guard++;
  }
  return out;
}

function bcListMonths(startYmd, endYmd) {
  const a = bcParseYMD(startYmd);
  const b = bcParseYMD(endYmd);
  if (!a || !b) return [];
  const out = [];
  let y = a.y, m = a.m;
  while (y < b.y || (y === b.y && m <= b.m)) {
    out.push({ y, m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function bcFormatDateDM(ymd) {
  const p = bcParseYMD(ymd);
  if (!p) return ymd || "";
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`;
}

function bcFormatRange(startYmd, endYmd) {
  return `${bcFormatDateDM(startYmd)}/${String(startYmd).slice(0,4)} – ${bcFormatDateDM(endYmd)}/${String(endYmd).slice(0,4)}`;
}

function bcVietnamTodayYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (t) => parts.find(x => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function bcVnDateKeyFromTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const get = (t) => parts.find(x => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function bcVnTimeHM(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(d);
  const get = (t) => parts.find(x => x.type === t)?.value || "";
  return `${get("hour")}:${get("minute")}`;
}

function bcToMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).slice(0, 5);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function bcMinutesToHHMM(mins) {
  if (mins == null || !Number.isFinite(mins)) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function bcSafeUpper(v) {
  return String(v ?? "").trim().toUpperCase();
}

function bcNormalizeSite(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "cs1" || s === "cơ sở 1" || s === "co so 1") return "cs1";
  if (s === "cs2" || s === "cơ sở 2" || s === "co so 2") return "cs2";
  return s;
}

function bcIsWork(loai) {
  return bcSafeUpper(loai) === "CA_LAM";
}

function bcIsDayOff(loai) {
  const x = bcSafeUpper(loai);
  return x === "NGHI_CA_NGAY" || x === "NGHI_PHEP_NGAY" || x === "NGHI_CA";
}

function bcIsHourlyLeave(loai) {
  const x = bcSafeUpper(loai);
  return x === "NGHI_THEO_GIO" || x === "NGHI_GIO" || x === "NGHI_PHEP_GIO";
}

function bcSubtractOne(work, leave) {
  const { s, e } = work;
  const ls = leave.s;
  const le = leave.e;
  if (le <= s || ls >= e) return [work];
  if (ls <= s && le >= e) return [];
  if (ls <= s && le < e) return [{ s: le, e }];
  if (ls > s && le >= e) return [{ s, e: ls }];
  return [{ s, e: ls }, { s: le, e }];
}

function bcSubtractLeaves(workIntervals, leaveIntervals) {
  let current = [...workIntervals];
  for (const lv of leaveIntervals) {
    const next = [];
    for (const w of current) next.push(...bcSubtractOne(w, lv));
    current = next;
    if (!current.length) break;
  }
  return current;
}

function bcFormatHour2(v) {
  return Number(v || 0).toFixed(2);
}

function bcFormatSignedMinutes(vHours) {
  const mins = Math.round(Number(vHours || 0) * 60);
  return `${mins >= 0 ? "+" : ""}${mins}p`;
}

function bcGetCompareState(actual, registered, dateYmd) {
  const a = Number(actual || 0);
  const r = Number(registered || 0);
  const today = bcVietnamTodayYMD();
  if (dateYmd >= today) return { type: "", diff: a - r };
  if (r > 0 && a <= 0) return { type: "missing_actual", diff: -r };
  if (r <= 0 && a > 0) return { type: "no_schedule", diff: a };
  const diff = a - r;
  if (r > 0 && a > 0 && diff <= -0.5) return { type: "under", diff };
  if (r > 0 && a > 0 && diff >= 0.5) return { type: "over", diff };
  return { type: "", diff };
}

function bcGetThuLabel(year, month, day, fallback = "") {
  if (fallback) return fallback;
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return names[new Date(year, month - 1, day).getDay()];
}

function bcBuildRegisteredData(scheduleRows) {
  const byKey = new Map();
  for (const r of scheduleRows || []) {
    const ngay = String(r.ngay || "").slice(0, 10);
    const manv = normalizeManv(r.manv);
    const site = bcNormalizeSite(r.diadiem) || "";
    if (!ngay || !manv) continue;
    const key = `${ngay}|${manv}|${site}`;
    if (!byKey.has(key)) byKey.set(key, { work: [], leaves: [], hasDayOff: false, site });
    const st = byKey.get(key);
    const loai = bcSafeUpper(r.loai_dang_ky);
    if (bcIsDayOff(loai)) { st.hasDayOff = true; continue; }
    if (bcIsWork(loai)) {
      const s = bcToMinutes(r.gio_bat_dau);
      const e = bcToMinutes(r.gio_ket_thuc);
      if (s != null && e != null && e > s) st.work.push({ s, e });
      continue;
    }
    if (bcIsHourlyLeave(loai)) {
      const s = bcToMinutes(r.tu_gio ?? r.gio_bat_dau);
      const e = bcToMinutes(r.den_gio ?? r.gio_ket_thuc);
      if (s != null && e != null && e > s) st.leaves.push({ s, e });
    }
  }

  const hoursMap = {};
  const detailParts = {};
  for (const [key, st] of byKey.entries()) {
    const [ngay, manv] = key.split("|");
    const dayKey = `${ngay}|${manv}`;
    if (st.hasDayOff) {
      if (!detailParts[dayKey]) detailParts[dayKey] = [];
      detailParts[dayKey].push(`${st.site ? st.site.toUpperCase() + ": " : ""}Nghỉ cả ngày`);
      continue;
    }
    const work = st.work.sort((a,b) => a.s - b.s);
    const merged = [];
    for (const w of work) {
      const last = merged[merged.length - 1];
      if (!last || w.s > last.e) merged.push({ ...w });
      else last.e = Math.max(last.e, w.e);
    }
    const leaves = st.leaves.sort((a,b) => a.s - b.s);
    const effective = bcSubtractLeaves(merged, leaves);
    const mins = effective.reduce((sum, x) => sum + Math.max(0, x.e - x.s), 0);
    hoursMap[dayKey] = (hoursMap[dayKey] || 0) + mins / 60;

    const workText = merged.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
    const leaveText = leaves.map(x => `${bcMinutesToHHMM(x.s)}–${bcMinutesToHHMM(x.e)}`).join(" + ");
    let part = workText || "Không có ca làm";
    if (leaveText) part += `; nghỉ ${leaveText}`;
    if (st.site) part = `${st.site.toUpperCase()}: ${part}`;
    if (!detailParts[dayKey]) detailParts[dayKey] = [];
    detailParts[dayKey].push(part);
  }

  const detailMap = {};
  const keys = new Set([...Object.keys(hoursMap), ...Object.keys(detailParts)]);
  for (const k of keys) {
    const total = Number(hoursMap[k] || 0);
    const parts = detailParts[k] || [];
    detailMap[k] = parts.length ? `${parts.join(" | ")} / ${bcFormatHour2(total)}h` : (total > 0 ? `${bcFormatHour2(total)}h` : "");
  }
  return { hoursMap, detailMap };
}

const bcEventLabels = {
  VAOCA: "Vào",
  NTR: "Nghỉ trưa",
  NTRD: "Vào lại",
  NCH: "Nghỉ chiều",
  NCHD: "Vào lại",
  TANCA: "Tan",
  AUTO_TANCA: "Tự tan",
  TANCA_LICH: "Tan theo lịch"
};

function bcBuildActualEventMap(logRows) {
  const map = {};
  for (const r of logRows || []) {
    const manv = normalizeManv(r.manv);
    const ngay = bcVnDateKeyFromTimestamp(r.created_at);
    if (!manv || !ngay) continue;
    const key = `${ngay}|${manv}`;
    if (!map[key]) map[key] = [];
    map[key].push(r);
  }
  const out = {};
  for (const [key, rows] of Object.entries(map)) {
    rows.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    out[key] = rows.map(r => {
      const ev = bcSafeUpper(r.su_kien);
      const label = bcEventLabels[ev] || ev || "Sự kiện";
      return `${label} ${bcVnTimeHM(r.created_at)}`.trim();
    }).join(" · ");
  }
  return out;
}

function bcDetailTextRenderer(instance, td, row, col, prop, value, cellProperties) {
  window.Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.style.whiteSpace = "normal";
  td.style.lineHeight = "1.35";
  td.style.verticalAlign = "top";
  return td;
}

function bcDetailAlertRenderer(instance, td, row, col, prop, value, cellProperties) {
  window.Handsontable.renderers.TextRenderer.apply(this, arguments);
  if (col === 2 && String(value ?? "").trim() !== "" && Number(value) === 0) td.textContent = "";
  td.style.whiteSpace = "normal";
  td.style.lineHeight = "1.35";
  td.style.verticalAlign = "top";
  td.style.background = "";
  td.style.color = "";
  td.style.fontWeight = "";
  td.title = "";
  const meta = bangCongNhanVienCellMeta?.[row]?.[col];
  const colors = {
    under: { bg: "#fff3b0", fg: "#7a5a00" },
    over: { bg: "#ffcdd2", fg: "#8e0000" },
    missing_actual: { bg: "#bbdefb", fg: "#0d47a1" },
    no_schedule: { bg: "#e1bee7", fg: "#6a1b9a" }
  };
  if (meta?.extreme) {
    td.style.background = "#ff1744";
    td.style.color = "#fff";
    td.style.fontWeight = "800";
  } else if (colors[meta?.type]) {
    td.style.background = colors[meta.type].bg;
    td.style.color = colors[meta.type].fg;
    td.style.fontWeight = "700";
  }
  td.title = meta?.tooltip || "";
  return td;
}

function bcRenderHot(data) {
  if (!hotBangCongNhanVienContainer || !window.Handsontable) return;
  const mobile = window.innerWidth <= 600;
  const headers = ["Ngày", "Thứ", "Giờ công", "Giờ đăng ký", "Giờ thực hiện", "Chênh lệch"];
  const settings = {
    data,
    colHeaders: headers,
    rowHeaders: true,
    rowHeaderWidth: mobile ? 38 : 46,
    width: "100%",
    height: mobile ? 520 : 430,
    stretchH: "all",
    manualColumnResize: true,
    manualRowResize: true,
    filters: true,
    dropdownMenu: true,
    columnSorting: true,
    readOnly: true,
    wordWrap: true,
    columnHeaderHeight: mobile ? 88 : 72,
    rowHeights: mobile ? 66 : 50,
    colWidths: mobile ? [58, 48, 72, 150, 165, 78] : [70, 55, 85, 260, 310, 95],
    viewportRowRenderingOffset: 30,
    cells(row, col) {
      const cp = {};
      if (col === 2 || col === 5) cp.renderer = bcDetailAlertRenderer;
      else if (col === 3 || col === 4) cp.renderer = bcDetailTextRenderer;
      return cp;
    },
    licenseKey: "non-commercial-and-evaluation"
  };
  if (!hotBangCongNhanVien) hotBangCongNhanVien = new window.Handsontable(hotBangCongNhanVienContainer, settings);
  else {
    hotBangCongNhanVien.updateSettings(settings);
    hotBangCongNhanVien.loadData(data);
    hotBangCongNhanVien.render();
  }
}

function bcRenderNhanVienCache() {
  const cache = bangCongNhanVienCache;
  if (!cache) return;
  const { tuNgay, denNgay, manv, tennv, dateList, congData, registeredData, actualEventMap } = cache;
  const onlyAbnormal = !!bangCongOnlyAbnormalEl?.checked;
  const groupByDate = {};
  for (const r of congData) {
    const d = String(r.ngay_ymd || "").slice(0,10);
    if (d) groupByDate[d] = r;
  }

  const hotData = [];
  bangCongNhanVienCellMeta = [];
  let countShown = 0;
  let abnormalCount = 0;
  let extremeCount = 0;
  let totalActual = 0;
  let totalRegistered = 0;

  for (const dateYmd of dateList) {
    const p = bcParseYMD(dateYmd);
    const found = groupByDate[dateYmd];
    const actual = Number(found?.gio_cong || 0);
    const registered = Number(registeredData.hoursMap[`${dateYmd}|${manv}`] || 0);
    const cmp = bcGetCompareState(actual, registered, dateYmd);
    const extreme = actual > 13;
    const abnormal = !!cmp.type || extreme;
    if (abnormal) abnormalCount++;
    if (extreme) extremeCount++;
    totalActual += actual;
    totalRegistered += registered;

    const hasAny = actual > 0 || registered > 0;
    if (!hasAny) continue;
    if (onlyAbnormal && !abnormal) continue;

    const thu = bcGetThuLabel(p.y, p.m, p.d, found?.thu || "");
    const regText = registeredData.detailMap[`${dateYmd}|${manv}`] || (registered > 0 ? `${bcFormatHour2(registered)}h` : "—");
    const events = actualEventMap[`${dateYmd}|${manv}`] || "";
    const actualText = actual > 0 ? `${events || "Không đọc được log chi tiết"} / ${bcFormatHour2(actual)}h` : (events ? events : "—");
    const diffText = (actual === 0 && registered === 0) ? "" : bcFormatSignedMinutes(actual - registered);
    const tooltip = [
      `${tennv} (${manv}) - ${dateYmd}`,
      `Giờ thực tế: ${bcFormatHour2(actual)}h`,
      `Giờ đăng ký: ${bcFormatHour2(registered)}h`,
      `Chênh lệch: ${bcFormatSignedMinutes(actual - registered)}`,
      extreme ? "Cảnh báo mạnh: giờ công thực tế lớn hơn 13.00h." : "",
      cmp.type === "under" ? "Thiếu từ 30 phút." : "",
      cmp.type === "over" ? "Vượt từ 30 phút." : "",
      cmp.type === "missing_actual" ? "Có lịch nhưng không có công." : "",
      cmp.type === "no_schedule" ? "Có công nhưng không có lịch đã duyệt." : ""
    ].filter(Boolean).join("\n");

    const rowIndex = hotData.length;
    hotData.push([
      bcFormatDateDM(dateYmd),
      thu,
      actual > 0 ? bcFormatHour2(actual) : "",
      regText,
      actualText,
      diffText
    ]);
    bangCongNhanVienCellMeta[rowIndex] = [
      {}, {},
      { type: cmp.type, extreme, tooltip },
      {}, {},
      { type: cmp.type, extreme: false, tooltip }
    ];
    countShown++;
  }

  hotData.push([
    "Tổng", "",
    bcFormatHour2(totalActual),
    `Tổng lịch: ${bcFormatHour2(totalRegistered)}h`,
    `Tổng thực tế: ${bcFormatHour2(totalActual)}h`,
    bcFormatSignedMinutes(totalActual - totalRegistered)
  ]);
  bangCongNhanVienCellMeta.push([{}, {}, {}, {}, {}, {}]);

  if (bangCongTitleEl) bangCongTitleEl.textContent = `CHI TIẾT BẢNG CÔNG – ${tennv} (${manv}) – ${bcFormatRange(tuNgay, denNgay)}`;
  bcRenderHot(hotData);
  setBangCongNhanVienMessage(
    `Hiển thị ${countShown} ngày${onlyAbnormal ? " bất thường" : ""} | Bất thường: ${abnormalCount} | >13h: ${extremeCount} | ` +
    `Tổng thực tế ${bcFormatHour2(totalActual)}h / đăng ký ${bcFormatHour2(totalRegistered)}h | Ngưỡng cảnh báo ±30 phút.`
  );
}

async function taiBangCongNhanVien(tuNgay, denNgay, manvRaw) {
  const manv = normalizeManv(manvRaw);
  if (!tuNgay || !denNgay || !manv) {
    setBangCongNhanVienMessage("Chưa đủ Từ ngày, Đến ngày và Mã nhân viên để tải bảng công.", true);
    return;
  }
  if (denNgay < tuNgay) {
    setBangCongNhanVienMessage("Đến ngày không được nhỏ hơn Từ ngày.", true);
    return;
  }
  const dateList = bcListDates(tuNgay, denNgay);
  if (!dateList.length || dateList.length > 366) {
    setBangCongNhanVienMessage("Khoảng ngày bảng công không hợp lệ hoặc lớn hơn 366 ngày.", true);
    return;
  }

  setBangCongNhanVienMessage(`Đang tải bảng công ${manv} từ ${bcFormatDateDM(tuNgay)} đến ${bcFormatDateDM(denNgay)}...`);
  const months = bcListMonths(tuNgay, denNgay);
  const nextDate = bcAddDays(denNgay, 1);
  const logStart = `${tuNgay}T00:00:00+07:00`;
  const logEnd = `${nextDate}T00:00:00+07:00`;

  try {
    const congPromise = Promise.all(months.map(({ y, m }) =>
      supabase.rpc("chamcong_bangcong_monthly", { p_month: m, p_year: y })
        .then(res => ({ ...res, y, m }))
    ));

    const [congRes, lichRes, logRes] = await Promise.all([
      congPromise,
      supabase.from("lichlam_dangky")
        .select("ngay, diadiem, manv, loai_dang_ky, gio_bat_dau, gio_ket_thuc, tu_gio, den_gio, trang_thai")
        .gte("ngay", tuNgay).lte("ngay", denNgay)
        .eq("manv", manv)
        .eq("trang_thai", "DA_DUYET"),
      supabase.from("chamcong_log")
        .select("manv, diadiem, su_kien, created_at")
        .eq("manv", manv)
        .gte("created_at", logStart).lt("created_at", logEnd)
        .order("created_at", { ascending: true })
    ]);

    const badMonth = congRes.find(x => x.error);
    if (badMonth) throw badMonth.error;
    if (lichRes.error) throw lichRes.error;

    const congData = [];
    for (const monthRes of congRes) {
      for (const r of (monthRes.data || [])) {
        if (normalizeManv(r.manv) !== manv) continue;
        const day = Number(r.ngay);
        if (!day) continue;
        const dateYmd = bcMakeYMD(monthRes.y, monthRes.m, day);
        if (dateYmd < tuNgay || dateYmd > denNgay) continue;
        congData.push({ ...r, ngay_ymd: dateYmd });
      }
    }

    const scheduleRows = (lichRes.data || []).filter(r => normalizeManv(r.manv) === manv);
    const logRows = logRes.error ? [] : (logRes.data || []).filter(r => normalizeManv(r.manv) === manv);
    const tennv = String(congData.find(r => String(r.tennv || "").trim())?.tennv || manv).trim();

    bangCongNhanVienCache = {
      tuNgay, denNgay, manv, tennv, dateList, congData,
      registeredData: bcBuildRegisteredData(scheduleRows),
      actualEventMap: bcBuildActualEventMap(logRows)
    };

    bcRenderNhanVienCache();
    if (logRes.error) {
      setBangCongNhanVienMessage((bangCongMsgEl?.textContent || "") + " | Chưa đọc được log vào/ra chi tiết; kiểm tra quyền SELECT chamcong_log.", true);
    }
  } catch (e) {
    console.error("Lỗi tải bảng công nhân viên:", e);
    setBangCongNhanVienMessage("Lỗi tải bảng công nhân viên: " + (e?.message || "Không xác định"), true);
    bangCongNhanVienCache = null;
    bangCongNhanVienCellMeta = [];
    bcRenderHot([]);
  }
}

async function tinhLuongThang() {
  const tuNgay = document.getElementById("tu_ngay").value;
  const denNgay = document.getElementById("den_ngay").value;
  const manv = document.getElementById("manv").value.trim();
  const luong_gio = parseFloat(document.getElementById("luong_gio").value || "0") || 0;
  const khoan_gio = parseFloat(document.getElementById("khoan_gio").value || "0") || 0;
  const pct_thuong = parseFloat(document.getElementById("pct_thuong").value || "0") || 0;

  if (!tuNgay || !denNgay) {
    alert("Vui lòng chọn đủ TỪ NGÀY và ĐẾN NGÀY.");
    return;
  }
  if (!manv) {
    alert("Vui lòng chọn mã nhân viên.");
    return;
  }

  setStatus("Đang tính lương, vui lòng đợi...");
  setResultFields({
    manv: "-",
    range: "-",
    so_ngay_cong: 0,
    tong_gio_cong: 0,
    gio_cong_tinh_luong: 0,
    gio_phat_tanca_lich: 0,
    so_lan_auto_tanca: 0,
    so_ngay_cb1: 0,
    so_ngay_cb2: 0,
    so_ngay_cb3: 0,
    so_ngay_vang: 0,
    so_ngay_tanca_lich: 0,
    khoan_gio,
    khoan_thang: 0,
    tong_doanh_thu: 0,
    tien_vuot: 0,
    tien_thuong: 0,
    luong_gio_thang: 0,
    tong_luong: 0,
    tong_hoa_hong: 0,
    khoan_tru: 0,
    thuc_linh: 0,
    luong_1_gio: 0
  });

  try {
    // 1) Giờ công tháng từ chamcong_tinhcong_monthly
    const { data: chamcongData, error: chamcongError } = await supabase.rpc(
      "chamcong_tinhcong_monthly",
      {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_diadiem: null,
        p_manv: manv
      }
    );

    if (chamcongError) {
      console.error("Lỗi chamcong_tinhcong_monthly:", chamcongError);
      alert("Lỗi lấy dữ liệu chấm công. Xem console để biết thêm chi tiết.");
      setStatus("");
      return;
    }

    let tong_gio_cong = 0;
    let so_ngay_cong = 0;
    let so_lan_auto_tanca = 0;
    let so_ngay_cb1 = 0;
    let so_ngay_cb2 = 0;
    let so_ngay_cb3 = 0;
    let so_ngay_vang = 0;
    let so_ngay_tanca_lich = 0;

    (chamcongData || []).forEach(row => {
      tong_gio_cong += Number(row.tong_gio_cong || 0);
      so_ngay_cong += Number(row.so_ngay_cong || 0);
      so_lan_auto_tanca += Number(row.so_lan_auto_tanca || 0);
      so_ngay_cb1 += Number(row.so_ngay_cb1 || 0);
      so_ngay_cb2 += Number(row.so_ngay_cb2 || 0);
      so_ngay_cb3 += Number(row.so_ngay_cb3 || 0);
      so_ngay_vang += Number(row.so_ngay_vang || 0);
      so_ngay_tanca_lich += Number(row.so_ngay_tanca_lich || 0);
    });

    const gio_phat_tanca_lich = so_ngay_tanca_lich * 1.0;
    const gio_cong_tinh_luong = Math.max(tong_gio_cong - gio_phat_tanca_lich, 0);

    // 2) Doanh số KPI từ nv_match2h_summary_all
    const { data: kpiData, error: kpiError } = await supabase.rpc(
      "nv_match2h_summary_all_v2",
      {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_manv: manv,
        p_masp_list: null,
        p_min_price: 0,
        p_size: null
      }
    );

    if (kpiError) {
      console.error("Lỗi nv_match2h_summary_all:", kpiError);
      alert("Lỗi lấy dữ liệu doanh số KPI. Xem console để biết thêm chi tiết.");
      setStatus("");
      return;
    }

    let tong_doanh_thu = 0;
    let tong_hoa_hong = 0;

    if (kpiData && kpiData.length > 0) {
      tong_doanh_thu = Number(kpiData[0].tong_doanh_thu || 0);
      tong_hoa_hong = Number(kpiData[0].tong_hoa_hong || 0);
    }

    // 3) Tính khoán & thưởng vượt khoán (CHO PHÉP ÂM)
    const khoan_thang = gio_cong_tinh_luong * khoan_gio;
    // Trước đây: chỉ lấy dương => Math.max(tong_doanh_thu - khoan_thang, 0)
    // Giờ: cho phép âm để nếu doanh thu < khoán thì bị trừ thưởng
    const tien_vuot = tong_doanh_thu - khoan_thang;
    const tien_thuong = tien_vuot * (pct_thuong / 100.0);

    // 4) Tính lương
    const luong_gio_thang = gio_cong_tinh_luong * luong_gio;
    // Nếu tien_thuong âm thì sẽ tự động trừ vào tổng lương
    const tong_luong = luong_gio_thang + tien_thuong + tong_hoa_hong;

    const khoan_tru = await loadKhoanTruForNhanVien(tuNgay, denNgay, manv);
    const thuc_linh = tong_luong - khoan_tru;
    const luong_1_gio = tong_gio_cong > 0 ? tong_luong / tong_gio_cong : 0;

    const rangeLabel = `${tuNgay} → ${denNgay}`;

    setResultFields({
      manv,
      range: rangeLabel,
      so_ngay_cong,
      tong_gio_cong,
      gio_cong_tinh_luong,
      gio_phat_tanca_lich,
      so_lan_auto_tanca,
      so_ngay_cb1,
      so_ngay_cb2,
      so_ngay_cb3,
      so_ngay_vang,
      so_ngay_tanca_lich,
      khoan_gio,
      khoan_thang,
      tong_doanh_thu,
      tien_vuot,
      tien_thuong,
      luong_gio_thang,
      tong_luong,
      tong_hoa_hong,
      khoan_tru,
      thuc_linh,
      luong_1_gio
    });

    // Đồng bộ luôn Bảng công chi tiết theo đúng nhân viên và khoảng ngày đang tính lương.
    await taiBangCongNhanVien(tuNgay, denNgay, manv);

    setStatus("Đã tính xong.");
  } catch (err) {
    console.error("Lỗi không mong muốn:", err);
    alert("Có lỗi xảy ra, xem console để biết chi tiết.");
    setStatus("");
  }
}

// --- Khởi tạo khi load trang ---
document.addEventListener("DOMContentLoaded", async () => {
  setDefaultDates();
  setStatus(
    "Chọn khoảng ngày, chọn mã NV, nhập lương giờ, khoán/giờ và % thưởng trên phần chênh lệch so với khoán (có thể âm/dương) rồi bấm Tính lương."
  );

  const tuNgayInput = document.getElementById("tu_ngay");
  const denNgayInput = document.getElementById("den_ngay");

  if (tuNgayInput && denNgayInput) {
    tuNgayInput.addEventListener("change", () => {
      const tuNgay = tuNgayInput.value;

      if (isFirstDayOfMonth(tuNgay)) {
        denNgayInput.value = getLastDayOfMonth(tuNgay);
      }
    });
  }

  // Đổ danh sách nhân viên vào datalist ds-manv
  const manvDatalist = document.getElementById("ds-manv");
  if (manvDatalist) {
    try {
      await fillNhanVienDropdown(manvDatalist, { showName: true });
    } catch (err) {
      console.error("Lỗi load danh mục nhân viên cho báo cáo lương:", err);
    }
  }

  if (bangCongOnlyAbnormalEl) {
    bangCongOnlyAbnormalEl.addEventListener("change", () => {
      if (bangCongNhanVienCache) bcRenderNhanVienCache();
    });
  }

  if (btnReloadBangCong) {
    btnReloadBangCong.addEventListener("click", () => {
      const tuNgay = document.getElementById("tu_ngay")?.value || "";
      const denNgay = document.getElementById("den_ngay")?.value || "";
      const manv = document.getElementById("manv")?.value?.trim() || "";
      taiBangCongNhanVien(tuNgay, denNgay, manv);
    });
  }

  // Nếu thay đổi nhân viên/khoảng ngày, báo rằng bảng công cần tính/tải lại để tránh hiểu nhầm dữ liệu cũ.
  [document.getElementById("tu_ngay"), document.getElementById("den_ngay"), document.getElementById("manv")]
    .filter(Boolean)
    .forEach(el => el.addEventListener("change", () => {
      if (bangCongNhanVienCache) setBangCongNhanVienMessage("Thông tin đã thay đổi. Bấm Tính lương hoặc Tải lại bảng công để cập nhật.");
    }));

  document.getElementById("btn-tinh-luong").addEventListener("click", tinhLuongThang);
});
