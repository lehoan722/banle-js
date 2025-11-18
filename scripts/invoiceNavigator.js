// scripts/invoiceNavigator.js

/**
 * Mở trang xem hóa đơn với số hóa đơn & loại hóa đơn lấy từ 1 dòng bất kỳ.
 * rowData: 1 object của Handsontable (hoặc dữ liệu report khác) có các field: sohd, loaihd, diadiem ...
 */
export function openInvoiceFromRow(rowData) {
  if (!rowData || !rowData.sohd) {
    alert("Không tìm được số hóa đơn để mở.");
    return;
  }

  const sohd = rowData.sohd;
  const loaihd = rowData.loaihd || "";
  const diadiem = rowData.diadiem || "";

  // ==========================
  // 1) XÁC ĐỊNH TRANG ĐÍCH
  // ==========================
  // Ở đây mình giả sử bạn có 1 trang xem hóa đơn chung là `xemhoadon.html`
  // và trang này nhận query `?sohd=...&loaihd=...&diadiem=...`
  // Bạn chỉ cần sửa lại `targetPath` cho đúng trang bạn muốn (xemhoadon.html, baocaobanhanghoadon.html,…)

  const targetPath = "/xemhoadon.html";     // TODO: đổi lại đúng đường dẫn trang xem HĐ của bạn

  const url = new URL(targetPath, window.location.origin);
  url.searchParams.set("sohd", sohd);
  if (loaihd) url.searchParams.set("loaihd", loaihd);
  if (diadiem) url.searchParams.set("diadiem", diadiem);

  // ==========================
  // 2) MỞ TRANG XEM HÓA ĐƠN
  // ==========================
  // _blank: mở tab mới
  // nếu bạn muốn mở ngay trên tab hiện tại thì dùng "_self"
  window.open(url.toString(), "_blank");
}

/**
 * Ví dụ cho trường hợp bạn chỉ biết mỗi số hóa đơn (không có rowData đầy đủ)
 */
export function openInvoiceByNumber(sohd) {
  if (!sohd) {
    alert("Thiếu số hóa đơn.");
    return;
  }
  const targetPath = "/xemhoadon.html";   // TODO: đổi lại cho đúng
  const url = new URL(targetPath, window.location.origin);
  url.searchParams.set("sohd", sohd);
  window.open(url.toString(), "_blank");
}
