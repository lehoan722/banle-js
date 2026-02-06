/*  nhansu_summary.js
    Module dùng chung: Tổng quan nhân lực theo giờ (dựa trên đăng ký ca đã duyệt/ chờ duyệt)
    - Hỗ trợ: CA_LAM, NGHI_CA_NGAY, NGHI_THEO_GIO (NGHI_GIO, NGHI_PHEP_GIO...)
    - Nếu có NGHI_CA_NGAY => bỏ toàn bộ ca của NV trong ngày đó
    - Nếu có nghỉ theo giờ => trừ interval nghỉ ra khỏi interval ca làm
    - Gom theo cơ sở (cs1/cs2/...) và theo khung giờ => hiển thị "HH:MM - HH:MM : N người (A,B,...)"
*/
(function () {
  "use strict";

  // ---------- helpers ----------
  function safeUpper(x) { return String(x ?? "").trim().toUpperCase(); }
  function safeLower(x) { return String(x ?? "").trim().toLowerCase(); }

  function toMinutes(timeStr) {
    // Accept: "07:30", "07:30:00", Date, etc.
    if (!timeStr) return null;
    const s = String(timeStr).trim();
    // lấy 5 ký tự đầu "HH:MM"
    const hhmm = s.length >= 5 ? s.slice(0, 5) : s;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
    return h * 60 + mi;
  }

  function minutesToHHMM(mins) {
    if (mins == null || !Number.isFinite(mins)) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

  // Trừ 1 interval nghỉ khỏi 1 interval làm: [s,e) - [ls,le)
  function subtractOne(work, leave) {
    const out = [];
    const s = work.s, e = work.e, ls = leave.s, le = leave.e;
    if (le <= s || ls >= e) { out.push(work); return out; }      // không giao
    if (ls <= s && le >= e) { return out; }                      // phủ hết
    if (ls <= s && le < e) { out.push({ s: le, e }); return out; } // cắt đầu
    if (ls > s && le >= e) { out.push({ s, e: ls }); return out; } // cắt đuôi
    // split giữa
    out.push({ s, e: ls });
    out.push({ s: le, e });
    return out;
  }

  function subtractMany(workIntervals, leaveIntervals) {
    let cur = workIntervals.slice();
    for (const lv of leaveIntervals) {
      const next = [];
      for (const w of cur) next.push(...subtractOne(w, lv));
      cur = next;
      if (!cur.length) break;
    }
    return cur;
  }

  // ---------- core build ----------
  function buildEffectiveRowsForSummary(rows) {
    // rows: lichlam_dangky
    // output: list { diadiem, startMin, endMin, manv, tennv }
    const bySite = new Map();

    for (const r of rows || []) {
      const site = safeLower(r.diadiem || r.coso || r.site);
      const manv = safeUpper(r.manv);
      const tennv = (r.tennv ?? r.ten_nv ?? r.hoten ?? "").toString().trim();

      if (!site || !manv) continue;

      if (!bySite.has(site)) bySite.set(site, new Map());
      const byManv = bySite.get(site);
      if (!byManv.has(manv)) byManv.set(manv, { manv, tennv, work: [], leaves: [], hasDayOff: false });
      const st = byManv.get(manv);

      const loai = safeUpper(r.loai_dang_ky || r.loai || r.type);

      // NGHỈ CẢ NGÀY => bỏ hết
      if (isLoaiNghiCaNgay(loai)) {
        st.hasDayOff = true;
        continue;
      }

      // CA_LAM
      if (isLoaiCaLam(loai)) {
        const s = toMinutes(r.gio_bat_dau);
        const e = toMinutes(r.gio_ket_thuc);
        if (s != null && e != null && e > s) st.work.push({ s, e });
        continue;
      }

      // NGHỈ THEO GIỜ (tu_gio/den_gio hoặc fallback gio_bat_dau/gio_ket_thuc)
      if (isLoaiNghiTheoGio(loai)) {
        const s = toMinutes(r.tu_gio || r.gio_bat_dau);
        const e = toMinutes(r.den_gio || r.gio_ket_thuc);
        if (s != null && e != null && e > s) st.leaves.push({ s, e });
        continue;
      }
    }

    const out = [];
    for (const [site, byManv] of bySite.entries()) {
      for (const st of byManv.values()) {
        if (st.hasDayOff) continue; // nghỉ cả ngày => không tính
        if (!st.work.length) continue;

        const finalWork = st.leaves.length ? subtractMany(st.work, st.leaves) : st.work;
        for (const w of finalWork) {
          if (w.e > w.s) {
            out.push({
              diadiem: site,
              startMin: w.s,
              endMin: w.e,
              manv: st.manv,
              tennv: st.tennv || st.manv
            });
          }
        }
      }
    }
    return out;
  }

  function renderSummaryText(effectiveRows) {
    // group by site -> interval -> list names
    const bySite = new Map();

    for (const r of effectiveRows || []) {
      const site = safeLower(r.diadiem);
      const key = `${r.startMin}-${r.endMin}`;
      if (!bySite.has(site)) bySite.set(site, new Map());
      const byInterval = bySite.get(site);
      if (!byInterval.has(key)) byInterval.set(key, []);
      byInterval.get(key).push(r.tennv || r.manv);
    }

    // sort intervals by start
    const lines = [];
    for (const [site, byInterval] of [...bySite.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${site}:`);
      const items = [...byInterval.entries()]
        .map(([k, arr]) => {
          const [s, e] = k.split("-").map(x => parseInt(x, 10));
          const names = (arr || []).slice().sort((x, y) => x.localeCompare(y));
          return { s, e, names };
        })
        .sort((a, b) => a.s - b.s || a.e - b.e);

      for (const it of items) {
        lines.push(`${minutesToHHMM(it.s)} - ${minutesToHHMM(it.e)} : ${it.names.length} người (${it.names.join(", ")})`);
      }
      lines.push(""); // blank line
    }
    return lines.join("\n").trim();
  }

  // ---------- DOM mount ----------
  function mount(opts) {
    // opts:
    // - supabase: instance (từ supabaseClient.js)
    // - table: tên bảng lichlam_dangky (default "lichlam_dangky")
    // - dateInput: element hoặc id input ngày
    // - button: element hoặc id nút tải
    // - output: element hoặc id nơi in text
    // - message: (optional) element hoặc id hiển thị trạng thái
    // - siteSelect: (optional) element hoặc id lọc cơ sở ("" / "cs1" / "cs2" / "all")
    // - statuses: (optional) ["DA_DUYET","CHO_DUYET"] mặc định
    const supabase = opts?.supabase;
    if (!supabase) throw new Error("NhansuSummary.mount: thiếu supabase instance.");

    const table = opts.table || "lichlam_dangky";
    const statuses = opts.statuses || ["DA_DUYET", "CHO_DUYET"];

    const dateEl = typeof opts.dateInput === "string" ? document.getElementById(opts.dateInput) : opts.dateInput;
    const btnEl = typeof opts.button === "string" ? document.getElementById(opts.button) : opts.button;
    const outEl = typeof opts.output === "string" ? document.getElementById(opts.output) : opts.output;
    const msgEl = opts.message
      ? (typeof opts.message === "string" ? document.getElementById(opts.message) : opts.message)
      : null;
    const siteEl = opts.siteSelect
      ? (typeof opts.siteSelect === "string" ? document.getElementById(opts.siteSelect) : opts.siteSelect)
      : null;

    if (!dateEl || !btnEl || !outEl) throw new Error("NhansuSummary.mount: thiếu dateInput/button/output.");

    function setMsg(t) { if (msgEl) msgEl.textContent = t || ""; }

    async function loadAndRender() {
      const ngay = dateEl.value; // dạng YYYY-MM-DD (khuyến nghị)
      if (!ngay) {
        outEl.textContent = "";
        setMsg("Chưa chọn ngày.");
        return;
      }

      setMsg("Đang tải đăng ký ca...");
      outEl.textContent = "";

      const siteFilter = siteEl ? safeLower(siteEl.value) : "";
      let q = supabase
        .from(table)
        .select("id,ngay,diadiem,manv,tennv,loai_dang_ky,trang_thai,gio_bat_dau,gio_ket_thuc,tu_gio,den_gio")
        .eq("ngay", ngay)
        .in("trang_thai", statuses);

      if (siteFilter && siteFilter !== "all") q = q.eq("diadiem", siteFilter);

      const { data, error } = await q;
      if (error) {
        console.error("NhansuSummary load error:", error);
        setMsg("Lỗi tải đăng ký ca.");
        outEl.textContent = "";
        return;
      }

      const rows = data || [];
      const eff = buildEffectiveRowsForSummary(rows);
      const text = renderSummaryText(eff);

      setMsg(`Đã tải xong (${rows.length} dòng đăng ký).`);
      outEl.textContent = text || (siteFilter && siteFilter !== "all"
        ? `${siteFilter}: (không có dữ liệu)`
        : "cs1: (không có dữ liệu)\ncs2: (không có dữ liệu)");
    }

    btnEl.addEventListener("click", loadAndRender);

    // return API để trang khác muốn gọi lại
    return { reload: loadAndRender };
  }

  // expose
  window.NhansuSummary = {
    mount,
    _debug: {
      buildEffectiveRowsForSummary,
      renderSummaryText
    }
  };
})();
