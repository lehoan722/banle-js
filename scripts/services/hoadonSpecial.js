// scripts/services/hoadonSpecial.js

import { saveHoaDonBanLe } from './hoadonSale.js';
import { taoDuLieuHoaDon } from '../viettelInvoice.js';

export async function saveHoaDonSpecial(ctx) {
  const result = await saveHoaDonBanLe(ctx);

  try {
    const invoiceData = taoDuLieuHoaDon(result.hoadon, result.chitiet);
    console.log("📤 Viettel payload:", invoiceData);
  } catch (e) {
    console.error("Lỗi Viettel:", e);
  }

  return result;
}