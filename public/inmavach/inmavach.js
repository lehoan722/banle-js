// File: public/inmavach/inmavach.js

import { loadData } from './data.js';
import { initGrid, getSelectedRows, syncGridToSelected } from './grid.js';
import { renderPreview } from './preview.js';
import { printAllPages } from './print.js';
import { formatGia } from './utils.js';

window.selected = [];

window.onload = async function () {
    // Khởi tạo bảng dữ liệu
    initGrid();

    // Tải dữ liệu mẫu (hoặc từ API)
    const data = await loadData();
    window.selected = data;
    syncGridToSelected();

    // Gán sự kiện
    document.getElementById('btnRender').onclick = () => renderPreview();
    document.getElementById('btnPrintAll').onclick = () => printAllPages();

    // Phím tắt
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.getElementById('previewArea').innerHTML = '';
        }
    });
};

// Xuất Excel
window.exportExcel = function () {
    const headers = ["STT", "Mã hàng", "Tên hàng", "SL Tem in", "ĐVT", "SL", "Giá lẻ", "In", "Giá nhập"];
    const data = getSelectedRows().map((row, idx) => [
        idx + 1,
        row.masp,
        row.tensp,
        row.sltem,
        row.dvt || "",
        row.sl,
        formatGia(row.giale),
        row.tick ? true : false,
        formatGia(row.gianhap)
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TemMaVach");
    XLSX.writeFile(wb, "tem-ma-vach.xlsx");
};
