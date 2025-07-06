// mainNhap.js - điều phối chính cho giao diện nhập hàng
import { initHoadonNhap } from './hoadonNhap.js';
import { saveNhapHang } from './luuNhap.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initHoadonNhap();

  document.getElementById('btnLuuNhap').addEventListener('click', async () => {
    await saveNhapHang();
  });
});