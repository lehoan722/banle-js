// ====== CẤU HÌNH CƠ BẢN ======
const IMG_BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
const SEARCH_PAGE = 'timkiemhanghoa222.html'; // mở ở tab mới với ?masp=...
// Nếu trong layout global bạn đã có supabase sẵn thì đoạn dưới sẽ không chạy.
if (!window.supabase) {
  // 👉 Thay bằng thông số thật của bạn (hoặc bỏ nếu đã có)
  const SUPABASE_URL = window.SUPABASE_URL || 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
  window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ====== TIỆN ÍCH NHỎ ======
function showToast(msg, type='info') {
  console.log(msg);
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:10px 14px;border-radius:8px;
  color:#fff;z-index:5000;box-shadow:0 6px 18px rgba(0,0,0,.2);transition:opacity .2s;`;
  el.style.background = type==='warn' ? '#e57373' : (type==='ok' ? '#43a047' : '#1976d2');
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; setTimeout(()=>el.remove(),200); }, 1900);
}
function fmtDateInput(d) { // Date -> 'YYYY-MM-DD'
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ====== STATE ======
let hot = null;
let originalRows = [];   // dữ liệu gốc để so sánh trahang
let currentRows = [];    // dữ liệu hiện trên bảng

// ====== HANDSONTABLE RENDERER: MÃ SP (CLICK => POPUP ẢNH) ======
function linkRenderer(instance, td, row, col, prop, value) {
  Handsontable.dom.empty(td);
  if (value) {
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = value;
    a.className = 'link masp-link';
    a.dataset.masp = value;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showImagePopup(value);
    });
    td.appendChild(a);
  } else {
    td.textContent = '';
  }
}

// ====== POPUP ẢNH ======
function showImagePopup(masp) {
  const modal = document.getElementById('imgModal');
  const img = document.getElementById('pimg');
  const cap = document.getElementById('cap');

  img.src = `${IMG_BASE}${encodeURIComponent(masp)}.JPG?t=${Date.now()}`;
  cap.innerHTML = `Mã sản phẩm: <a class="link" target="_blank" href="${SEARCH_PAGE}?masp=${encodeURIComponent(masp)}">${masp}</a>`;
  modal.style.display = 'block';

  // click nền để đóng
  modal.onclick = (evt) => {
    if (evt.target === modal) modal.style.display = 'none';
  };
}
document.getElementById('imgClose').addEventListener('click', () => {
  document.getElementById('imgModal').style.display = 'none';
});

// ====== LOAD DATA THEO BỘ LỌC ======
async function loadData() {
  const dia  = document.getElementById('fDiaDiem').value;  // 'ALL'|'cs1'|'cs2'
  const d1   = document.getElementById('fFrom').value;     // 'YYYY-MM-DD'
  const d2   = document.getElementById('fTo').value;       // 'YYYY-MM-DD'
  const masp = document.getElementById('fMasp').value.trim();
  const nv   = document.getElementById('fTennv').value.trim();
  const tt   = document.getElementById('fTrangThai').value; // 'ALL'|'OK'|'HET'|'TRONG'

  document.getElementById('btnFilter').disabled = true;

  let q = supabase.from('dathang')
    .select('sohd, diadiem, masp, mau, con_size, het_size, trahang, tennv, ghichu, ngaygio', { count: 'exact' })
    .gte('ngaygio', `${d1} 00:00:00`)
    .lte('ngaygio', `${d2} 23:59:59`)
    .order('ngaygio', { ascending: false });

  if (dia !== 'ALL') q = q.eq('diadiem', dia);
  if (masp) q = q.ilike('masp', `%${masp}%`);
  if (nv)   q = q.ilike('tennv', `%${nv}%`);

  if (tt === 'OK' || tt === 'HET') q = q.eq('trahang', tt);
  if (tt === 'TRONG') q = q.or('trahang.is.null,trahang.eq.');

  const { data, error } = await q;
  document.getElementById('btnFilter').disabled = false;

  if (error) { showToast('❌ Lỗi tải dữ liệu', 'warn'); return; }
  originalRows = (data || []).map(r => ({ ...r }));  // snapshot
  currentRows  = (data || []).map(r => ({ ...r }));
  renderTable();
}

