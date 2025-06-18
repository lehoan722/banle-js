// utils.js - Các hàm tiện ích dùng chung và hằng số cấu hình

// Định dạng giá tiền
export function formatGia(gia) {
  gia = parseInt(gia || 0);
  return gia.toLocaleString("vi-VN");
}

// Hằng số cấu hình tem
export const PAGE_MARGIN_TOP_MM = 5;
export const PAGE_MARGIN_LEFT_MM = 4;
export const TEM_WIDTH_MM = 35;
export const TEM_HEIGHT_MM = 19;
export const COLS_PER_PAGE = 5;
export const ROWS_PER_PAGE = 8;
export const TEMS_PER_PAGE = COLS_PER_PAGE * ROWS_PER_PAGE;

// Tạo mã QR base64 từ text để sử dụng khi in (in toàn bộ)
export function generateQRBase64(text, size = 25) {
  const qr = new QRious({
    value: text,
    size: size,
    level: 'M'
  });
  return qr.toDataURL();
}
