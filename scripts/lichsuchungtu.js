import { supabase } from './supabaseClient.js';

let activeTab = 'sua'; // 'sua' | 'xoa'
let currentRows = [];
let currentTrashRow = null;
let currentVersionRow = null;
let currentVersionList = [];

let isLoading = false;
let loadRequestId = 0;

const $ = (id) => document.getElementById(id);

function formatDateInputLocal(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ensureStatusBox() {
  let el = document.getElementById('loadingStatus');
  if (el) return el;

  const summaryBar = document.querySelector('.summary');
  if (!summaryBar) return null;

  el = document.createElement('div');
  el.id = 'loadingStatus';
  el.style.fontSize = '13px';
  el.style.fontWeight = '600';
  el.style.color = '#c62828';
  el.style.marginLeft = 'auto';
  el.style.display = 'none';
  summaryBar.appendChild(el);

  return el;
}

function setLoadingState(loading, text = 'Đang tải dữ liệu...') {
  isLoading = loading;

  const statusEl = ensureStatusBox();
  if (statusEl) {
    statusEl.textContent = loading ? text : '';
    statusEl.style.display = loading ? 'block' : 'none';
  }

  const btnTim = $('btnTim');
  const btnLamMoi = $('btnLamMoi');
  const tabSua = $('tabSua');
  const tabXoa = $('tabXoa');

  if (btnTim) btnTim.disabled = loading;
  if (btnLamMoi) btnLamMoi.disabled = loading;
  if (tabSua) tabSua.disabled = loading;
  if (tabXoa) tabXoa.disabled = loading;
}

function debugLog(...args) {
  console.log('[lichsuchungtu]', ...args);
}

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

  $('tuNgay').value = formatDateInputLocal(from);
  $('denNgay').value = formatDateInputLocal(today);
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

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const opened = Array.from(document.querySelectorAll('.modal.show'));
    if (!opened.length) return;

    const lastModal = opened[opened.length - 1];
    if (lastModal?.id) hideModal(lastModal.id);
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        hideModal(modal.id);
      }
    });
  });
}

function setActiveTab(tab) {
  if (isLoading) return;

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
  const requestId = ++loadRequestId;
  const currentTab = activeTab;

  setLoadingState(true, `Đang tải ${currentTab === 'sua' ? 'lịch sử sửa' : 'lịch sử xóa'}...`);
  debugLog('start loadData', { requestId, activeTab: currentTab, filters: getFilters() });

  try {
    if (currentTab === 'sua') {
      await loadEditLogs(requestId);
    } else {
      await loadTrashLogs(requestId);
    }
  } catch (err) {
    console.error(err);
    alert('❌ Có lỗi khi tải dữ liệu lịch sử chứng từ.');
  } finally {
    if (requestId === loadRequestId) {
      setLoadingState(false);
      debugLog('finish loadData', { requestId, activeTab: currentTab });
    } else {
      debugLog('skip finish because outdated request', { requestId, latest: loadRequestId });
    }
  }
}

async function loadEditLogs(requestId) {
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

  debugLog('query edit logs', { requestId, filters: f });
  debugLog('edit logs date range', {
    from: f.tuNgay ? `${f.tuNgay}T00:00:00` : '(none)',
    to: f.denNgay ? `${f.denNgay}T23:59:59` : '(none)'
  });

  const { data, error } = await query;

  debugLog('raw edit log response', {
    requestId,
    hasError: !!error,
    rawLength: Array.isArray(data) ? data.length : '(not array)',
    firstRow: Array.isArray(data) && data.length ? data[0] : null
  });

  if (requestId !== loadRequestId) {
    debugLog('discard outdated edit log result', { requestId, latest: loadRequestId });
    return;
  }

  if (error) {
    console.error(error);
    alert('❌ Không tải được lịch sử sửa.');
    return;
  }

  if (Array.isArray(data) && data.length === 0) {
    const { data: sampleData, error: sampleError } = await supabase
      .from('invoice_edit_log')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(3);

    debugLog('sample edit logs without filters', {
      requestId,
      hasError: !!sampleError,
      sampleLength: Array.isArray(sampleData) ? sampleData.length : '(not array)',
      sampleFirstRow: Array.isArray(sampleData) && sampleData.length ? sampleData[0] : null
    });
  }

  let rows = Array.isArray(data) ? data : [];

  if (f.masp) {
    rows = rows.filter(r => JSON.stringify(r.diff || {}).toUpperCase().includes(f.masp));
  }

  if (requestId !== loadRequestId) {
    debugLog('discard outdated edit log rows after filter', { requestId, latest: loadRequestId });
    return;
  }

  debugLog('edit logs loaded', { requestId, count: rows.length });

  currentRows = rows;
  renderEditLogs(rows);
}

