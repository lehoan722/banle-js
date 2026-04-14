// scripts/services/hoadonService.js

import { buildContext } from './hoadonContext.js';
import { saveHoaDonBanLe } from './hoadonSale.js';
import { saveHoaDonNhap } from './hoadonNhap.js';
import { saveHoaDonSpecial } from './hoadonSpecial.js';
import { saveHoaDonCCN } from './hoadonCcn.js';

export async function saveHoaDonService() {
  const ctx = await buildContext();

  if (!ctx || !ctx.bangKetQua || Object.keys(ctx.bangKetQua).length === 0) {
    throw new Error("❌ Không có dữ liệu để lưu.");
  }

  // ===== PHÂN LUỒNG NGHIỆP VỤ =====
  if (ctx.isCCN) {
    return await saveHoaDonCCN(ctx);
  }

  if (ctx.isNhap) {
    return await saveHoaDonNhap(ctx);
  }

  if (ctx.save2Ban) {
    return await saveHoaDonSpecial(ctx);
  }

  return await saveHoaDonBanLe(ctx);
}
