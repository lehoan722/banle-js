// luuNhap.js - xử lý lưu dữ liệu phiếu nhập vào Supabase

import { supabase } from '../scripts/supabaseClient.js';

export async function saveNhapHang() {
  const sohd = document.getElementById('sophieu').value;
  const nhacc = document.getElementById('tenkh').value;
  const loaihd = 'NHAP';

  const hoadon = {
    sohd,
    nhacc,
    loaihd,
    trangthai: 'LƯU',
    created_at: new Date().toISOString(),
  };

  let { error } = await supabase.from('hoadon_banle').insert([hoadon]);
  if (error) {
    alert('Lỗi lưu phiếu nhập: ' + error.message);
  } else {
    alert('Đã lưu phiếu nhập: ' + sohd);
  }
}