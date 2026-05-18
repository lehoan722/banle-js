import { supabase } from './supabaseClient.js';
import { khoiTaoDangNhapDungChung } from './authModule.js';

window.supabase = supabase;

const VALID_FORM = ['SLIM', 'REGULAR', 'WIDE'];
const VALID_RONG_ONG = ['16', '18', '20', '22'];
const VALID_CO_GIAN = ['CO', 'KHONG'];

let rows = [];
let selectedIndex = -1;
let productSuggestData = [];

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

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function resetInputOnly() {
  maspInput.value = '';
  formInput.value = '';
  rongOngInput.value = '';
  coGianInput.value = '';
  maspSuggestBox.style.display = 'none';
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
  const value = normalizeText(formInput.value);
  if (!value) {
    formInput.value = '';
    return true;
  }
  if (!VALID_FORM.includes(value)) {
    showMessage('Form chỉ được nhập: SLIM / REGULAR / WIDE.');
    formInput.focus();
    formInput.select();
    return false;
  }
  formInput.value = value;
  return true;
}

function validateRongOng() {
  const value = normalizeText(rongOngInput.value);
  if (!value) {
    rongOngInput.value = '';
    return true;
  }
  if (!VALID_RONG_ONG.includes(value)) {
    showMessage('Rộng ống chỉ được nhập: 16 / 18 / 20 / 22.');
    rongOngInput.focus();
    rongOngInput.select();
    return false;
  }
  rongOngInput.value = value;
  return true;
}

function validateCoGian() {
  const value = normalizeText(coGianInput.value);
  if (!value) {
    coGianInput.value = '';
    return true;
  }
  if (!VALID_CO_GIAN.includes(value)) {
    showMessage('Co giãn chỉ được nhập: CO / KHONG.');
    coGianInput.focus();
    coGianInput.select();
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
  if (!validateMasp()) return;
  if (!validateForm()) return;
  if (!validateRongOng()) return;
  if (!validateCoGian()) return;

  const row = {
    masp: normalizeText(maspInput.value),
    form: normalizeText(formInput.value),
    rong_ong: normalizeText(rongOngInput.value),
    co_gian: normalizeText(coGianInput.value)
  };

  if (!row.form && !row.rong_ong && !row.co_gian) {
    showMessage('Bạn chưa nhập thông số nào để ghi.');
    return;
  }

  rows.push(row);
  selectedIndex = rows.length - 1;
  renderTable();
  resetInputOnly();
}

function renderTable() {
  resultBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    if (index === selectedIndex) tr.classList.add('selected');

    tr.innerHTML = `
            <td>${row.masp}</td>
            <td>${row.form || ''}</td>
            <td>${row.rong_ong || ''}</td>
            <td>${row.co_gian || ''}</td>
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
      setTimeout(() => formInput.focus(), 50);
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

    if ((current.form === null || current.form === '') && row.form) {
      updateData.form = row.form;
    }

    if ((current.rong_ong === null || current.rong_ong === '') && row.rong_ong) {
      updateData.rong_ong = Number(row.rong_ong);
    }

    if ((current.co_gian === null || current.co_gian === '') && row.co_gian) {
      updateData.co_gian = row.co_gian;
    }

    if (!Object.keys(updateData).length) {
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

  if (!validateMasp()) return;

  maspSuggestBox.style.display = 'none';
  maspSuggestBox.innerHTML = '';

  const exists = await checkMaspExists(maspInput.value);
  if (!exists) {
    maspInput.focus();
    maspInput.select();
    return;
  }

  maspSuggestBox.style.display = 'none';
  formInput.focus();
});

formInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!validateForm()) return;
  showMessage('');
  rongOngInput.focus();
  rongOngInput.select();
});

rongOngInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!validateRongOng()) return;
  showMessage('');
  coGianInput.focus();
  coGianInput.select();
});

coGianInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  e.preventDefault();

  if (!validateCoGian()) return;
  addCurrentRow();
});

coGianInput.addEventListener('change', () => {
  if (!coGianInput.value) return;
  addCurrentRow();
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

document.getElementById('btnOk').addEventListener('click', () => {
  addCurrentRow();
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
