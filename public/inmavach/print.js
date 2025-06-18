import {
  syncHandsontableToSelected,
  getSelectedRows,
  formatGia,
  globalTemsAll,
  globalBlank,
  currentPage,
  totalPages
} from './main.js';

// Các biến cấu hình in tem
const PAGE_MARGIN_TOP_MM = 3.5;
const PAGE_MARGIN_LEFT_MM = 5;
const TEM_WIDTH_MM = 37;
const TEM_HEIGHT_MM = 19;

// State toàn cục
let _globalTemsAll = [];
let _globalBlank = 0;
let _currentPage = 1;
let _totalPages = 1;

const fromRowInput = document.getElementById('fromRow');
const fromColInput = document.getElementById('fromCol');
const previewArea = document.getElementById('previewArea');

window.renderPreview = function (page = 1, silent = false) {
  syncHandsontableToSelected();
  const selected = getSelectedRows();
  const loaiTem = document.getElementById('loaiTem')?.value || "";

  if (!loaiTem) {
    showCustomPopup(`
      <div style="font-size:15px; margin-bottom:12px">Bạn muốn in tem loại nào?</div>
      <button onclick="chonLoaiTem('quanao')" style="margin-right:10px">In tem Quần áo</button>
      <button onclick="chonLoaiTem('giaydep')">In tem Giày dép</button>
    `);
    return;
  }

  let infoChung = "";
  if (loaiTem === "giaydep") {
    infoChung = `không giặt,tẩy;Bảo quản nơi khô ráo;<br>
    Dán nhãn tại Việt Nam.Giày/dép;chất liệu:da,nhựa,caosu tổng hợp;cỡ:38-43<br>
    Shop Hoàn Tuyết, Thái Nguyên;`;
  } else if (loaiTem === "quanao") {
    infoChung = `không tẩy;giặt tay,Bảo quản khô ráo;<br>
    Dán nhãn tại Việt Nam. Quần,Áo ;<br>
    chất liệu: Vải sợi tổng hợp;cỡ: S-XXL<br>
    Shop Hoàn Tuyết, Thái Nguyên;`;
  }

  if (!silent) {
    _globalTemsAll = [];
    selected.forEach(row => {
      if (row.tick) {
        for (let i = 0; i < row.sltem; i++) {
          _globalTemsAll.push(row);
        }
      }
    });
  }

  const fromRow = parseInt(fromRowInput.value) || 1;
  const fromCol = parseInt(fromColInput.value) || 1;
  _globalBlank = (fromRow - 1) * 5 + (fromCol - 1);

  const totalTems = _globalTemsAll.length;
  const firstPageTems = 40 - _globalBlank;
  _totalPages = (totalTems <= firstPageTems) ? 1 : 1 + Math.ceil((totalTems - firstPageTems) / 40);
  _currentPage = Math.min(page, _totalPages);

  const temList = _globalTemsAll;
  let startIdx = (_currentPage === 1) ? 0 : (40 - _globalBlank) + (_currentPage - 2) * 40;
  let endIdx = startIdx + ((_currentPage === 1) ? (40 - _globalBlank) : 40);
  let pageTems = temList.slice(startIdx, endIdx);

  let html = `<div class="print-preview" style="padding-top:${PAGE_MARGIN_TOP_MM}mm; padding-left:${PAGE_MARGIN_LEFT_MM}mm;">
    <div class="tem-grid" style="display: grid; grid-template-columns: 35mm 35mm 35mm 35mm 35mm; grid-template-rows: repeat(8, 19mm); column-gap: 5mm; row-gap: 1.9mm;">`;

  const maxTems = (_currentPage === 1) ? (40 - _globalBlank) : 40;
  for (let i = 0; i < (_currentPage === 1 ? _globalBlank : 0); i++) {
    html += `<div class="tem tem-blank"></div>`;
  }

  for (let i = 0; i < maxTems; i++) {
    const t = pageTems[i] || null;
    if (!t) {
      html += `<div class="tem tem-blank"></div>`;
    } else {
      html += `
<div class="tem" data-masp="${t.masp}" data-giale="${t.giale}" style="width:${TEM_WIDTH_MM}mm;height:${TEM_HEIGHT_MM}mm;box-sizing:border-box;overflow:hidden;border:0px solid #888;display:flex;flex-direction:column;justify-content:center;padding:0mm 0mm 0mm 1mm;">
  <div style="font-size:5.5pt;line-height:1;word-break:break-word;margin:0;padding:0;">${infoChung}</div>
  <div style="display:flex;flex-direction:row;align-items:flex-start;justify-content:flex-start;">
    <div style="display:flex;flex-direction:column;justify-content:flex-end;max-width:calc(100% - 32px);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
      <div style="font-size:11pt;font-weight:bold;line-height:1;">Giá: ${formatGia(t.giale)}</div>
      <div style="font-size:8pt;line-height:1;margin-top:2px;word-break:break-word;white-space:normal;">${t.masp}</div>    
    </div>
    <div style="width:18px;height:18px;margin-left:4px;">
      <canvas class="qr" width="18" height="18"></canvas>
    </div>
  </div>
</div>`;
    }
  }

  html += `</div></div>`;

  if (!silent) {
    previewArea.innerHTML = html;
    document.getElementById("pageInfo").textContent = `Trang ${_currentPage} / ${_totalPages}`;
  }

  document.querySelectorAll('.tem .qr').forEach((el) => {
    const parent = el.closest('.tem');
    if (!parent || parent.classList.contains('tem-blank')) return;
    const masp = parent.getAttribute('data-masp');
    new QRious({
      element: el,
      value: masp,
      size: 25,
      level: 'M'
    });
  });
};

