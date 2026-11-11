/* HOAN TUYET - Admin toggle employee revenue attribution, for NEW invoices and existing invoices opened for viewing/editing.
 * Deliberately independent of hoadon.js, bangketqua.js and secure save RPC.
 * Does NOT modify money, quantity, employee name or consultation links.
 */
(() => {
  'use strict';
  const SUFFIX = '_HUY';
  const table = document.getElementById('bangketqua');
  if (!table || !/banlemtcs[12]\.html$/i.test(location.pathname)) return;

  const style = document.createElement('style');
  style.textContent = `
    #bangketqua tbody tr[data-manv-ban$="_HUY"] > td:nth-child(9) {
      color: #b42318 !important; font-weight: 700; text-decoration: underline dotted;
    }
    body.ht-admin-ds #bangketqua tbody tr[data-entry-key] > td:nth-child(9) {
      cursor: pointer;
    }
    body.ht-admin-ds #bangketqua tbody tr[data-entry-key] > td:nth-child(9):hover {
      outline: 2px solid #e0a72f; outline-offset: -2px;
    }
  `;
  document.head.appendChild(style);

  // Permit the existing viewing/editing workflow; never change saved rows directly.
  // In 'xem' the existing Save button will request Admin edit confirmation.
  function invoiceContext() {
    const state = String(document.getElementById('hd_state')?.value || '')
      .trim().toLowerCase();
    const editing = state === 'sua' || window.HD_CTX?.mode === 'EDIT' ||
      window.dangSuaHoaDon === true || window.choPhepSua === true;
    const viewing = ['xem', 'chua xem', 'chưa xem', 'chuaxem'].includes(state);
    const fresh = state === 'moi' && !editing;
    const sohd = String(document.getElementById('sohd')?.value || '').trim();
    // Do not allow an old-invoice operation with no invoice identifier.
    return { allowed: fresh || ((viewing || editing) && !!sohd), isOld: !fresh, sohd, state };
  }
  function hasAdminHint() {
    return String(localStorage.getItem('is_admin') || '').toLowerCase() === 'true';
  }
  function updateHint() { document.body.classList.toggle('ht-admin-ds', hasAdminHint()); }
  updateHint();
  window.addEventListener('storage', updateHint);
  const original = (s) => s.endsWith(SUFFIX) ? s.slice(0, -SUFFIX.length) : s;

  let busy = false;
  table.addEventListener('click', async (event) => {
    const td = event.target.closest('td');
    const tr = td?.closest('tr');
    if (!td || !tr || !tr.closest('#bangketqua tbody') || td.cellIndex !== 8) return;
    // No effect on normal row selection or ordinary staff operation.
    if (!hasAdminHint()) return;
    if (!tr.dataset.entryKey) return;  // Pasted DOM rows not backed by line model.
    event.stopPropagation();
    if (busy) return;
    const context = invoiceContext();
    if (!context.allowed) {
      alert('Hãy mở hóa đơn mới hoặc tải hóa đơn cũ hợp lệ trước khi đổi mã NV bán.');
      return;
    }
    const entryKey = tr.dataset.entryKey;
    const idx = Number(tr.dataset.lineIndex);
    if (!Number.isInteger(idx) || idx < 0) return;
    const model = window.bangKetQua;
    const item = model?.[entryKey];
    if (!item || !Array.isArray(item.manv_bans)) {
      alert('Không tìm thấy dòng dữ liệu nguồn. Không thay đổi gì.');
      return;
    }
    const oldCode = String(item.manv_bans[idx] || '').trim().toUpperCase();
    if (!oldCode) {
      alert('Dòng chưa có mã nhân viên bán nên không thể HỦY/khôi phục.');
      return;
    }
    const nextCode = oldCode.endsWith(SUFFIX) ? original(oldCode) : `${oldCode}${SUFFIX}`;
    if (!nextCode) return;
    busy = true;
    try {
      if (!window.supabase?.rpc) throw Error('Không thể xác thực quyền Admin với Supabase.');
      const { data: isAdmin, error } = await window.supabase.rpc('is_admin');
      if (error || isAdmin !== true) throw Error('Tài khoản không có quyền Admin hoặc không xác thực được quyền.');
      const liveContext = invoiceContext();
      if (!liveContext.allowed || liveContext.isOld !== context.isOld ||
          liveContext.sohd !== context.sohd ||
          window.bangKetQua?.[entryKey] !== item ||
          String(item.manv_bans[idx] || '').trim().toUpperCase() !== oldCode) {
        throw Error('Hóa đơn hoặc dòng hàng đã thay đổi, vui lòng thao tác lại.');
      }
      const saveNotice = context.isOld
        ? '\n\nHóa đơn cũ: phải bấm LƯU SỬA và xác thực sửa hóa đơn để thay đổi có hiệu lực.'
        : '\n\nHóa đơn mới: phải bấm LƯU để thay đổi có hiệu lực.';
      const message = (oldCode.endsWith(SUFFIX)
        ? `Khôi phục doanh thu nhân viên: ${oldCode} → ${nextCode}?`
        : `Không tính doanh thu cho ${oldCode} trên dòng này?\nMã lưu thành: ${nextCode}`) + saveNotice;
      if (!confirm(message)) return;
      // Single source of truth used by secure payload generator, F3 and renderer.
      item.manv_bans[idx] = nextCode;
      // Preserve tennv_bans, tu_van references, price, amount, discount, quantity.
      // If view is still the same row, update DOM dataset for F3/DOM reconstruction.
      const liveRow = [...table.querySelectorAll('tbody tr')].find(r =>
        r.dataset.entryKey === entryKey && Number(r.dataset.lineIndex) === idx);
      if (liveRow) {
        liveRow.dataset.manvBan = nextCode;
        if (liveRow.cells[8]) liveRow.cells[8].textContent = nextCode;
      }
      alert(`Đã đổi mã NV bán thành ${nextCode} trên giao diện.\n` +
        (context.isOld
          ? 'Chưa cập nhật dữ liệu gốc. Bấm LƯU và hoàn tất xác thực sửa hóa đơn.'
          : 'Chưa lưu hóa đơn. Hãy kiểm tra cột NV bán trước khi bấm LƯU.'));
    } catch (e) {
      alert(`Không thực hiện được: ${e?.message || e}`);
    } finally { busy = false; }
  });
})();
