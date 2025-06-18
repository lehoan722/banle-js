// ================== print.js ==================
import { getSelectedRows } from './grid.js';
import { renderPreview } from './preview.js';

let currentPage = 1;
let totalPages = 1;

export function printAllPages() {
  const selected = getSelectedRows();
  const totalTems = selected.flatMap(row => row.tick ? Array(row.sltem).fill(row) : []);
  totalPages = Math.ceil(totalTems.length / 40);

  let printContents = '';
  for (let page = 1; page <= totalPages; page++) {
    printContents += renderPreview(page, true); // render preview in print mode (return HTML)
    if (page < totalPages) printContents += '<div class="page-break"></div>';
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>In mã vạch</title>
      <style>
        @media print {
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      ${printContents}
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

export function setPages(pages) {
  totalPages = pages;
}

export function getPages() {
  return { currentPage, totalPages };
}

export function setCurrentPage(page) {
  currentPage = page;
}
