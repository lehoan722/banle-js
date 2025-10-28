/** ========= CẤU HÌNH ========= **/
const IMG_BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
const SEARCH_PAGE = 'timkiemhanghoa222.html'; // mở tab mới với ?masp=...


// ==== Supabase client (giống xemhoadon111) ====
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** ========= TIỆN ÍCH ========= **/
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:10px 14px;border-radius:8px;
  color:#fff;z-index:5000;box-shadow:0 6px 18px rgba(0,0,0,.2);transition:opacity .2s;`;
  el.style.background = type === 'warn' ? '#e57373' : (type === 'ok' ? '#43a047' : '#1976d2');
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 1900);
}
function fmtDateInput(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

function getUser() {
  return {
    diadiem: localStorage.getItem('diadiem') || '',
    manv: localStorage.getItem('manv') || '',
    tennv: localStorage.getItem('tennv') || ''
  };
}

// Tách nhiều size trong "het_size" theo , . hoặc khoảng trắng; loại rỗng; giữ thứ tự
function parseHetSizesUI(raw) {
  if (!raw) return [];
  return String(raw)
    .replace(/[，。．｡]/g, ',')  // các dấu fullwidth -> phẩy
    .replace(/\./g, ',')        // chấm -> phẩy
    .split(/[,\s]+/)            // tách theo phẩy hoặc khoảng trắng
    .map(s => s.trim())
    .filter(Boolean);
}

// Nổ nhiều dòng theo het_size
function explodeRowsByHetSize(rows) {
  const out = [];
  for (const r of rows) {
    const list = parseHetSizesUI(r.het_size);
    if (list.length <= 1) {
      out.push(r);
    } else {
      for (const sz of list) out.push({ ...r, het_size: sz });
    }
  }
  return out;
}


/** ========= STATE ========= **/
let hot = null;
let originalRows = [];
let currentRows = [];

/** ========= ĐĂNG NHẬP (giống trang bán lẻ) ========= **/
const EMAIL_MAP = { cs1: 'khohangcs1@gmail.com', cs2: 'khohangcs2@gmail.com' };

async function doLogin() {
  const csSel = document.getElementById('login-cs').value;
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const manv = document.getElementById('login-manv').value.trim().toUpperCase();
  const pass = document.getElementById('login-password').value.trim();
  const msgEl = document.getElementById('loginMsg');

  if (!email || !pass || !manv) { msgEl.textContent = 'Vui lòng nhập đủ email, mật khẩu, mã NV'; return; }

  msgEl.textContent = 'Đang đăng nhập...';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) { msgEl.textContent = `❌ ${error.message}`; return; }

  // Tra bảng nhân viên lấy tên
  const { data: nv, error: e2 } = await supabase.from('dmnhanvien').select('manv, tennv').eq('manv', manv).limit(1);
  if (e2 || !nv || !nv.length) { msgEl.textContent = '❌ Mã NV không hợp lệ'; return; }

  localStorage.setItem('diadiem', csSel);
  localStorage.setItem('manv', nv[0].manv);
  localStorage.setItem('tennv', nv[0].tennv);

  // đồng bộ email gợi ý theo cơ sở lần sau
  if (EMAIL_MAP[csSel]) document.getElementById('login-email').value = EMAIL_MAP[csSel];

  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appRoot').style.display = '';
  initPage(); // khởi tạo bộ lọc & load dữ liệu
}

function ensureLogin() {
  const { diadiem, manv, tennv } = getUser();
  if (diadiem && manv && tennv) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appRoot').style.display = '';
    initPage();
  } else {
    // gợi ý email theo cơ sở
    const csEl = document.getElementById('login-cs');
    const emailEl = document.getElementById('login-email');
    csEl.addEventListener('change', () => {
      const m = EMAIL_MAP[csEl.value]; if (m) emailEl.value = m;
    });
    const m = EMAIL_MAP[csEl.value]; if (m) emailEl.value = m;
    document.getElementById('btnLogin').addEventListener('click', doLogin);
    document.getElementById('loginOverlay').style.display = 'flex';
  }
}

/** ========= POPUP ẢNH ========= **/
function showImagePopup(masp) {
  const modal = document.getElementById('imgModal');
  document.getElementById('pimg').src = `${IMG_BASE}${encodeURIComponent(masp)}.JPG?t=${Date.now()}`;
  document.getElementById('cap').innerHTML =
    `Mã sản phẩm: <a class="link" target="_blank" href="${SEARCH_PAGE}?masp=${encodeURIComponent(masp)}">${masp}</a>`;
  modal.style.display = 'block';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}
