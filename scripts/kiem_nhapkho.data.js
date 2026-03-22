import { state } from './kiem_nhapkho.core.js';

// demo supabase (bạn thay lại client thật)
export async function layHoaDonNguon() {
  console.log('load hóa đơn nguồn...');
}

// lưu phiếu
export async function luuPhieu() {
  console.log('đang lưu...');

  const data = [];

  state.nhapMap.forEach((sl, key) => {
    const [masp, size] = key.split('__');
    data.push({ masp, size, sl });
  });

  console.log('DATA SAVE:', data);

  alert('Đã lưu (demo)');
}