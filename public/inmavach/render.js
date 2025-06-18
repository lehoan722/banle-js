// render.js – tạo HTML hiển thị từng trang tem in
import { TEM_PER_PAGE, TEM_PER_ROW, TEM_WIDTH_MM, TEM_HEIGHT_MM, PAGE_MARGIN_LEFT_MM, PAGE_MARGIN_TOP_MM, formatGia } from './utils.js';

export function renderTemGrid(tems, loaiTem, page = 1, fromRow = 1, fromCol = 1) {
    let infoChung = '';
    if (loaiTem === 'giaydep') {
        infoChung = `
        không giặt,tẩy;Bảo quản nơi khô ráo;<br>
        Dán nhãn tại Việt Nam.Giày/dép;chất
        liệu:da,nhựa,caosu tổng hợp;cỡ:38-43<br>
        Shop Hoàn Tuyết, Thái Nguyên;`;
    } else if (loaiTem === 'quanao') {
        infoChung = `
        không tẩy;giặt tay,Bảo quản khô ráo;<br>
        Dán nhãn tại Việt Nam. Quần,Áo ;<br>
        chất liệu: Vải sợi tổng hợp;cỡ: S-XXL<br>
        Shop Hoàn Tuyết, Thái Nguyên;`;
    }

    let blank = (page === 1) ? (fromRow - 1) * TEM_PER_ROW + (fromCol - 1) : 0;
    let maxTems = TEM_PER_PAGE - (page === 1 ? blank : 0);
    let startIdx = (page - 1) * TEM_PER_PAGE;
    let pageTems = tems.slice(startIdx, startIdx + maxTems);

    let html = `<div class="print-preview" style="
        padding-top: ${PAGE_MARGIN_TOP_MM}mm;
        padding-left: ${PAGE_MARGIN_LEFT_MM}mm;
    ">
    <div class="tem-grid">`;

    for (let i = 0; i < blank; i++) {
        html += `<div class="tem tem-blank"></div>`;
    }

    for (let i = 0; i < maxTems; i++) {
        const t = pageTems[i] || null;
        if (!t) html += `<div class="tem tem-blank"></div>`;
        else html += `
        <div class="tem" data-masp="${t.masp}" data-giale="${t.giale}">
            <div class="info-chung">${infoChung}</div>
            <div class="info-row">
                <div class="info-text">
                    <div class="gia">Giá: ${formatGia(t.giale)}</div>
                    <div class="masp">${t.masp}</div>
                </div>
                <div class="qr-wrap">
                    <canvas class="qr" width="18" height="18"></canvas>
                </div>
            </div>
        </div>`;
    }

    html += `</div></div>`;
    return html;
}
