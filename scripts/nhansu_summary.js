// /public/scripts/nhansu_summary.js
// Module dùng chung: Tổng hợp nhân sự theo giờ (dựa trên lichlam_dangky đã duyệt)
// - Hỗ trợ loại: CA_LAM, NGHI_CA_NGAY/NGHI_PHEP_NGAY/NGHI_CA, NGHI_THEO_GIO/NGHI_GIO/NGHI_PHEP_GIO
// - Quy tắc: Nếu có nghỉ cả ngày => loại khỏi tổng hợp. Nếu có nghỉ theo giờ => trừ khoảng nghỉ khỏi ca làm.

export function initNhansuSummary({
  supabase,
  dateInputEl,
  loadButtonEl,
  timelineEl,
  messageEl,
  statuses = ["CHO_DUYET", "DA_DUYET"],
  autoLoad = false,
} = {}) {
  if (!supabase) throw new Error("initNhansuSummary: missing supabase");
  if (!dateInputEl) throw new Error("initNhansuSummary: missing dateInputEl");
  if (!loadButtonEl) throw new Error("initNhansuSummary: missing loadButtonEl");
  if (!timelineEl) throw new Error("initNhansuSummary: missing timelineEl");

  const setMsg = (t) => {
    if (!messageEl) return;
    messageEl.textContent = t ?? "";
  };

  async function loadSummary() {
    const ngay = normalizeDateInput(dateInputEl.value);
    if (!ngay) {
      setMsg("Vui lòng chọn ngày.");
      if (timelineEl) timelineEl.innerHTML = "";
      return;
    }

    setMsg("Đang tải đăng ký ca...");
    if (timelineEl) timelineEl.innerHTML = "";

    const { data, error } = await supabase
      .from("lichlam_dangky")
      .select(
        "ngay, diadiem, manv, loai_dang_ky, gio_bat_dau, gio_ket_thuc, tu_gio, den_gio, trang_thai"
      )
      .eq("ngay", ngay)
      .in("trang_thai", statuses);

    if (error) {
      console.error("Lỗi tải lichlam_dangky:", error);
      setMsg("Lỗi tải đăng ký ca.");
      if (timelineEl) timelineEl.innerHTML = '<div style="color:#c62828">Lỗi tải đăng ký ca.</div>';
      return;
    }

    const rows = data || [];
    if (rows.length === 0) {
      setMsg(`Không có đăng ký ca (${statuses.join("/")}) trong ngày ${ngay}.`);
      if (timelineEl) timelineEl.innerHTML = '<div style="opacity:.7">Không có dữ liệu</div>';
      return;
    }

    const effective = buildEffectiveRowsForSummary(rows);
    renderTimelineBlocks(timelineEl, effective);
    setMsg(`Đã tải xong (${rows.length} dòng đăng ký).`);
  }

  loadButtonEl.addEventListener("click", loadSummary);
  if (autoLoad) loadSummary();

  return {
    loadSummary,
    // exposed for re-use/testing
    buildEffectiveRowsForSummary,
    renderTimelineBlocks: (rows) => renderTimelineBlocks(timelineEl, rows),
  };
}

// ===================== Helpers =====================

