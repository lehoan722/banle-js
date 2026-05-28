// stockQuickColor.js
// Xử lý mã gốc, màu hiện tại, màu khác cùng mã gốc.

(function () {
  "use strict";

  const SQ_COLOR_CACHE = {};

  function getMaspBaseAndColor(maspRaw) {
    const masp = String(maspRaw || "").trim().toUpperCase();
    const idx = masp.lastIndexOf(".");

    if (idx <= 0 || idx >= masp.length - 1) {
      return { base: masp, color: "" };
    }

    return {
      base: masp.slice(0, idx),
      color: masp.slice(idx + 1)
    };
  }

  function normalizeColorName(colorRaw) {
    return String(colorRaw || "").trim().toLowerCase();
  }

  function buildOtherColorLinksHtml(currentMasp, mauKhacText) {
    const { base } = getMaspBaseAndColor(currentMasp);

    const colors = String(mauKhacText || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (!base || !colors.length) return "";

    return colors.map(color => {
      const targetMasp = `${base}.${color}`.toUpperCase();
      return `<span class="sq-color-link" data-color-masp="${targetMasp}">${color}</span>`;
    }).join(", ");
  }

  function prepareColorPromise(client, masp) {
    const colorInfo = getMaspBaseAndColor(masp);

    if (!colorInfo.base || !colorInfo.color) {
      return Promise.resolve({ data: [], error: null });
    }

    if (SQ_COLOR_CACHE[colorInfo.base]) {
      return Promise.resolve({
        data: SQ_COLOR_CACHE[colorInfo.base].map(m => ({ masp: m })),
        error: null
      });
    }

    return client
      .from("dmhanghoa")
      .select("masp")
      .ilike("masp", colorInfo.base + ".%");
  }

  function parseColorResult(masp, colorRes) {
    const colorInfo = getMaspBaseAndColor(masp);
    let mau_khac = "";

    if (colorRes && !colorRes.error && Array.isArray(colorRes.data)) {
      const allMasps = colorRes.data
        .map(r => String(r.masp || "").trim().toUpperCase())
        .filter(Boolean);

      if (colorInfo.base && allMasps.length) {
        SQ_COLOR_CACHE[colorInfo.base] = allMasps;
      }

      const currentColor = normalizeColorName(colorInfo.color);

      const otherColors = allMasps
        .map(code => getMaspBaseAndColor(code).color)
        .map(normalizeColorName)
        .filter(c => c && c !== currentColor);

      mau_khac = Array.from(new Set(otherColors)).join(", ");
    }

    return mau_khac;
  }

  window.StockQuickColor = {
    getMaspBaseAndColor,
    normalizeColorName,
    buildOtherColorLinksHtml,
    prepareColorPromise,
    parseColorResult,
  };
})();
