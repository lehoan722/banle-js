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
  console.warn("=== TEST KHUYEN MAI LOCAL 1.0.4 ===", {
    gia,
    khuyenMaiNhapTay,
    sanPham: sp?.masp
  });

  // Chỉ đọc khuyến mại là số tiền.
  // Bỏ hoàn toàn cách hiểu theo phần trăm trong bản thử nghiệm.
  const raw = String(khuyenMaiNhapTay ?? sp?.khuyenmai ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[₫đ]/gi, "")
    .replace(/[.,]/g, "");

  const soTien = Number(raw);

  if (!Number.isFinite(soTien) || soTien <= 0) {
    return 0;
  }

  return Math.round(soTien);
}