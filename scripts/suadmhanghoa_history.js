import { supabase } from './supabaseClient.js';
import { khoiTaoDangNhapDungChung } from './authModule.js';

let hotLichSu;
let hotSession;

let currentLoginManv = '';
let currentLoginTenNv = '';
let currentLoginCoSo = 'cs1';

async function blockNonAdminAccess(message = '❌ Bạn không được phép truy cập trang này.') {
  alert(message);

  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('Không signOut được khi chặn non-admin:', e);
  }

  try {
    localStorage.removeItem('manv');
    localStorage.removeItem('tennv');
    localStorage.removeItem('is_admin');
    localStorage.removeItem('quyen_sua_hoadon');

    sessionStorage.removeItem('manv');
    sessionStorage.removeItem('tennv');
    sessionStorage.removeItem('is_admin');
    sessionStorage.removeItem('quyen_sua_hoadon');
  } catch (e) {
    console.warn('Không xóa được cache quyền:', e);
  }

  location.reload();
}

function vnDateTimeText(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function getPreviewEl() {
  return document.getElementById('preview');
}

function setPreview(html) {
  const el = getPreviewEl();
  if (el) el.innerHTML = html || '';
}

function getSelectedHistoryRow() {
  if (!hotLichSu) return null;
  const selected = hotLichSu.getSelectedLast();
  if (!selected) return null;

  const row = selected[0];
  const data = hotLichSu.getSourceDataAtRow(row);
  return data || null;
}

function getSelectedSessionId() {
  const row = getSelectedHistoryRow();
  return (row?.session_id || '').toString().trim();
}

function initHistoryTable() {
  const container = document.getElementById('hot-lichsu');
  if (!container) return;

  if (hotLichSu) hotLichSu.destroy();

  hotLichSu = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      'ID',
      'Session ID',
      'Mã SP',
      'Cột sửa',
      'Giá trị cũ',
      'Giá trị mới',
      'Người cập nhật',
      'Ngày cập nhật',
      'Loại'
    ],
    columns: [
      { data: 'id', width: 220, readOnly: true },
      { data: 'session_id', width: 240, readOnly: true },
      { data: 'masp', width: 140, readOnly: true },
      { data: 'column_name', width: 120, readOnly: true },
      { data: 'old_value', width: 160, readOnly: true },
      { data: 'new_value', width: 160, readOnly: true },
      { data: 'updated_by', width: 120, readOnly: true },
      { data: 'updated_at_text', width: 160, readOnly: true },
      { data: 'action_type', width: 90, readOnly: true }
    ],
    height: 420,
    width: '100%',
    stretchH: 'all',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',
    cells(row, col) {
      const cp = {};
      const data = this.instance.getSourceDataAtRow(row);
      const actionType = (data?.action_type || '').toString().trim().toUpperCase();

      if (actionType === 'RESTORE') {
        cp.className = 'row-restore';
      }

      return cp;
    }
  });
}

function initSessionTable() {
  const container = document.getElementById('hot-session');
  if (!container) return;

  if (hotSession) hotSession.destroy();

  hotSession = new Handsontable(container, {
    data: [],
    rowHeaders: true,
    colHeaders: [
      'ID',
      'Session ID',
      'Mã SP',
      'Cột sửa',
      'Giá trị cũ',
      'Giá trị mới',
      'Người cập nhật',
      'Ngày cập nhật',
      'Loại',
      'Ghi chú'
    ],
    columns: [
      { data: 'id', width: 220, readOnly: true },
      { data: 'session_id', width: 240, readOnly: true },
      { data: 'masp', width: 140, readOnly: true },
      { data: 'column_name', width: 120, readOnly: true },
      { data: 'old_value', width: 160, readOnly: true },
      { data: 'new_value', width: 160, readOnly: true },
      { data: 'updated_by', width: 120, readOnly: true },
      { data: 'updated_at_text', width: 160, readOnly: true },
      { data: 'action_type', width: 90, readOnly: true },
      { data: 'note', width: 260, readOnly: true }
    ],
    height: 320,
    width: '100%',
    stretchH: 'all',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',
    cells(row, col) {
      const cp = {};
      const data = this.instance.getSourceDataAtRow(row);
      const actionType = (data?.action_type || '').toString().trim().toUpperCase();

      if (actionType === 'RESTORE') {
        cp.className = 'row-restore';
      }

      return cp;
    }
  });
}

