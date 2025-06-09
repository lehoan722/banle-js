// viettelInvoice_FULL.js - Tạo JSON đầy đủ gửi Viettel

import { supabase } from './supabaseClient.js';

export async function guiHoaDonViettel(mahoadon) {
  try {
    const { data: hoadon, error: errHD } = await supabase
      .from('hoadon_banleT')
      .select('*')
      .eq('sohd', mahoadon)
      .single();

    const { data: chitiet, error: errCT } = await supabase
      .from('ct_hoadon_banleT')
      .select('*')
      .eq('sohd', mahoadon);

    if (errHD || errCT || !hoadon || !chitiet || chitiet.length === 0) {
      alert("\u274C Không tìm thấy dữ liệu hóa đơn\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
      return;
    }

    const json = taoDuLieuHoaDon(hoadon, chitiet);
    console.log('🔥 Dữ liệu gửi Viettel:', json);

    const response = await fetch("https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/createInvoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "4600370592",
        password: "123456aA*",
        taxCode: "4600370592",
        templateCode: "2/001",
        invoiceSeries: "C25MLH",
        data: json
      })
    });

    const result = await response.json();
    console.log('📥 Phản hồi từ Viettel: ', result);

    if (result.message === 'GENERAL' || response.status >= 400) throw new Error(result.message);

    // Ghi trạng thái thành công
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Đã gửi' })
      .eq('sohd', mahoadon);

  } catch (error) {
    console.error('❌ Lỗi khi gửi HĐĐT:', error);
    alert(`\u274C Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`);

    // Ghi trạng thái thất bại
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + error.message })
      .eq('sohd', mahoadon);
  }
}

function taoDuLieuHoaDon(hoadon, chitiet) {
  return {
    generalInvoiceInfo: {
      invoiceType: "01GTKT",
      templateCode: "2/001",
      invoiceSeries: "C25MLH",
      invoiceIssuedDate: new Date().getTime(),
      currencyCode: "VND",
      adjustmentType: "1",
      paymentStatus: true,
      paymentType: "TM/CK",
      paymentTypeName: "TM/CK",
      cusGetInvoiceRight: true
    },
    buyerInfo: {
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
      sellerTaxCode: "4600370592",
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, TP Thái Nguyên",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "cskt.viettelhue@gmail.com",
      sellerBankAccount: "123456789"
    },
    payments: [
      { paymentMethodName: "TM/CK" }
    ],
    itemInfo: chitiet.map((item, index) => ({
      lineNumber: index + 1,
      itemCode: item.masp,
      itemName: item.tensp,
      unitName: item.size || "Chiếc",
      quantity: item.soluong,
      unitPrice: item.gia,
      itemTotalAmountWithoutTax: item.thanhtien,
      taxPercentage: 0,
      taxAmount: 0,
      discount: 0,
      itemDiscount: item.km || 0
    })),
    summarizeInfo: {
      totalAmountWithoutTax: hoadon.thanhtoan,
      totalTaxAmount: 0,
      totalAmountWithTax: hoadon.thanhtoan,
      totalAmountWithTaxInWords: "Bốn trăm nghìn đồng chẵn",
      discountAmount: 0
    },
    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  }
}
