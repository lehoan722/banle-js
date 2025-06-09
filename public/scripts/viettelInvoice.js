// viettelInvoice.js - Gửi hóa đơn điện tử Viettel từ hệ thống bán lẻ

import { supabase } from './supabaseClient.js';

const configViettel = {
  apiUrl: "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/createInvoice",
  username: "4600370592",
  password: "123456aA*",
  supplierTaxCode: "4600370592",
  templateCode: "1/002",
  invoiceSeries: "C25MHT"
};

// Hàm gửi hóa đơn điện tử Viettel
export async function guiHoaDonViettel(mahoadon) {
  try {
    const data = await taoDuLieuHoaDon(mahoadon);

    console.log("🔥 JSON gửi Viettel:", JSON.stringify(data, null, 2));

    const response = await fetch(configViettel.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    console.log("📥 Phản hồi từ Viettel:", result);

    if (result.success) {
      await capNhatTrangThaiHoaDon(mahoadon, {
        so_hoadon: result.invoiceNo,
        ma_tra_cuu: result.lookupCode,
        file_pdf: result.pdfUrl,
        trang_thai_gui: "DA_GUI"
      });
    } else {
      throw new Error(result.message || "GENERAL");
    }
  } catch (error) {
    alert("Gửi hóa đơn điện tử thất bại: " + error.message + "\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
    console.error("❌ Lỗi khi gửi HĐĐT:", error);

    const { error: updateError } = await supabase
      .from("hoadon_banleT")
      .update({ trang_thai_gui: "CHUA_GUI" })
      .eq("sohd", mahoadon);

    if (updateError) {
      console.error("❌ Lỗi ghi trạng thái Supabase:", updateError);
    }
  }
}

// Hàm tạo JSON đúng định dạng Viettel
async function taoDuLieuHoaDon(mahoadon) {
  const { data: hoadon } = await supabase
    .from("hoadon_banleT")
    .select("*")
    .eq("sohd", mahoadon)
    .single();

  const { data: chitiet } = await supabase
    .from("ct_hoadon_banleT")
    .select("*")
    .eq("sohd", mahoadon);

  if (!hoadon || chitiet.length === 0) {
    throw new Error("Không tìm thấy dữ liệu hóa đơn");
  }

  const ngayLap = hoadon.ngay || new Date().toISOString().slice(0, 10);

  return {
    username: configViettel.username,
    password: configViettel.password,
    supplierTaxCode: configViettel.supplierTaxCode,
    invoiceCode: "", // để rỗng cho hệ thống tự sinh
    templateCode: configViettel.templateCode,
    invoiceSeries: configViettel.invoiceSeries,

    generalInvoiceInfo: {
      invoiceType: "01GTKT", // Hoá đơn GTGT
      invoiceName: "HÓA ĐƠN BÁN HÀNG",
      currencyCode: "VND",
      adjustmentType: "0", // không điều chỉnh
      paymentStatus: "1",
      cusGetInvoiceRight: false,
      invoiceIssuedDate: ngayLap,
    },

    buyerInfo: {
      buyerName: hoadon.khachhang || "Khách lẻ",
      buyerTaxCode: "",
      buyerAddress: hoadon.diadiem || "",
      buyerPhoneNumber: "",
      buyerEmail: ""
    },

    itemInfo: chitiet.map(sp => ({
      itemCode: sp.masp,
      itemName: sp.tensp,
      unitName: "Chiếc",
      unitPrice: sp.gia,
      quantity: sp.soluong,
      itemTotalAmountWithoutTax: sp.thanhtien,
      taxPercentage: 0,
      taxAmount: 0,
      itemDiscount: sp.km || 0
    })),

    summarizeInfo: {
      sumOfTotalLineAmountWithoutTax: hoadon.thanhtoan || 0,
      totalAmountWithoutTax: hoadon.thanhtoan || 0,
      totalTaxAmount: 0,
      totalAmountWithTax: hoadon.thanhtoan || 0,
      discountAmount: hoadon.chietkhau || 0,
      settlementDiscountAmount: 0,
      amountPaid: hoadon.thanhtoan || 0,
      amountRemaining: 0,
      totalAmount: hoadon.thanhtoan || 0,
      totalAmountInWords: "Bốn trăm nghìn đồng"
    },

    sellerInfo: {
      sellerLegalName: "ĐẶNG LÊ HOÀN",
      sellerTaxCode: configViettel.supplierTaxCode,
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, TP Thái Nguyên",
      sellerPhoneNumber: "0916747401",
      sellerBankAccount: "123456789",
      sellerEmail: "cskt.viettelhue@gmail.com"
    }
  };
}

// Cập nhật trạng thái gửi hóa đơn
async function capNhatTrangThaiHoaDon(mahoadon, obj) {
  await supabase
    .from("hoadon_banleT")
    .update(obj)
    .eq("sohd", mahoadon);
}
