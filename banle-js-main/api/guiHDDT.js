// guiHDDT.js - chạy trên /api/guiHDDT (Vercel, serverless, ...)

import fetch from 'node-fetch';

// 1. Mapping thông tin tài khoản các cơ sở (có thể thêm CS mới dễ dàng)
const viettelAccounts = {
  cs1: {
    username: '4600370592',
    password: '123456aA*',
    mst: '4600370592',
    invoiceSeries: 'C25MLH',
    templateCode: '2/001',
    endpoint: 'https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/4600370592'
  },
  cs2: {
    username: '4600960665',
    password: '123456aA*',
    mst: '4600960665',
    invoiceSeries: 'C25MAT',
    templateCode: '2/001',
    endpoint: 'https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/4600960665'
  }
  // ... thêm CS3 nếu cần
};

// 2. Nhận diện CS qua sohd
function getCoSoBySohd(sohd = '') {
  if (sohd.startsWith('bancs1T_')) return 'cs1';
  if (sohd.startsWith('bancs2T_')) return 'cs2';
  // ... thêm điều kiện nếu có prefix khác
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ message: 'Thiếu dữ liệu hóa đơn' });

    // 3. Xác định cơ sở qua sohd
    const sohd = data?.buyerInfo?.sohd || data?.sohd || data?.generalInvoiceInfo?.sohd || '';
    const coso = getCoSoBySohd(sohd);
    if (!coso || !viettelAccounts[coso]) {
      return res.status(400).json({ message: 'Không xác định được cơ sở hoặc cấu hình chưa có!' });
    }
    const acc = viettelAccounts[coso];

    // 4. Chuẩn hóa lại dữ liệu gửi lên (bảo đảm chuẩn như module NodeJS local!)
    // (Bổ sung nếu cần ép kiểu số/tính toán tổng tiền ...)
    // Ví dụ ép kiểu số tiền
    if (data.payments?.length) {
      data.payments = data.payments.map(p => ({
        ...p,
        paymentAmount: Number(p.paymentAmount) || 0
      }));
    }
    if (data.summarizeInfo) {
      data.summarizeInfo.totalAmountWithoutTax = Number(data.summarizeInfo.totalAmountWithoutTax) || 0;
      data.summarizeInfo.totalAmountWithTax = Number(data.summarizeInfo.totalAmountWithTax) || 0;
      data.summarizeInfo.totalTaxAmount = Number(data.summarizeInfo.totalTaxAmount) || 0;
      data.summarizeInfo.discountAmount = Number(data.summarizeInfo.discountAmount) || 0;
    }

    // 5. Gọi lấy token Viettel đúng user/pass
    const tokenRes = await fetch('https://api-vinvoice.viettel.vn/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: acc.username,
        password: acc.password
      })
    });
    const tokenData = await tokenRes.json();
    console.log(">>> Kết quả lấy token:", tokenData);    
    if (!tokenData?.access_token) {
      return res.status(401).json({ message: 'Không lấy được access_token', detail: tokenData });
    }
    const token = tokenData.access_token;

    // 6. Tạo payload chuẩn gửi lên endpoint động
    const payload = {
      ...data,
      generalInvoiceInfo: {
        ...data.generalInvoiceInfo,
        invoiceSeries: acc.invoiceSeries, // đảm bảo luôn đúng series
        templateCode: acc.templateCode
      },
      sellerInfo: {
        ...data.sellerInfo,
        sellerTaxCode: acc.mst
      }
    };

    // 7. Gửi hóa đơn lên Viettel (endpoint động)
    const hoaDonRes = await fetch(acc.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    let hoaDonData;
    try {
      hoaDonData = await hoaDonRes.json();
    } catch (e) {
      const fallback = await hoaDonRes.text();
      return res.status(502).json({ message: 'Phản hồi Viettel lỗi', raw: fallback });
    }

    if (hoaDonRes.status >= 400 || hoaDonData?.message === 'GENERAL') {
      return res.status(500).json({
        message: 'Gửi hóa đơn thất bại',
        detail: hoaDonData
      });
    }

    return res.status(200).json({
      message: 'Gửi hóa đơn thành công',
      detail: hoaDonData
    });

  } catch (error) {
    return res.status(500).json({
      message: 'Lỗi server khi gửi HĐĐT',
      error: error.message,
      stack: error.stack || 'no stack trace'
    });
  }
}
