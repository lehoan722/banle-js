// scripts/services/hoadonCcn.js
import { luuHoaDonccn1v2 } from '../luuhoadon.js';

export async function saveHoaDonCCN(ctx = {}) {
  console.log("🚚 saveHoaDonCCN chạy", {
    sohd: ctx?.sohd || "",
    isEdit: !!ctx?.isEdit,
    isCCN: !!ctx?.isCCN
  });

  return await luuHoaDonccn1v2();
}

// expose để HTML/F2/auto-save gọi qua entry mới
window.saveHoaDonCCN = saveHoaDonCCN;
