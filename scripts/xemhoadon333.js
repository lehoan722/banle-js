// xemhoadon333.js
// Chuẩn tính theo DETAIL (ct_hoadon_banle) + lọc ngày theo hd.ngay
// Trang 333 dùng đăng nhập chung qua ./scripts/authModule.js giống xemhoadon111
// => Supabase client lấy từ window.supabase (được authModule gắn sau khi login)

let sb = null;

// gọi trong onLoginSuccess để khởi tạo trang
export function initXemHoaDon333() {
  sb = window.supabase;
  if (!sb) {
    alert('Chưa khởi tạo Supabase (window.supabase). Hãy đăng nhập qua authModule trước.');
    return;
  }
  init();
}
// ===== Helpers
const $ = (id) => document.getElementById(id);

function toYMD(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function parseMoney(v) {
  if (!v) return null;
  const s = String(v).replace(/[\.,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtMoney(n) {
  if (n == null) return '';
  try {
    return Number(n).toLocaleString('vi-VN');
  } catch {
    return String(n);
  }
}

function fmtDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

function normalizeMaspList(text) {
  if (!text) return null;
  const raw = text
    .split(/[,\n\t\r\s]+/g)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  if (!raw.length) return null;
  // distinct
  return Array.from(new Set(raw));
}

function getFilters() {
  const tuNgay = $('tuNgay').value ? $('tuNgay').value : null;
  const denNgay = $('denNgay').value ? $('denNgay').value : null;

  return {
    p_tu_ngay: tuNgay,
    p_den_ngay: denNgay,
    p_loai: $('loai').value || null,
    p_diadiem: $('diadiem').value || null,
    p_manv: $('manv').value.trim() || null,
    p_khachhang: $('khachhang').value.trim() || null,
    p_tien_tu: parseMoney($('tienTu').value),
    p_tien_den: parseMoney($('tienDen').value),
    p_sohd: $('sohd').value.trim() || null,
    p_masp_list: normalizeMaspList($('maspList').value),
    p_must_contain_all: $('mustAll').checked
  };
}

function setLoading(on) {
  $('loading').style.display = on ? 'block' : 'none';
  $('btnLoc').disabled = on;
  $('btnPrev').disabled = on;
  $('btnNext').disabled = on;
}

let pageSize = Number($('pageSize').value) || 5000;
let offset = 0;
let totalRows = 0;

async function loadCount(filters) {
  const { data, error } = await sb.rpc('xemhoadon333_count', filters);
  if (error) throw error;
  return data?.[0] || null;
}

async function loadPage(filters, limit, offset) {
  const payload = { ...filters, p_limit: limit, p_offset: offset };
  const { data, error } = await sb.rpc('xemhoadon333_paged', payload);
  if (error) throw error;
  return data || [];
}

function renderMeta(countRow) {
  if (!countRow) {
    $('meta').innerHTML = '';
    return;
  }
  const {
    total_rows,
    total_sl_detail,
    total_tien_detail,
    total_sl_header,
    total_lech_sl
  } = countRow;

  const warn = (Number(total_lech_sl) !== 0) ? ' <span class="warn">| Lệch SL: ' + fmtMoney(total_lech_sl) + '</span>' : '';
  $('meta').innerHTML =
    'Tổng dòng: <b>' + fmtMoney(total_rows) + '</b>' +
    ' | Tổng SL (detail): <b>' + fmtMoney(total_sl_detail) + '</b>' +
    ' | Tổng tiền (detail): <b>' + fmtMoney(total_tien_detail) + '</b>' +
    ' | Tổng SL (header): <b>' + fmtMoney(total_sl_header) + '</b>' +
    warn;
}

function renderPageInfo() {
  const page = Math.floor(offset / pageSize) + 1;
  const totalPage = totalRows ? Math.ceil(totalRows / pageSize) : 1;
  $('pageInfo').textContent = `Trang ${page} / ${totalPage} (offset=${offset}, pageSize=${pageSize})`;
}

function renderTable(rows) {
  const tb = $('tb');
  tb.innerHTML = '';
  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');

    const sohd = r.sohd || '';
    const diadiem = r.diadiem || '';
    const sohdLink = `<span class="link" data-sohd="${sohd}" data-diadiem="${diadiem}">${sohd}</span>`;

    tr.innerHTML = `
      <td class="center">${offset + idx + 1}</td>
      <td>${r.ngay || ''}</td>
      <td>${sohdLink}</td>
      <td>${diadiem}</td>
      <td title="${r.tennv || ''}">${r.tennv || r.manv || ''}</td>
      <td title="${r.khachhang || ''}">${r.khachhang || ''}</td>
      <td class="num">${fmtMoney(r.sl_detail)}</td>
      <td class="num">${fmtMoney(r.tt_detail)}</td>
      <td class="num">${fmtMoney(r.sl_header)}</td>
      <td class="num">${fmtMoney(r.lech_sl)}</td>
      <td>${fmtDT(r.created_at)}</td>
      <td title="${r.ghichu || ''}">${r.ghichu || ''}</td>
    `;
    tb.appendChild(tr);
  });

  // click sohd -> mở trang xem hoá đơn (giữ cách làm giống 111)
  tb.querySelectorAll('.link').forEach(el => {
    el.addEventListener('click', () => {
      const sohd = el.getAttribute('data-sohd');
      const diadiem = el.getAttribute('data-diadiem') || '';
      // Bạn có thể đổi sang trang xem hoá đơn bạn đang dùng
      // Ở 111 mình thấy hay mở: /xemhoadon.html?sohd=...&diadiem=cs1
      const url = `/xemhoadon.html?sohd=${encodeURIComponent(sohd)}&diadiem=${encodeURIComponent(diadiem)}`;
      window.open(url, '_blank');
    });
  });
}

async function runSearch(resetOffset=true) {
  try {
    setLoading(true);
    pageSize = Number($('pageSize').value) || 5000;
    if (resetOffset) offset = 0;

    const filters = getFilters();
    // bắt buộc có từ/đến ngày để tránh query quá nặng
    if (!filters.p_tu_ngay || !filters.p_den_ngay) {
      alert('Vui lòng chọn đủ Từ ngày và Đến ngày (lọc theo hd.ngay).');
      return;
    }

    const countRow = await loadCount(filters);
    totalRows = Number(countRow?.total_rows || 0);
    renderMeta(countRow);
    renderPageInfo();

    const rows = await loadPage(filters, pageSize, offset);
    renderTable(rows);

    // disable prev/next theo biên
    $('btnPrev').disabled = (offset <= 0);
    $('btnNext').disabled = (offset + pageSize >= totalRows);
  } catch (e) {
    console.error(e);
    alert('Lỗi tải dữ liệu: ' + (e?.message || e));
  } finally {
    setLoading(false);
  }
}

function copyTable() {
  const table = $('tbl');
  const rows = [...table.querySelectorAll('tr')].map(tr =>
    [...tr.querySelectorAll('th,td')].map(td => td.innerText.replace(/\t/g,' ')).join('\t')
  ).join('\n');
  navigator.clipboard.writeText(rows).then(() => {
    alert('Đã copy bảng (TSV).');
  }).catch(() => {
    alert('Không copy được. Trình duyệt chặn clipboard.');
  });
}

// ===== init defaults
function init() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  $('tuNgay').value = toYMD(firstDay);
  $('denNgay').value = toYMD(now);

  $('btnLoc').addEventListener('click', () => runSearch(true));
  $('btnPrev').addEventListener('click', () => {
    offset = Math.max(0, offset - pageSize);
    runSearch(false);
  });
  $('btnNext').addEventListener('click', () => {
    offset = offset + pageSize;
    runSearch(false);
  });
  $('pageSize').addEventListener('change', () => runSearch(true));
  $('btnCopy').addEventListener('click', copyTable);

  // Enter để lọc nhanh ở vài ô
  ['manv','khachhang','sohd','tienTu','tienDen'].forEach(id => {
    $(id).addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') runSearch(true);
    });
  });
}
