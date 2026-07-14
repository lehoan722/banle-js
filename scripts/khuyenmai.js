// khuyenmai.js

/**
 * Đọc giá trị khuyến mại an toàn.
 *
 * Quy ước:
 * - 10       → 10%
 * - "10"     → 10%
 * - "10,5"   → 10,5%
 * - "10.5"   → 10,5%
 * - "10.000" → 10.000 đồng
 * - "10,000" → 10.000 đồng
 * - 10000    → 10.000 đồng
 */
function parseKhuyenMai(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return NaN;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  let raw = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[₫đ]/gi, "");

  if (!raw) return NaN;

  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");

  // Có cả dấu chấm và dấu phẩy
  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");

    if (lastDot > lastComma) {
      // Ví dụ 1,234.50
      raw = raw.replace(/,/g, "");
    } else {
      // Ví dụ 1.234,50
      raw = raw
        .replace(/\./g, "")
        .replace(",", ".");
    }

    const result = Number(raw);
    return Number.isFinite(result) ? result : NaN;
  }

  const separator = hasDot
    ? "."
    : hasComma
      ? ","
      : null;

  if (separator) {
    const parts = raw.split(separator);

    // Ví dụ 1.000.000
    if (parts.length > 2) {
      const result = Number(parts.join(""));
      return Number.isFinite(result) ? result : NaN;
    }

    const tail = parts[1] || "";

    // Đúng 3 chữ số sau dấu:
    // coi là phân cách hàng nghìn
    // 10.000 hoặc 10,000 → 10000
    if (/^\d{3}$/.test(tail)) {
      const result = Number(parts.join(""));
      return Number.isFinite(result) ? result : NaN;
    }

    // 10.5 hoặc 10,5 → phần trăm thập phân
    raw = parts[0] + "." + tail;
  }

  const result = Number(raw);
  return Number.isFinite(result) ? result : NaN;
}

/**
 * Xác định số tiền khuyến mại cho sản phẩm.
 */
export function tinhKhuyenMai(sp, gia, khuyenMaiNhapTay) {
  const giaBan = Number(gia) || 0;

  // Khuyến mại nhập tay
  if (
    khuyenMaiNhapTay !== undefined &&
    khuyenMaiNhapTay !== null &&
    khuyenMaiNhapTay !== ""
  ) {
    const soKM = parseKhuyenMai(khuyenMaiNhapTay);

    if (Number.isFinite(soKM) && soKM > 0) {
      if (soKM > 100) {
        return Math.round(soKM);
      }

      return Math.round((giaBan * soKM) / 100);
    }
  }

  // Khuyến mại từ danh mục hàng hóa
  const rawKM =
    sp &&
    sp.khuyenmai !== undefined &&
    sp.khuyenmai !== null &&
    sp.khuyenmai !== ""
      ? sp.khuyenmai
      : null;

  const km = parseKhuyenMai(rawKM);

  if (km === 0) {
    return 0;
  }

  if (!Number.isFinite(km)) {
    return giaBan < 100000
      ? 5000
      : giaBan < 500000
        ? 10000
        : 20000;
  }

  if (km > 0 && km <= 100) {
    return Math.round((giaBan * km) / 100);
  }

  if (km > 100) {
    return Math.round(km);
  }

  return 0;
}