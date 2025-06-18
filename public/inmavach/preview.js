// File: public/inmavach/preview.js
import { syncGridToSelected, getSelectedRows } from './grid.js';
import { generateQRBase64 } from './utils.js';

export function renderPreview(page = 1) {
    syncGridToSelected();
    const loaiTem = document.getElementById('loaiTem').value;
    if (!loaiTem) return alert("Vui lòng chọn loại tem!");

    const thongtin = loaiTem === 'giaydep'
        ? `không giặt,tẩy;Bảo quản nơi khô ráo;<br>Dán nhãn tại Việt Nam...`
        : `không tẩy;giặt tay...`;

    const allTems = [];
    getSelectedRows().forEach(row => {
        if (row.tick) {
            for (let i = 0; i < row.sltem; i++) allTems.push(row);
        }
    });

    const maxPerPage = 40;
    const startIdx = (page - 1) * maxPerPage;
    const endIdx = startIdx + maxPerPage;
    const rows = allTems.slice(startIdx, endIdx);

    let html = `<div class="print-preview"><div class="tem-grid">`;
    for (const row of rows) {
        html += `<div class="tem">
            <div style="font-size:6pt">${thongtin}</div>
            <div style="font-size:10pt;font-weight:bold">Giá: ${row.giale}</div>
            <div style="font-size:8pt">${row.masp}</div>
            <img src="${generateQRBase64(row.masp)}" width="20" height="20" />
        </div>`;
    }
    html += `</div></div>`;
    document.getElementById('previewArea').innerHTML = html;
}
