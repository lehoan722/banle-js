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
      sellerEmail: "lehoan722@gmail.com",
      sellerBankAccount: "",
      sellerBankName: ""
    },
    cs2: {
      sellerLegalName: "NGUYỄN ÁNH TUYẾT",
      sellerTaxCode: "4600960665",
      sellerAddressLine: "Số 561, Tổ 23, Phường Phan Đình Phùng, Tỉnh Thái Nguyên, Việt Nam",
      sellerPhoneNumber: "0763424342",
      sellerEmail: "nguyenanhtuyet140175@gmail.com",
      sellerBankAccount: "",
      sellerBankName: ""
    }
  };

  // Chọn sellerInfo đúng theo cơ sở
  const sellerInfo = isCs2 ? sellers.cs2 : sellers.cs1;
  // Nếu có override từ dmkhachhang thì dùng, không thì fallback "Khách lẻ"
  const b = hoadon.__buyerOverride || null;

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
    // Nếu có override từ dmkhachhang thì dùng, không thì fallback "Khách lẻ"  
    buyerInfo: {
      sohd: hoadon.sohd,
      buyerName: b?.buyerName || hoadon.khachhang || "",
      buyerTaxCode: b?.buyerTaxCode || "",
      buyerAddressLine: b?.buyerAddressLine || "",
      buyerPhoneNumber: b?.buyerPhoneNumber || "",
      buyerEmail: b?.buyerEmail || "",
      buyerIdNo: "",
      buyerIdType: "",
      buyerBudgetCode: ""
    },
    sellerInfo: sellerInfo,
    payments: [
      { paymentMethodName: "", paymentAmount: tongTien }
    ],
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


// ===== Retry helpers & flags =====
const RETRY_LIMIT = 3;                        // số lần thử tối đa
const RETRY_BACKOFF_MS = [0, 800, 1600];      // độ trễ mỗi lần thử (ms)
const ENABLE_MANUAL_RETRY_POPUP = true;       // bật/tắt popup gửi lại thủ công

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Lấy thông tin KH từ dmkhachhang theo makh hoặc tên (fallback)
async function fetchBuyerFromDMKH(makhOrName) {
  try {
    const key = String(makhOrName || "").trim();
    if (!key || /^kh(á|a)ch\s*l(ẻ|e)$/i.test(key)) return null;

    // Ưu tiên coi #khachhang là MÃ KH
    let { data: kh, error } = await supabase
      .from('dmkhachhang')
      .select('makh, tenkh, diachi, dienthoai, email, mst')
      .eq('makh', key)
      .maybeSingle();

    // Nếu không có, thử khớp theo tên (nới lỏng)
    if ((!kh || error) && key.length >= 2) {
      const { data: list } = await supabase
        .from('dmkhachhang')
        .select('makh, tenkh, diachi, dienthoai, email, mst')
        .ilike('tenkh', key);
      kh = Array.isArray(list) && list.length === 1 ? list[0] : null;
    }

    if (!kh) return null;

    return {
      buyerName: kh.tenkh || 'Khách lẻ',
      buyerAddressLine: kh.diachi || '',
      buyerTaxCode: kh.mst || '',
      buyerPhoneNumber: kh.dienthoai || '',
      buyerEmail: kh.email || ''
    };
  } catch {
    return null;
  }
}