document.getElementById('imgClose').addEventListener('click', () => {
  document.getElementById('imgModal').style.display = 'none';
});

function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ========= POPUP GALLERY ẢNH CHO TOÀN BỘ DÒNG ========= **/
const galleryModal = document.getElementById('galleryModal');
const galGrid = document.getElementById('galGrid');
const galSearch = document.getElementById('galSearch');
const btnShowGallery = document.getElementById('btnShowGallery');
const btnGalClose = document.getElementById('galClose');
const btnGalApply = document.getElementById('galApply');
const btnGalAllOK = document.getElementById('galAllOK');
const btnGalAllHET = document.getElementById('galAllHET');
const btnGalClear = document.getElementById('galClear');

function openGallery() {
  if (!currentRows || !currentRows.length) {
    showToast('⚠️ Chưa có dữ liệu để hiển thị ảnh', 'warn');
    return;
  }
  buildGalleryCards(currentRows);
  galleryModal.style.display = 'block';
}

function closeGallery() {
  galleryModal.style.display = 'none';
  galGrid.innerHTML = '';
  galSearch.value = '';
}

function buildGalleryCards(rows) {
  // rows: MỖI DÒNG LÀ MỘT THẺ ẢNH (không gom theo masp)
  galGrid.innerHTML = '';
  // giữ trật tự giống bảng: card nào -> dòng đó (match theo sohd)
  rows.forEach((r, idx) => {
    const sohd = r.sohd || '';
    const masp = r.masp || '';
    const trahang = (r.trahang || '').toUpperCase();

    const card = document.createElement('div');
    card.className = 'gitem';
    card.dataset.sohd = sohd;
    card.dataset.masp = masp;

    // khung ảnh
    const pic = document.createElement('div');
    pic.className = 'pic';

    const img = document.createElement('img');
    img.alt = masp;
    img.loading = 'lazy';
    img.src = `${IMG_BASE}${encodeURIComponent(masp)}.JPG?t=${Date.now()}`;
    img.onerror = () => {
      img.remove(); // bỏ img hỏng
      const ph = document.createElement('div');
      ph.style.cssText = 'padding:16px; text-align:center;';
      ph.innerHTML = '<div class="miss">⛔ Chưa có ảnh</div>';
      pic.appendChild(ph);
    };
    pic.appendChild(img);

    // caption + link (đổi theo yêu cầu)
    const cap = document.createElement('div');
    cap.className = 'cap';

    const mau = r.mau || '';
    const hetsize = r.het_size || '';
    const ghichu = r.ghichu || '';

    cap.innerHTML = `
  <div><b>Mã SP:</b> <a target="_blank" href="${SEARCH_PAGE}?masp=${encodeURIComponent(masp)}">${masp || '(trống)'}</a></div>
  <div><b>Màu:</b> ${escHtml(mau) || '—'}</div>
  <div><b>Hết size:</b> ${escHtml(hetsize) || '—'}</div>
  <div><b>Ghi chú:</b> ${escHtml(ghichu) || '—'}</div>
`;

    // lựa chọn OK / HET (mutually exclusive)
    const opts = document.createElement('div');
    opts.className = 'opts';
    // dùng radio theo từng card (name duy nhất ở từng card)
    const name = `opt_${idx}`;
    opts.innerHTML = `
      <label><input type="radio" name="${name}" value="OK"> OK</label>
      <label><input type="radio" name="${name}" value="HET"> HET</label>
      <label><input type="radio" name="${name}" value=""> Bỏ chọn</label>
    `;

    // set trạng thái ban đầu theo dòng
    setTimeout(() => {
      const radios = opts.querySelectorAll(`input[name="${name}"]`);
      if (trahang === 'OK') radios[0].checked = true;
      else if (trahang === 'HET') radios[1].checked = true;
      else radios[2].checked = true;
    });

    card.appendChild(pic);
    card.appendChild(cap);
    card.appendChild(opts);
    galGrid.appendChild(card);
  });
}

// lọc nhanh theo mã SP
galSearch.addEventListener('input', () => {
  const kw = galSearch.value.trim().toUpperCase();
  [...galGrid.children].forEach(card => {
    const masp = (card.dataset.masp || '').toUpperCase();
    card.style.display = !kw || masp.includes(kw) ? '' : 'none';
  });
});

