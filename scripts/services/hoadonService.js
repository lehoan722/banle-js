// scripts/services/hoadonService.js

import { buildContext } from './hoadonContext.js';
import { saveHoaDonBanLe } from './hoadonSale.js';
import { saveHoaDonNhap } from './hoadonNhap.js';
import { saveHoaDonSpecial } from './hoadonSpecial.js';
import { saveHoaDonCCN } from './hoadonCcn.js';

console.log("✅ hoadonService.js đã được gọi");
console.log("✅ saveHoaDonService() chạy");

export async function saveHoaDonService() {
  const ctx = await buildContext();

  if (!ctx || !ctx.bangKetQua || Object.keys(ctx.bangKetQua).length === 0) {
    throw new Error("❌ Không có dữ liệu để lưu.");
  }

  // ✅ Chặn cứng: nếu đang sửa hóa đơn thì tuyệt đối không được lưu 2 bản
  if (ctx.isEdit) {
    ctx.save2Ban = false;
  }

  console.log("🧭 CTX trong hoadonService:", {
    sohd: ctx.sohd,
    isEdit: ctx.isEdit,
    isCCN: ctx.isCCN,
    isNhap: ctx.isNhap,
    isSpecialByTMT: ctx.isSpecialByTMT,
    isSpecialByMod3: ctx.isSpecialByMod3,
    save2Ban: ctx.save2Ban
  });

  // ===== PHÂN LUỒNG NGHIỆP VỤ =====
  if (ctx.isCCN) {
    return await saveHoaDonCCN(ctx);
  }

  if (ctx.isNhap) {
    return await saveHoaDonNhap(ctx);
  }

  // ✅ Chỉ hóa đơn MỚI đặc biệt mới được vào lưu 2 bản
  if (!ctx.isEdit && ctx.save2Ban) {
    return await saveHoaDonSpecial(ctx);
  }

  // ✅ Còn lại, kể cả hóa đơn đặc biệt nhưng đang ở chế độ sửa, đều lưu như bán lẻ thường
  return await saveHoaDonBanLe(ctx);
}