function normalizeDateInput(v) {
  // Accept yyyy-mm-dd (input[type=date]) or dd/mm/yyyy (fallback)
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function safeUpper(v) {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeSite(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "cs1" || s === "cơ sở 1" || s === "co so 1") return "cs1";
  if (s === "cs2" || s === "cơ sở 2" || s === "co so 2") return "cs2";
  return s;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).slice(0, 5); // "HH:MM"
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToHHMM(mins) {
  if (mins == null || !Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function isLoaiCaLam(loai) {
  return safeUpper(loai) === "CA_LAM";
}

function isLoaiNghiCaNgay(loai) {
  const x = safeUpper(loai);
  return x === "NGHI_CA_NGAY" || x === "NGHI_PHEP_NGAY" || x === "NGHI_CA";
}

function isLoaiNghiTheoGio(loai) {
  const x = safeUpper(loai);
  return x === "NGHI_THEO_GIO" || x === "NGHI_GIO" || x === "NGHI_PHEP_GIO";
}

// Subtract leave intervals from a work interval [s,e)
function subtractOne(work, leave) {
  const out = [];
  const s = work.s,
    e = work.e,
    ls = leave.s,
    le = leave.e;

  if (le <= s || ls >= e) {
    out.push(work);
    return out;
  }
  if (ls <= s && le >= e) return out; // fully covered
  if (ls <= s && le < e) {
    out.push({ s: le, e });
    return out;
  }
  if (ls > s && le >= e) {
    out.push({ s, e: ls });
    return out;
  }
  // split in middle
  out.push({ s, e: ls });
  out.push({ s: le, e });
  return out;
}

function subtractLeaves(workIntervals, leaveIntervals) {
  let current = [...workIntervals];
  for (const lv of leaveIntervals) {
    const next = [];
    for (const w of current) next.push(...subtractOne(w, lv));
    current = next;
    if (current.length === 0) break;
  }
  return current;
}

// Build "effective" CA_LAM rows after applying NGHI_CA_NGAY and NGHI_THEO_GIO
function buildEffectiveRowsForSummary(rows) {
  const bySite = new Map(); // site -> Map(manv -> { work:[], leaves:[], hasDayOff:false })
  for (const r of rows || []) {
    const site = normalizeSite(r.diadiem ?? r.co_so ?? r.coso ?? r.site);
    const manv = safeUpper(r.manv);
    if (!site || !manv) continue;

    if (!bySite.has(site)) bySite.set(site, new Map());
    const byManv = bySite.get(site);
    if (!byManv.has(manv)) byManv.set(manv, { work: [], leaves: [], hasDayOff: false });
    const st = byManv.get(manv);

    const loai = safeUpper(r.loai_dang_ky);
    if (isLoaiNghiCaNgay(loai)) {
      st.hasDayOff = true;
      continue;
    }

    if (isLoaiCaLam(loai)) {
      const s = toMinutes(r.gio_bat_dau);
      const e = toMinutes(r.gio_ket_thuc);
      if (s != null && e != null && e > s) st.work.push({ s, e });
      continue;
    }

    if (isLoaiNghiTheoGio(loai)) {
      const s = toMinutes(r.tu_gio ?? r.gio_bat_dau);
      const e = toMinutes(r.den_gio ?? r.gio_ket_thuc);
      if (s != null && e != null && e > s) st.leaves.push({ s, e });
      continue;
    }
  }

  const out = [];
  for (const [site, byManv] of bySite.entries()) {
    for (const [manv, st] of byManv.entries()) {
      if (st.hasDayOff) continue;

      // sort + merge work, sort leaves
      const work = st.work.sort((a, b) => a.s - b.s);
      const mergedWork = [];
      for (const w of work) {
        const last = mergedWork[mergedWork.length - 1];
        if (!last || w.s > last.e) mergedWork.push({ ...w });
        else last.e = Math.max(last.e, w.e);
      }

      const leaves = st.leaves.sort((a, b) => a.s - b.s);
      const effective = subtractLeaves(mergedWork, leaves);

      for (const it of effective) {
        const sStr = minutesToHHMM(it.s);
        const eStr = minutesToHHMM(it.e);
        if (!sStr || !eStr) continue;
        out.push({
          ngay: rows?.[0]?.ngay ?? null,
          diadiem: site,
          manv,
          gio_bat_dau: sStr,
          gio_ket_thuc: eStr,
          loai_dang_ky: "CA_LAM",
          trang_thai: "DA_DUYET",
        });
      }
    }
  }
  return out;
}

function buildTimelineForOneSite(rows) {
  const events = new Map(); // minute -> { starts:[], ends:[] }
  const points = new Set();

  for (const r of rows) {
    const sMin = toMinutes(r.gio_bat_dau);
    const eMin = toMinutes(r.gio_ket_thuc);
    if (sMin == null || eMin == null) continue;
    if (eMin <= sMin) continue;

    points.add(sMin);
    points.add(eMin);

    if (!events.has(sMin)) events.set(sMin, { starts: [], ends: [] });
    if (!events.has(eMin)) events.set(eMin, { starts: [], ends: [] });

    events.get(sMin).starts.push(r.manv);
    events.get(eMin).ends.push(r.manv);
  }

  const sortedPoints = Array.from(points).sort((a, b) => a - b);
  const active = new Set();
  const blocks = [];

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const t = sortedPoints[i];
    const next = sortedPoints[i + 1];

    const ev = events.get(t);
    if (ev) {
      for (const x of ev.ends) active.delete(x);
      for (const x of ev.starts) active.add(x);
    }

    if (next > t && active.size > 0) {
      blocks.push({
        start: minutesToHHMM(t),
        end: minutesToHHMM(next),
        count: active.size,
        names: Array.from(active).sort(),
      });
    }
  }
  return blocks;
}

function renderTimelineBlocks(containerEl, rows) {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  const bySite = new Map();
  for (const r of rows || []) {
    const site = normalizeSite(r.diadiem);
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push({
      manv: safeUpper(r.manv),
      gio_bat_dau: String(r.gio_bat_dau).slice(0, 5),
      gio_ket_thuc: String(r.gio_ket_thuc).slice(0, 5),
    });
  }

  const sites = Array.from(bySite.keys()).sort();
  for (const site of sites) {
    const blocks = buildTimelineForOneSite(bySite.get(site));

    const title = document.createElement("div");
    title.style.fontWeight = "600";
    title.style.margin = "6px 0 2px";
    title.style.color = site === "cs1" ? "#0d47a1" : site === "cs2" ? "#b71c1c" : "#333";
    title.textContent = `${site}:`;
    containerEl.appendChild(title);

    if (blocks.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.75";
      empty.textContent = "(không có dữ liệu)";
      containerEl.appendChild(empty);
      continue;
    }

    for (const b of blocks) {
      const line = document.createElement("div");
      line.textContent = `${b.start} - ${b.end} : ${b.count} người (${b.names.join(", ")})`;
      containerEl.appendChild(line);
    }
  }
}
