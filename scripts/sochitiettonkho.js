import { getSupabaseClient } from './authModule.js';

const supabase = getSupabaseClient();
window.supabase = supabase;

let currentPayload = null;
let popupReqId = 0;

function $(id) { return document.getElementById(id); }
function n(v) { const x = Number(v || 0); return Number.isFinite(x) ? x : 0; }
function fmtNum(v) { return n(v).toLocaleString('vi-VN'); }
function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toLocaleString('vi-VN');
}
function localISO(d) {
  const p = x => String(x).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = x => String(x).padStart(2,'0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setStatus(text, isError=false) {
  const el = $('statusMsg');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

function renderSummary(payload) {
  const o = payload?.opening || {};
  const c = payload?.closing || {};
  $('maspTitle').textContent = payload?.masp || '';
  $('openingBox').innerHTML = `TỒN ĐẦU KỲ &nbsp; CS1: <b>${fmtNum(o.cs1)}</b> &nbsp; | &nbsp; CS2: <b>${fmtNum(o.cs2)}</b> &nbsp; | &nbsp; Tổng: <b>${fmtNum(o.total)}</b>`;
  $('closingBox').innerHTML = `TỒN CUỐI KỲ &nbsp; CS1: <b>${fmtNum(c.cs1)}</b> &nbsp; | &nbsp; CS2: <b>${fmtNum(c.cs2)}</b> &nbsp; | &nbsp; Tổng: <b>${fmtNum(c.total)}</b>`;
}

function renderRows(rows) {
  const tbody = $('reportBody');
  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">Không có chứng từ tăng/giảm kho trong khoảng ngày đã chọn.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const ps = n(r.phatsinh);
    const transfer = !!r.la_chuyen_kho;
    const phatSinhText = transfer
      ? fmtNum(Math.abs(ps))
      : `${ps > 0 ? '+' : ''}${fmtNum(ps)}`;
    const neg1 = n(r.ton_cs1) < 0 ? ' neg' : '';
    const neg2 = n(r.ton_cs2) < 0 ? ' neg' : '';
    const negT = n(r.tong_ton) < 0 ? ' neg' : '';
    const psClass = transfer ? 'transfer' : (ps > 0 ? 'inc' : 'dec');
    const safeSohd = String(r.sohd || '').replace(/"/g,'&quot;');
    return `<tr data-sohd="${safeSohd}">
      <td class="center">${r.stt ?? ''}</td>
      <td>${fmtDateTime(r.ngay_gio)}</td>
      <td class="invoice" title="Double click để mở chứng từ">${r.sohd || ''}</td>
      <td class="center">${r.coso || ''}</td>
      <td class="num ${psClass}">${phatSinhText}</td>
      <td class="num${neg1}">${fmtNum(r.ton_cs1)}</td>
      <td class="num${neg2}">${fmtNum(r.ton_cs2)}</td>
      <td class="num strong${negT}">${fmtNum(r.tong_ton)}</td>
      <td class="num">${fmtMoney(r.gia)}</td>
    </tr>`;
  }).join('');
}

window.taiSoChiTietTonKho = async function () {
  const masp = ($('maspInput')?.value || '').trim().toUpperCase();
  const tuNgay = $('tuNgay')?.value;
  const denNgay = $('denNgay')?.value;

  if (!masp) return alert('Vui lòng nhập/chọn Mã sản phẩm.');
  if (!tuNgay || !denNgay) return alert('Vui lòng chọn đủ Từ ngày và Đến ngày.');
  if (tuNgay > denNgay) return alert('Từ ngày không được lớn hơn Đến ngày.');

  setStatus('Đang tải lịch sử tồn kho...');
  $('btnView').disabled = true;
  try {
    const { data, error } = await supabase.rpc('sochitiet_tonkho_v2', {
      p_masp: masp,
      p_tu_ngay: tuNgay,
      p_den_ngay: denNgay,
      p_coso: $('cosoSelect')?.value || null,
      p_loai: $('loaiSelect')?.value || null
    });
    if (error) throw error;

    const payload = Array.isArray(data) ? (data[0] || {}) : (data || {});
    currentPayload = payload;
    renderSummary(payload);
    renderRows(payload.rows || []);
    const f1 = $('cosoSelect')?.selectedOptions?.[0]?.textContent || 'Cả hai';
    const f2 = $('loaiSelect')?.selectedOptions?.[0]?.textContent || 'Tất cả chứng từ';
    setStatus(`${(payload.rows || []).length.toLocaleString('vi-VN')} chứng từ | ${f1} | ${f2}.`);
  } catch (err) {
    console.error(err);
    currentPayload = null;
    renderRows([]);
    setStatus('Lỗi tải báo cáo: ' + (err?.message || err), true);
  } finally {
    $('btnView').disabled = false;
  }
};

// ===== Tìm mã sản phẩm =====
window.openProductPopup = async function () {
  $('productPopup').style.display = 'flex';
  $('popupSearchInput').value = $('maspInput').value || '';
  $('popupSearchInput').focus();
  await searchProducts($('popupSearchInput').value.trim());
};
window.closeProductPopup = function () { $('productPopup').style.display = 'none'; };
window.clearMasp = function () { $('maspInput').value = ''; $('maspInput').focus(); };

async function searchProducts(keyword='') {
  const reqId = ++popupReqId;
  const list = $('popupSearchList');
  list.innerHTML = '<div class="popup-info">Đang tải...</div>';
  let q = supabase.from('dmhanghoa').select('masp,tensp').limit(150);
  if (keyword) q = q.or(`masp.ilike.%${keyword}%,tensp.ilike.%${keyword}%`);
  const { data, error } = await q;
  if (reqId !== popupReqId) return;
  if (error) { list.innerHTML = `<div class="popup-info error">${error.message}</div>`; return; }
  if (!data?.length) { list.innerHTML = '<div class="popup-info">Không tìm thấy.</div>'; return; }
  list.innerHTML = data.map(r => {
    const code = String(r.masp || '').replace(/'/g, '&#39;');
    return `<div class="product-row" data-masp="${code}"><b>${r.masp || ''}</b><span>${r.tensp || ''}</span></div>`;
  }).join('');
}

// ===== Mở chứng từ gốc =====
function openInvoiceBySohd(sohdRaw) {
  if (!sohdRaw) return;
  // Dòng chuyển kho đã ghép 2 HĐ: ưu tiên mở chứng từ XCN.
  const all = String(sohdRaw).split('↔').map(s => s.trim()).filter(Boolean);
  let sohd = all.find(s => s.toLowerCase().startsWith('xcn')) || all[0];
  if (!sohd) return;

  const prefix = sohd.split('_')[0].toLowerCase();
  let url = null;
  if (prefix === 'bancs1') url = `banlemtcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'bancs2') url = `banlemtcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'bannvcs1') url = `bannvcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'bannvcs2') url = `bannvcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'nmcs1') url = `nhapmoimtcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'nmcs2') url = `nhapmoimtcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'xcncs1' || prefix === 'ncncs1') url = `ccn2v1cs1.html?sohd=${encodeURIComponent(sohd)}&loaihd=${prefix}&diadiem=cs1`;
  else if (prefix === 'xcncs2' || prefix === 'ncncs2') url = `ccn2v1cs2.html?sohd=${encodeURIComponent(sohd)}&loaihd=${prefix}&diadiem=cs2`;
  else if (prefix === 'nhapkiemcs1') url = `nhapkiemcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'nhapkiemcs2') url = `nhapkiemcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'xuatkiemcs1') url = `xuatkiemcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'xuatkiemcs2') url = `xuatkiemcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'nhaptamcs1') url = `nhaptamcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'nhaptamcs2') url = `nhaptamcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'nhapdoics1') url = `nhapdoimtcs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'nhapdoics2') url = `nhapdoimtcs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;
  else if (prefix === 'xuathuycs1') url = `xuathuycs1.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs1`;
  else if (prefix === 'xuathuycs2') url = `xuathuycs2.html?sohd=${encodeURIComponent(sohd)}&diadiem=cs2`;

  if (url) window.open(url, '_blank');
  else alert('Chưa khai báo trang mở cho loại chứng từ: ' + prefix);
}