// ====== RENDER HANDSONTABLE ======
function renderTable() {
  const gridEl = document.getElementById('grid');

  const columns = [
    { data:'masp', renderer: linkRenderer, readOnly: true, width: 140 },
    { data:'mau', readOnly: true, width: 90 },
    { data:'con_size', readOnly: true, width: 180 },
    { data:'het_size', readOnly: true, width: 180 },
    { data:'trahang', type:'dropdown', source:['OK','HET'], strict:false, allowEmpty:true, width: 90 },
    { data:'tennv', readOnly: true, width: 120 },
    { data:'ghichu', readOnly: true, width: 160 },
    { data:'ngaygio', readOnly: true, width: 160 },
    { data:'sohd', readOnly: true, width: 160 },
  ];

  const colHeaders = ['ma sp','mau','con size','het size','tra hang','ten nv','ghi chu','ngay gio','so hd'];

  if (hot) {
    hot.loadData(currentRows);
    return;
  }

  hot = new Handsontable(gridEl, {
    data: currentRows,
    columns,
    colHeaders,
    rowHeaders: true,
    width: '100%',
    height: 'calc(100vh - 240px)',
    manualColumnResize: true,
    licenseKey: 'non-commercial-and-evaluation',
    // Tô màu dòng theo trạng thái
    cells: function (row) {
      const r = this.instance.getSourceDataAtRow(row);
      const cellProperties = {};
      if (r && r.trahang) {
        if (String(r.trahang).toUpperCase() === 'OK')  cellProperties.className = 'row-ok';
        if (String(r.trahang).toUpperCase() === 'HET') cellProperties.className = 'row-het';
      }
      return cellProperties;
    },
    afterChange: function(changes, src) {
      if (!changes || src === 'loadData') return;
      // đồng bộ currentRows với data trong bảng
      currentRows = this.getSourceData();
    }
  });
}

// ====== LƯU DỮ LIỆU (chỉ cột trahang) ======
async function saveData() {
  if (!hot) return;
  const nowRows = hot.getSourceData();

  // So sánh trahang theo sohd
  const changed = [];
  const mapOld = new Map(originalRows.map(r => [r.sohd, r.trahang || '']));
  for (const r of nowRows) {
    const oldVal = mapOld.get(r.sohd) ?? '';
    const newVal = (r.trahang || '').trim();
    if (oldVal !== newVal) {
      changed.push({ sohd: r.sohd, trahang: newVal || null });
    }
  }
  if (!changed.length) { showToast('Không có gì để lưu'); return; }

  document.getElementById('btnSave').disabled = true;
  const { error } = await supabase.from('dathang').upsert(changed, { onConflict: 'sohd' });
  document.getElementById('btnSave').disabled = false;

  if (error) { showToast('❌ Lưu dữ liệu thất bại', 'warn'); return; }

  // cập nhật snapshot gốc
  for (const u of changed) {
    const idx = originalRows.findIndex(x => x.sohd === u.sohd);
    if (idx >= 0) originalRows[idx].trahang = u.trahang;
  }
  showToast('✅ Lưu dữ liệu thành công', 'ok');
}

// ====== INIT ======
window.addEventListener('load', () => {
  // default: 7 ngày gần nhất
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - 7);
  document.getElementById('fFrom').value = fmtDateInput(from);
  document.getElementById('fTo').value   = fmtDateInput(to);

  document.getElementById('btnFilter').addEventListener('click', loadData);
  document.getElementById('btnSave').addEventListener('click', saveData);

  // Enter tại các ô text → lọc
  ['fMasp','fTennv'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ loadData(); } });
  });

  loadData();
});
