import { supabase } from './supabaseClient.js';

// Tạo dữ liệu JSON chuẩn
function taoDuLieuHoaDon(hoadon, chitiet) {
  let tongTien = Number(hoadon.thanhtoan) || chitiet.reduce((sum, item) => sum + Number(item.thanhtien), 0);
  return {
    generalInvoiceInfo: {
      sohd: hoadon.sohd, // truyền sohd để backend nhận diện cơ sở
      invoiceType: "02GTTT",
      templateCode: "2/001",
      invoiceSeries: hoadon.sohd.startsWith('bancs2T_') ? "C25MAT" : "C25MLH",
      invoiceIssuedDate: new Date().getTime(),
      currencyCode: "VND",
      adjustmentType: "1",
      paymentStatus: true,
      paymentType: "TM/CK",
      paymentTypeName: "TM/CK",
      cusGetInvoiceRight: true
    },
    buyerInfo: {
      sohd: hoadon.sohd, // truyền cả ở đây (hoặc chỉ 1 nơi)
      buyerName: hoadon.khachhang || "Khách lẻ",
      buyerTaxCode: "",
      buyerAddressLine: hoadon.diadiem || "",
      buyerPhoneNumber: "",
      buyerEmail: "",
      buyerIdNo: "",
      buyerIdType: "",
      buyerBudgetCode: ""
    },
    sellerInfo: {
      sellerLegalName: "ĐẶNG LÊ HOÀN",
      sellerTaxCode: hoadon.sohd.startsWith('bancs2T_') ? "4600960665" : "4600370592",
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, Phường Tích Lương, TP Thái Nguyên, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "cskt.viettelhue@gmail.com",
      sellerBankAccount: "123456789"
    },
    payments: [
      { paymentMethodName: "TM/CK", paymentAmount: tongTien }
    ],
    itemInfo: chitiet.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.masp,
      itemName: item.tensp,
      unitName: item.size || "Chiếc",
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

// Hàm gửi hóa đơn từ Web (giữ nguyên logic lỗi/thành công)
export async function guiHoaDonViettel(mahoadon) {
  try {
    const { data: hoadon } = await supabase
      .from('hoadon_banleT')
      .select('*')
      .eq('sohd', mahoadon)
      .single();

    const { data: chitiet } = await supabase
      .from('ct_hoadon_banleT')
      .select('*')
      .eq('sohd', mahoadon);

    if (!hoadon || !chitiet || chitiet.length === 0) {
      alert("❌ Không tìm thấy dữ liệu hóa đơn\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
      return;
    }

    // Chuẩn hóa JSON đầu ra
    const json = taoDuLieuHoaDon(hoadon, chitiet);

    // Gửi lên API backend
    const response = await fetch('/api/guiHDDT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: json })
    });

    let result;
    try {
      result = await response.json();
    } catch (err) {
      alert("❌ Lỗi khi đọc phản hồi từ server trung gian.");
      return;
    }

    if (!response.ok) {
      alert(result?.message || 'Gửi hóa đơn thất bại');
      return;
    }

    // Cập nhật trạng thái
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Đã gửi' })
      .eq('sohd', mahoadon);

    alert("✅ Gửi hóa đơn thành công!");

  } catch (error) {
    alert(`❌ Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`);
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + error.message })
      .eq('sohd', mahoadon);
  }
}
