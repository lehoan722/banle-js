// scripts/banhangbaomat/inHoaDonBaoMat.js

export function inHoaDonBaoMat(result, payload) {
  if (
    !result?.ok ||
    !["SAVE_REAL_V1", "EDIT_REAL_V1"].includes(result?.mode)
  ) {
    return;
  }

  const sohd = result.sohd || payload.invoice?.sohd;
  if (!sohd) {
    alert("❌ Không có số hóa đơn để in.");
    return;
  }

  const url = `${location.origin}/in-hoadon-db.html?sohd=${encodeURIComponent(sohd)}`;

  if (typeof window.openPrintOverlay === "function") {
    window.openPrintOverlay(url, { autoPrint: false });
    return;
  }

  window.open(url, "_blank");
}
