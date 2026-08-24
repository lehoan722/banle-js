import { supabase } from './supabaseClient.js';
import { playSuccessBeep, playAlertBeep, setupBeepUnlockOnce } from './soundBeep.js';
import { khoiTaoDangNhapDungChung } from './authModule.js';

window.supabase = supabase;

// Dữ liệu FORM trong CSDL chỉ chấp nhận đúng 3 giá trị viết hoa: BO / VUA / RONG
const VALID_FORM = ['BO', 'VUA', 'RONG'];
const VALID_RONG_ONG = ['16', '18', '20', '22'];
const VALID_CO_GIAN = ['CO', 'KHONG'];

let rows = [];
let selectedIndex = -1;
let productSuggestData = [];
let isProcessingMasp = false;

const maspInput = document.getElementById('maspInput');
const formInput = document.getElementById('formInput');
const rongOngInput = document.getElementById('rongOngInput');
const coGianInput = document.getElementById('coGianInput');
const maspSuggestBox = document.getElementById('maspSuggestBox');
const resultBody = document.getElementById('resultBody');
const messageEl = document.getElementById('message');

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

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeForm(value) {
  return String(value || '').trim().toUpperCase();
}

function isMaspDuplicated(masp) {
  return rows.some(r => normalizeText(r.masp) === normalizeText(masp));
}

function resetMaspOnly() {
  maspInput.value = '';
  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';
  showMessage('');
  setTimeout(() => maspInput.focus(), 30);
}

function resetInputOnly() {
  maspInput.value = '';
  formInput.value = '';
  rongOngInput.value = '';
  coGianInput.value = '';
  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';
  showMessage('');
  setTimeout(() => maspInput.focus(), 50);
}

function resetAll() {
  rows = [];
  selectedIndex = -1;
  renderTable();
  resetInputOnly();
}

function validateMasp() {
  const masp = normalizeText(maspInput.value);
  if (!masp) {
    showMessage('Bạn chưa nhập mã sản phẩm.');
    maspInput.focus();
    return false;
  }
  maspInput.value = masp;
  return true;
}

function validateForm() {
  const value = normalizeForm(formInput.value);

  if (!value) {
    showMessage('Bạn bắt buộc phải chọn Form trước khi đưa sản phẩm xuống bảng.');
    formInput.focus();
    return false;
  }

  if (!VALID_FORM.includes(value)) {
    showMessage('Form chỉ được chọn: Bó / Vừa / Rộng.');
    formInput.focus();
    return false;
  }

  // Giữ đúng giá trị chuẩn trong CSDL: BO / VUA / RONG
  formInput.value = value;
  return true;
}

function validateRongOng() {
  const value = String(rongOngInput.value || '').trim();
  if (!value) return true;

  if (!VALID_RONG_ONG.includes(value)) {
    showMessage('Rộng ống chỉ được chọn: 16 / 18 / 20 / 22.');
    rongOngInput.focus();
    return false;
  }
  return true;
}

function validateCoGian() {
  const value = normalizeText(coGianInput.value);
  if (!value) return true;

  if (!VALID_CO_GIAN.includes(value)) {
    showMessage('Co giãn chỉ được chọn: Có / Không.');
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
    showMessage('Lỗi kiểm tra mã sản phẩm.');
    return false;
  }

  if (!data) {
    showMessage(`Mã sản phẩm ${masp} chưa có trong danh mục hàng hóa.`);
    return false;
  }

  return true;
}

function addCurrentRow() {
  if (!validateMasp()) return false;

  if (isMaspDuplicated(maspInput.value)) {
    showMessage(`Mã sản phẩm ${maspInput.value} đã tồn tại trong bảng kết quả.`);
    void playTripleAlertBeep();
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
    co_gian: normalizeText(coGianInput.value)
  };

  rows.push(row);
  selectedIndex = rows.length - 1;
  renderTable();
  playInsertedBeep();

  // Sau khi thêm chỉ xóa Mã SP.
  // Form / Rộng ống / Co giãn được giữ nguyên để quét liên tục.
  resetMaspOnly();
  return true;
}

async function processCurrentMasp() {
  if (isProcessingMasp) return;

  // QUAN TRỌNG: tuyệt đối không reset Form / Rộng ống / Co giãn trong luồng Enter.
  if (!validateMasp()) return;

  if (isMaspDuplicated(maspInput.value)) {
    maspSuggestBox.style.display = 'none';
    maspSuggestBox.innerHTML = '';
    showMessage(`Mã sản phẩm ${maspInput.value} đã tồn tại trong bảng kết quả.`);
    await playTripleAlertBeep();
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
  } finally {
    isProcessingMasp = false;
  }
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

function renderTable() {
  resultBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (index === selectedIndex) tr.classList.add('selected');
    if (row.saveStatus === 'skipped') tr.classList.add('row-skipped');

    tr.innerHTML = `
      <td>${row.masp}</td>
      <td>${displayForm(row.form)}</td>
      <td>${row.rong_ong || ''}</td>
      <td>${displayCoGian(row.co_gian)}</td>
    `;

    tr.addEventListener('click', () => {
      selectedIndex = index;
      renderTable();
    });

    resultBody.appendChild(tr);
  });
}

