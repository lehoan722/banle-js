// VI DU GAN LICH AM VAO MOT O NGAY CUA TRANG BAO CAO

import { moLichAmPicker } from './scripts/lichAmPicker.js';

document.getElementById('btnLichAm').addEventListener('click', async () => {
  const input = document.getElementById('tuNgay');
  const kq = await moLichAmPicker({
    ngayMacDinh: input.value || null,
    maDiaDiem: 'THAI_NGUYEN',
    tieuDe: 'Chọn ngày báo cáo'
  });

  if (!kq) return;

  // Vẫn trả ngày DƯƠNG chuẩn YYYY-MM-DD cho truy vấn cũ.
  // Người dùng chỉ dùng lịch âm để chọn ngày.
  input.value = kq.ngay_duong;

  console.log('Ngày âm đã chọn:', {
    ngay_am: kq.ngay_am,
    thang_am: kq.thang_am,
    nam_am: kq.nam_am,
    thang_am_nhuan: kq.thang_am_nhuan
  });
});
