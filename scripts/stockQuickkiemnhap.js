/* HOÀN TUYẾT / StockQuick kiểm nhập X-N V1 · module độc lập (25/11/2026)
 * X tại cột cơ sở xuất, N tại cột cơ sở nhận cho hóa đơn xcn chưa có dấu DK.
 * Không ghi bất kỳ dữ liệu nào vào DB. Không sửa nghiệp vụ C/D hiện có.
 */
(function () {
  "use strict";
  const RPC = "rpc_stockquick_kiemnhap_xn_v1";
  const CACHE_MS = 20000;
  const cache = new Map();
  let stylesAdded = false;

  function normSize(value) {
    return String(value ?? "0").trim().replace(/^size\s+/i, "").trim();
  }
  function normMasp(value) {
    return String(value ?? "").trim().toUpperCase();
  }
  function addStyle() {
    if (stylesAdded) return;
    stylesAdded = true;
    if (document.getElementById("sq-kiemnhap-xn-style")) return;
    const style = document.createElement("style");
    style.id = "sq-kiemnhap-xn-style";
    style.textContent = `
      .sq-stock-popup .sq-kn-xn {
        display:inline-flex; align-items:center; justify-content:center;
        vertical-align:middle; margin-right:3px; padding:1px 3px;
        border-radius:3px; min-width:13px; font-size:12px;
        font-weight:800; line-height:1.2; cursor:pointer; user-select:none;
      }
      .sq-stock-popup .sq-kn-xn-x { background:#ffedd5; color:#9a3412; border:1px solid #fdba74; }
      .sq-stock-popup .sq-kn-xn-n { background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; }
      .sq-kn-invoice-mask {position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;}
      .sq-kn-invoice-dialog {width:min(94vw,470px);max-height:80vh;overflow:auto;background:#fff;color:#16243b;border-radius:12px;padding:16px;box-shadow:0 10px 36px rgba(0,0,0,.25);font:inherit;}
      .sq-kn-invoice-dialog button {cursor:pointer;min-height:40px;}
      .sq-kn-invoice-link {display:block;width:100%;text-align:left;border:1px solid #cbd5e1;background:#f8fafc;padding:11px;margin:7px 0;border-radius:8px;color:#1d4ed8;word-break:break-word;}
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
  function showInvoicePicker(invoices, caption) {
    const ids = Array.from(new Set(invoices.map(x => String(x || "").trim())))
      .filter(x => /^xcncs[12]_[a-z0-9_-]+$/i.test(x));
    if (!ids.length) return;
    if (ids.length === 1) { openInvoice(ids[0]); return; }
    document.querySelectorAll(".sq-kn-invoice-mask").forEach(el => el.remove());
    const overlay = document.createElement("div");
    overlay.className = "sq-kn-invoice-mask";
    overlay.setAttribute("role", "presentation");
    const dialog = document.createElement("div");
    dialog.className = "sq-kn-invoice-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px";
    const heading = document.createElement("strong");
    heading.textContent = `Chọn phiếu xuất chi nhánh (${ids.length})`;
    const close = document.createElement("button");
    close.textContent = "Đóng";
    close.type = "button";
    close.addEventListener("click", () => overlay.remove());
    header.append(heading, close);
    const sub = document.createElement("p");
    sub.textContent = caption;
    sub.style.cssText = "font-size:13px;color:#475569;margin:10px 0";
    dialog.append(header, sub);
    for (const id of ids) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sq-kn-invoice-link";
      button.textContent = id;
      button.addEventListener("click", () => { openInvoice(id); overlay.remove(); });
      dialog.appendChild(button);
    }
    overlay.appendChild(dialog);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function dismiss(e) {
      if (e.key === "Escape" || !overlay.isConnected) { overlay.remove(); document.removeEventListener("keydown", dismiss); }
    });
    document.body.appendChild(overlay);
  }
  function isTouchDevice() {
    return window.matchMedia?.("(pointer: coarse)")?.matches === true;
  }
  function render(popup, rows) {
    if (!popup?.isConnected) return;
    popup.querySelectorAll(".sq-kn-xn").forEach(node => node.remove());
    const bySize = new Map();
    for (const r of rows) {
      const size = normSize(r.size);
      if (!bySize.has(size)) bySize.set(size, []);
      bySize.get(size).push(r);
    }
    popup.querySelectorAll("tr.sq-open-similar-row[data-size]").forEach(tr => {
      const size = normSize(tr.dataset.size);
      const list = bySize.get(size) || [];
      for (const r of list) {
        const from = String(r.from_branch || "").toLowerCase();
        const to = String(r.to_branch || "").toLowerCase();
        const inv = Array.isArray(r.invoices) ? r.invoices : [];
        const qty = Number(r.qty || 0);
        const info = `Chưa kiểm nhập: ${qty} SP · ${inv.length} HĐ · ${inv.slice(0, 8).join(", ")}${inv.length > 8 ? "..." : ""}`;
        for (const [branch, char] of [[from, "X"], [to, "N"]]) {
          const td = tr.querySelector(branch === "cs1" ? "td.sq-col-k1" : branch === "cs2" ? "td.sq-col-k2" : ":not(*)");
          if (!td) continue;
          const badge = document.createElement("span");
          badge.className = `sq-kn-xn sq-kn-xn-${char.toLowerCase()}`;
          badge.textContent = char;
          badge.title = `${char === "X" ? "Xuất" : "Nhập"} ${from.toUpperCase()} → ${to.toUpperCase()} · ${info}`;
          badge.setAttribute("aria-label", badge.title);
          const open = e => {
            e.preventDefault();
            e.stopPropagation();
            showInvoicePicker(inv, `${char === "X" ? "Xuất" : "Nhập"} ${from.toUpperCase()} → ${to.toUpperCase()} · Size ${size} · ${qty} SP chưa kiểm nhập`);
          };
          badge.title += " · Nhấp đúp để xem hóa đơn (điện thoại: chạm một lần)";
          badge.setAttribute("tabindex", "0");
          badge.setAttribute("role", "button");
          badge.addEventListener("click", e => {
            e.stopPropagation();
            if (isTouchDevice()) open(e);
          });
          badge.addEventListener("dblclick", open);
          badge.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") open(e);
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
      render(popup, rows);
    } catch (err) {
      // Cảnh báo X/N là bổ sung; không để lỗi mạng/RPC phá Popup tồn kho.
      console.warn("[stockQuickkiemnhap] Không thể tải ký hiệu X/N:", err);
    }
  }
  window.StockQuickKiemNhap = { attach, clearCache: () => cache.clear() };
})();
