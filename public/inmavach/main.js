// ================== main.js ==================
import { initGrid } from './grid.js';
import { setupEvents } from './events.js';
import { fetchSanPhamData } from './data.js';

window.onload = async () => {
  await fetchSanPhamData();    // Lấy danh sách sản phẩm từ Supabase
  initGrid();                  // Khởi tạo bảng
  setupEvents();               // Khởi tạo nút, bàn phím
};
