import { saveHoaDonService } from './hoadonService.js';

export async function saveBanLe111(source = 'unknown') {
  console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);
  return await saveHoaDonService();
}