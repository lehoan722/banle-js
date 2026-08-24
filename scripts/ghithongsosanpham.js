import { supabase } from './supabaseClient.js';
import { playSuccessBeep, playAlertBeep, setupBeepUnlockOnce } from './soundBeep.js';
import { khoiTaoDangNhapDungChung } from './authModule.js';

window.supabase = supabase;

const VALID_FORM = ['BO', 'VUA', 'RONG'];
const VALID_RONG_ONG = ['16', '18', '20', '22'];
const VALID_CO_GIAN = ['CO', 'KHONG'];

let rows = [];
let selectedIndex = -1;
let productSuggestData = [];
let isProcessingMasp = false;
let currentManv = '';
let currentTenNv = '';
let currentCoSo = 'cs1';
let viewingHistory = false;
let currentHistorySession = null;
let batchSaved = false;
let stockQuickLoadPromise = null;

const maspInput = document.getElementById('maspInput');
const formInput = document.getElementById('formInput');
const rongOngInput = document.getElementById('rongOngInput');
const coGianInput = document.getElementById('coGianInput');
const maspSuggestBox = document.getElementById('maspSuggestBox');
const resultBody = document.getElementById('resultBody');
const messageEl = document.getElementById('message');
const btnOk = document.getElementById('btnOk');
const btnThemMoi = document.getElementById('btnThemMoi');
const btnLuu = document.getElementById('btnLuu');
const btnCopy = document.getElementById('btnCopy');
const btnXoaDong = document.getElementById('btnXoaDong');
const btnTaiDuLieu = document.getElementById('btnTaiDuLieu');
const historyModal = document.getElementById('historyModal');
const historyBody = document.getElementById('historyBody');
const historyDate = document.getElementById('historyDate');
const historyEmployee = document.getElementById('historyEmployee');
const historyStatus = document.getElementById('historyStatus');

function showMessage(msg, isOk = false) {
  messageEl.style.color = isOk ? '#168a2f' : '#d63333';
  messageEl.textContent = msg || '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playTripleAlertBeep() {
  for (let i = 0; i < 3; i++) {
    try { playAlertBeep(); } catch (_) {}
    if (i < 2) await sleep(300);
  }
}

function playInsertedBeep() {
  try { playSuccessBeep(); } catch (_) {}
}

