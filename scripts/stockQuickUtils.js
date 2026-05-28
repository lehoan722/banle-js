// stockQuickUtils.js
// Hàm phụ trợ dùng chung cho popup tồn kho nhanh.
// File này được stockQuickPopup.js tự nạp. Không cần gọi trực tiếp trong HTML.

(function () {
  "use strict";

  function getSupabaseClient() {
    if (typeof window === "undefined") return null;
    const client = window.supabase;
    if (!client || !client.auth || typeof client.from !== "function") {
      console.warn("[StockQuickPopup] supabase global chưa sẵn sàng. Hãy đảm bảo đã load authModule.js hoặc supabaseClient.js trước.");
      return null;
    }
    return client;
  }

  async function waitForSupabaseReady(maxWaitMs = 1000) {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const client = getSupabaseClient();

      if (
        client &&
        client.auth &&
        typeof client.auth.getSession === "function" &&
        typeof client.rpc === "function"
      ) {
        try {
          await client.auth.getSession();
          return client;
        } catch (e) {}
      }

      await new Promise(r => setTimeout(r, 150));
    }

    return getSupabaseClient();
  }

  function getIsAdminLocal() {
    try {
      return (sessionStorage.getItem("is_admin") || localStorage.getItem("is_admin")) === "true";
    } catch {
      return false;
    }
  }

  function normalizeSize(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "";
    if (/^\d+$/.test(s)) return "size " + s;
    if (s.startsWith("size ")) return s;
    return "size " + s.replace(/^size\s*/, "").trim();
  }

  function displaySizeLabel(size) {
    const raw = String(size ?? "").trim();
    if (!raw) return "";
    const noPrefix = raw.replace(/^size\s+/i, "").trim();
    if (noPrefix.includes(",")) return noPrefix;

    const SIZE_FULL_MAP = {
      "38": "38,2,S,46,240,165",
      "39": "39,3,M,48,245,170",
      "40": "40,4,L,50,250,175",
      "41": "41,5,XL,52,255,180",
      "42": "42,6,2XL,54,260,185",
      "43": "43,7,3X,56,265,190",
      "44": "44,8,4X,58,270,195",
      "45": "45,9,5X,60,275,200",
    };

    const m = noPrefix.match(/(\d{1,2})/);
    const num = m ? m[1] : noPrefix;
    if (num === "0") return "0";
    return SIZE_FULL_MAP[num] || num;
  }

  function formatShortPrice(v) {
    const n = Number(v || 0);
    if (!n) return "";
    if (n % 1000 === 0) return String(Math.round(n / 1000)) + ".";
    return n.toLocaleString("vi-VN");
  }

  async function copyTextToClipboard(text) {
    const t = String(text || "").trim();
    if (!t) return false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(t);
        return true;
      } catch (e) {}
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function getDenNgay() {
    try {
      const raw = sessionStorage.getItem("XNT14_FILTERS");
      if (raw) {
        const f = JSON.parse(raw);
        if (f.den_ngay) return f.den_ngay;
      }
    } catch (e) {}
    return new Date().toISOString().slice(0, 10);
  }

  function toYYYYMMDD(v) {
    if (!v) return "";
    const s = String(v).trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toISOString().slice(0, 10);
  }

  function yyyymmddToDDMMYY(s) {
    if (!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return String(s).trim();
    const yy = m[1].slice(2);
    return `${m[3]}${m[2]}${yy}`;
  }

  function normalizeND(v) {
    const ymd = toYYYYMMDD(v);
    return yyyymmddToDDMMYY(ymd);
  }

  window.StockQuickUtils = {
    getSupabaseClient,
    waitForSupabaseReady,
    getIsAdminLocal,
    normalizeSize,
    displaySizeLabel,
    formatShortPrice,
    copyTextToClipboard,
    getDenNgay,
    normalizeND,
  };
})();
