// khuyenmai.js

/**
 * Hàm xác định giá trị khuyến mại cho một sản phẩm
 * @param {object} sp - Thông tin sản phẩm (có thể là object từ bảng danh mục hàng hóa)
 * @param {number} gia - Giá bán thực tế
 * @param {number|string} khuyenMaiNhapTay - Giá trị khuyến mại nhập tay (tùy chọn, nếu không nhập thì truyền "" hoặc undefined)
 * @returns {number} - Số tiền khuyến mại tính được
 */
export function tinhKhuyenMai(sp, gia, khuyenMaiNhapTay) {
  // --- ƯU TIÊN XỬ LÝ KHUYẾN MẠI NHẬP TAY ---
  if (
    khuyenMaiNhapTay !== undefined &&
    khuyenMaiNhapTay !== null &&
    khuyenMaiNhapTay !== ""
  ) {
    let soKM = Number(khuyenMaiNhapTay);
    if (!isNaN(soKM) && soKM > 0) {
      if (soKM > 100) {
        // Trừ trực tiếp số tiền
        return soKM;
      } else {
        // Trừ theo phần trăm
        return Math.round((gia * soKM) / 100);
      }
    }
    // Nếu người dùng nhập text không hợp lệ (NaN), vẫn dùng logic cũ
  }

  // --- LOGIC KHUYẾN MẠI MẶC ĐỊNH ---
  let km = sp && sp.khuyenmai !== undefined && sp.khuyenmai !== null && sp.khuyenmai !== ''
    ? parseFloat(sp.khuyenmai)
    : NaN;
  if (km === 0) {
    return 0;
  }

  if (isNaN(km)) {
    // Không có khuyến mại trong danh mục: Quy tắc cũ
    return gia < 100000 ? 5000 : gia < 500000 ? 10000 : 20000;
  }
  if (km >= 1 && km < 100) {
    // % khuyến mại
    return Math.round((gia * km) / 100);
  }
  if (km >= 1000) {
    // Số tiền khuyến mại trực tiếp
    return km;
  }
  // Nếu giá trị linh tinh, về mặc định
  return gia < 100000 ? 5000 : gia < 500000 ? 10000 : 20000;
}
