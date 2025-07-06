// hoadonNhap.js - xử lý giao diện và dữ liệu hóa đơn nhập hàng

export async function initHoadonNhap() {
  // Thiết lập mặc định
  document.getElementById('tieudeTrang').innerText = 'NHẬP HÀNG TỪ NHÀ CUNG CẤP';
  document.getElementById('loaihd').value = 'NHAP';
  document.getElementById('tenkh').placeholder = 'Tên nhà cung cấp';
  document.getElementById('ghichu').placeholder = 'Ghi chú nhập hàng';

  // Gán prefix số chứng từ
  document.getElementById('sophieu').value = await taoSoChungTu('nhapcs1_');
}

async function taoSoChungTu(prefix) {
  // Gọi Supabase hoặc viết lại đoạn logic lấy số mới
  const now = Date.now();
  return prefix + now.toString().slice(-5); // Giả lập số chứng từ
}