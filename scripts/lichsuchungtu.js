import { supabase } from './supabaseClient.js';

let activeTab = 'sua'; // 'sua' | 'xoa'
let currentRows = [];
let currentTrashRow = null;
let currentVersionRow = null;
let currentVersionList = [];

const $ = (id) => document.getElementById(id);

function formatDateTime(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return String(v);
  }
}

function formatJson(obj) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj ?? '');
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function setDefaultDates() {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 14);

  $('tuNgay').value = from.toISOString().slice(0, 10);
  $('denNgay').value = today.toISOString().slice(0, 10);
}

function showModal(id) {
  $(id)?.classList.add('show');
}

function hideModal(id) {
  $(id)?.classList.remove('show');
}

function bindModalClose() {
  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      hideModal(el.getAttribute('data-close'));
    });
  });
}

function setActiveTab(tab) {
  activeTab = tab;
  $('tabSua').classList.toggle('active', tab === 'sua');
  $('tabXoa').classList.toggle('active', tab === 'xoa');
  $('tenTabHienTai').textContent = tab === 'sua' ? 'Lịch sử sửa' : 'Lịch sử xóa';
  loadData();
}

function getFilters() {
  return {
    tuNgay: $('tuNgay').value,
    denNgay: $('denNgay').value,
    sohd: $('sohdFilter').value.trim(),
    masp: $('maspFilter').value.trim().toUpperCase(),
    action: $('actionFilter').value,
    source: $('sourceFilter').value.trim()
  };
}

async function loadData() {
  if (activeTab === 'sua') {
    await loadEditLogs();
  } else {
    await loadTrashLogs();
  }
}

async function loadEditLogs() {
  const f = getFilters();

  let query = supabase
    .from('invoice_edit_log')
    .select('*')
    .order('logged_at', { ascending: false })
    .limit(500);

  if (f.tuNgay) query = query.gte('logged_at', `${f.tuNgay}T00:00:00`);
  if (f.denNgay) query = query.lte('logged_at', `${f.denNgay}T23:59:59`);
  if (f.sohd) query = query.ilike('sohd', `%${f.sohd}%`);
  if (f.action) query = query.eq('action', f.action);
  if (f.source) query = query.ilike('source', `%${f.source}%`);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    alert('❌ Không tải được lịch sử sửa.');
    return;
  }

  let rows = Array.isArray(data) ? data : [];

  if (f.masp) {
    rows = rows.filter(r => JSON.stringify(r.diff || {}).toUpperCase().includes(f.masp));
  }

  currentRows = rows;
  renderEditLogs(rows);
}

async function loadTrashLogs() {
  const f = getFilters();

  let query = supabase
    .from('invoice_trash')
    .select('*')
    .order('trashed_at', { ascending: false })
    .limit(500);

  if (f.tuNgay) query = query.gte('trashed_at', `${f.tuNgay}T00:00:00`);
  if (f.denNgay) query = query.lte('trashed_at', `${f.denNgay}T23:59:59`);
  if (f.sohd) query = query.ilike('sohd', `%${f.sohd}%`);
  if (f.source) query = query.ilike('source', `%${f.source}%`);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    alert('❌ Không tải được lịch sử xóa.');
    return;
  }

  let rows = Array.isArray(data) ? data : [];

  if (f.masp) {
    rows = rows.filter(r => JSON.stringify(r.details || []).toUpperCase().includes(f.masp));
  }

  currentRows = rows;
  renderTrashLogs(rows);
}

