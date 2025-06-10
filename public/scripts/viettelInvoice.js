import { supabase } from './supabaseClient.js';

// Hàm chính để gửi hóa đơn lên Viettel
export async function guiHoaDonViettel(mahoadon) {
  try {
    // 1. Lấy dữ liệu hóa đơn và chi tiết
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

    // 2. Lấy token truy cập
    const token = await layAccessToken();

    // 3. Tạo dữ liệu JSON hóa đơn
    const json = taoDuLieuHoaDon(hoadon, chitiet);
    console.log('🔥 Dữ liệu gửi Viettel:', json);

    // 4. Gửi hóa đơn lên Viettel
    const response = await fetch("https://api-vinvoice.viettel.vn/services/einvoiceapplication/v2/createInvoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        invoiceApplication: {
          templateCode: "2/001",
          invoiceSeries: "C25MLH",
          data: json
        }
      })
    });

    const result = await response.json();
    console.log('📥 Phản hồi từ Viettel: ', result);

    if (response.status >= 400 || result.message === 'GENERAL') {
      throw new Error(result?.description || result?.message || 'Gửi hóa đơn thất bại');
    }

    // 5. Ghi trạng thái thành công vào Supabase
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Đã gửi' })
      .eq('sohd', mahoadon);

    alert("✅ Gửi hóa đơn thành công!");

  } catch (error) {
    console.error('❌ Lỗi khi gửi HĐĐT:', error);
    alert(`❌ Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`);

    // Ghi trạng thái thất bại
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + error.message })
      .eq('sohd', mahoadon);
  }
}

// Hàm lấy access token từ Viettel
async function layAccessToken() {
  const response = await fetch("https://api-vinvoice.viettel.vn/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "4600370592",
      password: "123456aA*"
    })
  });

  const result = await response.json();
  if (!result?.access_token) throw new Error("Không lấy được access_token từ Viettel");
  return result.access_token;
}

// Hàm tạo dữ liệu JSON đúng chuẩn Viettel
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
      totalAmountWithTaxInWords: "Bốn trăm nghìn đồng chẵn", // Cần cải tiến: viết số ra chữ tự động
      discountAmount: 0
    },
    taxBreakdowns: [],
    metadata: [],
    customFields: [],
    deliveryInfo: {},
    meterReading: []
  }
}
