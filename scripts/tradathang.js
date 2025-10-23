/** ========= CẤU HÌNH ========= **/
const IMG_BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
const SEARCH_PAGE = 'timkiemhanghoa222.html'; // mở tab mới với ?masp=...


// ==== Supabase client (giống xemhoadon111) ====
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** ========= TIỆN ÍCH ========= **/
function showToast(msg, type='info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:10px 14px;border-radius:8px;
  color:#fff;z-index:5000;box-shadow:0 6px 18px rgba(0,0,0,.2);transition:opacity .2s;`;
  el.style.background = type==='warn' ? '#e57373' : (type==='ok' ? '#43a047' : '#1976d2');
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),200); }, 1900);
}
function fmtDateInput(d) { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }

function getUser() {
  return {
    diadiem: localStorage.getItem('diadiem') || '',
    manv: localStorage.getItem('manv') || '',
    tennv: localStorage.getItem('tennv') || ''
  };
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
  const manv  = document.getElementById('login-manv').value.trim().toUpperCase();
  const pass  = document.getElementById('login-password').value.trim();
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
  const dia  = document.getElementById('fDiaDiem').value;  // 'ALL'|'cs1'|'cs2'
  const d1   = document.getElementById('fFrom').value;     // 'YYYY-MM-DD'
  const d2   = document.getElementById('fTo').value;       // 'YYYY-MM-DD'
  const masp = document.getElementById('fMasp').value.trim();
  const nv   = document.getElementById('fTennv').value.trim();
  const tt   = document.getElementById('fTrangThai').value; // 'ALL'|'OK'|'HET'|'TRONG'

  document.getElementById('btnFilter').disabled = true;

  let q = supabase.from('dathang')
    .select('sohd,diadiem,masp,mau,con_size,het_size,trahang,tennv,ghichu,ngaygio,nvtrahang', { count:'exact' })
    .gte('ngaygio', `${d1} 00:00:00`)
    .lte('ngaygio', `${d2} 23:59:59`)
    .order('ngaygio', { ascending:false });

  if (dia !== 'ALL') q = q.eq('diadiem', dia);
  if (masp) q = q.ilike('masp', `%${masp}%`);
  if (nv)   q = q.ilike('tennv', `%${nv}%`);

  if (tt === 'OK' || tt === 'HET') q = q.eq('trahang', tt);
  if (tt === 'TRONG') q = q.or('trahang.is.null,trahang.eq.');

  const { data, error } = await q;
  document.getElementById('btnFilter').disabled = false;

  if (error) { showToast('❌ Lỗi tải dữ liệu', 'warn'); return; }
  originalRows = (data || []).map(r => ({ ...r }));
  currentRows  = (data || []).map(r => ({ ...r }));
  renderTable();
}

/** ========= HIỂN THỊ BẢNG ========= **/
function renderTable() {
  const gridEl = document.getElementById('grid');
  const columns = [
    { data:'masp', renderer: linkRenderer, readOnly:true, width: 140 },
    { data:'mau', readOnly:true, width: 90 },
    { data:'con_size', readOnly:true, width: 180 },
    { data:'het_size', readOnly:true, width: 180 },
    { data:'trahang', type:'dropdown', source:['OK','HET'], strict:false, allowEmpty:true, width: 90 },
    { data:'tennv', readOnly:true, width: 120 },        // người đặt
    { data:'nvtrahang', readOnly:true, width: 130 },    // người trả (mới)
    { data:'ghichu', readOnly:true, width: 160 },
    { data:'ngaygio', readOnly:true, width: 160 },
    { data:'sohd', readOnly:true, width: 160 },
  ];
  const colHeaders = ['ma sp','mau','con size','het size','tra hang','ten nv','nv trả','ghi chu','ngay gio','so hd'];

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
        if (v === 'OK')  cellProperties.className = 'row-ok';
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
async function saveData() {
  if (!hot) return;
  const nowRows = hot.getSourceData();
  const oldMap = new Map(originalRows.map(r => [r.sohd, r.trahang || '']));

  const tennv = (localStorage.getItem('tennv') || '').trim();
  if (!tennv) { showToast('⚠️ Chưa đăng nhập', 'warn'); return; }

  const changed = [];
  for (const r of nowRows) {
    const sohd = (r.sohd || '').trim();
    if (!sohd) continue; // bỏ dòng rác

    const oldVal = (oldMap.get(sohd) ?? '').trim();
    let newVal = (r.trahang || '').trim().toUpperCase();
    if (newVal !== 'OK' && newVal !== 'HET') newVal = ''; // chỉ chấp nhận OK/HET, còn lại coi như rỗng

    if (oldVal !== newVal) {
      changed.push({
        sohd,
        trahang: newVal || null,
        nvtrahang: tennv
      });
    }
  }

  if (!changed.length) { showToast('Không có gì để lưu'); return; }

  document.getElementById('btnSave').disabled = true;
  const { error } = await supabase
    .from('dathang')
    .upsert(changed, { onConflict: 'sohd', ignoreDuplicates: false, returning: 'minimal' });
  document.getElementById('btnSave').disabled = false;

  if (error) {
    console.error(error);
    // Một số lỗi thường gặp:
    // - "UPSERT requires an updateable view" hoặc thiếu unique(sohd) -> chạy SQL ở bước 1
    // - Null value in column sohd -> có dòng thiếu sohd -> đã lọc ở trên
    showToast('❌ Lưu dữ liệu thất bại: ' + (error.message || ''), 'warn');
    return;
  }

  // cập nhật snapshot gốc + hiển thị nvtrahang trên bảng
  for (const u of changed) {
    const i = originalRows.findIndex(x => x.sohd === u.sohd);
    if (i >= 0) originalRows[i].trahang = u.trahang, originalRows[i].nvtrahang = u.nvtrahang;
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
  document.getElementById('fTo').value   = fmtDateInput(to);

  document.getElementById('btnFilter').addEventListener('click', loadData);
  document.getElementById('btnSave').addEventListener('click', saveData);
  ['fMasp','fTennv'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') loadData(); });
  });

  // gợi ý địa điểm theo login
  const { diadiem } = getUser();
  if (diadiem) document.getElementById('fDiaDiem').value = diadiem;

  loadData();
}

window.addEventListener('load', ensureLogin);