function showError(msg) {
  showMessage(msg, false);
  void playTripleAlertBeep();
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeForm(value) {
  return String(value || '').trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function displayForm(value) {
  const v = normalizeForm(value);
  if (v === 'BO') return 'Bó';
  if (v === 'VUA') return 'Vừa';
  if (v === 'RONG') return 'Rộng';
  return value || '';
}

function displayCoGian(value) {
  const v = normalizeText(value);
  if (v === 'CO') return 'Có';
  if (v === 'KHONG') return 'Không';
  return value || '';
}

function isMaspDuplicated(masp) {
  return rows.some(r => normalizeText(r.masp) === normalizeText(masp));
}

function updateUiMode() {
  const locked = viewingHistory || batchSaved;
  maspInput.disabled = locked;
  formInput.disabled = locked;
  rongOngInput.disabled = locked;
  coGianInput.disabled = locked;
  btnOk.disabled = locked;
  btnLuu.disabled = locked || !rows.length;
  btnXoaDong.disabled = locked;

  const badge = document.getElementById('modeBadge');
  if (viewingHistory) {
    badge.textContent = `ĐANG XEM LẠI ${currentHistorySession?.ma_phien || ''}`.trim();
    badge.className = 'mode-badge history';
  } else if (batchSaved) {
    badge.textContent = 'ĐÃ LƯU - BẤM THÊM MỚI ĐỂ NHẬP TIẾP';
    badge.className = 'mode-badge saved';
  } else {
    badge.textContent = 'ĐANG NHẬP';
    badge.className = 'mode-badge entry';
  }
}

function resetMaspOnly() {
  maspInput.value = '';
  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';
  showMessage('');
  if (!viewingHistory && !batchSaved) setTimeout(() => maspInput.focus(), 30);
}

function resetInputOnly() {
  maspInput.value = '';
  formInput.value = '';
  rongOngInput.value = '';
  coGianInput.value = '';
  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';
  showMessage('');
  if (!viewingHistory && !batchSaved) setTimeout(() => maspInput.focus(), 50);
}

function resetAll() {
  rows = [];
  selectedIndex = -1;
  viewingHistory = false;
  currentHistorySession = null;
  batchSaved = false;
  renderTable();
  resetInputOnly();
  updateUiMode();
}

function validateMasp() {
  const masp = normalizeText(maspInput.value);
  if (!masp) {
    showError('Bạn chưa nhập mã sản phẩm.');
    maspInput.focus();
    return false;
  }
  maspInput.value = masp;
  return true;
}

function validateForm() {
  const value = normalizeForm(formInput.value);
  if (!value) {
    showError('Bạn bắt buộc phải chọn Form trước khi đưa sản phẩm xuống bảng.');
    formInput.focus();
    return false;
  }
  if (!VALID_FORM.includes(value)) {
    showError('Form chỉ được chọn: Bó / Vừa / Rộng.');
    formInput.focus();
    return false;
  }
  formInput.value = value;
  return true;
}

function validateRongOng() {
  const value = String(rongOngInput.value || '').trim();
  if (!value) return true;
  if (!VALID_RONG_ONG.includes(value)) {
    showError('Rộng ống chỉ được chọn: 16 / 18 / 20 / 22.');
    rongOngInput.focus();
    return false;
  }
  return true;
}

function validateCoGian() {
  const value = normalizeText(coGianInput.value);
  if (!value) return true;
  if (!VALID_CO_GIAN.includes(value)) {
    showError('Co giãn chỉ được chọn: Có / Không.');
    coGianInput.focus();
    return false;
  }
  coGianInput.value = value;
  return true;
}

async function checkMaspExists(masp) {
  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp')
    .eq('masp', masp)
    .maybeSingle();

  if (error) {
    console.error(error);
    showError('Lỗi kiểm tra mã sản phẩm.');
    return false;
  }
  if (!data) {
    showError(`Mã sản phẩm ${masp} chưa có trong danh mục hàng hóa.`);
    return false;
  }
  return true;
}

function addCurrentRow() {
  if (!validateMasp()) return false;
  if (isMaspDuplicated(maspInput.value)) {
    showError(`Mã sản phẩm ${maspInput.value} đã tồn tại trong bảng kết quả.`);
    maspInput.focus();
    maspInput.select();
    return false;
  }
  if (!validateForm()) return false;
  if (!validateRongOng()) return false;
  if (!validateCoGian()) return false;

  const row = {
    masp: normalizeText(maspInput.value),
    form: normalizeForm(formInput.value),
    rong_ong: String(rongOngInput.value || '').trim(),
    co_gian: normalizeText(coGianInput.value),
    saveStatus: ''
  };

  rows.push(row);
  selectedIndex = rows.length - 1;
  renderTable();
  updateUiMode();
  playInsertedBeep();
  resetMaspOnly();
  return true;
}

async function processCurrentMasp() {
  if (isProcessingMasp || viewingHistory || batchSaved) return;
  if (!validateMasp()) return;

  if (isMaspDuplicated(maspInput.value)) {
    maspSuggestBox.style.display = 'none';
    maspSuggestBox.innerHTML = '';
    showError(`Mã sản phẩm ${maspInput.value} đã tồn tại trong bảng kết quả.`);
    maspInput.focus();
    maspInput.select();
    return;
  }

  if (!validateForm()) return;
  if (!validateRongOng()) return;
  if (!validateCoGian()) return;

  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';
  const masp = normalizeText(maspInput.value);

  isProcessingMasp = true;
  try {
    const exists = await checkMaspExists(masp);
    if (!exists) {
      maspInput.focus();
      maspInput.select();
      return;
    }
    addCurrentRow();
  } catch (err) {
    console.error(err);
    showError(`Không xử lý được mã ${masp}: ${err.message || err}`);
  } finally {
    isProcessingMasp = false;
  }
}

async function ensureStockQuickPopup() {
  if (typeof window.stockQuickPopup === 'function') return true;
  if (!stockQuickLoadPromise) {
    stockQuickLoadPromise = import('./stockQuickPopup.js')
      .catch((err) => {
        console.error('Không tải được stockQuickPopup.js:', err);
        return null;
      });
  }
  await stockQuickLoadPromise;
  return typeof window.stockQuickPopup === 'function';
}

async function openStockQuick(masp) {
  const ok = await ensureStockQuickPopup();
  if (!ok) {
    showError('StockQuickPopup chưa sẵn sàng. Kiểm tra file scripts/stockQuickPopup.js.');
    return;
  }
  try {
    window.stockQuickPopup(normalizeText(masp));
  } catch (err) {
    console.error(err);
    showError(`Không mở được thông tin nhanh của ${masp}.`);
  }
}

function renderTable() {
  resultBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (index === selectedIndex) tr.classList.add('selected');
    if (row.saveStatus === 'skipped') tr.classList.add('row-skipped');
    if (row.saveStatus === 'error') tr.classList.add('row-error');

    tr.innerHTML = `
      <td class="masp-cell" title="Bấm để xem thông tin nhanh">${escapeHtml(row.masp)}</td>
      <td>${escapeHtml(displayForm(row.form))}</td>
      <td>${escapeHtml(row.rong_ong || '')}</td>
      <td>${escapeHtml(displayCoGian(row.co_gian))}</td>
    `;

    tr.addEventListener('click', () => {
      selectedIndex = index;
      renderTable();
    });

    tr.querySelector('.masp-cell').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedIndex = index;
      renderTable();
      void openStockQuick(row.masp);
    });

    resultBody.appendChild(tr);
  });
}

