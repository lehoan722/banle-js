// print.js – Xử lý hiển thị và in mã vạch

import { selected, syncHandsontableToSelected } from './grid.js';
import { generateQRBase64 } from './qr.js';

export let currentPage = 1;
export let totalPages = 1;
export let temsAll = [];

const PAGE_MARGIN_TOP_MM = 0;
const PAGE_MARGIN_LEFT_MM = 0;
const TEM_WIDTH_MM = 35;
const TEM_HEIGHT_MM = 19;

const previewArea = document.getElementById("previewArea");
const fromRowInput = document.getElementById("fromRow");
const fromColInput = document.getElementById("fromCol");

function formatGia(gia) {
  return typeof gia === "number" ? gia.toLocaleString("vi-VN") : gia;
}

export function renderPreview(page = 1) {
  syncHandsontableToSelected();

  const loaiTem = document.getElementById("loaiTem")?.value;
  if (!loaiTem) {
    showChonTemModal();
    return;
  }

  let infoChung = "";
  if (loaiTem === "giaydep") {
    infoChung = `không giặt,tẩy;Bảo quản nơi khô ráo;<br>Dán nhãn tại Việt Nam.Giày/dép;chất<br>liệu:da,nhựa,caosu tổng hợp;cỡ:38-43<br>Shop Hoàn Tuyết, Thái Nguyên;`;
  } else if (loaiTem === "quanao") {
    infoChung = `không tẩy;giặt tay,Bảo quản khô ráo;<br>Dán nhãn tại Việt Nam. Quần,Áo ;<br>chất liệu: Vải sợi tổng hợp;cỡ: S-XXL<br>Shop Hoàn Tuyết, Thái Nguyên;`;
  }

  temsAll = [];
  selected.forEach(row => {
    if (row.tick) {
      for (let i = 0; i < row.sltem; i++) {
        temsAll.push(row);
      }
    }
  });

  const fromRow = parseInt(fromRowInput.value) || 1;
  const fromCol = parseInt(fromColInput.value) || 1;
  const offset = (fromRow - 1) * 5 + (fromCol - 1);

  totalPages = Math.ceil((temsAll.length + offset) / 40) || 1;
  currentPage = Math.min(page, totalPages);

  let start = (currentPage - 1) * 40 - (currentPage === 1 ? 0 : offset);
  let pageTems = temsAll.slice(start, start + 40);
  let blank = currentPage === 1 ? offset : 0;

  let html = `<div class="print-preview" style="padding-top:${PAGE_MARGIN_TOP_MM}mm;padding-left:${PAGE_MARGIN_LEFT_MM}mm;">
    <div class="tem-grid" style="display:grid;grid-template-columns:repeat(5,${TEM_WIDTH_MM}mm);grid-template-rows:repeat(8,${TEM_HEIGHT_MM}mm);column-gap:5mm;row-gap:1.8mm;">`;

  for (let i = 0; i < blank; i++) html += `<div class="tem tem-blank"></div>`;

  for (let i = 0; i < 40 - blank; i++) {
    const t = pageTems[i];
    if (!t) html += `<div class="tem tem-blank"></div>`;
    else {
      html += `
<div class="tem" data-masp="${t.masp}" data-giale="${t.giale}" style="width:${TEM_WIDTH_MM}mm;height:${TEM_HEIGHT_MM}mm;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:0mm 0mm 0mm 1mm;">
  <div style="font-size:5.5pt;line-height:1;word-break:break-word;margin:0;padding:0;">${infoChung}</div>
  <div style="display:flex;flex-direction:row;align-items:flex-start;justify-content:flex-start;">
    <div style="display:flex;flex-direction:column;justify-content:flex-end;max-width:calc(100% - 32px);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
      <div style="font-size:11pt;font-weight:bold;line-height:1;">Giá: ${formatGia(t.giale)}</div>
      <div style="font-size:8pt;line-height:1;margin-top:2px;word-break:break-word;white-space:normal;">${t.masp}</div>
    </div>
    <div style="width:18px;height:18px;margin-left:4px;display:flex;align-items:flex-start;justify-content:flex-start;">
      <img src="${generateQRBase64(t.masp)}" style="width:100%;height:100%;" />
    </div>
  </div>
</div>`;
    }
  }

  html += `</div></div>`;
  previewArea.innerHTML = html;

  document.getElementById("pageInfo").textContent = `Trang ${currentPage} / ${totalPages}`;
}

function showChonTemModal() {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.right = "0";
  modal.style.bottom = "0";
  modal.style.background = "rgba(0,0,0,0.5)";
  modal.style.zIndex = "1000";
  modal.style.display = "flex";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";

  modal.innerHTML = `
<div style="background:#fff;padding:20px;border-radius:8px;min-width:300px;text-align:center;">
  <p>Bạn muốn in tem Quần áo hay Giày dép?</p>
  <button onclick="document.getElementById('loaiTem').value='quanao'; document.body.removeChild(this.closest('div').parentNode); renderPreview();">In Quần áo</button>
  <button onclick="document.getElementById('loaiTem').value='giaydep'; document.body.removeChild(this.closest('div').parentNode); renderPreview();">In Giày dép</button>
</div>`;

  document.body.appendChild(modal);
}

export function printAllPages() {
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    renderPreview(i);
    const html = previewArea.innerHTML;
    pages.push(`<div class="page">${html}</div>`);
  }

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`<!DOCTYPE html><html><head><title>In mã vạch</title>
<style>
@media print {
  .page { page-break-after: always; }
  body { margin: 0; }
}
.tem-grid { display: grid; grid-template-columns: repeat(5, ${TEM_WIDTH_MM}mm); grid-template-rows: repeat(8, ${TEM_HEIGHT_MM}mm); column-gap: 5mm; row-gap: 1.8mm; }
.tem { width: ${TEM_WIDTH_MM}mm; height: ${TEM_HEIGHT_MM}mm; box-sizing: border-box; overflow: hidden; }
</style></head><body>
${pages.join("\n")}
<script>window.onload = () => { window.print(); }</script>
</body></html>`);
  printWindow.document.close();
}