// Hàm gửi hóa đơn từ Web (có retry tối đa 3 lần, giữ popup gửi lại)
export async function guiHoaDonViettel(mahoadon, duLieuHoaDonCu = null) {
  let json; // payload gửi Viettel
  try {
    // 1) Chuẩn bị dữ liệu (dùng lại duLieuHoaDonCu nếu có)
    if (duLieuHoaDonCu) {
      json = duLieuHoaDonCu;
    } else {
      const { data: hoadonData, error: e1 } = await supabase
        .from('hoadon_banleT')
        .select('*')
        .eq('sohd', mahoadon)
        .single();

      let buyerOverride = null;
      if (hoadonData?.khachhang && !/^kh(á|a)ch\s*l(ẻ|e)$/i.test(hoadonData.khachhang)) {
        buyerOverride = await fetchBuyerFromDMKH(hoadonData.khachhang);
      }

      // Build JSON (truyền override nếu có)
      json = taoDuLieuHoaDon(
        { ...hoadonData, __buyerOverride: buyerOverride },
        chitietData
      );

      const { data: chitietData, error: e2 } = await supabase
        .from('ct_hoadon_banleT')
        .select('*')
        .eq('sohd', mahoadon);

      if (e1 || e2 || !hoadonData || !Array.isArray(chitietData) || chitietData.length === 0) {
        alert("❌ Không tìm thấy dữ liệu hóa đơn.\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.");
        return;
      }
      json = taoDuLieuHoaDon(hoadonData, chitietData);
    }

    // 2) Gửi với retry
    let lastErrorText = "";
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        if (attempt > 1) {
          await sleep(RETRY_BACKOFF_MS[attempt - 1] || 0);
        }

        // Gợi ý backend refresh token ở các lần thử > 1 (nếu backend hỗ trợ)
        const body = { data: json };
        if (attempt > 1) body.forceRefreshToken = true;

        const response = await fetch('/api/guiHDDT', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        // Đọc text trước, rồi thử parse JSON để lấy message lỗi nếu có
        const raw = await response.text();
        let result;
        try { result = JSON.parse(raw); } catch (_) { }

        if (response.ok) {
          await supabase
            .from('hoadon_banleT')
            .update({ trang_thai_gui: 'Đã gửi' })
            .eq('sohd', mahoadon);

          alert("✅ Gửi hóa đơn thành công!");
          return;
        }

        // Không ok -> lưu thông tin lỗi để hiển thị sau cùng và thử lại
        lastErrorText = (result?.message || raw || response.statusText || "Không rõ lỗi");
        // Tiếp tục vòng lặp để thử lại
      } catch (err) {
        lastErrorText = err?.message || String(err) || "Không rõ lỗi";
        // Tiếp tục vòng lặp để thử lại
      }
    }

    // 3) Nếu chạy tới đây nghĩa là cả 3 lần đều thất bại
    const errorMsg = lastErrorText || "Không rõ";
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + errorMsg })
      .eq('sohd', mahoadon);

    if (ENABLE_MANUAL_RETRY_POPUP && typeof hienThiThongBaoLoiVoiGuiLai === 'function') {
      // Gọi popup cho phép người dùng chủ động bấm "Gửi lại"
      // Truyền luôn JSON đã build sẵn để không phải build lại lần nữa
      hienThiThongBaoLoiVoiGuiLai(
        "❌ Không gửi được hóa đơn sau 3 lần thử.\nLý do gần nhất: " + errorMsg +
        "\nBạn có thể bấm 'Gửi lại' để thử thêm.",
        json,     // duLieuHoaDonCu
        mahoadon, // số hóa đơn
        errorMsg  // cho mục đích hiển thị/log nếu cần
      );
      return;
    }

    // Nếu không bật popup thì mới báo lỗi như cũ
    alert(
      "❌ Không gửi được hóa đơn sau 3 lần thử.\n" +
      "Lý do gần nhất: " + errorMsg + "\n" +
      "Bạn có thể vào 'xemhoadonT.html' để gửi lại."
    );

  } catch (outerError) {
    await supabase
      .from('hoadon_banleT')
      .update({ trang_thai_gui: 'Lỗi: ' + (outerError?.message || 'Không rõ') })
      .eq('sohd', mahoadon);

    // Giữ nguyên hành vi cũ: hiện popup gửi lại tay
    if (ENABLE_MANUAL_RETRY_POPUP && typeof hienThiThongBaoLoiVoiGuiLai === 'function') {
      hienThiThongBaoLoiVoiGuiLai(
        "❌ Gửi hóa đơn điện tử thất bại: " + (outerError?.message || 'Không rõ') +
        "\nBạn có thể vào 'xemhoadonT.html' để gửi lại sau.",
        duLieuHoaDonCu || json,
        mahoadon,
        outerError?.message || 'Không rõ'
      );
    } else {
      alert("❌ Gửi hóa đơn điện tử thất bại: " + (outerError?.message || 'Không rõ'));
    }
  }
}

// Giữ nguyên hàm popup gửi lại; có thể nhận thêm tham số nhưng không bắt buộc
function hienThiThongBaoLoiVoiGuiLai(message, duLieuHoaDonCu, mahoadon /*, errorText */) {
  if (confirm(`${message}\n\nBạn muốn gửi lại hóa đơn này không?`)) {
    // Khi người dùng chọn OK thì gọi lại đúng hàm gửi, dùng lại dữ liệu cũ
    guiHoaDonViettel(mahoadon, duLieuHoaDonCu);
  }
}
