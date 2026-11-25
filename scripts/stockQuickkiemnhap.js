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
        font-weight:800; line-height:1.2; cursor:help;
      }
      .sq-stock-popup .sq-kn-xn-x { background:#ffedd5; color:#9a3412; border:1px solid #fdba74; }
      .sq-stock-popup .sq-kn-xn-n { background:#dbeafe; color:#1d4ed8; border:1px solid #93c5fd; }
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
          badge.addEventListener("click", e => e.stopPropagation());
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
