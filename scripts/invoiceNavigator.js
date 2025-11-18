// scripts/invoiceNavigator.js
// Module dùng chung để điều hướng từ báo cáo sang đúng trang chứng từ

// Map: tiền tố loại hóa đơn / số hóa đơn -> trang HTML đích
const LOAIHD_TO_PAGE = {
  // Bán lẻ máy tính
  bancs1: "/banlemtcs1.html",
  bancs2: "/banlemtcs2.html",

  // Bán lẻ nhân viên
  bannvcs1: "/bannvcs1.html",
  bannvcs2: "/bannvcs2.html",

  // Nhập đổi từ khách (ndoics1_xxx)
  ndoics1: "/nhapdoimtcs1.html",
  ndoics2: "/nhapdoimtcs2.html",

  // Nhập kiểm kho
  nkcs1: "/nhapkiemcs1.html",
  nkcs2: "/nhapkiemcs2.html",

  // Nhập tạm
  ntcs1: "/nhaptamcs1.html",
  ntcs2: "/nhaptamcs2.html",

  // Nhập mới
  nmcs1: "/nhapmoimtcs1.html",
  nmcs2: "/nhapmoimtcs2.html",

  // Xuất hủy
  xhcs1: "/xuathuycs1.html",
  xhcs2: "/xuathuycs2.html",

  // Xuất kiểm
  xkcs1: "/xuatkiemcs1.html",
  xkcs2: "/xuatkiemcs2.html",

  // Chuyển chi nhánh 1 -> 2 & 2 -> 1
  xcncs1: "/ccn1v2cs1.html",
  xcncs2: "/ccn2v1cs2.html",
};

// Hàm nội bộ: lấy key loại hóa đơn chuẩn từ 1 dòng dữ liệu
function detectLoaihd(rowData) {
  if (!rowData) return null;

  // Ưu tiên cột loaihd nếu có
  let key = rowData.loaihd;
  if (typeof key === "string" && key.trim()) {
    key = key.trim().toLowerCase();
    if (LOAIHD_TO_PAGE[key]) return key;
  }

  // Nếu không có, cắt prefix trước dấu "_" của số hóa đơn
  if (rowData.sohd) {
    const prefix = String(rowData.sohd).split("_")[0].trim().toLowerCase();
    if (LOAIHD_TO_PAGE[prefix]) return prefix;
  }

  return null;
}

// Hàm PUBLIC: mở đúng trang chứng từ với số HĐ lấy từ 1 dòng báo cáo
export function openInvoiceFromRow(rowData) {
  if (!rowData || !rowData.sohd) {
    alert("Không tìm được số hóa đơn để mở.");
    return;
  }

  const sohd = String(rowData.sohd).trim();
  const diadiem = (rowData.diadiem || "").trim();
  const loaihdKey = detectLoaihd(rowData);

  // Xác định trang đích
  let targetPath = "/xemhoadon.html"; // fallback nếu chưa map loại này
  if (loaihdKey && LOAIHD_TO_PAGE[loaihdKey]) {
    targetPath = LOAIHD_TO_PAGE[loaihdKey];
  }

  const url = new URL(targetPath, window.location.origin);
  url.searchParams.set("sohd", sohd);
  if (loaihdKey) url.searchParams.set("loaihd", loaihdKey);
  if (diadiem) url.searchParams.set("diadiem", diadiem);

  // Lưu thêm vào localStorage để trang đích có thể đọc nếu muốn
  try {
    localStorage.setItem(
      "last_open_invoice",
      JSON.stringify({ sohd, loaihd: loaihdKey, diadiem })
    );
  } catch (e) {
    // bỏ qua lỗi localStorage (ví dụ private mode)
  }

  // Mở trang chứng từ – nếu muốn mở ngay trên tab hiện tại dùng "_self"
  window.open(url.toString(), "_blank");
}
