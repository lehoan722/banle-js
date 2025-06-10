
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
      alert("❌ Không tìm thấy dữ liệu hóa đơn\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
      return;
    }

    const json = taoDuLieuHoaDon(hoadon, chitiet);
    console.log('🔥 Dữ liệu gửi trung gian: ', json);

    const response = await fetch('/api/guiHDDT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: json })
    });

    console.log("📦 Response status:", response.status);
    console.log("📦 Response headers:", [...response.headers.entries()]);

    let result;
    try {
      const clone = response.clone();
      result = await clone.json();
    } catch (err) {
      try {
        const fallbackText = await response.text();
        console.error("❌ Phản hồi không hợp lệ (không phải JSON):", fallbackText);
        throw new Error("Lỗi từ server trung gian: " + fallbackText);
      } catch (readErr) {
        throw new Error("Lỗi từ server trung gian: Không đọc được phản hồi");
      }
    }

    console.log('📥 Phản hồi từ API trung gian:', result);

    if (!response.ok) {
      throw new Error(result?.message || 'Gửi thất bại');
    }

    alert("✅ Gửi hóa đơn thành công!");

  } catch (error) {
    console.error('❌ Lỗi khi gửi HĐĐT:', error);
    alert(`❌ Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`);
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
    payments: [{ paymentMethodName: "TM/CK" }],
    itemInfo: chitiet.map((ct, i) => ({
      lineNumber: i + 1,
      itemCode: ct.masp,
      itemName: ct.tensp,
      unitName: ct.size || "Chiếc",
      quantity: ct.soluong,
      unitPrice: ct.gia,
      itemTotalAmountWithoutTax: ct.thanhtien,
      taxPercentage: 0,
      taxAmount: 0,
      discount: 0,
      itemDiscount: ct.km || 0
    })),
    summarizeInfo: {
      totalAmountWithoutTax: hoadon.thanhtoan,
      totalTaxAmount: 0,
      totalAmountWithTax: hoadon.thanhtoan,
      totalAmountWithTaxInWords: "Bốn trăm nghìn đồng chẵn",
      discountAmount: hoadon.chietkhau || 0
    },
    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  };
}