function renderEditLogs(rows) {
  $('tongBanGhi').textContent = rows.length;

  $('mainThead').innerHTML = `
    <tr>
      <th>ID</th>
      <th>logged_at</th>
      <th>sohd</th>
      <th>table_name</th>
      <th>row_id</th>
      <th>action</th>
      <th>source</th>
      <th>Tóm tắt</th>
      <th>Thao tác</th>
    </tr>
  `;

  if (!rows.length) {
    $('mainTbody').innerHTML = `<tr><td colspan="9" class="empty">Không có dữ liệu.</td></tr>`;
    return;
  }

  $('mainTbody').innerHTML = rows.map(r => {
    const diff = r.diff || {};
    const keys = Object.keys(diff);
    const summary = keys.slice(0, 5).join(', ') || '(không có diff)';

    return `
      <tr>
        <td class="mono">${r.id ?? ''}</td>
        <td>${formatDateTime(r.logged_at)}</td>
        <td class="mono">${escapeHtml(r.sohd)}</td>
        <td>${escapeHtml(r.table_name)}</td>
        <td>${r.row_id ?? ''}</td>
        <td>${renderActionPill(r.action)}</td>
        <td>${escapeHtml(r.source || '')}</td>
        <td>${escapeHtml(summary)}</td>
        <td>
          <div class="action-links">
            <button class="btn-gray btn-view-log" data-id="${r.id}">Chi tiết</button>
            <button class="btn-primary btn-view-versions" data-sohd="${escapeHtml(r.sohd)}">Version</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bindEditTableActions();
}

function renderTrashLogs(rows) {
  $('tongBanGhi').textContent = rows.length;

  $('mainThead').innerHTML = `
    <tr>
      <th>ID</th>
      <th>trashed_at</th>
      <th>sohd</th>
      <th>ngay</th>
      <th>loaihd</th>
      <th>diadiem</th>
      <th>actor</th>
      <th>reason</th>
      <th>source</th>
      <th>restored</th>
      <th>Thao tác</th>
    </tr>
  `;

  if (!rows.length) {
    $('mainTbody').innerHTML = `<tr><td colspan="11" class="empty">Không có dữ liệu.</td></tr>`;
    return;
  }

  $('mainTbody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.id ?? ''}</td>
      <td>${formatDateTime(r.trashed_at)}</td>
      <td class="mono">${escapeHtml(r.sohd)}</td>
      <td>${escapeHtml(r.ngay || '')}</td>
      <td>${escapeHtml(r.loaihd || '')}</td>
      <td>${escapeHtml(r.diadiem || '')}</td>
      <td>${escapeHtml(r.actor_text || '')}</td>
      <td>${escapeHtml(r.reason || '')}</td>
      <td>${escapeHtml(r.source || '')}</td>
      <td>${r.restored_at ? `<span class="pill green">Đã restore</span><br><span class="mono">${escapeHtml(r.restore_target_sohd || '')}</span>` : `<span class="pill red">Chưa restore</span>`}</td>
      <td>
        <div class="action-links">
          <button class="btn-gray btn-view-trash" data-id="${r.id}">Xem</button>
          <button class="btn-ok btn-restore-trash" data-id="${r.id}" ${r.restored_at ? 'disabled' : ''}>Restore</button>
        </div>
      </td>
    </tr>
  `).join('');

  bindTrashTableActions();
}

function renderActionPill(action) {
  const a = String(action || '').toUpperCase();
  let cls = 'blue';
  if (a.includes('DELETE')) cls = 'red';
  else if (a.includes('RESTORE')) cls = 'orange';
  else if (a.includes('UPDATE')) cls = 'blue';
  else if (a.includes('INSERT')) cls = 'green';
  return `<span class="pill ${cls}">${escapeHtml(a)}</span>`;
}

function bindEditTableActions() {
  document.querySelectorAll('.btn-view-log').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const row = currentRows.find(x => Number(x.id) === id);
      if (!row) return;
      openLogModal(row);
    };
  });

  document.querySelectorAll('.btn-view-versions').forEach(btn => {
    btn.onclick = async () => {
      const sohd = btn.dataset.sohd;
      await openVersionsModal(sohd);
    };
  });
}

function bindTrashTableActions() {
  document.querySelectorAll('.btn-view-trash').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const row = currentRows.find(x => Number(x.id) === id);
      if (!row) return;
      openTrashModal(row);
    };
  });

  document.querySelectorAll('.btn-restore-trash').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const row = currentRows.find(x => Number(x.id) === id);
      if (!row) return;
      currentTrashRow = row;
      $('restoreMode').value = 'original';
      $('restoreNewSohd').value = '';
      $('restoreTrashNote').value = '';
      toggleRestoreNewSohd();
      showModal('modalRestoreTrash');
    };
  });
}

function openLogModal(row) {
  $('logMeta').innerHTML = `
    <div><b>ID:</b> ${row.id ?? ''}</div>
    <div><b>logged_at:</b> ${formatDateTime(row.logged_at)}</div>
    <div><b>sohd:</b> <span class="mono">${escapeHtml(row.sohd)}</span></div>
    <div><b>table_name:</b> ${escapeHtml(row.table_name || '')}</div>
    <div><b>row_id:</b> ${row.row_id ?? ''}</div>
    <div><b>action:</b> ${escapeHtml(row.action || '')}</div>
    <div><b>source:</b> ${escapeHtml(row.source || '')}</div>
  `;
  $('logDiff').textContent = formatJson(row.diff || {});
  showModal('modalLog');
}

