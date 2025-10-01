// scripts/shared/masp-normalizer.iife.js
// IIFE — dùng khi bạn muốn <script src=".../masp-normalizer.iife.js"></script> và gọi window.Masp.*

(function (global) {
  const SUFFIX_RE = /^(.*)_([A-Z0-9.\-]+)$/i;
  const PAREN_NUM_RE = /^(.*)\(\s*\d+\s*\)$/;

  function toUpperSafe(s) {
    return String(s || "").trim().toUpperCase();
  }

  function stripParenCounter(s, enable = true) {
    if (!enable) return s;
    const m = s.match(PAREN_NUM_RE);
    return m ? m[1] : s;
  }

  function parseMaspWithSize(raw, opts) {
    const { dropParenCounter = true } = opts || {};
    let s = toUpperSafe(raw);
    s = stripParenCounter(s, dropParenCounter);

    const m = s.match(SUFFIX_RE);
    if (m) {
      const base = m[1].trim();
      const size = m[2].trim();
      return { masp: base, size };
    }
    return { masp: s, size: null };
  }

  function hasSizeSuffix(raw) {
    const s = toUpperSafe(raw);
    return SUFFIX_RE.test(s);
  }

  function normalizeMasp(raw, opts) {
    return parseMaspWithSize(raw, opts).masp;
  }

  function normalizeMany(list, opts) {
    const seen = new Set();
    const out = [];
    for (const x of list || []) {
      const base = normalizeMasp(x, opts);
      if (!base) continue;
      const key = base;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(base);
      }
    }
    return out;
  }

  const Masp = {
    parse: parseMaspWithSize,
    hasSizeSuffix,
    normalize: normalizeMasp,
    normalizeMany,
  };

  global.Masp = Masp;
})(window);
