// xemhoadon222.js — dùng global window.supabase (giống 111/XNT)

const qs  = (s) => document.querySelector(s);
const qsa = (s) => Array.from(document.querySelectorAll(s));
const qsv = (s) => (qs(s)?.value || '').trim();

let limit = 1000;
let offset = 0;
let lastTotal = 0;
let currentRows = [];  // lưu rows để mở popup nhanh

// ngày mặc định: tháng hiện tại
(function initDates(){
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  qs('#tuNgay').value  = `${yyyy}-${mm}-01`;
  qs('#denNgay').value = `${yyyy}-${mm}-${new Date(yyyy, today.getMonth()+1, 0).getDate()}`;
})();

qs('#btnLoc').addEventListener('click', () => { offset = 0; loadData(); });
qs('#prev').addEventListener('click', () => { offset = Math.max(0, offset - limit); loadData(); });
qs('#next').addEventListener('click', () => { if (offset + limit < lastTotal) { offset += limit; loadData(); }});
qs('#btnCopy').addEventListener('click', copyTable);
qs('#btnDelete').addEventListener('click', onDeleteSelected);
qs('#pageSize').addEventListener('change', () => { limit = Number(qsv('#pageSize')) || 1000; offset = 0; loadData(); });
qs('#chkAll').addEventListener('change', (e)=> {
  const ck = e.target.checked;
  qsa('#tbl tbody input[type="checkbox"].rowchk').forEach(c => c.checked = ck);
});

// Modal
qs('#btnClose').addEventListener('click', closeModal);
qs('#btnCopyDetail').addEventListener('click', copyDetail);

async function loadData(){
  const tu_ngay    = qsv('#tuNgay');
  const den_ngay   = qsv('#denNgay');
  const group_mode = qsv('#groupMode') || 'day';
  const nhanvien   = qsv('#nhanvien') || null;
  const khach      = qsv('#khach') || null;
  const tien_tu    = qsv('#tienTu') ? Number(qsv('#tienTu')) : null;
  const tien_den   = qsv('#tienDen') ? Number(qsv('#tienDen')) : null;
  const sohd       = qsv('#sohd') || null;
  const diadiem    = qsv('#diadiem') || null;

  const loaihdSel = Array.from(qs('#loaihd').selectedOptions).map(o => o.value);
  const loaihd    = loaihdSel.length ? loaihdSel : ['bancs1','bancs2'];

  const maspRaw   = qsv('#maspList');
  const masp_list = maspRaw ? maspRaw.split(/[\s,]+/).filter(Boolean) : null;
  const mustAll   = qs('#mustAll').checked;

  // COUNT
  const { data: sumRows, error: errC } = await supabase.rpc('xemhoadon222_count', {
    p_tu_ngay: tu_ngay, p_den_ngay: den_ngay,
    p_loaihd: loaihd, p_group_mode: group_mode,
    p_diadiem: diadiem || null,
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
    `Lệch SL: <b class="${Number(sum.sum_lech_sl)===0?'badge-ok':'badge-err'}">${fmt(sum.sum_lech_sl)}</b>`;

  // PAGED
  const { data: rows, error: errP } = await supabase.rpc('xemhoadon222_paged', {
    p_tu_ngay: tu_ngay, p_den_ngay: den_ngay,
    p_loaihd: loaihd, p_group_mode: group_mode,
    p_diadiem: diadiem || null,
    p_nhanvien: nhanvien, p_khach: khach,
    p_tien_tu: tien_tu, p_tien_den: tien_den,
    p_sohd: sohd,
    p_masp_list: masp_list, p_must_contain_all: mustAll,
    p_limit: limit, p_offset: offset, p_order: 'ngay,sohd'
  });
  if (errP) { alert('Lỗi PAGED: ' + errP.message); return; }

  currentRows = rows || [];
  render(currentRows, group_mode);
  qs('#pageInfo').textContent = `Trang ${Math.floor(offset/limit)+1} / ${Math.max(1, Math.ceil(lastTotal/limit))}`;
}

function render(rows, mode){
  const tb = qs('#tbl tbody');
  tb.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const lech = Number(r.lech_sl || 0);
    // click mở chi tiết: chỉ khi có số HĐ (mode = invoice)
    tr.addEventListener('click', (ev) => {
      // tránh click vào checkbox
      if ((ev.target.tagName==='INPUT') || (mode!=='invoice')) return;
      openModal(r.sohd);
    });

    tr.innerHTML = `
      <td><input type="checkbox" class="rowchk" data-sohd="${r.sohd||''}" ${mode!=='invoice'?'disabled':''}></td>
      <td>${offset + i + 1}</td>
      <td>${r.ngay || ''}</td>
      <td>${mode==='invoice' ? (r.sohd || '') : ''}</td>
      <td>${r.diadiem || ''}</td>
      <td>${mode==='invoice' ? (r.nhanvien || '') : ''}</td>
      <td>${mode==='invoice' ? (r.khach || '') : ''}</td>
      <td class="num">${fmt(r.sl_detail)}</td>
      <td class="num">${fmtMoney(r.tien_detail)}</td>
      <td class="num">${fmt(r.sl_header)}</td>
      <td class="num" style="color:${lech===0?'inherit':'#d00'};font-weight:${lech===0?'normal':'600'}">${fmt(lech)}</td>
    `;
    tb.appendChild(tr);
  });
}