async function searchProducts(keyword) {
  if (viewingHistory || batchSaved) return;
  const key = normalizeText(keyword);
  if (!key) {
    maspSuggestBox.style.display = 'none';
    return;
  }

  const { data, error } = await supabase
    .from('dmhanghoa')
    .select('masp, tensp')
    .or(`masp.ilike.%${key}%,tensp.ilike.%${key}%`)
    .order('masp')
    .limit(20);

  if (error) {
    console.error(error);
    return;
  }

  productSuggestData = data || [];
  renderSuggest();
}

function renderSuggest() {
  if (!productSuggestData.length) {
    maspSuggestBox.style.display = 'none';
    return;
  }

  maspSuggestBox.innerHTML = productSuggestData.map(sp => `
    <div class="suggest-item" data-masp="${escapeHtml(sp.masp)}">
      <b>${escapeHtml(sp.masp)}</b><br>
      <span>${escapeHtml(sp.tensp || '')}</span>
    </div>
  `).join('');

  maspSuggestBox.style.display = 'block';
  maspSuggestBox.querySelectorAll('.suggest-item').forEach(item => {
    item.addEventListener('mousedown', () => {
      maspInput.value = item.dataset.masp || '';
      maspSuggestBox.style.display = 'none';
      maspSuggestBox.innerHTML = '';
      setTimeout(() => maspInput.focus(), 30);
    });
  });
}

