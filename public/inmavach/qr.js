// qr.js - Xử lý sinh mã QR từ mã sản phẩm


// Dùng thẳng window.QRious vì QRious không export dạng module
window.generateQR = function (element, text) {
    new QRious({
        element,
        value: text,
        size: 25,
        level: 'M',
    });
};


// Hàm khởi tạo mã QR cho các phần tử có class 'qr'
export function generateQRCodesForPage() {
  document.querySelectorAll('.tem .qr').forEach((el) => {
    const parent = el.closest('.tem');
    if (!parent || parent.classList.contains('tem-blank')) return;
    const masp = parent.getAttribute('data-masp');
    new QRious({
      element: el,
      value: masp,
      size: 25,
      level: 'M'
    });
  });
}

// Hàm tạo ảnh QR base64 (dùng cho chế độ in tất cả các trang – tạo sẵn ảnh QR để tránh mất mã khi in hàng loạt)
export function generateQRBase64(text) {
  const qr = new QRious({
    value: text,
    size: 25,
    level: 'M'
  });
  return qr.toDataURL();
}