// Tool chọn nhanh
btnGalAllOK.addEventListener('click', () => {
  [...galGrid.children].forEach((card, i) => {
    if (card.style.display === 'none') return;
    const name = `opt_${i}`;
    const r = card.querySelector(`input[name="${name}"][value="OK"]`);
    if (r) r.checked = true;
  });
});
btnGalAllHET.addEventListener('click', () => {
  [...galGrid.children].forEach((card, i) => {
    if (card.style.display === 'none') return;
    const name = `opt_${i}`;
    const r = card.querySelector(`input[name="${name}"][value="HET"]`);
    if (r) r.checked = true;
  });
});
btnGalClear.addEventListener('click', () => {
  [...galGrid.children].forEach((card, i) => {
    if (card.style.display === 'none') return;
    const name = `opt_${i}`;
    const r = card.querySelector(`input[name="${name}"][value=""]`);
    if (r) r.checked = true;
  });
});

// Áp lựa chọn → bảng (chỉ ghi vào lưới; lưu DB vẫn dùng nút LƯU DL)
btnGalApply.addEventListener('click', () => {
  if (!hot) return;
  const map = new Map(); // sohd -> 'OK'|'HET'|''

  [...galGrid.children].forEach((card, i) => {
    const sohd = card.dataset.sohd || '';
    const name = `opt_${i}`;
    const checked = card.querySelector(`input[name="${name}"]:checked`);
    const val = checked ? checked.value : '';
    if (sohd) map.set(sohd, val);
  });

  // Áp vào source data (match theo sohd, không đụng cột khác)
  const rows = hot.getSourceData();
  rows.forEach(r => {
    const v = map.get(r.sohd);
    if (typeof v !== 'undefined') {
      r.trahang = v || null; // '' -> null
    }
  });
  hot.loadData(rows); // refresh màu dòng
  closeGallery();
  showToast('Đã áp trạng thái lên bảng. Nhấn "LƯU DL" để ghi vào CSDL.', 'ok');
});

btnGalClose.addEventListener('click', closeGallery);
galleryModal.addEventListener('click', (e) => {
  if (e.target === galleryModal) closeGallery(); // click ra ngoài để đóng
});

// nút mở gallery
btnShowGallery.addEventListener('click', openGallery);


/** ========= HOT RENDERER ========= **/
function linkRenderer(instance, td, row, col, prop, value) {
  Handsontable.dom.empty(td);
  if (value) {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = value;
    a.className = 'link';
    a.addEventListener('click', (e) => { e.preventDefault(); showImagePopup(value); });
    td.appendChild(a);
  }
}

/** ========= LOAD DỮ LIỆU ========= **/
async function loadData() {
  const dia = document.getElementById('fDiaDiem').value;  // 'ALL'|'cs1'|'cs2'
  const d1 = document.getElementById('fFrom').value;     // 'YYYY-MM-DD'
  const d2 = document.getElementById('fTo').value;       // 'YYYY-MM-DD'
  const masp = document.getElementById('fMasp').value.trim();
  const nv = document.getElementById('fTennv').value.trim();
  const tt = document.getElementById('fTrangThai').value; // 'ALL'|'OK'|'HET'|'TRONG'

  document.getElementById('btnFilter').disabled = true;

  let q = supabase.from('dathang')
    .select('sohd,diadiem,masp,mau,con_size,het_size,trahang,tennv,ghichu,ngaygio,nvtrahang', { count: 'exact' })
    .gte('ngaygio', `${d1} 00:00:00`)
    .lte('ngaygio', `${d2} 23:59:59`)
    .order('ngaygio', { ascending: false });

  if (dia !== 'ALL') q = q.eq('diadiem', dia);
  if (masp) q = q.ilike('masp', `%${masp}%`);
  if (nv) q = q.ilike('tennv', `%${nv}%`);

  if (tt === 'OK' || tt === 'HET') q = q.eq('trahang', tt);
  if (tt === 'TRONG') q = q.or('trahang.is.null,trahang.eq.');

  document.getElementById('btnFilter').disabled = false;

  if (error) { showToast('❌ Lỗi tải dữ liệu', 'warn'); return; }

  // NỔ DÒNG theo het_size trước khi đẩy vào bảng
  const base = (data || []).map(r => ({ ...r }));
  const expanded = explodeRowsByHetSize(base);

  originalRows = expanded.map(r => ({ ...r }));
  currentRows = expanded.map(r => ({ ...r }));

  renderTable();

}

