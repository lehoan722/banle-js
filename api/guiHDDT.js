export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ message: 'Thiếu dữ liệu hóa đơn' });
    }

    // 1. Lấy token từ Viettel
    const tokenRes = await fetch('https://api-vinvoice.viettel.vn/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '4600370592',
        password: '123456aA*'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) {
      return res.status(401).json({ message: 'Không lấy được access_token', detail: tokenData });
    }

    const token = tokenData.access_token;

    // 2. Gửi hóa đơn lên Viettel
    const createRes = await fetch('https://api-vinvoice.viettel.vn/services/einvoiceapplication/v2/createInvoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        invoiceApplication: {
          templateCode: "2/001",
          invoiceSeries: "C25MLH",
          data: data
        }
      })
    });

    const result = await createRes.json();

    if (createRes.status >= 400 || result?.message === 'GENERAL') {
      return res.status(500).json({ message: 'Gửi hóa đơn thất bại', detail: result });
    }

    return res.status(200).json({ message: 'Gửi hóa đơn thành công', detail: result });

  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server khi gửi HĐĐT', error: error.message });
  }
}