async function copyTable(){
  const text = qs('#tbl')?.outerText || '';
  await navigator.clipboard.writeText(text);
  alert('Đã copy bảng vào clipboard.');
}

async function onDeleteSelected(){
  // chỉ cho phép xóa ở chế độ chi tiết (mới có sohd)
  const mode = qsv('#groupMode');
  if (mode !== 'invoice') {
    alert('Hãy chuyển "Loại tổng hợp" sang "Chi tiết từng hóa đơn" để xóa.');
    return;
  }
  const chosen = qsa('#tbl tbody input.rowchk:checked').map(c => c.dataset.sohd).filter(Boolean);
  if (!chosen.length) { alert('Chưa chọn hóa đơn nào.'); return; }

  // Xác nhận
  if (!confirm(`Bạn chắc chắn muốn xóa ${chosen.length} hóa đơn? (Hành động này không thể hoàn tác)`)) return;

  // (Tùy chọn) xác thực NV: bạn có thể hỏi mã NV ở đây
  // const manv = prompt('Nhập mã NV xác thực (tùy chọn):', '');

  // Xóa HĐ: do FK CASCADE, ct_hoadon_banle sẽ xóa theo
  const { error } = await supabase
    .from('hoadon_banle')
    .delete()
    .in('sohd', chosen);

  if (error) { alert('Xóa lỗi: ' + error.message); return; }

  alert('Đã xóa thành công.');
  // reload trang hiện tại
  loadData();
}

// ======= POPUP CHI TIẾT =======
function openModal(sohd){
  if (!sohd) return;
  qs('#modalSohd').textContent = sohd;
  // load detail
  loadDetail(sohd);
  qs('#modal').style.display = 'flex';
}

function closeModal(){
  qs('#modal').style.display = 'none';
  qs('#tblDetail tbody').innerHTML = '';
}

async function loadDetail(sohd){
  const { data, error } = await supabase
    .from('ct_hoadon_banle')
    .select('masp,tensp,size,soluong,gia,km,thanhtien')
    .eq('sohd', sohd)
    .order('id', { ascending: true });

  if (error) { alert('Lỗi tải chi tiết: ' + error.message); return; }

  const tb = qs('#tblDetail tbody');
  tb.innerHTML = '';
  (data || []).forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.masp||''}</td>
      <td>${r.tensp||''}</td>
      <td>${r.size||''}</td>
      <td class="num">${fmt(r.soluong)}</td>
      <td class="num">${fmtMoney(r.gia)}</td>
      <td class="num">${fmtMoney(r.km)}</td>
      <td class="num">${fmtMoney(r.thanhtien ?? ( (Number(r.gia||0)-Number(r.km||0)) * Number(r.soluong||0) ))}</td>
    `;
    tb.appendChild(tr);
  });
}

async function copyDetail(){
  const text = qs('#tblDetail')?.outerText || '';
  await navigator.clipboard.writeText(text);
  alert('Đã copy chi tiết HĐ vào clipboard.');
}

// ======= Utils =======
function fmt(x){ return (x==null)?'':Number(x).toLocaleString('vi-VN'); }
function fmtMoney(x){ return (x==null)?'':Number(x).toLocaleString('vi-VN'); }

// auto load
loadData();
