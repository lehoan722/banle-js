/* HOÀN TUYẾT · StockQuick X/N · V1.03 · 26/11/2026
 * Bấm 1 lần X/N: xem thẻ thông tin; bấm đúp/chạm đôi: mở hóa đơn.
 * Giữ nguyên RPC tổng hợp X/N và cơ chế DK hiện có. RPC chi tiết chỉ đọc, tải khi mở thẻ.
 */
(function () {
  "use strict";
  const RPC = "rpc_stockquick_kiemnhap_xn_v1";
  const DETAIL_RPC = "rpc_stockquick_kiemnhap_xn_detail_v1";
  const CACHE_MS = 20000;
  const DOUBLE_MS = 360;
  const cache = new Map();
  const detailCache = new Map();
  let stylesAdded = false;
  let activeCard = null;
  let outsideHandler = null;
  let escapeHandler = null;
  let scrollHandler = null;

  function normSize(value) { return String(value ?? "0").trim().replace(/^size\s+/i, "").trim(); }
  function normMasp(value) { return String(value ?? "").trim().toUpperCase(); }
  function invoiceIds(list) {
    return [...new Set((Array.isArray(list) ? list : []).map(x => String(x || "").trim()))]
      .filter(x => /^xcncs[12]_[a-z0-9_-]+$/i.test(x));
  }
  function addStyle() {
    if (stylesAdded || document.getElementById("sq-kiemnhap-xn-style")) { stylesAdded = true; return; }
    stylesAdded = true;
    const style = document.createElement("style");
    style.id = "sq-kiemnhap-xn-style";
    style.textContent = `
      .sq-stock-popup .sq-kn-xn{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-right:3px;padding:1px 3px;border-radius:3px;min-width:13px;font-size:12px;font-weight:800;line-height:1.2;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation}
      .sq-stock-popup .sq-kn-xn-x{background:#ffedd5;color:#9a3412;border:1px solid #fdba74}
      .sq-stock-popup .sq-kn-xn-n{background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd}
      .sq-kn-invoice-mask{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .sq-kn-invoice-dialog{width:min(94vw,470px);max-height:80vh;overflow:auto;background:#fff;color:#16243b;border-radius:12px;padding:16px;box-shadow:0 10px 36px rgba(0,0,0,.25);font:inherit}
      .sq-kn-invoice-dialog button{cursor:pointer;min-height:40px}
      .sq-kn-invoice-link{display:block;width:100%;text-align:left;border:1px solid #cbd5e1;background:#f8fafc;padding:11px;margin:7px 0;border-radius:8px;color:#1d4ed8;word-break:break-word}
      .sq-kn-info{position:fixed;z-index:2147483645;box-sizing:border-box;width:min(340px,calc(100vw - 20px));max-height:min(62vh,400px);overflow:auto;overscroll-behavior:contain;padding:12px;border:1px solid #93c5fd;border-radius:10px;background:#fff;color:#17233b;box-shadow:0 9px 26px rgba(15,23,42,.25);font:13px/1.45 Arial,sans-serif;text-align:left}
      .sq-kn-info-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;font-weight:700}
      .sq-kn-info-x{border:0;background:#eef2f7;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:17px}
      .sq-kn-info-item{border-top:1px solid #e2e8f0;padding:8px 0 5px}
      .sq-kn-info-small{color:#475569;font-size:12px}
      .sq-kn-info-open{border:1px solid #93c5fd;border-radius:6px;color:#1d4ed8;background:#eff6ff;padding:5px 8px;margin-top:5px;cursor:pointer}
      .sq-kn-info-hint{color:#64748b;font-size:11px;margin-top:7px}
    `;
    document.head.appendChild(style);
  }
  async function fetchRows(masp) {
    const key = normMasp(masp);
    const old = cache.get(key);
    if (old && Date.now() - old.at < CACHE_MS) return old.rows;
    const client = window.supabase;
    if (!client || typeof client.rpc !== "function") return [];
    const { data, error } = await client.rpc(RPC, { p_masp: key });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    cache.set(key, { rows, at: Date.now() });
    return rows;
  }
  function invoiceUrl(sohd) {
    const url = new URL("/xemhoadon111.html", window.location.origin);
    url.searchParams.set("sohd", sohd);
    return url.toString();
  }
  function openInvoice(sohd) {
    if (!/^xcncs[12]_[a-z0-9_-]+$/i.test(sohd)) return;
    window.open(invoiceUrl(sohd), "_blank", "noopener,noreferrer");
  }
  function closeCard() {
    if (activeCard) { activeCard.remove(); activeCard = null; }
    if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
    if (escapeHandler) document.removeEventListener("keydown", escapeHandler);
    if (scrollHandler) window.removeEventListener("resize", scrollHandler);
    outsideHandler = escapeHandler = scrollHandler = null;
  }
  function makeText(parent, tag, textValue, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = textValue;
    parent.appendChild(el);
    return el;
  }
  function showInvoicePicker(invoices, caption) {
    closeCard();
    const ids = invoiceIds(invoices);
    if (!ids.length) return;
    if (ids.length === 1) { openInvoice(ids[0]); return; }
    document.querySelectorAll(".sq-kn-invoice-mask").forEach(el => el.remove());
    const overlay = document.createElement("div");
    overlay.className = "sq-kn-invoice-mask";
    const dialog = document.createElement("div");
    dialog.className = "sq-kn-invoice-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px";
    makeText(head, "strong", `Chọn phiếu xuất chi nhánh (${ids.length})`);
    const close = makeText(head, "button", "Đóng");
    close.type = "button";
    close.addEventListener("click", () => overlay.remove());
    dialog.append(head);
    makeText(dialog, "p", caption, "sq-kn-info-small");
    for (const id of ids) {
      const btn = makeText(dialog, "button", id, "sq-kn-invoice-link");
      btn.type = "button";
      btn.addEventListener("click", () => { openInvoice(id); overlay.remove(); });
    }
    overlay.appendChild(dialog);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    const dismiss = e => {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", dismiss); }
    };
    document.addEventListener("keydown", dismiss);
    document.body.appendChild(overlay);
  }
  function placeCard(card, badge) {
    if (!badge.isConnected) { closeCard(); return; }
    const r = badge.getBoundingClientRect();
    const gap = 8, margin = 10;
    const below = Math.max(0, window.innerHeight - r.bottom - gap - margin);
    const above = Math.max(0, r.top - gap - margin);
    const useBelow = below >= 220 || below >= above;
    const available = useBelow ? below : above;
    // Chiều cao thẻ chỉ dùng khoảng trống phía trên hoặc dưới, không che X/N.
    card.style.maxHeight = `${Math.max(90, available)}px`;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    const top = useBelow ? r.bottom + gap : r.top - gap - height;
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(margin, top)}px`;
  }
  async function fetchDetail(masp, size, from, to, ids) {
    const key = JSON.stringify([masp, size, from, to, ids]);
    const old = detailCache.get(key);
    if (old && Date.now() - old.at < CACHE_MS) return old.rows;
    const client = window.supabase;
    if (!client || typeof client.rpc !== "function") throw new Error("Không có kết nối Supabase");
    const { data, error } = await client.rpc(DETAIL_RPC, {
      p_masp: masp, p_size: size, p_from_branch: from, p_to_branch: to
    });
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []).filter(r => ids.includes(String(r.sohd || "")));
    detailCache.set(key, { rows, at: Date.now() });
    return rows;
  }
  function showInfo(badge, ctx) {
    closeCard();
    addStyle();
    const ids = invoiceIds(ctx.inv);
    const card = document.createElement("section");
    card.className = "sq-kn-info";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Thông tin hóa đơn chuyển chi nhánh chưa kiểm nhập");
    const head = document.createElement("div"); head.className = "sq-kn-info-head";
    makeText(head, "span", `${ctx.char === "X" ? "Xuất" : "Nhập"} ${ctx.from.toUpperCase()} → ${ctx.to.toUpperCase()} · Size ${ctx.size}`);
    const close = makeText(head, "button", "×", "sq-kn-info-x");
    close.type = "button"; close.setAttribute("aria-label", "Đóng thông tin");
    close.addEventListener("click", closeCard);
    card.appendChild(head);
    makeText(card, "div", `Chưa kiểm nhập: ${ctx.qty} SP · ${ids.length} hóa đơn`, "sq-kn-info-small");
    const body = document.createElement("div");
    card.appendChild(body);
    for (const id of ids) {
      const item = document.createElement("div"); item.className = "sq-kn-info-item";
      makeText(item, "strong", id);
      const fields = makeText(item, "div", "Đang tải ngày, nhân viên…", "sq-kn-info-small");
      const open = makeText(item, "button", "Xem hóa đơn", "sq-kn-info-open");
      open.type = "button";
      open.addEventListener("click", e => { e.stopPropagation(); openInvoice(id); });
      body.appendChild(item);
      item.dataset.invoice = id;
      item._sqFields = fields;
    }
    if (!ids.length) makeText(body, "div", "Không tìm thấy số hóa đơn hợp lệ.", "sq-kn-info-small");
    makeText(card, "div", "Chạm/nhấp đúp vào X hoặc N để mở phiếu.", "sq-kn-info-hint");
    document.body.appendChild(card);
    activeCard = card;
    placeCard(card, badge);
    outsideHandler = e => {
      if (!card.contains(e.target) && !badge.contains(e.target)) closeCard();
    };
    escapeHandler = e => { if (e.key === "Escape") closeCard(); };
    scrollHandler = () => { if (activeCard === card) placeCard(card, badge); };
    document.addEventListener("pointerdown", outsideHandler, true);
    document.addEventListener("keydown", escapeHandler);
    window.addEventListener("resize", scrollHandler);
    if (!ids.length) return;
    void fetchDetail(ctx.masp, ctx.size, ctx.from, ctx.to, ids).then(rows => {
      if (activeCard !== card) return;
      const details = new Map(rows.map(r => [String(r.sohd), r]));
      for (const item of body.children) {
        const r = details.get(item.dataset.invoice);
        if (!r) { item._sqFields.textContent = "Chưa lấy được thông tin chi tiết"; continue; }
        let dateText = String(r.ngay || "").trim();
        // Đưa ISO YYYY-MM-DD về DD/MM/YYYY, giữ phần giờ nếu có.
        dateText = dateText.replace(/^(\d{4})-(\d{2})-(\d{2})(.*)$/, (_, y, m, d, tail) => `${d}/${m}/${y}${tail}`);
        item._sqFields.textContent = `${Number(r.qty || 0)} SP · ${dateText || "Chưa rõ ngày"} · NV: ${String(r.manv || "—")}`;
      }
      placeCard(card, badge);
    }).catch(err => {
      if (activeCard !== card) return;
      for (const item of body.children) item._sqFields.textContent = "Chưa tải được ngày/NV; vẫn có thể xem phiếu";
      console.warn("[stockQuickkiemnhap] Không tải được chi tiết hóa đơn:", err);
    });
  }
  function render(popup, rows, masp) {
    if (!popup?.isConnected) return;
    closeCard();
    popup.querySelectorAll(".sq-kn-xn").forEach(node => node.remove());
    const bySize = new Map();
    for (const r of rows) {
      const size = normSize(r.size);
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push(r);
    }
    popup.querySelectorAll("tr.sq-open-similar-row[data-size]").forEach(tr => {
      const size = normSize(tr.dataset.size);
      for (const r of bySize.get(size) || []) {
        const from = String(r.from_branch || "").toLowerCase();
        const to = String(r.to_branch || "").toLowerCase();
        const inv = invoiceIds(r.invoices);
        const qty = Number(r.qty || 0);
        for (const [branch, char] of [[from, "X"], [to, "N"]]) {
          const td = tr.querySelector(branch === "cs1" ? "td.sq-col-k1" : branch === "cs2" ? "td.sq-col-k2" : ":not(*)");
          if (!td) continue;
          const badge = document.createElement("span");
          badge.className = `sq-kn-xn sq-kn-xn-${char.toLowerCase()}`;
          badge.textContent = char;
          badge.title = `${char === "X" ? "Xuất" : "Nhập"} ${from.toUpperCase()} → ${to.toUpperCase()} · ${qty} SP · ${inv.length} HĐ · Chạm 1 lần xem thông tin, 2 lần mở phiếu`;
          badge.setAttribute("aria-label", badge.title);
          badge.setAttribute("tabindex", "0");
          badge.setAttribute("role", "button");
          const ctx = { masp, size, from, to, inv, qty, char };
          let lastClick = 0, pending = null;
          badge.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            const now = Date.now();
            if (pending && now - lastClick <= DOUBLE_MS) {
              clearTimeout(pending); pending = null; lastClick = 0;
              showInvoicePicker(inv, `${char === "X" ? "Xuất" : "Nhập"} ${from.toUpperCase()} → ${to.toUpperCase()} · Size ${size} · ${qty} SP chưa kiểm nhập`);
              return;
            }
            if (pending) clearTimeout(pending);
            lastClick = now;
            pending = setTimeout(() => {
              pending = null;
              if (badge.isConnected) showInfo(badge, ctx);
            }, DOUBLE_MS);
          });
          badge.addEventListener("dblclick", e => { e.preventDefault(); e.stopPropagation(); });
          badge.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault(); e.stopPropagation();
              showInfo(badge, ctx);
            }
          });
          td.prepend(badge);
        }
      }
    });
  }
  async function attach(popup, masp) {
    try {
      if (!popup?.isConnected) return;
      addStyle();
      const key = normMasp(masp || popup.dataset.masp);
      if (!key) return;
      const rows = await fetchRows(key);
      if (!popup.isConnected || normMasp(popup.dataset.masp) !== key) return;
      render(popup, rows, key);
    } catch (err) {
      console.warn("[stockQuickkiemnhap] Không thể tải ký hiệu X/N:", err);
    }
  }
  window.StockQuickKiemNhap = { attach, clearCache: () => { cache.clear(); detailCache.clear(); closeCard(); } };
})();
