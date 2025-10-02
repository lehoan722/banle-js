
/**
 * MenuComponent v1.0
 * - Đọc Google Sheet CSV (gviz) -> render menu ngang + dropdown
 * - Lọc theo cơ sở (cs1/cs2/all) và roles (nếu có)
 * - Cache localStorage 30 phút, có nút "🔄" làm mới
 * - Fallback menu tối thiểu khi lỗi mạng/CSV
 *
 * Yêu cầu cột trên Sheet: group,label,url,target,cs,order,roles,visible,icon,hotkey (tùy chọn)
 */

(function (global) {
  const DEFAULT_CACHE_TTL_MIN = 30;
  const CACHE_KEY_DATA = "MENU_CONFIG_CACHE_V1";
  const CACHE_KEY_TS = "MENU_CONFIG_CACHE_TS_V1";

  function buildCsvUrl(sheetId, sheetName) {
    const base = "https://docs.google.com/spreadsheets/d/";
    // gviz CSV export
    return `${base}${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  function now() { return Date.now(); }
  function minutes(ms) { return Math.floor(ms / 60000); }

  function getCache(ttlMin = DEFAULT_CACHE_TTL_MIN) {
    try {
      const ts = localStorage.getItem(CACHE_KEY_TS);
      const raw = localStorage.getItem(CACHE_KEY_DATA);
      if (!ts || !raw) return null;
      const ageMin = minutes(now() - Number(ts));
      if (ageMin > ttlMin) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
      localStorage.setItem(CACHE_KEY_TS, String(now()));
    } catch {}
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY_DATA);
      localStorage.removeItem(CACHE_KEY_TS);
    } catch {}
  }

  // CSV parser đơn giản (hỗ trợ dấu phẩy trong "...")
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ""; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); field = ""; row = []; i++; continue; }
        field += c; i++; continue;
      }
    }
    // push last cell
    row.push(field);
    rows.push(row);
    return rows;
  }

  function toObjects(rows) {
    if (!rows || !rows.length) return [];
    const headers = rows[0].map(h => (h || "").trim().toLowerCase());
    return rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
      return obj;
    });
  }

  function normalizeCs(cs) {
    const v = (cs || "").toLowerCase();
    if (v === "cs1" || v === "cs2" || v === "all") return v;
    if (v === "" || v === "true" || v === "x") return "all";
    return v; // cho phép giá trị mở rộng khác
  }

  function matchCs(itemCs, currentCs) {
    const a = normalizeCs(itemCs);
    if (!currentCs) return a !== "none";
    if (a === "all") return true;
    if (a === "none") return false;
    return a === currentCs.toLowerCase();
  }

  function matchRoles(itemRoles, currentManvOrRole) {
    const raw = (itemRoles || "").trim();
    if (!raw) return true; // không cấu hình = ai cũng thấy
    if (!currentManvOrRole) return false;
    const tokens = raw.split(/[,\s]+/).map(s => s.toLowerCase()).filter(Boolean);
    return tokens.includes(String(currentManvOrRole).toLowerCase());
  }

  function sortByOrder(arr) {
    return arr.slice().sort((a, b) => {
      const ao = Number(a.order || 0), bo = Number(b.order || 0);
      return ao - bo || String(a.label).localeCompare(String(b.label));
    });
  }

  function groupBy(arr, key) {
    const map = {};
    arr.forEach(x => {
      const k = (x[key] || "").trim();
      if (!map[k]) map[k] = [];
      map[k].push(x);
    });
    return map;
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(ch => {
      if (ch == null) return;
      if (typeof ch === "string") e.appendChild(document.createTextNode(ch));
      else e.appendChild(ch);
    });
    return e;
  }

  function applyBasicStyles(host) {
    // CSS rất nhẹ, không phá style cũ. Có thể bỏ nếu bạn đã có CSS riêng.
    const css = `
      .mc-wrap { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .mc-left { display:flex; gap:12px; flex-wrap:wrap; }
      .mc-group { position:relative; }
      .mc-btn { cursor:pointer; padding:6px 10px; border:1px solid #ddd; border-radius:6px; background:#fff; }
      .mc-btn:hover { background:#f5f5f5; }
      .mc-dd { position:absolute; top:100%; left:0; min-width:240px; z-index:1000; border:1px solid #ddd; background:#fff; border-radius:6px; padding:6px; display:none; box-shadow:0 6px 20px rgba(0,0,0,.08); }
      .mc-group:hover .mc-dd { display:block; }
      .mc-item { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:6px 8px; border-radius:4px; }
      .mc-item:hover { background:#f2f2f2; }
      .mc-right { margin-left:auto; display:flex; gap:8px; align-items:center; }
      .mc-search { padding:6px 10px; border:1px solid #ddd; border-radius:6px; min-width:220px; }
      .mc-badge { font-size:11px; opacity:.7; }
      .mc-refresh { cursor:pointer; }
      .mc-error { color:#b00020; font-size:12px; }
    `;
    const style = el("style", { html: css });
    host.appendChild(style);
  }

  async function fetchSheet(csvUrl, forceReload) {
    if (!forceReload) {
      const cached = getCache();
      if (cached && Array.isArray(cached)) return cached;
    }
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch menu CSV failed: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const data = toObjects(rows);
    setCache(data);
    return data;
  }

  function filterAndShape(data, ctx) {
    const { cs, manvOrRole } = ctx;
    return data
      .filter(x => (x.visible ?? "").toLowerCase() !== "false")  // visible=false => ẩn
      .filter(x => matchCs(x.cs, cs))
      .filter(x => matchRoles(x.roles, manvOrRole))
      .map(x => ({
        group: x.group || "KHÁC",
        label: x.label || "",
        url: x.url || "#",
        target: x.target || "_blank",
        cs: normalizeCs(x.cs || "all"),
        order: x.order || "",
        roles: x.roles || "",
        icon: x.icon || "",
        hotkey: x.hotkey || ""
      }));
  }

  function render(hostEl, items, ctx) {
    hostEl.innerHTML = "";
    applyBasicStyles(hostEl);

    const wrap = el("div", { class: "mc-wrap" });
    const left = el("div", { class: "mc-left" });
    const right = el("div", { class: "mc-right" });

    // Nhóm theo group
    const groups = groupBy(sortByOrder(items), "group");
    Object.keys(groups).forEach(gname => {
      const gItems = sortByOrder(groups[gname]);
      const g = el("div", { class: "mc-group" });
      const btn = el("div", { class: "mc-btn" }, [gname, el("span", { class: "mc-badge" }, `(${gItems.length})`)]);
      const dd = el("div", { class: "mc-dd" });

      gItems.forEach(it => {
        const a = el("a", { href: it.url, target: it.target, class: "mc-item" }, [
          it.label,
          el("span", { class: "mc-badge" }, [
            it.cs !== "all" ? `[${it.cs}]` : "",
            it.hotkey ? ` ${it.hotkey}` : ""
          ].join(""))
        ]);
        dd.appendChild(a);
      });

      g.appendChild(btn);
      g.appendChild(dd);
      left.appendChild(g);
    });

    
    // Nút refresh
    const refresh = el("button", { class: "mc-btn mc-refresh", title: "Làm mới menu (bỏ qua cache)" }, "🔄");
    refresh.addEventListener("click", async () => {
      try {
        refresh.disabled = true;
        clearCache();
        const fresh = await fetchSheet(ctx.csvUrl, true);
        const filtered = filterAndShape(fresh, ctx);
        render(hostEl, filtered, ctx);
      } catch (e) {
        showError(`Lỗi làm mới: ${e.message}`);
      } finally {
        refresh.disabled = false;
      }
    });

    right.appendChild(refresh);

    wrap.appendChild(left);
    wrap.appendChild(right);

    hostEl.appendChild(wrap);

    // Thêm banner nhỏ hiển thị cơ sở hiện tại
    //if (ctx.cs) {
      //const banner = el("div", { class: "mc-badge" }, `Cơ sở: ${ctx.cs.toUpperCase()}`); 
      //banner.style.marginTop = "4px";
      //hostEl.appendChild(banner);
   // }
  }

  function showError(msg, host) {
    if (!host) return;
    const d = el("div", { class: "mc-error" }, msg);
    host.appendChild(d);
  }

  async function mount(opts) {
    const {
      el: selector,
      sheetId,
      sheetName,
      csvUrl, // tùy chọn: nếu đã tự build sẵn
      cs,     // ví dụ: localStorage.diadiem
      manv,   // ví dụ: localStorage.manv hoặc role
      cacheTtlMin = DEFAULT_CACHE_TTL_MIN
    } = opts;

    const host = (typeof selector === "string") ? document.querySelector(selector) : selector;
    if (!host) throw new Error("MenuComponent: không tìm thấy phần tử mount");

    const url = csvUrl || buildCsvUrl(sheetId, sheetName);
    const ctx = { csvUrl: url, cs, manvOrRole: manv, cacheTtlMin };

    try {
      const cached = getCache(cacheTtlMin);
      let data;
      if (cached) data = cached;
      else {
        data = await fetchSheet(url, false);
      }
      const items = filterAndShape(data, ctx);
      if (!items.length) {
        render(host, [], ctx);
        showError("Không có mục menu nào (kiểm tra Sheet hoặc bộ lọc cs/roles).", host);
        return;
      }
      render(host, items, ctx);
    } catch (e) {
      // Fallback tối thiểu
      const fallback = [
        { group: "GIAO DỊCH", label: "HÓA ĐƠN BÁN LẺ", url: "banlemtcs1.html", target: "_self", cs: "all", order: 10 },
        { group: "BÁO CÁO", label: "baocaoxnt16", url: "baocaoxnt16.html", target: "_blank", cs: "all", order: 20 }
      ];
      render(host, fallback, { csvUrl: url, cs, manvOrRole: manv });
      showError("Không tải được menu từ Google Sheet. Đang hiển thị menu dự phòng.", host);
      console.error(e);
    }
  }

  global.MenuComponent = { mount, buildCsvUrl, clearCache };
})(window);



// ================= PATCHED DROPDOWN ENTER-GUARD =================
// Bản vá: chống chồng chéo Enter giữa scanner và Enter giả lập

// Guard variables
const ENTER_DELAY_MS = 180;
const ENTER_WINDOW_MS = 180;
let __lastTrustedEnterAt = 0;

function syncHighlightFromInput() {
  const raw = (__sizeInput.value || '').replace(/[^\d]/g, '');
  if (raw !== __sizeInput.value) __sizeInput.value = raw;
  const v = Number(raw);
  const idx = __sizeDD.findIndexByValue(v);
  if (idx !== null) __sizeDD.highlight(idx);
}

// Capture Enter "thật"
if (typeof __sizeInput !== 'undefined' && __sizeInput) {
  __sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.isTrusted) {
      __lastTrustedEnterAt = Date.now();
    }
  }, true);
}

// Modified onPick
__sizeDD.onPick = (val, row, source) => {
  __sizeInput.value = String(val);
  __sizeInput.dispatchEvent(new Event('input',  { bubbles: true }));
  __sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
  __sizeInput.focus();
  __sizeInput.select();

  if (source === 'mouse') {
    const plannedValue = __sizeInput.value;
    setTimeout(() => {
      if (Date.now() - __lastTrustedEnterAt <= ENTER_WINDOW_MS) return;
      if (document.activeElement !== __sizeInput) return;
      if (!__sizeInput.value || __sizeInput.value.trim() === '') return;
      if (__sizeInput.value !== plannedValue) return;
      const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
      const ku = new KeyboardEvent('keyup',   { key: 'Enter', code: 'Enter', bubbles: true });
      __sizeInput.dispatchEvent(kd);
      __sizeInput.dispatchEvent(ku);
    }, ENTER_DELAY_MS);
  }
};
// ================= END PATCH =================