// Xuất Excel
window.exportExcel = function () {
  const selected = getSelectedRows();
  const headers = ["STT", "Mã hàng", "Tên hàng", "SL Tem in", "ĐVT", "SL", "Giá lẻ", "In", "Giá nhập"];
  const data = selected.map((row, idx) => [
    idx + 1,
    row.masp,
    row.tensp,
    row.sltem,
    row.dvt || "",
    row.sl,
    Number(row.giale) || 0,
    row.tick ? true : false,
    Number(row.gianhap) || 0
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TemMaVach");
  XLSX.writeFile(wb, "tem-ma-vach.xlsx");
};

// In hiện tại
window.checkLoaiTemAndPrint = function () {
  const loaiTem = document.getElementById('loaiTem').value;
  if (!loaiTem) {
    showCustomPopup(`
      <div style="font-size:15px; margin-bottom:12px">Bạn muốn in tem loại nào?</div>
      <button onclick="chonLoaiTem('quanao')" style="margin-right:10px">In tem Quần áo</button>
      <button onclick="chonLoaiTem('giaydep')">In tem Giày dép</button>
    `);
    return;
  }
  window.print();
};

window.chonLoaiTem = function (loai) {
  document.getElementById('loaiTem').value = loai;
  closeCustomPopup();
  renderPreview();
  setTimeout(() => window.print(), 800);
};

// In toàn bộ
window.printAllPages = function () {
  syncHandsontableToSelected();
  const selected = getSelectedRows();
  _globalTemsAll = [];
  selected.forEach(row => {
    if (row.tick) {
      for (let i = 0; i < row.sltem; i++) {
        _globalTemsAll.push(row);
      }
    }
  });

  const loaiTem = document.getElementById('loaiTem')?.value || "";
  if (!loaiTem) {
    showCustomPopup(`
      <div style="font-size:15px; margin-bottom:12px">Bạn muốn in tem loại nào?</div>
      <button onclick="chonLoaiTemPrintAll('quanao')" style="margin-right:10px">In tem Quần áo</button>
      <button onclick="chonLoaiTemPrintAll('giaydep')">In tem Giày dép</button>
    `);
    return;
  }

  const fromRow = parseInt(fromRowInput.value) || 1;
  const fromCol = parseInt(fromColInput.value) || 1;
  _globalBlank = (fromRow - 1) * 5 + (fromCol - 1);

  const totalTems = _globalTemsAll.length;
  const firstPageTems = 40 - _globalBlank;
  const totalPagesCalc = (totalTems <= firstPageTems) ? 1 : 1 + Math.ceil((totalTems - firstPageTems) / 40);

  let fullHtml = '';
  for (let p = 1; p <= totalPagesCalc; p++) {
    renderPreview(p, true);
    fullHtml += document.querySelector(".print-preview")?.outerHTML || '';
  }

  const printWindow = window.open('', '', 'width=800,height=600');
  printWindow.document.write(`
    <html><head><title>In tem mã vạch</title>
    <style>
      .print-preview {
        position: relative;
        width: 210mm;
        height: 297mm;
        background: white;
        page-break-after: always;
        transform: scale(1.46222);
        transform-origin: top left;
      }
      body, html {
        margin: 0;
        padding: 0;
      }
    </style>
    </head><body>${fullHtml}</body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
};

window.chonLoaiTemPrintAll = function (loai) {
  document.getElementById('loaiTem').value = loai;
  closeCustomPopup();
  printAllPages();
};

// Popup chọn loại tem
function showCustomPopup(html) {
  const div = document.createElement("div");
  div.id = "popup";
  div.style.position = "fixed";
  div.style.top = "30%";
  div.style.left = "50%";
  div.style.transform = "translate(-50%, -30%)";
  div.style.padding = "20px";
  div.style.background = "#fff";
  div.style.border = "1px solid #ccc";
  div.style.zIndex = 9999;
  div.innerHTML = html;
  document.body.appendChild(div);
}

function closeCustomPopup() {
  const popup = document.getElementById("popup");
  if (popup) popup.remove();
}

// Điều hướng trang
window.prevPage = function () {
  if (_currentPage > 1) renderPreview(_currentPage - 1);
};
window.nextPage = function () {
  if (_currentPage < _totalPages) renderPreview(_currentPage + 1);
};
