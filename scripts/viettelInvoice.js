function taoDuLieuHoaDon(hoadon, chitiet) {
  let tongTien = Number(hoadon.thanhtoan) || chitiet.reduce((sum, item) => sum + Number(item.thanhtien), 0);

  // Nhận diện cơ sở từ số hóa đơn
  let isCs2 = hoadon.sohd.startsWith('bancs2T_'); // Cơ sở 2
  let isCs1 = hoadon.sohd.startsWith('bancs1T_'); // Cơ sở 1

  if (!isCs1 && !isCs2) {
    throw new Error("❌ Không xác định được cơ sở phát hành hóa đơn từ số hóa đơn: " + hoadon.sohd + ". Vui lòng kiểm tra lại!");
  }

  // Cập nhật thông tin từng chủ CƠ SỞ tại đây
  const sellers = {
    cs1: {
      sellerLegalName: "ĐẶNG LÊ HOÀN",
      sellerTaxCode: "4600370592",
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, Phường Tích Lương, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "huel31@viettel.com.vn",
      sellerBankAccount: "",
      sellerBankName: ""
    },
    cs2: {
      sellerLegalName: "NGUYỄN ÁNH TUYẾT",
      sellerTaxCode: "4600960665",
      sellerAddressLine: "Số 561, Tổ 23, Phường Phan Đình Phùng, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "cskh.viettelhue@gmail.com",
      sellerBankAccount: "",
      sellerBankName: ""
    }
  };

  // Chọn sellerInfo đúng theo cơ sở
  const sellerInfo = isCs2 ? sellers.cs2 : sellers.cs1;

  return {
    generalInvoiceInfo: {
      sohd: hoadon.sohd,
      invoiceType: "02GTTT",
      templateCode: isCs2 ? "2/001" : "2/001", // nếu 2 mẫu template khác nhau thì sửa ở đây
      invoiceSeries: isCs2 ? "C25MAT" : "C25MLH",
      invoiceIssuedDate: new Date().getTime(),
      currencyCode: "VND",
      adjustmentType: "1",
      paymentStatus: true,
      paymentType: "TM/CK",
      paymentTypeName: "TM/CK",
      cusGetInvoiceRight: true
    },
    buyerInfo: {
      sohd: hoadon.sohd,
      buyerName: hoadon.khachhang || "Khách lẻ",
      buyerTaxCode: "",
      buyerAddressLine: hoadon.diadiem || "",
      buyerPhoneNumber: "",
      buyerEmail: "",
      buyerIdNo: "",
      buyerIdType: "",
      buyerBudgetCode: ""
    },
    sellerInfo: sellerInfo, // ĐÃ ĐƯỢC TÁCH RIÊNG BIỆT
    payments: [
      { paymentMethodName: "TM/CK", paymentAmount: tongTien }
    ],
    itemInfo: chitiet.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.masp,
      itemName: item.tensp,
      unitName: item.dvt,
      quantity: Number(item.soluong),
      unitPrice: Number(item.gia) - Number(item.km || 0),
      itemTotalAmountWithoutTax: Number(item.thanhtien),
      taxPercentage: 0,
      taxAmount: 0,
      discount: 0,
      itemDiscount: Number(item.km) || 0
    })),
    summarizeInfo: {
      totalAmountWithoutTax: tongTien,
      totalTaxAmount: 0,
      totalAmountWithTax: tongTien,
      totalAmountWithTaxInWords: "Bốn trăm nghìn đồng chẵn",
      discountAmount: Number(hoadon.chietkhau) || 0
    },
    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  };
}