async function loadTrashLogs(requestId) {
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

  debugLog('query trash logs', { requestId, filters: f });
  debugLog('trash logs date range', {
    from: f.tuNgay ? `${f.tuNgay}T00:00:00` : '(none)',
    to: f.denNgay ? `${f.denNgay}T23:59:59` : '(none)'
  });

  const { data, error } = await query;

  debugLog('raw trash log response', {
    requestId,
    hasError: !!error,
    rawLength: Array.isArray(data) ? data.length : '(not array)',
    firstRow: Array.isArray(data) && data.length ? data[0] : null
  });

  if (requestId !== loadRequestId) {
    debugLog('discard outdated trash log result', { requestId, latest: loadRequestId });
    return;
  }

  if (error) {
    console.error(error);
    alert('❌ Không tải được lịch sử xóa.');
    return;
  }

  if (Array.isArray(data) && data.length === 0) {
    const { data: sampleData, error: sampleError } = await supabase
      .from('invoice_trash')
      .select('*')
      .order('trashed_at', { ascending: false })
      .limit(3);

    debugLog('sample trash logs without filters', {
      requestId,
      hasError: !!sampleError,
      sampleLength: Array.isArray(sampleData) ? sampleData.length : '(not array)',
      sampleFirstRow: Array.isArray(sampleData) && sampleData.length ? sampleData[0] : null
    });
  }

  let rows = Array.isArray(data) ? data : [];

  if (f.masp) {
    rows = rows.filter(r => JSON.stringify(r.details || []).toUpperCase().includes(f.masp));
  }

  if (requestId !== loadRequestId) {
    debugLog('discard outdated trash log rows after filter', { requestId, latest: loadRequestId });
    return;
  }

  debugLog('trash logs loaded', { requestId, count: rows.length });

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

function extractLogDetailRows(diff) {
  const d = diff || {};

  if (Array.isArray(d.details)) return d.details;
  if (Array.isArray(d.detail_rows)) return d.detail_rows;
  if (Array.isArray(d.rows)) return d.rows;

  if (Array.isArray(d._inserted)) return d._inserted;
  if (Array.isArray(d._updated)) return d._updated;
  if (Array.isArray(d._deleted)) return d._deleted;

  if (d._inserted && typeof d._inserted === 'object') return [d._inserted];
  if (d._updated && typeof d._updated === 'object') return [d._updated];
  if (d._deleted && typeof d._deleted === 'object') return [d._deleted];

  return [];
}

function renderLogDetailsTable(details) {
  const arr = Array.isArray(details) ? details : [];

  if (!arr.length) {
    $('logDetailsTbody').innerHTML = `
      <tr>
        <td colspan="10" class="empty">Không có chi tiết.</td>
      </tr>
    `;
    return;
  }

  $('logDetailsTbody').innerHTML = arr.map(item => `
    <tr>
      <td class="mono">${escapeHtml(item.masp || '')}</td>
      <td>${escapeHtml(item.tensp || '')}</td>
      <td>${escapeHtml(item.size || '')}</td>
      <td>${escapeHtml(item.soluong ?? item.sl ?? '')}</td>
      <td>${escapeHtml(item.gia ?? '')}</td>
      <td>${escapeHtml(item.km ?? '')}</td>
      <td>${escapeHtml(item.thanhtien ?? '')}</td>
      <td>${escapeHtml(item.ketqua || '')}</td>
      <td>${escapeHtml(formatDateTime(item.created_at || ''))}</td>
      <td>${escapeHtml(formatDateTime(item.updated_at || ''))}</td>
    </tr>
  `).join('');
}

function openLogModal(row) {
  $('logMeta').innerHTML = `
    <div class="meta-grid">
      <div class="k">ID</div>
      <div class="v">${row.id ?? ''}</div>

      <div class="k">logged_at</div>
      <div class="v">${formatDateTime(row.logged_at)}</div>

      <div class="k">sohd</div>
      <div class="v mono">${escapeHtml(row.sohd)}</div>

      <div class="k">table_name</div>
      <div class="v">${escapeHtml(row.table_name || '')}</div>

      <div class="k">row_id</div>
      <div class="v">${row.row_id ?? ''}</div>

      <div class="k">action</div>
      <div class="v">${escapeHtml(row.action || '')}</div>

      <div class="k">source</div>
      <div class="v">${escapeHtml(row.source || '')}</div>
    </div>
  `;

  $('logDiff').textContent = formatJson(row.diff || {});
  renderLogDetailsTable(extractLogDetailRows(row.diff || {}));
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

  $('btnTim').onclick = () => {
    if (isLoading) return;
    loadData();
  };

  $('btnLamMoi').onclick = () => {
    if (isLoading) return;
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
  try {
    bindModalClose();
    bindEvents();
    setDefaultDates();
    toggleRestoreNewSohd();
    ensureStatusBox();

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    debugLog('supabase session check', {
      hasError: !!sessionError,
      hasSession: !!sessionData?.session,
      userId: sessionData?.session?.user?.id || null,
      email: sessionData?.session?.user?.email || null
    });

    await loadData();
  } catch (err) {
    console.error(err);
    alert('❌ Khởi tạo trang lịch sử chứng từ thất bại.');
  }
}

init();
