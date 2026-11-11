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

  // Khi tải hóa đơn cũ, bảng HTML có thể đã hiển thị trong khi
  // window.bangKetQua chưa được đồng bộ (đặc biệt trạng thái "xem").
  // Chỉ dựng lại nguồn từ DOM khi thực sự không tìm được dòng gốc.
  function findSourceRow(tr) {
    const entryKey = String(tr.dataset.entryKey || '');
    const idx = Number(tr.dataset.lineIndex);
    if (!entryKey || !Number.isInteger(idx) || idx < 0) return null;
    const find = () => {
      const item = window.bangKetQua?.[entryKey];
      return item && Array.isArray(item.manv_bans) && idx < item.manv_bans.length
        ? { entryKey, idx, item } : null;
    };
    let found = find();
    if (found) return found;
    // Dùng hàm đồng bộ DOM -> line model sẵn có ở bangketqua.js.
    // Hàm này bảo toàn manv_ban, thông tin tư vấn, giá và KM từ data-*.
    if (typeof window.capNhatBangKetQuaTuDOM === 'function') {
      window.capNhatBangKetQuaTuDOM();
      // Giữ biến module hoadon.js và biến window cùng nguồn dữ liệu.
      window.hoadonSyncFromWindow?.();
      found = find();
    }
    return found;
  }

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
    const displayedCode = String(tr.dataset.manvBan || tr.cells[8]?.textContent || '').trim().toUpperCase();
    if (!displayedCode) {
      alert('Dòng chưa có mã nhân viên bán nên không thể HỦY/khôi phục.');
      return;
    }
    const nextCode = displayedCode.endsWith(SUFFIX)
      ? original(displayedCode) : `${displayedCode}${SUFFIX}`;
    if (!nextCode) return;
    busy = true;
    try {
      if (!window.supabase?.rpc) throw Error('Không thể xác thực quyền Admin với Supabase.');
      const { data: isAdmin, error } = await window.supabase.rpc('is_admin');
      if (error || isAdmin !== true) throw Error('Tài khoản không có quyền Admin hoặc không xác thực được quyền.');
      const liveContext = invoiceContext();
      const liveRow = [...table.querySelectorAll('tbody tr')].find(r =>
        r.dataset.entryKey === entryKey && Number(r.dataset.lineIndex) === idx);
      if (!liveContext.allowed || liveContext.isOld !== context.isOld ||
          liveContext.sohd !== context.sohd || !liveRow ||
          String(liveRow.dataset.manvBan || liveRow.cells[8]?.textContent || '').trim().toUpperCase() !== displayedCode) {
        throw Error('Hóa đơn hoặc dòng hàng đã thay đổi, vui lòng thao tác lại.');
      }
      const source = findSourceRow(liveRow);
      if (!source ||
          String(source.item.manv_bans[source.idx] || '').trim().toUpperCase() !== displayedCode) {
        throw Error('Không đồng bộ được dòng dữ liệu nguồn. Hãy tải lại hóa đơn rồi thử lại.');
      }
      const saveNotice = context.isOld
        ? '\n\nHóa đơn cũ: phải bấm LƯU SỬA và xác thực sửa hóa đơn để thay đổi có hiệu lực.'
        : '\n\nHóa đơn mới: phải bấm LƯU để thay đổi có hiệu lực.';
      const message = (displayedCode.endsWith(SUFFIX)
        ? `Khôi phục doanh thu nhân viên: ${displayedCode} → ${nextCode}?`
        : `Không tính doanh thu cho ${displayedCode} trên dòng này?\nMã lưu thành: ${nextCode}`) + saveNotice;
      if (!confirm(message)) return;
      // Single source of truth used by secure payload generator, F3 and renderer.
      source.item.manv_bans[source.idx] = nextCode;
      // Preserve tennv_bans, tu_van references, price, amount, discount, quantity.
      // If view is still the same row, update DOM dataset for F3/DOM reconstruction.
      liveRow.dataset.manvBan = nextCode;
      if (liveRow.cells[8]) liveRow.cells[8].textContent = nextCode;
      alert(`Đã đổi mã NV bán thành ${nextCode} trên giao diện.\n` +
        (context.isOld
          ? 'Chưa cập nhật dữ liệu gốc. Bấm LƯU và hoàn tất xác thực sửa hóa đơn.'
          : 'Chưa lưu hóa đơn. Hãy kiểm tra cột NV bán trước khi bấm LƯU.'));
    } catch (e) {
      alert(`Không thực hiện được: ${e?.message || e}`);
    } finally { busy = false; }
  });
})();
