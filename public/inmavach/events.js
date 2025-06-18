// events.js

import { renderPreview, printAllPages, showLoaiTemOptions } from './print.js';
import { syncHandsontableToSelected, clearSelectedRow } from './grid.js';

export function initEvents() {
  document.getElementById('xemtrang').addEventListener('click', () => {
    if (!checkLoaiTemAndRender()) return;
  });

  document.getElementById('xemtrangtiep').addEventListener('click', () => {
    if (currentPage < totalPages) {
      renderPreview(currentPage + 1);
    }
  });

  document.getElementById('quaylai').addEventListener('click', () => {
    if (currentPage > 1) {
      renderPreview(currentPage - 1);
    }
  });

  document.getElementById('inall').addEventListener('click', () => {
    printAllPages();
  });

  document.getElementById('loaiTem').addEventListener('change', () => {
    renderPreview(1);
  });

  document.getElementById('btnChonLoaiTem').addEventListener('click', () => {
    showLoaiTemOptions();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('overlayLoaiTem')?.remove();
    }
  });

  document.getElementById('fromRowInput')?.addEventListener('change', () => renderPreview(1));
  document.getElementById('fromColInput')?.addEventListener('change', () => renderPreview(1));

  document.getElementById('clearAll')?.addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn xóa hết các dòng đã chọn?")) {
      clearSelectedRow();
    }
  });

  // Xóa từng dòng bằng cách click đúp
  document.getElementById('previewArea').addEventListener('dblclick', e => {
    const tem = e.target.closest('.tem');
    if (tem && tem.dataset.masp) {
      const masp = tem.dataset.masp;
      const idx = selected.findIndex(r => r.masp === masp);
      if (idx !== -1) {
        selected.splice(idx, 1);
        renderPreview(currentPage);
      }
    }
  });
}

function checkLoaiTemAndRender() {
  const loaiTem = document.getElementById('loaiTem')?.value;
  if (!loaiTem) {
    showLoaiTemOptions();
    return false;
  }
  renderPreview(1);
  return true;
}