/** ========= HIỂN THỊ BẢNG ========= **/
function renderTable() {
  const gridEl = document.getElementById('grid');
  const columns = [
    { data: 'masp', renderer: linkRenderer, readOnly: true, width: 140 },
    { data: 'mau', readOnly: true, width: 90 },
    { data: 'con_size', readOnly: true, width: 180 },
    { data: 'het_size', readOnly: true, width: 180 },
    { data: 'trahang', type: 'dropdown', source: ['OK', 'HET'], strict: false, allowEmpty: true, width: 90 },
    { data: 'tennv', readOnly: true, width: 120 },        // người đặt
    { data: 'nvtrahang', readOnly: true, width: 130 },    // người trả (mới)
    { data: 'ghichu', readOnly: true, width: 160 },
    { data: 'ngaygio', readOnly: true, width: 160 },
    { data: 'sohd', readOnly: true, width: 160 },
  ];
  const colHeaders = ['ma sp', 'mau', 'con size', 'het size', 'tra hang', 'ten nv', 'nv trả', 'ghi chu', 'ngay gio', 'so hd'];

  if (hot) { hot.loadData(currentRows); return; }

  hot = new Handsontable(gridEl, {
    data: currentRows,
    columns, colHeaders, rowHeaders: true,
    width: '100%',
    height: 'calc(100vh - 240px)',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',
    cells: function (row) {
      const r = this.instance.getSourceDataAtRow(row);
      const cellProperties = {};
      if (r && r.trahang) {
        const v = String(r.trahang).toUpperCase();
        if (v === 'OK') cellProperties.className = 'row-ok';
        if (v === 'HET') cellProperties.className = 'row-het';
      }
      return cellProperties;
    },
    afterChange(changes, src) {
      if (!changes || src === 'loadData') return;
      currentRows = this.getSourceData();
    }
  });
}

/** ========= LƯU DỮ LIỆU (trahang + nvtrahang) ========= **/
/** ========= LƯU DỮ LIỆU (trahang + nvtrahang + diadiem) ========= **/
// ===== LƯU DỮ LIỆU: UPDATE theo sohd (không dùng upsert) =====
async function saveData() {
  if (!hot) return;
  const nowRows = hot.getSourceData();
  const oldMap = new Map(originalRows.map(r => [r.sohd, r.trahang || '']));

  const tennv = (localStorage.getItem('tennv') || '').trim();
  const diadiem = (localStorage.getItem('diadiem') || '').trim();
  if (!tennv || !diadiem) { showToast('⚠️ Chưa đăng nhập hoặc thiếu địa điểm', 'warn'); return; }

  const changed = [];
  for (const r of nowRows) {
    const sohd = (r.sohd || '').trim();
    if (!sohd) continue;

    const oldVal = (oldMap.get(sohd) ?? '').trim();
    let newVal = (r.trahang || '').trim().toUpperCase();
    if (newVal !== 'OK' && newVal !== 'HET') newVal = ''; // chuẩn hóa

    if (oldVal !== newVal) {
      changed.push({ sohd, trahang: newVal || null, nvtrahang: tennv, diadiem });
    }
  }
  if (!changed.length) { showToast('Không có gì để lưu'); return; }

  document.getElementById('btnSave').disabled = true;

  // UPDATE từng dòng theo sohd để không đụng NOT NULL các cột khác
  const results = await Promise.all(changed.map(u =>
    supabase.from('dathang')
      .update({ trahang: u.trahang, nvtrahang: u.nvtrahang, diadiem: u.diadiem })
      .eq('sohd', u.sohd)
  ));

  document.getElementById('btnSave').disabled = false;

  // kiểm tra lỗi nào (nếu có)
  const err = results.find(r => r.error);
  if (err) {
    console.error(err.error);
    showToast('❌ Lưu dữ liệu thất bại: ' + (err.error.message || ''), 'warn');
    return;
  }

  // cập nhật snapshot & cột nvtrahang trên UI
  for (const u of changed) {
    const i = originalRows.findIndex(x => x.sohd === u.sohd);
    if (i >= 0) { originalRows[i].trahang = u.trahang; originalRows[i].nvtrahang = u.nvtrahang; }
  }
  const cur = hot.getSourceData();
  for (const u of changed) {
    const i = cur.findIndex(x => x.sohd === u.sohd);
    if (i >= 0) cur[i].nvtrahang = u.nvtrahang;
  }
  hot.loadData(cur);

  showToast('✅ Lưu dữ liệu thành công', 'ok');
}

/** ========= INIT ========= **/
function initPage() {
  // mặc định 7 ngày gần nhất
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 7);
  document.getElementById('fFrom').value = fmtDateInput(from);
  document.getElementById('fTo').value = fmtDateInput(to);

  document.getElementById('btnFilter').addEventListener('click', loadData);
  document.getElementById('btnSave').addEventListener('click', saveData);
  ['fMasp', 'fTennv'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') loadData(); });
  });

  // gợi ý địa điểm theo login
  const { diadiem } = getUser();
  if (diadiem) document.getElementById('fDiaDiem').value = diadiem;

  loadData();
}

window.addEventListener('load', ensureLogin);