window.copyTable = async function () {
  if (!currentPayload) return alert('Chưa có dữ liệu để copy.');
  const headers = ['STT','Ngày giờ','Hóa đơn','Cơ sở','+/- SL','CS1','CS2','Tổng tồn','Giá'];
  const lines = [headers.join('\t')];
  (currentPayload.rows || []).forEach(r => {
    lines.push([
      r.stt ?? '', fmtDateTime(r.ngay_gio), r.sohd ?? '', r.coso ?? '',
      r.la_chuyen_kho ? Math.abs(n(r.phatsinh)) : n(r.phatsinh),
      n(r.ton_cs1), n(r.ton_cs2), n(r.tong_ton), r.gia ?? ''
    ].join('\t'));
  });
  await navigator.clipboard.writeText(lines.join('\n'));
};

async function loadLoaiChungTuOptions() {
  const sel = $('loaiSelect');
  if (!sel) return;
  try {
    const { data, error } = await supabase
      .from('sochungtu')
      .select('loai,coso,is_tang_giam')
      .neq('is_tang_giam', 0)
      .order('loai', { ascending:true });
    if (error) throw error;

    const seen = new Set();
    const rows = (data || []).filter(r => {
      const k = String(r.loai || '').trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k); return true;
    });
    sel.innerHTML = '<option value="">Tất cả chứng từ</option>' + rows.map(r => {
      const loai = String(r.loai || '').trim().toLowerCase();
      const cs = String(r.coso || '').trim().toUpperCase();
      return `<option value="${loai}">${loai}${cs ? ' - ' + cs : ''}</option>`;
    }).join('');
  } catch (e) {
    console.warn('Không tải được danh sách loại chứng từ:', e);
  }
}

window.initSoChiTietTonKho = async function () {
  const now = new Date();
  $('tuNgay').value = '2025-06-01';
  $('denNgay').value = localISO(now);
  if ($('cosoSelect')) $('cosoSelect').value = '';
  await loadLoaiChungTuOptions();

  // Nhận mã từ URL: ?masp=ABC
  const qs = new URLSearchParams(location.search);
  const m = (qs.get('masp') || '').trim().toUpperCase();
  if (m) {
    $('maspInput').value = m;
    setTimeout(() => window.taiSoChiTietTonKho(), 0);
  }

  $('popupSearchInput').addEventListener('input', e => searchProducts(e.target.value.trim()));
  $('popupSearchList').addEventListener('click', e => {
    const row = e.target.closest('.product-row');
    if (!row) return;
    $('maspInput').value = row.dataset.masp || '';
    window.closeProductPopup();
  });
  $('productPopup').addEventListener('mousedown', e => { if (e.target.id === 'productPopup') window.closeProductPopup(); });
  $('reportBody').addEventListener('dblclick', e => {
    const tr = e.target.closest('tr[data-sohd]');
    if (tr) openInvoiceBySohd(tr.dataset.sohd);
  });
  $('maspInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.taiSoChiTietTonKho();
  });
  $('cosoSelect')?.addEventListener('change', () => { if (currentPayload) window.taiSoChiTietTonKho(); });
  $('loaiSelect')?.addEventListener('change', () => { if (currentPayload) window.taiSoChiTietTonKho(); });
};
