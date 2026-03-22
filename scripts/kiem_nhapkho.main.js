import { bindInput } from './kiem_nhapkho.ui.js';
import { luuPhieu } from './kiem_nhapkho.data.js';
import { byId } from './kiem_nhapkho.core.js';

// bind nút
function bindButtons() {
  const btnSave = byId('btnSave');

  if (btnSave) {
    btnSave.onclick = () => {
      luuPhieu();
    };
  }
}

// init
function init() {
  bindInput();
  bindButtons();

  console.log('INIT KIEM NHAP KHO OK');
}

init();

// export ra ngoài nếu cần
window.NhapKiemKho = {
  save: luuPhieu
};