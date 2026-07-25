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
    return Number.isFinite(value)
      ? value
      : NaN;
  }

  let raw = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[₫đ]/gi, "");

  if (!raw) return NaN;

  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");

  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");

    if (lastDot > lastComma) {
      // 1,234.50
      raw = raw.replace(/,/g, "");
    } else {
      // 1.234,50
      raw = raw
        .replace(/\./g, "")
        .replace(",", ".");
    }

    const result = Number(raw);

    return Number.isFinite(result)
      ? result
      : NaN;
  }

  const separator = hasDot
    ? "."
    : hasComma
      ? ","
      : null;

  if (separator) {
    const parts = raw.split(separator);

    // 1.000.000
    if (parts.length > 2) {
      const result = Number(parts.join(""));

      return Number.isFinite(result)
        ? result
        : NaN;
    }

    const tail = parts[1] || "";

    // 10.000 hoặc 10,000 là số tiền
    if (/^\d{3}$/.test(tail)) {
      const result = Number(parts.join(""));

      return Number.isFinite(result)
        ? result
        : NaN;
    }

    // 10.5 hoặc 10,5 là phần trăm thập phân
    raw = parts[0] + "." + tail;
  }

  const result = Number(raw);

  return Number.isFinite(result)
    ? result
    : NaN;
}

/**
 * Xác định số tiền khuyến mại cho một sản phẩm.
 *
 * Thứ tự ưu tiên:
 * 1. Khuyến mại nhập tay.
 * 2. Khuyến mại được khai báo trong danh mục sản phẩm.
 * 3. Quy tắc khuyến mại mặc định theo giá.
 *
 * @param {object} sp
 * @param {number} gia
 * @param {number|string} khuyenMaiNhapTay
 * @returns {number}
 */
export function tinhKhuyenMai(
  sp,
  gia,
  khuyenMaiNhapTay
) {
  const giaBan = Number(gia || 0);

  /*
   * 1. Ưu tiên khuyến mại nhập tay nếu được truyền vào.
   */
  const kmNhapTay =
    parseKhuyenMai(khuyenMaiNhapTay);

  if (
    Number.isFinite(kmNhapTay) &&
    kmNhapTay > 0
  ) {
    if (kmNhapTay <= 100) {
      return Math.round(
        giaBan * kmNhapTay / 100
      );
    }

    return Math.round(kmNhapTay);
  }

  /*
   * 2. Đọc khuyến mại trong danh mục sản phẩm.
   */
  const kmDanhMuc =
    parseKhuyenMai(sp?.khuyenmai);

  /*
   * Khuyến mại được khai báo rõ bằng 0
   * nghĩa là sản phẩm không được khuyến mại.
   */
  if (kmDanhMuc === 0) {
    return 0;
  }

  if (
    Number.isFinite(kmDanhMuc) &&
    kmDanhMuc > 0
  ) {
    if (kmDanhMuc < 100) {
      return Math.round(
        giaBan * kmDanhMuc / 100
      );
    }

    if (kmDanhMuc >= 1000) {
      return Math.round(kmDanhMuc);
    }
  }

  /*
   * 3. Không có khuyến mại riêng:
   * áp dụng quy tắc mặc định đang dùng ở MAIN.
   */
  if (giaBan < 100000) {
    return 5000;
  }

  if (giaBan < 500000) {
    return 10000;
  }

  return 20000;
}
