
// viettelInvoice.js - Gửi hóa đơn điện tử Viettel từ hệ thống bán lẻ

import { supabase } from './supabaseClient.js'; // ← Bổ sung dòng này

// viettelInvoice.js - Gửi hóa đơn điện tử Viettel từ hệ thống bán lẻ


// ⚠️ Bạn cần điền cấu hình kết nối API Viettel tại đây

const configViettel = {
  apiUrl: "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/createInvoice",
  username: "4600370592",
  password: "123456aA*",
  supplierTaxCode: "4600370592",
  templateCode: "2/001",
  invoiceSeries: "C25MLH"
};

// Hàm gọi sau khi lưu bảng T thành công
export async function guiHoaDonViettel(mahoadon) {
  try {
    const duLieu = await taoDuLieuHoaDon(mahoadon);

    // 👀 In dữ liệu gửi đi để kiểm tra
    console.log("🔥 Dữ liệu gửi Viettel:", JSON.stringify({
      username: configViettel.username,
      password: configViettel.password,
      taxCode: configViettel.supplierTaxCode,
      templateCode: configViettel.templateCode,
      invoiceSeries: configViettel.invoiceSeries,
      data: duLieu
    }, null, 2));

    const response = await fetch(configViettel.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: configViettel.username,
        password: configViettel.password,
        taxCode: configViettel.supplierTaxCode,
        templateCode: configViettel.templateCode,
        invoiceSeries: configViettel.invoiceSeries,
        data: duLieu
      })
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
    alert("Gửi hóa đơn điện tử thất bại: " + error.message + "\\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
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


// Lấy dữ liệu hóa đơn từ Supabase
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

  if (!hoadon || chitiet.length === 0) throw new Error("Không tìm thấy dữ liệu hóa đơn");

  return {
    buyerName: hoadon.tenkhach || "Khách lẻ",
    buyerTaxCode: hoadon.masothue || "",
    items: chitiet.map(sp => ({
      name: sp.tensp || sp.masp,
      quantity: sp.soluong,
      unitPrice: sp.gia,
      amount: sp.thanhtien
    })),
    totalAmount: hoadon.tongcong || 0
  };
}

// Ghi lại kết quả gửi hóa đơn vào bảng
async function capNhatTrangThaiHoaDon(mahoadon, obj) {
  await supabase
    .from("hoadon_banleT")
    .update(obj)
    .eq("sohd", mahoadon);
}