async function saveRows() {
  if (viewingHistory) {
    showError('Bạn đang xem lại phiên cũ. Bấm Thêm mới để bắt đầu nhập dữ liệu mới.');
    return;
  }
  if (batchSaved) {
    showError('Danh sách này đã được lưu. Bấm Thêm mới để tạo đợt nhập tiếp theo.');
    return;
  }
  if (!rows.length) {
    showError('Chưa có dòng nào để lưu.');
    return;
  }

  btnLuu.disabled = true;
  showMessage('Đang lưu danh mục hàng hóa và lịch sử phiên...');

  try {
    const payloadRows = rows.map(r => ({
      masp: r.masp,
      form: r.form,
      rong_ong: r.rong_ong || '',
      co_gian: r.co_gian || ''
    }));

    const { data, error } = await supabase.rpc('gts_save_session', {
      p_coso: currentCoSo || 'cs1',
      p_manv: currentManv || '',
      p_tennv: currentTenNv || '',
      p_rows: payloadRows
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const resultRows = Array.isArray(result?.results) ? result.results : [];
    const statusQueues = new Map();

    resultRows.forEach(r => {
      const key = normalizeText(r.masp);
      if (!statusQueues.has(key)) statusQueues.set(key, []);
      statusQueues.get(key).push(r.ket_qua);
    });

    rows.forEach(row => {
      const queue = statusQueues.get(normalizeText(row.masp)) || [];
      const status = queue.shift() || '';
      row.saveStatus = status === 'BO_QUA' ? 'skipped' : status === 'LOI' ? 'error' : 'saved';
    });

    batchSaved = true;
    selectedIndex = -1;
    renderTable();
    updateUiMode();

    showMessage(
      `Đã lưu phiên ${result?.ma_phien || ''}. Cập nhật: ${Number(result?.cap_nhat || 0)}, bỏ qua: ${Number(result?.bo_qua || 0)}, lỗi: ${Number(result?.loi || 0)}.`,
      Number(result?.loi || 0) === 0
    );
  } catch (err) {
    console.error(err);
    btnLuu.disabled = false;
    showError(`Lưu dữ liệu thất bại: ${err.message || err}`);
  }
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return String(value);
  }
}

function openHistoryModal() {
  historyModal.classList.add('show');
  loadHistorySessions();
}

function closeHistoryModal() {
  historyModal.classList.remove('show');
}

async function loadHistorySessions() {
  historyStatus.textContent = 'Đang tải dữ liệu...';
  historyBody.innerHTML = '';

  try {
    let query = supabase
      .from('ghithongso_phien')
      .select('id, ma_phien, coso, manv, tennv, tong_dong, cap_nhat, bo_qua, loi, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const dateValue = historyDate.value;
    if (dateValue) {
      const start = new Date(`${dateValue}T00:00:00`);
      const end = new Date(`${dateValue}T23:59:59.999`);
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const employeeKey = String(historyEmployee.value || '').trim().toLowerCase();
    const filtered = (data || []).filter(s => {
      if (!employeeKey) return true;
      return String(s.manv || '').toLowerCase().includes(employeeKey)
        || String(s.tennv || '').toLowerCase().includes(employeeKey);
    });

    if (!filtered.length) {
      historyStatus.textContent = 'Không có phiên phù hợp.';
      return;
    }

    historyStatus.textContent = `Tìm thấy ${filtered.length} phiên. Bấm vào một dòng để xem lại.`;

    filtered.forEach(session => {
      const tr = document.createElement('tr');
      tr.className = 'history-row';
      tr.innerHTML = `
        <td>${escapeHtml(session.ma_phien || '')}</td>
        <td>${escapeHtml(formatDateTime(session.created_at))}</td>
        <td>${escapeHtml([session.manv, session.tennv].filter(Boolean).join(' - '))}</td>
        <td>${Number(session.tong_dong || 0)}</td>
        <td>${Number(session.cap_nhat || 0)}</td>
        <td class="skip-number">${Number(session.bo_qua || 0)}</td>
        <td>${Number(session.loi || 0)}</td>
      `;
      tr.addEventListener('click', () => loadHistorySession(session));
      historyBody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    historyStatus.textContent = 'Không tải được lịch sử.';
    showError(`Không tải được lịch sử ghi thông số: ${err.message || err}`);
  }
}

async function loadHistorySession(session) {
  try {
    historyStatus.textContent = `Đang tải ${session.ma_phien}...`;
    const { data, error } = await supabase
      .from('ghithongso_chitiet')
      .select('id, masp, form, rong_ong, co_gian, ket_qua, manv, created_at')
      .eq('session_id', session.id)
      .order('id', { ascending: true });

    if (error) throw error;

    rows = (data || []).map(r => ({
      masp: r.masp,
      form: r.form || '',
      rong_ong: r.rong_ong == null ? '' : String(r.rong_ong),
      co_gian: r.co_gian || '',
      saveStatus: r.ket_qua === 'BO_QUA' ? 'skipped' : r.ket_qua === 'LOI' ? 'error' : 'saved'
    }));

    selectedIndex = -1;
    viewingHistory = true;
    currentHistorySession = session;
    batchSaved = false;
    renderTable();
    updateUiMode();
    closeHistoryModal();
    showMessage(
      `Đang xem lại ${session.ma_phien} · ${formatDateTime(session.created_at)} · ${session.manv || ''}${session.tennv ? ' - ' + session.tennv : ''} · ${rows.length} dòng.`,
      true
    );
  } catch (err) {
    console.error(err);
    showError(`Không tải được chi tiết phiên: ${err.message || err}`);
  }
}

maspInput.addEventListener('input', async () => {
  await searchProducts(maspInput.value);
});

maspInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  await processCurrentMasp();
});

formInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (normalizeText(maspInput.value)) await processCurrentMasp();
  else maspInput.focus();
});

[rongOngInput, coGianInput].forEach(el => {
  el.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (normalizeText(maspInput.value)) await processCurrentMasp();
    else maspInput.focus();
  });
});

