// scripts/services/hoadonCcn.js

import { luuHoaDonccn1v2 } from '../luuhoadon.js';

export async function saveHoaDonCCN(ctx) {
  return await luuHoaDonccn1v2();
}