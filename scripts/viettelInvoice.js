import { supabase } from './supabaseClient.js';

// Tạo dữ liệu JSON chuẩn
function taoDuLieuHoaDon(hoadon, chitiet) {
  let tongTien = Number(hoadon.thanhtoan) || chitiet.reduce((sum, item) => sum + Number(item.thanhtien), 0);

  let isCs2 = hoadon.sohd.startsWith('bancs2T_'); // Cơ sở 2
  let isCs1 = hoadon.sohd.startsWith('bancs1T_'); // Cơ sở 1

  if (!isCs1 && !isCs2) {
    throw new Error("❌ Không xác định được cơ sở phát hành hóa đơn từ số hóa đơn: " + hoadon.sohd + ". Vui lòng kiểm tra lại!");
  }

  let sellerInfo = isCs2
    ? {
      sellerLegalName: "NGUYỄN ÁNH TUYẾT",
      sellerTaxCode: "4600960665",
      sellerAddressLine: "Số 561, Tổ 23, Phường Phan Đình Phùng, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "cskh.viettelhue@gmail.com",
      sellerBankAccount: "",
      sellerBankName: ""
    }
    : {
      sellerLegalName: "ĐẶNG LÊ HOÀN",
      sellerTaxCode: "4600370592",
      sellerAddressLine: "Số nhà 540, đường 3/2, tổ 8, Phường Tích Lương, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0916747401",
      sellerEmail: "huel31@viettel.com.vn",
      sellerBankAccount: "",
      sellerBankName: ""
    };

  return {
    generalInvoiceInfo: {
      sohd: hoadon.sohd, // <-- Quan trọng! Để backend xác định cơ sở!
      invoiceType: "02GTTT",
      templateCode: isCs2 ? "2/001" : "2/001",
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
      sohd: hoadon.sohd, // <-- Nhớ truyền ở đây giống như file xemhoadonT.html
      buyerName: "",
      buyerTaxCode: "",
      buyerAddressLine: "",
      buyerPhoneNumber: "",
      buyerEmail: "",
      buyerIdNo: "",
      buyerIdType: "",
      buyerBudgetCode: ""
    },
    sellerInfo: sellerInfo,
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



// Hàm gửi hóa đơn từ Web (giữ nguyên logic lỗi/thành công)
export async function guiHoaDonViettel(mahoadon, duLieuHoaDonCu = null) {
  try {
    let hoadon, chitiet, json;
    if (duLieuHoaDonCu) {
      // Nếu là lần gửi lại, dùng dữ liệu cũ
      json = duLieuHoaDonCu;
    } else {
      // Lấy từ DB (bình thường)
      const { data: hoadonData } = await supabase
        .from('hoadon_banleT')
        .select('*')
        .eq('sohd', mahoadon)
        .single();

      const { data: chitietData } = await supabase
        .from('ct_hoadon_banleT')
        .select('*')
        .eq('sohd', mahoadon);

      if (!hoadonData || !chitietData || chitietData.length === 0) {
        alert("❌ Không tìm thấy dữ liệu hóa đơn\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
        return;
      }
      hoadon = hoadonData;
      chitiet = chitietData;
      json = taoDuLieuHoaDon(hoadon, chitiet);
    }

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
      hienThiThongBaoLoiVoiGuiLai("❌ Lỗi khi đọc phản hồi từ server trung gian.", json, mahoadon);
      return;
    }

    if (!response.ok) {
      hienThiThongBaoLoiVoiGuiLai(result?.message || '❌ Gửi hóa đơn thất bại!', json, mahoadon);
      return;
    }

    // Cập nhật trạng thái thành công
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Đã gửi' })
      .eq('sohd', mahoadon);

    alert("✅ Gửi hóa đơn thành công!");

  } catch (error) {
    hienThiThongBaoLoiVoiGuiLai(`❌ Gửi hóa đơn điện tử thất bại: ${error.message}\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.`, duLieuHoaDonCu, mahoadon);

    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + error.message })
      .eq('sohd', mahoadon);
  }
}

function hienThiThongBaoLoiVoiGuiLai(message, duLieuHoaDonCu, mahoadon) {
  if (confirm(`${message}\n\nBạn muốn gửi lại hóa đơn này không?`)) {
    // Khi người dùng chọn OK thì gọi lại đúng hàm gửi, dùng lại dữ liệu cũ
    guiHoaDonViettel(mahoadon, duLieuHoaDonCu);
  }
}