btnThemMoi.addEventListener('click', resetAll);

btnXoaDong.addEventListener('click', () => {
  if (viewingHistory || batchSaved) {
    showError('Dữ liệu đang ở chế độ chỉ xem, không thể xóa dòng.');
    return;
  }
  if (selectedIndex < 0 || selectedIndex >= rows.length) {
    showError('Bạn chưa chọn dòng cần xóa.');
    return;
  }
  rows.splice(selectedIndex, 1);
  selectedIndex = -1;
  renderTable();
  updateUiMode();
  showMessage('Đã xóa dòng.', true);
});

btnLuu.addEventListener('click', saveRows);
btnTaiDuLieu.addEventListener('click', openHistoryModal);
document.getElementById('historyClose').addEventListener('click', closeHistoryModal);
document.getElementById('historySearch').addEventListener('click', loadHistorySessions);
document.getElementById('historyClearFilter').addEventListener('click', () => {
  historyDate.value = '';
  historyEmployee.value = '';
  loadHistorySessions();
});
historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) closeHistoryModal();
});
historyEmployee.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadHistorySessions();
  }
});

btnOk.addEventListener('click', async () => {
  await processCurrentMasp();
});

document.addEventListener('click', (e) => {
  if (!maspSuggestBox.contains(e.target) && e.target !== maspInput) {
    maspSuggestBox.style.display = 'none';
  }
});

btnCopy.addEventListener('click', async () => {
  if (!rows.length) {
    showError('Chưa có dữ liệu để copy.');
    return;
  }

  const lines = [
    ['Mã SP', 'Form', 'Rộng ống', 'Co giãn'].join('\t'),
    ...rows.map(r => [r.masp || '', r.form || '', r.rong_ong || '', r.co_gian || ''].join('\t'))
  ];

  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showMessage('Đã copy dữ liệu. Bạn có thể dán vào Google Sheet hoặc Excel.', true);
  } catch (e) {
    console.error(e);
    showError('Không copy được. Trình duyệt không cho phép clipboard.');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  try { setupBeepUnlockOnce(document); } catch (_) {}
  void ensureStockQuickPopup();

  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: async (nhanvien, context) => {
      currentManv = normalizeText(nhanvien?.manv || '');
      currentTenNv = String(nhanvien?.tennv || '').trim();
      currentCoSo = String(context?.diadiem || 'cs1').trim().toLowerCase();
      updateUiMode();
      setTimeout(() => maspInput.focus(), 100);
    }
  });
});

updateUiMode();