function getDateRangeISO() {
  const fromDate = (document.getElementById('date-from')?.value || '').trim();
  const toDate = (document.getElementById('date-to')?.value || '').trim();

  if (!fromDate && !toDate) return null;

  const range = {};
  if (fromDate) range.fromISO = new Date(`${fromDate}T00:00:00+07:00`).toISOString();
  if (toDate) range.toISO = new Date(`${toDate}T23:59:59.999+07:00`).toISOString();

  return range;
}

async function taiLichSu() {
  try {
    setPreview('⏳ Đang tải lịch sử...');

    const masp = (document.getElementById('filter-masp')?.value || '').trim().toUpperCase();
    const sessionId = (document.getElementById('filter-session')?.value || '').trim();
    const updatedBy = (document.getElementById('filter-updated-by')?.value || '').trim().toUpperCase();
    const columnName = (document.getElementById('filter-column')?.value || '').trim();
    const dateRange = getDateRangeISO();

    let q = supabase
      .from('dmhanghoa_history')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(2000);

    if (masp) q = q.eq('masp', masp);
    if (sessionId) q = q.ilike('session_id', `%${sessionId}%`);
    if (updatedBy) q = q.ilike('updated_by', `%${updatedBy}%`);
    if (columnName) q = q.eq('column_name', columnName);
    if (dateRange?.fromISO) q = q.gte('updated_at', dateRange.fromISO);
    if (dateRange?.toISO) q = q.lte('updated_at', dateRange.toISO);

    const { data, error } = await q;

    if (error) throw error;

    const rows = (data || []).map(r => ({
      ...r,
      updated_at_text: vnDateTimeText(r.updated_at)
    }));

    hotLichSu.loadData(rows);
    hotSession.loadData([]);

    setPreview(`✅ Đã tải <b>${rows.length}</b> dòng lịch sử.`);
  } catch (err) {
    console.error(err);
    alert('Lỗi tải lịch sử: ' + (err?.message || err));
    setPreview('<span style="color:#dc2626;">❌ Lỗi tải lịch sử.</span>');
  }
}

async function xemChiTietSessionDangChon() {
  const sessionId = getSelectedSessionId();

  if (!sessionId) {
    alert('Bạn cần chọn 1 dòng lịch sử trước.');
    return;
  }

  try {
    setPreview(`⏳ Đang tải chi tiết session <b>${sessionId}</b>...`);

    const { data, error } = await supabase
      .from('dmhanghoa_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = (data || []).map(r => ({
      ...r,
      updated_at_text: vnDateTimeText(r.updated_at)
    }));

    hotSession.loadData(rows);

    setPreview(`✅ Đã tải <b>${rows.length}</b> dòng của session <b>${sessionId}</b>.`);
  } catch (err) {
    console.error(err);
    alert('Lỗi tải chi tiết session: ' + (err?.message || err));
    setPreview('<span style="color:#dc2626;">❌ Lỗi tải chi tiết session.</span>');
  }
}

