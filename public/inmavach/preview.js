// preview.js
import { getSelectedRows } from "./grid.js";

let currentPage = 1;
let totalPages = 1;
let allTems = [];

export function renderPreview(page = 1) {
    const loaiTem = document.getElementById("loaiTem").value || "";
    if (!loaiTem) {
        alert("Vui lòng chọn loại tem cần in!");
        return;
    }

    let infoChung = loaiTem === "giaydep" ?
        `không giặt,tẩy;Bảo quản nơi khô ráo;<br>
        Dán nhãn tại Việt Nam.Giày/dép;chất liệu:da,nhựa,caosu tổng hợp;cỡ:38-43<br>
        Shop Hoàn Tuyết, Thái Nguyên;`
        : `không tẩy;giặt tay,Bảo quản khô ráo;<br>
        Dán nhãn tại Việt Nam. Quần,Áo ;<br>
        chất liệu: Vải sợi tổng hợp;cỡ: S-XXL<br>
        Shop Hoàn Tuyết, Thái Nguyên;`;

    const fromRow = parseInt(document.getElementById("fromRow").value) || 1;
    const fromCol = parseInt(document.getElementById("fromCol").value) || 1;
    const blank = (page === 1) ? (fromRow - 1) * 5 + (fromCol - 1) : 0;

    const selected = getSelectedRows();
    allTems = [];
    selected.forEach(row => {
        for (let i = 0; i < row.sltem; i++) {
            allTems.push(row);
        }
    });

    totalPages = Math.ceil((allTems.length + blank) / 40);
    currentPage = Math.min(page, totalPages);

    const start = (currentPage - 1) * 40 - (currentPage === 1 ? 0 : blank);
    const pageTems = allTems.slice(start, start + 40 - (currentPage === 1 ? blank : 0));

    let html = `<div class="print-preview" style="padding-top: 5mm; padding-left: 5mm;">
    <div class="tem-grid" style="
        display: grid;
        grid-template-columns: repeat(5, 35mm);
        grid-template-rows: repeat(8, 19mm);
        column-gap: 5mm; row-gap: 1.9mm;">
    `;
    for (let i = 0; i < (currentPage === 1 ? blank : 0); i++) {
        html += `<div class="tem tem-blank"></div>`;
    }

    for (let i = 0; i < 40 - (currentPage === 1 ? blank : 0); i++) {
        const t = pageTems[i];
        if (!t) {
            html += `<div class="tem tem-blank"></div>`;
        } else {
            html += `
            <div class="tem" data-masp="${t.masp}" data-giale="${t.giale}" style="
                width:35mm;height:19mm;overflow:hidden;border:0px solid #888;
                display:flex;flex-direction:column;justify-content:center;padding:0 0 0 1mm;">
                <div style="font-size:5.5pt;line-height:1;">${infoChung}</div>
                <div style="display:flex;align-items:flex-start;">
                    <div style="font-size:11pt;font-weight:bold;max-width:calc(100%-32px);overflow:hidden;text-overflow:ellipsis;">
                        Gía: ${formatGia(t.giale)}</div>
                    <div style="font-size:8pt;margin-top:2px;word-break:break-word;">${t.masp}</div>
                    <div style="width:18px;height:18px;margin-left:4px;">
                        <canvas class="qr" width="18" height="18"></canvas>
                    </div>
                </div>
            </div>
            `;
        }
    }

    html += `</div></div>`;
    document.getElementById("previewArea").innerHTML = html;

    document.querySelectorAll(".tem .qr").forEach((el) => {
        const masp = el.closest(".tem").getAttribute("data-masp") || "";
        new QRious({ element: el, value: masp, size: 25 });
    });

    document.getElementById("pageInfo").textContent = `Trang ${currentPage} / ${totalPages}`;
}

export function nextPage() {
    if (currentPage < totalPages) renderPreview(currentPage + 1);
}

export function prevPage() {
    if (currentPage > 1) renderPreview(currentPage - 1);
}
