import { supabase } from './supabaseClient.js';

export async function guiHoaDonViettel(mahoadon) {
  try {
    // 1. Lấy dữ liệu hóa đơn và chi tiết từ Supabase
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

    // 2. Tạo dữ liệu JSON chuẩn hóa gửi lên Viettel
    const json = taoDuLieuHoaDon(hoadon, chitiet);
    console.log('🔥 Dữ liệu gửi trung gian:', json);

    // 3. Gửi dữ liệu lên API trung gian (Vercel)
    const response = await fetch('/api/guiHDDT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: json })
    });

    let result;
    let responseText = '';
    try {
      const clone = response.clone(); // 👈 Clone response để đọc dự phòng
      result = await response.json();
    } catch (err) {
      try {
        responseText = await response.text(); // dùng stream từ clone
      } catch (readErr) {
        responseText = 'Không đọc được phản hồi';
      }
      console.error("❌ Phản hồi không hợp lệ (không phải JSON):", responseText);
      throw new Error("Lỗi từ server trung gian: " + responseText);
    }


    console.log('📥 Phản hồi từ API trung gian:', result);

    if (!response.ok) {
      throw new Error(result?.message || 'Gửi thất bại');
    }

    // 4. Ghi trạng thái "Đã gửi" nếu thành công
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Đã gửi' })
      .eq('sohd', mahoadon);

    alert("✅ Gửi hóa đơn thành công!");

  } catch (error) {
    console.error('❌ Lỗi khi gửi HĐĐT:', error);
    alert(`❌ Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`);

    // Ghi trạng thái lỗi vào bảng hóa đơn
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + error.message })
      .eq('sohd', mahoadon);
  }
}

// Tạo dữ liệu đúng chuẩn Viettel từ hóa đơn và chi tiết
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
      totalAmountWithTaxInWords: "Bốn trăm nghìn đồng chẵn", // TODO: auto chuyển số thành chữ
      discountAmount: 0
    },
    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  };
}