async function khoiPhucSessionDangChon() {
  const sessionId = getSelectedSessionId();

  if (!sessionId) {
    alert('Bạn cần chọn 1 dòng lịch sử trước.');
    return;
  }

  const ok = confirm(
    `Bạn có chắc muốn khôi phục toàn bộ session này không?\n\n${sessionId}\n\nHệ thống sẽ trả dữ liệu về giá trị cũ trước khi phiên này ghi đè.`
  );
  if (!ok) return;

  try {
    setPreview(`⏳ Đang khôi phục session <b>${sessionId}</b>...`);

    const { data, error } = await supabase.rpc('rpc_restore_dmhanghoa_history_session', {
      p_session_id: sessionId,
      p_restored_by: currentLoginManv || null
    });

    if (error) throw error;

    if (!data?.success) {
      throw new Error(data?.message || 'Khôi phục thất bại');
    }

    setPreview(
      `✅ Đã khôi phục session <b>${sessionId}</b>. ` +
      `Số dòng cập nhật: <b>${data.updated_count || 0}</b>.`
    );

    await taiLichSu();
  } catch (err) {
    console.error(err);
    alert('Lỗi khôi phục session: ' + (err?.message || err));
    setPreview('<span style="color:#dc2626;">❌ Lỗi khôi phục session.</span>');
  }
}

async function khoiPhucDongDangChon() {
  const row = getSelectedHistoryRow();

  if (!row?.id) {
    alert('Bạn cần chọn 1 dòng lịch sử trước.');
    return;
  }

  const ok = confirm(
    `Bạn có chắc muốn khôi phục dòng này không?\n\n` +
    `Mã SP: ${row.masp}\n` +
    `Cột: ${row.column_name}\n` +
    `Cũ: ${row.old_value ?? '(trống)'}\n` +
    `Mới: ${row.new_value ?? '(trống)'}`
  );
  if (!ok) return;

  try {
    setPreview(`⏳ Đang khôi phục dòng lịch sử...`);

    const { data, error } = await supabase.rpc('rpc_restore_dmhanghoa_history_row', {
      p_history_id: row.id,
      p_restored_by: currentLoginManv || null
    });

    if (error) throw error;

    if (!data?.success) {
      throw new Error(data?.message || 'Khôi phục dòng thất bại');
    }

    setPreview(
      `✅ Đã khôi phục dòng lịch sử cho mã <b>${data.masp}</b>, cột <b>${data.column_name}</b>.`
    );

    await taiLichSu();
  } catch (err) {
    console.error(err);
    alert('Lỗi khôi phục dòng: ' + (err?.message || err));
    setPreview('<span style="color:#dc2626;">❌ Lỗi khôi phục dòng.</span>');
  }
}

function lamMoiForm() {
  document.getElementById('date-from').value = '';
  document.getElementById('date-to').value = '';
  document.getElementById('filter-masp').value = '';
  document.getElementById('filter-session').value = '';
  document.getElementById('filter-updated-by').value = '';
  document.getElementById('filter-column').value = '';

  hotLichSu.loadData([]);
  hotSession.loadData([]);
  setPreview('');
}

function attachEvents() {
  document.getElementById('btn-load')?.addEventListener('click', taiLichSu);
  document.getElementById('btn-view-session')?.addEventListener('click', xemChiTietSessionDangChon);
  document.getElementById('btn-restore-session')?.addEventListener('click', khoiPhucSessionDangChon);
  document.getElementById('btn-restore-row')?.addEventListener('click', khoiPhucDongDangChon);
  document.getElementById('btn-reset')?.addEventListener('click', lamMoiForm);
}

(function initPage() {
  initHistoryTable();
  initSessionTable();
  attachEvents();

  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: async (nhanvien, context) => {
      const isAdmin =
        nhanvien?.is_admin === true ||
        localStorage.getItem('is_admin') === 'true';

      if (!isAdmin) {
        await blockNonAdminAccess('❌ Chỉ admin mới được phép đăng nhập vào trang lịch sử sửa danh mục hàng hóa.');
        return false;
      }

      currentLoginCoSo =
        (context?.diadiem || nhanvien?.diadiem || 'cs1')
          .toString()
          .trim()
          .toLowerCase();

      currentLoginManv = (nhanvien?.manv || '').toString().trim().toUpperCase();
      currentLoginTenNv = (nhanvien?.tennv || nhanvien?.hoten || '').toString().trim();

      return true;
    }
  });
})();
