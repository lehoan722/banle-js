// scripts/shared/masp-normalizer.js
// ESM module — import { Masp } from "./shared/masp-normalizer.js";

/**
 * Quy ước:
 * - Chỉ cắt "_HẬU_TỐ" ở CUỐI chuỗi. Không đụng "_" ở giữa mã.
 * - Hậu tố cho phép: A–Z 0–9 . - (để hỗ trợ "41.5", "XL", "43-2", v.v.)
 * - Chuẩn hoá IN HOA toàn bộ để so sánh nhất quán.
 * - Tuỳ chọn loại bỏ đuôi "(số)" ở cuối (ví dụ ABC12-DG(2)).
 */
const SUFFIX_RE = /^(.*)_([A-Z0-9.\-]+)$/i;          // bắt đuôi _suffix ở CUỐI
const PAREN_NUM_RE = /^(.*)\(\s*\d+\s*\)$/;           // bắt đuôi (3) ở CUỐI

function toUpperSafe(s) {
  return String(s || "").trim().toUpperCase();
}

function stripParenCounter(s, enable = true) {
  if (!enable) return s;
  const m = s.match(PAREN_NUM_RE);
  return m ? m[1] : s;
}

/**
 * Tách mã + size hậu tố: "ABC12-DG38_38" -> { masp: "ABC12-DG38", size: "38" }
 * Nếu không có hậu tố: { masp: "ABC12-DG38", size: null }
 * @param {string} raw
 * @param {object} opts
 *  - dropParenCounter: boolean (default true) loại bỏ đuôi "(số)"
 */
export function parseMaspWithSize(raw, opts = {}) {
  const { dropParenCounter = true } = opts;
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

export function hasSizeSuffix(raw) {
  const s = toUpperSafe(raw);
  return SUFFIX_RE.test(s);
}

/** Chỉ lấy mã gốc để truy vấn */
export function normalizeMasp(raw, opts = {}) {
  return parseMaspWithSize(raw, opts).masp;
}

/** Áp dụng cho danh sách (textarea/buffer quét) */
export function normalizeMany(list, opts = {}) {
  const seen = new Set();
  const out = [];
  for (const x of list || []) {
    const base = normalizeMasp(x, opts);
    if (!base) continue;
    const key = base; // đã IN HOA
    if (!seen.has(key)) {
      seen.add(key);
      out.push(base);
    }
  }
  return out;
}

export const Masp = {
  parse: parseMaspWithSize,
  hasSizeSuffix,
  normalize: normalizeMasp,
  normalizeMany,
};

export default Masp;
