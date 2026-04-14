// scripts/services/hoadonNhap.js

import { saveHoaDonBanLe } from './hoadonSale.js';

export async function saveHoaDonNhap(ctx) {
  // hiện tại giữ nguyên logic giống bán lẻ
  return await saveHoaDonBanLe(ctx);
}