async function searchProducts(keyword) {
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
    <div class="suggest-item" data-masp="${sp.masp}">
      <b>${sp.masp}</b><br>
      <span>${sp.tensp || ''}</span>
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
  if (!rows.length) {
    showMessage('Chưa có dòng nào để lưu.');
    return;
  }

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Mỗi lần bấm Lưu sẽ tính lại trạng thái của toàn bộ dòng.
  // Chỉ những dòng thực sự bị bỏ qua mới được đánh dấu đỏ.
  rows.forEach(row => { row.saveStatus = ''; });

  for (const row of rows) {
    const { data: current, error: readError } = await supabase
      .from('dmhanghoa')
      .select('masp, form, rong_ong, co_gian')
      .eq('masp', row.masp)
      .maybeSingle();

    if (readError || !current) {
      console.error(readError);
      errorCount++;
      continue;
    }

    const updateData = {};

    // Chỉ ghi khi dữ liệu hiện tại đang trống; tuyệt đối không ghi đè.
    if ((current.form === null || current.form === '') && row.form) {
      updateData.form = row.form; // BO / VUA / RONG
    }

    if ((current.rong_ong === null || current.rong_ong === '') && row.rong_ong) {
      updateData.rong_ong = Number(row.rong_ong);
    }

    if ((current.co_gian === null || current.co_gian === '') && row.co_gian) {
      updateData.co_gian = row.co_gian;
    }

    if (!Object.keys(updateData).length) {
      row.saveStatus = 'skipped';
      skippedCount++;
      continue;
    }

    const { error: updateError } = await supabase
      .from('dmhanghoa')
      .update(updateData)
      .eq('masp', row.masp);

    if (updateError) {
      console.error(updateError);
      errorCount++;
    } else {
      updatedCount++;
    }
  }

  // Render lại sau khi lưu để các dòng bị bỏ qua hiện màu đỏ ngay.
  renderTable();

  showMessage(
    `Đã lưu xong. Cập nhật: ${updatedCount}, bỏ qua: ${skippedCount}, lỗi: ${errorCount}.`,
    errorCount === 0
  );
}

maspInput.addEventListener('input', async () => {
  await searchProducts(maspInput.value);
});

maspInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  await processCurrentMasp();
});

// Nếu đã nhập Mã SP nhưng quên chọn Form: sau khi chọn Form, nhấn Enter
// sẽ xử lý luôn chính Mã SP đang nằm trong ô, KHÔNG xóa Form.
formInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (normalizeText(maspInput.value)) {
    await processCurrentMasp();
  } else {
    maspInput.focus();
  }
});

// Rộng ống / Co giãn cũng hỗ trợ Enter tương tự để thao tác bằng bàn phím nhanh.
[rongOngInput, coGianInput].forEach(el => {
  el.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (normalizeText(maspInput.value)) {
      await processCurrentMasp();
    } else {
      maspInput.focus();
    }
  });
});

document.getElementById('btnThemMoi').addEventListener('click', resetAll);

document.getElementById('btnXoaDong').addEventListener('click', () => {
  if (selectedIndex < 0 || selectedIndex >= rows.length) {
    showMessage('Bạn chưa chọn dòng cần xóa.');
    return;
  }

  rows.splice(selectedIndex, 1);
  selectedIndex = -1;
  renderTable();
  showMessage('Đã xóa dòng.', true);
});

document.getElementById('btnLuu').addEventListener('click', saveRows);

document.addEventListener('click', (e) => {
  if (!maspSuggestBox.contains(e.target) && e.target !== maspInput) {
    maspSuggestBox.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  try { setupBeepUnlockOnce(document); } catch (_) {}

  khoiTaoDangNhapDungChung({
    appContainerId: 'app-container',
    macDinhDiaDiem: 'cs1',
    tuDongKhoaCoSo: true,
    loginApiPath: '/api/login-cs1',
    onLoginSuccess: async () => {
      setTimeout(() => maspInput.focus(), 100);
    }
  });
});

document.getElementById('btnOk').addEventListener('click', async () => {
  await processCurrentMasp();
});

document.getElementById('btnCopy').addEventListener('click', async () => {
  if (!rows.length) {
    showMessage('Chưa có dữ liệu để copy.');
    return;
  }

  const lines = [
    ['Mã SP', 'Form', 'Rộng ống', 'Co giãn'].join('\t'),
    ...rows.map(r => [
      r.masp || '',
      r.form || '',
      r.rong_ong || '',
      r.co_gian || ''
    ].join('\t'))
  ];

  const text = lines.join('\n');

  try {
    await navigator.clipboard.writeText(text);
    showMessage('Đã copy dữ liệu. Bạn có thể dán vào Google Sheet hoặc Excel.', true);
  } catch (e) {
    console.error(e);
    showMessage('Không copy được. Trình duyệt không cho phép clipboard.');
  }
});