async function openVersionsModal(sohd) {
  const { data, error } = await supabase
    .from('invoice_version_history')
    .select('*')
    .eq('sohd', sohd)
    .order('version_no', { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    alert('❌ Không tải được danh sách version.');
    return;
  }

  currentVersionList = Array.isArray(data) ? data : [];

  $('versionsTbody').innerHTML = currentVersionList.length
    ? currentVersionList.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${formatDateTime(r.saved_at)}</td>
        <td class="mono">${escapeHtml(r.sohd)}</td>
        <td>${r.version_no}</td>
        <td>${escapeHtml(r.action || '')}</td>
        <td>${escapeHtml(r.source || '')}</td>
        <td>${escapeHtml(r.note || '')}</td>
        <td>
          <div class="action-links">
            <button class="btn-gray btn-version-view" data-id="${r.id}">Xem</button>
            <button class="btn-warn btn-version-restore" data-id="${r.id}">Restore</button>
          </div>
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="8" class="empty">Không có version.</td></tr>`;

  document.querySelectorAll('.btn-version-view').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const row = currentVersionList.find(x => Number(x.id) === id);
      if (!row) return;
      openVersionView(row);
    };
  });

  document.querySelectorAll('.btn-version-restore').forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const row = currentVersionList.find(x => Number(x.id) === id);
      if (!row) return;
      currentVersionRow = row;
      $('restoreVersionNote').value = '';
      showModal('modalRestoreVersion');
    };
  });

  showModal('modalVersions');
}

function openVersionView(row) {
  currentVersionRow = row;
  $('versionHeaderBox').textContent = formatJson(row.header || {});
  renderDetailsTable(row.details || [], $('versionDetailsTbody'));
  showModal('modalVersionView');
}

function openTrashModal(row) {
  currentTrashRow = row;
  $('trashHeaderBox').textContent = formatJson(row.header || {});
  renderDetailsTable(row.details || [], $('trashDetailsTbody'));
  showModal('modalTrashView');
}

function renderDetailsTable(details, tbodyEl) {
  const arr = Array.isArray(details) ? details : [];
  if (!arr.length) {
    tbodyEl.innerHTML = `<tr><td colspan="8" class="empty">Không có chi tiết.</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = arr.map(item => `
    <tr>
      <td class="mono">${escapeHtml(item.masp || '')}</td>
      <td>${escapeHtml(item.tensp || '')}</td>
      <td>${escapeHtml(item.size || '')}</td>
      <td>${escapeHtml(item.soluong ?? '')}</td>
      <td>${escapeHtml(item.gia ?? '')}</td>
      <td>${escapeHtml(item.km ?? '')}</td>
      <td>${escapeHtml(item.thanhtien ?? '')}</td>
      <td>${escapeHtml(item.ketqua || '')}</td>
    </tr>
  `).join('');
}

function toggleRestoreNewSohd() {
  const mode = $('restoreMode').value;
  $('newSohdWrap').classList.toggle('hidden', mode !== 'new_number');
}

async function restoreTrashNow() {
  if (!currentTrashRow) return;

  const mode = $('restoreMode').value;
  const newSohd = $('restoreNewSohd').value.trim();
  const note = $('restoreTrashNote').value.trim();
  const actorText =
    localStorage.getItem('manv') ||
    '';

  if (mode === 'new_number' && !newSohd) {
    alert('❌ Bạn phải nhập số hóa đơn mới.');
    $('restoreNewSohd').focus();
    return;
  }

  const ok = confirm('Bạn có chắc muốn restore hóa đơn này không?');
  if (!ok) return;

  const { data, error } = await supabase.rpc('rpc_restore_invoice_from_trash', {
    p_trash_id: currentTrashRow.id,
    p_mode: mode,
    p_new_sohd: mode === 'new_number' ? newSohd : null,
    p_note: note || 'Restore từ màn hình lịch sử chứng từ',
    p_actor_text: actorText
  });

  if (error) {
    console.error(error);
    alert('❌ Restore trash thất bại: ' + (error.message || 'Lỗi không xác định'));
    return;
  }

  alert('✅ Restore thành công. Số hóa đơn: ' + data);
  hideModal('modalRestoreTrash');
  hideModal('modalTrashView');
  await loadData();
}

async function restoreVersionNow() {
  if (!currentVersionRow) return;

  const note = $('restoreVersionNote').value.trim();
  const actorText = localStorage.getItem('manv') || '';

  const ok = confirm('Bạn có chắc muốn restore version này không?');
  if (!ok) return;

  const { data, error } = await supabase.rpc('rpc_restore_invoice_from_version', {
    p_version_id: currentVersionRow.id,
    p_note: note || 'Restore version từ màn hình lịch sử chứng từ',
    p_actor_text: actorText
  });

  if (error) {
    console.error(error);
    alert('❌ Restore version thất bại: ' + (error.message || 'Lỗi không xác định'));
    return;
  }

  alert('✅ Restore version thành công cho hóa đơn: ' + data);
  hideModal('modalRestoreVersion');
  hideModal('modalVersionView');
  hideModal('modalVersions');
  await loadData();
}

function bindEvents() {
  $('tabSua').onclick = () => setActiveTab('sua');
  $('tabXoa').onclick = () => setActiveTab('xoa');

  $('btnTim').onclick = () => loadData();
  $('btnLamMoi').onclick = () => {
    $('sohdFilter').value = '';
    $('maspFilter').value = '';
    $('actionFilter').value = '';
    $('sourceFilter').value = '';
    setDefaultDates();
    loadData();
  };

  $('restoreMode').onchange = toggleRestoreNewSohd;
  $('btnRestoreTrashNow').onclick = restoreTrashNow;
  $('btnOpenRestoreTrash').onclick = () => {
    if (!currentTrashRow) return;
    $('restoreMode').value = 'original';
    $('restoreNewSohd').value = '';
    $('restoreTrashNote').value = '';
    toggleRestoreNewSohd();
    showModal('modalRestoreTrash');
  };

  $('btnRestoreVersionNow').onclick = () => {
    if (!currentVersionRow) return;
    $('restoreVersionNote').value = '';
    showModal('modalRestoreVersion');
  };
  $('btnRestoreVersionConfirm').onclick = restoreVersionNow;
}

async function init() {
  bindModalClose();
  bindEvents();
  setDefaultDates();
  toggleRestoreNewSohd();
  await loadData();
}

init();