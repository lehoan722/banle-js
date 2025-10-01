// xemhoadon222.js  — dùng kèm <script type="module" src="scripts/xemhoadon222.js"></script>

// 1) Import Supabase JS (ESM)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 2) Khai báo thông số Supabase của bạn
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

// 3) Khởi tạo client (QUAN TRỌNG!)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 4) Helper ngắn
const qs  = (s) => document.querySelector(s);
const qsv = (s) => (qs(s)?.value || '').trim();

// 5) State phân trang
let limit = 200;
let offset = 0;
let lastTotal = 0;

// 6) Ngày mặc định = tháng hiện tại
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
qs('#tuNgay').value  = `${yyyy}-${mm}-01`;
qs('#denNgay').value = `${yyyy}-${mm}-${new Date(yyyy, today.getMonth() + 1, 0).getDate()}`;

// 7) Sự kiện
qs('#btnLoc').addEventListener('click', () => { offset = 0; loadData(); });
qs('#prev').addEventListener('click', () => { offset = Math.max(0, offset - limit); loadData(); });
qs('#next').addEventListener('click', () => { if (offset + limit < lastTotal) { offset += limit; loadData(); }});
qs('#btnCopy').addEventListener('click', copyTable);

// 8) Hàm chính gọi RPC
async function loadData() {
  try {
    const tu_ngay    = qsv('#tuNgay');
    const den_ngay   = qsv('#denNgay');
    const group_mode = qsv('#groupMode') || 'day';
    const nhanvien   = qsv('#nhanvien') || null;
    const khach      = qsv('#khach') || null;
    const tien_tu    = qsv('#tienTu') ? Number(qsv('#tienTu')) : null;
    const tien_den   = qsv('#tienDen') ? Number(qsv('#tienDen')) : null;
    const sohd       = qsv('#sohd') || null;

    const loaihdSel = Array.from(qs('#loaihd').selectedOptions).map(o => o.value);
    const loaihd    = loaihdSel.length ? loaihdSel : ['bancs1', 'bancs2'];

    const maspRaw   = qsv('#maspList');
    const masp_list = maspRaw ? maspRaw.split(/[\s,]+/).filter(Boolean) : null;
    const mustAll   = qs('#mustAll').checked;

    // COUNT
    const { data: sumRows, error: errC } = await supabase.rpc('xemhoadon222_count', {
      p_tu_ngay: tu_ngay, p_den_ngay: den_ngay,
      p_loaihd: loaihd, p_group_mode: group_mode,
      p_nhanvien: nhanvien, p_khach: khach,
      p_tien_tu: tien_tu, p_tien_den: tien_den,
      p_sohd: sohd,
      p_masp_list: masp_list, p_must_contain_all: mustAll
    });
    if (errC) { alert('Lỗi COUNT: ' + errC.message); return; }

    const sum = sumRows?.[0] ?? {
      total_rows: 0, sum_sl_detail: 0, sum_tien_detail: 0, sum_sl_header: 0, sum_lech_sl: 0
    };
    lastTotal = Number(sum.total_rows || 0);

    qs('#summary').innerHTML =
      `Tổng dòng: <b>${fmt(sum.total_rows)}</b> | ` +
      `Tổng SL (detail): <b>${fmt(sum.sum_sl_detail)}</b> | ` +
      `Tổng tiền (detail): <b>${fmtMoney(sum.sum_tien_detail)}</b> | ` +
      `Tổng SL (header): <b>${fmt(sum.sum_sl_header)}</b> | ` +
      `Lệch SL: <b style="color:${Number(sum.sum_lech_sl)===0?'green':'red'}">${fmt(sum.sum_lech_sl)}</b>`;

    // PAGED
    const { data: rows, error: errP } = await supabase.rpc('xemhoadon222_paged', {
      p_tu_ngay: tu_ngay, p_den_ngay: den_ngay,
      p_loaihd: loaihd, p_group_mode: group_mode,
      p_nhanvien: nhanvien, p_khach: khach,
      p_tien_tu: tien_tu, p_tien_den: tien_den,
      p_sohd: sohd,
      p_masp_list: masp_list, p_must_contain_all: mustAll,
      p_limit: limit, p_offset: offset, p_order: 'ngay,sohd'
    });
    if (errP) { alert('Lỗi PAGED: ' + errP.message); return; }

    render(rows || [], group_mode);
    qs('#pageInfo').textContent = `Trang ${Math.floor(offset/limit) + 1} / ${Math.max(1, Math.ceil(lastTotal / limit))}`;
  } catch (e) {
    console.error(e);
    alert('Lỗi không xác định khi tải dữ liệu!');
  }
}

// 9) Render bảng
function render(rows, mode) {
  const tb = qs('#tbl tbody');
  tb.innerHTML = '';
  rows.forEach((r, i) => {
    const lech = Number(r.lech_sl || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${offset + i + 1}</td>
      <td>${r.ngay || ''}</td>
      <td>${mode === 'invoice' ? (r.sohd || '') : ''}</td>
      <td>${mode === 'invoice' ? (r.nhanvien || '') : ''}</td>
      <td>${mode === 'invoice' ? (r.khach || '') : ''}</td>
      <td class="num">${fmt(r.sl_detail)}</td>
      <td class="num">${fmtMoney(r.tien_detail)}</td>
      <td class="num">${fmt(r.sl_header)}</td>
      <td class="num" style="color:${lech===0?'inherit':'#d00'};font-weight:${lech===0?'normal':'600'}">${fmt(lech)}</td>
    `;
    tb.appendChild(tr);
  });
}

// 10) Utils
function fmt(x)      { return (x == null) ? '' : Number(x).toLocaleString('vi-VN'); }
function fmtMoney(x) { return (x == null) ? '' : Number(x).toLocaleString('vi-VN'); }

async function copyTable() {
  const text = document.querySelector('#tbl')?.outerText || '';
  await navigator.clipboard.writeText(text);
  alert('Đã copy bảng vào clipboard.');
}

// 11) Tải lần đầu
loadData();
