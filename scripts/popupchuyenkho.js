// scripts/popupchuyenkho.js
import { supabase } from './supabaseClient.js';

let popupChuyenKhoDangMo = false;
window.__popupChuyenKhoContext = window.__popupChuyenKhoContext || null;

const SALES_PREFIXES = ['bancs1', 'bancs2', 'bannvcs1', 'bannvcs2'];

function getTodayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeMasp(v) {
  return String(v || '').trim().toUpperCase();
}

function normalizeSize(v) {
  return String(v ?? '').trim();
}

function sizeSortValue(size) {
  const s = String(size || '').trim().toLowerCase();
  if (!s) return 999999;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (m) return Number(m[0]);
  return 999998;
}

function sortSizesAsc(arr) {
  return [...arr].sort((a, b) => {
    const av = sizeSortValue(a.size ?? a);
    const bv = sizeSortValue(b.size ?? b);
    if (av !== bv) return av - bv;
    return String(a.size ?? a).localeCompare(String(b.size ?? b), 'vi');
  });
}

function getIsAdminLike() {
  const rawIsAdmin = (localStorage.getItem("is_admin") || "").toLowerCase();
  const rawSua = (localStorage.getItem("sua_hoadon") || "").toLowerCase();
  const rawXoa = (localStorage.getItem("xoa_hoadon") || "").toLowerCase();
  const rawRole = (localStorage.getItem("role") || "").toLowerCase();

  return (
    rawIsAdmin === "true" || rawIsAdmin === "1" ||
    rawSua === "true" || rawSua === "1" ||
    rawXoa === "true" || rawXoa === "1" ||
    rawRole === "admin"
  );
}

function calcGoiy(cs1, cs2) {
  if (cs1 >= 1 && cs2 === 0) return '1v2';
  if (cs1 === 0 && cs2 >= 2) return '2v1';
  if (cs1 <= 1 && cs2 > 2) return '2v1';
  if (cs2 <= 1 && cs1 > 2) return '1v2';
  return 'cân bằng';
}

const CFG = {
  keep_min_src: 1,
  dest_min: 2,
  max_move: 999999,
  prefer_cs2: true
};

function calcMoveQty(cs1, cs2, goiy) {
  const keep = CFG.keep_min_src;
  const maxm = CFG.max_move;
  const total = (cs1 || 0) + (cs2 || 0);

  if (total === 1) {
    if (goiy === '1v2' && cs1 === 1) {
      return Math.min(1, maxm);
    }
    return 0;
  }

  if (total === 5) {
    const t1 = 2;
    if (goiy === '1v2') {
      const srcCap = Math.max(0, cs1 - keep);
      return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
    }
    if (goiy === '2v1') {
      const srcCap = Math.max(0, cs2 - keep);
      return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
    }
    return 0;
  }

  if (total > 5) {
    const t1 = Math.round(total / 3);
    if (goiy === '1v2') {
      const srcCap = Math.max(0, cs1 - keep);
      return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
    }
    if (goiy === '2v1') {
      const srcCap = Math.max(0, cs2 - keep);
      return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
    }
    return 0;
  }

  if (cs1 === 0 && cs2 > 1) {
    const srcCap = Math.max(0, cs2 - keep);
    return Math.min(1, srcCap);
  }

  if (goiy === '1v2') {
    const need_min = Math.max(0, CFG.dest_min - cs2);
    const need_bias = CFG.prefer_cs2
      ? Math.ceil((cs1 - cs2 + 1) / 2)
      : Math.ceil((cs1 - cs2) / 2);
    const q0 = Math.max(need_min, need_bias, 0);
    const srcCap = Math.max(0, cs1 - keep);
    return Math.max(0, Math.min(q0, srcCap, maxm));
  }

  if (goiy === '2v1') {
    const need_min = Math.max(0, CFG.dest_min - cs1);
    const need_bias = CFG.prefer_cs2
      ? Math.ceil((cs2 - cs1 - 1) / 2)
      : Math.ceil((cs2 - cs1) / 2);
    const q0 = Math.max(need_min, need_bias, 0);
    const srcCap = Math.max(0, cs2 - keep);
    return Math.max(0, Math.min(q0, srcCap, maxm));
  }

  return 0;
}

function getDirByPageKind(pageKind) {
  return pageKind === 'cs2' ? '2v1' : '1v2';
}

function getTargetUrlByPageKind(pageKind) {
  return pageKind === 'cs2'
    ? 'https://banle-js.vercel.app/ccn2v1cs2.html'
    : 'https://banle-js.vercel.app/ccn1v2cs1.html';
}

async function fetchRecentSaleHeaders() {
  const fromDate = getYesterdayYmd();
  const toDate = getTodayYmd();

  const { data, error } = await supabase
    .from('hoadon_banle')
    .select('sohd, ngay')
    .gte('ngay', fromDate)
    .lte('ngay', toDate);

  if (error) {
    console.error('[CK Popup] Lỗi lấy header hóa đơn gần đây:', error);
    return [];
  }

  const rows = (data || []).filter(r => {
    const sohd = String(r.sohd || '').toLowerCase().trim();
    return SALES_PREFIXES.some(prefix => sohd.startsWith(prefix));
  });

  return rows;
}

async function fetchRecentSaleDetails(sohds) {
  if (!Array.isArray(sohds) || !sohds.length) return [];

  const { data, error } = await supabase
    .from('ct_hoadon_banle')
    .select('id, sohd, masp, size, soluong')
    .in('sohd', sohds);

  if (error) {
    console.error('[CK Popup] Lỗi lấy chi tiết hóa đơn gần đây:', error);
    return [];
  }

  return (data || []).map(r => ({
    id: r.id,
    sohd: String(r.sohd || ''),
    masp: normalizeMasp(r.masp),
    size: normalizeSize(r.size),
    soluong: Number(r.soluong || 0),
    admin_xnccn: false
  }));
}

async function fetchXntNhanhRows(masps) {
  if (!Array.isArray(masps) || !masps.length) return [];

  const { data, error } = await supabase.rpc('xntnhanh', {
    p_masps: masps,
    p_den_ngay: getTodayYmd(),
    p_tonghop_size: false
  });

  if (error) {
    console.error('[CK Popup] Lỗi RPC xntnhanh:', error);
    return [];
  }

  return (data || []).map(r => ({
    masp: normalizeMasp(r.masp),
    size: normalizeSize(r.size),
    ton_cs1: Number(r.ton_cs1 || 0),
    ton_cs2: Number(r.ton_cs2 || 0)
  }));
}

function buildPopupRows({ xntRows, dir, saleCtMapByMasp }) {
  const grouped = new Map();

  for (const r of xntRows) {
    const masp = normalizeMasp(r.masp);
    if (!masp) continue;

    if (!saleCtMapByMasp.has(masp)) continue;

    const goiy = calcGoiy(Number(r.ton_cs1 || 0), Number(r.ton_cs2 || 0));
    if (goiy !== dir) continue;

    const sl = calcMoveQty(Number(r.ton_cs1 || 0), Number(r.ton_cs2 || 0), goiy);
    if (!sl || sl <= 0) continue;

    if (!grouped.has(masp)) {
      grouped.set(masp, {
        masp,
        dir: goiy,
        items: []
      });
    }

    grouped.get(masp).items.push({
      size: normalizeSize(r.size),
      sl: Number(sl)
    });
  }

  const out = [];
  for (const [, v] of grouped) {
    const sortedItems = sortSizesAsc(v.items).filter(x => Number(x.sl || 0) > 0);

    if (!sortedItems.length) continue;

    const displayText = sortedItems
      .map(it => `${it.size}/${it.sl}`)
      .join(' ');

    out.push({
      masp: v.masp,
      dir: v.dir,
      displayText,
      items: sortedItems
    });
  }

  out.sort((a, b) => a.masp.localeCompare(b.masp, 'vi'));
  return out;
}

async function persistAdminConfirmByMasp({ masps, sohds }) {
  const uniqMasps = [...new Set((masps || []).map(normalizeMasp).filter(Boolean))];
  const uniqSohds = [...new Set((sohds || []).map(x => String(x || '').trim()).filter(Boolean))];

  if (!uniqMasps.length || !uniqSohds.length) return;

  const { error } = await supabase
    .from('ct_hoadon_banle')
    .update({ admin_xnccn: true })
    .in('sohd', uniqSohds)
    .in('masp', uniqMasps);

  if (error) {
    console.error('[CK Popup] Lỗi cập nhật admin_xnccn:', error);
    throw error;
  }
}

function openQuickStock(masp) {
  try {
    if (typeof window.stockQuickPopup === 'function') {
      window.stockQuickPopup(normalizeMasp(masp));
    }
  } catch (e) {
    console.error('[CK Popup] Lỗi mở stockQuickPopup:', e);
  }
}

function buildPrefillPayload(rows, pageKind) {
  const dir = getDirByPageKind(pageKind);

  return {
    dir,
    note: 'Tạo từ popup đề nghị chuyển kho',
    items: rows.map(r => ({
      masp: r.masp,
      items: sortSizesAsc(r.items).map(x => ({
        size: x.size,
        sl: Number(x.sl || 0)
      }))
    }))
  };
}

function showPopupChuyenKho(rows, context) {
  if (!rows || !rows.length) return;
  if (popupChuyenKhoDangMo) return;
  popupChuyenKhoDangMo = true;

  const isAdmin = getIsAdminLike();
  const targetUrl = getTargetUrlByPageKind(context.pageKind);

  const overlay = document.createElement('div');
  overlay.id = 'chuyenkho-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.03)',
    zIndex: '9998'
  });

  const box = document.createElement('div');
  box.id = 'chuyenkho-popup';
  Object.assign(box.style, {
    position: 'fixed',
    top: '10px',
    left: '10px',
    minWidth: '520px',
    maxWidth: '760px',
    maxHeight: '70vh',
    overflow: 'auto',
    background: '#f6edd8',
    border: '1px solid #c9b179',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    zIndex: '9999',
    padding: '6px'
  });

  const headerRow = document.createElement('div');
  Object.assign(headerRow.style, {
    display: 'grid',
    gridTemplateColumns: '145px 120px 120px 120px 1fr 70px 26px',
    gap: '0',
    alignItems: 'center',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: '600'
  });

  function mkHeaderCell(text, bg = '#f1d280') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.padding = '6px 8px';
    div.style.background = bg;
    div.style.border = '1px solid #d2c19f';
    return div;
  }

  const btnTitle = mkHeaderCell('YÊU CẦU chuyển kho');
  const btnTao = document.createElement('button');
  btnTao.textContent = 'Tạo hd CCN';
  Object.assign(btnTao.style, {
    padding: '6px 8px',
    border: '1px solid #d2c19f',
    background: '#f1c75b',
    cursor: 'pointer',
    fontWeight: '600'
  });

  const btnDong = document.createElement('button');
  btnDong.textContent = 'DONG';
  Object.assign(btnDong.style, {
    padding: '6px 8px',
    border: '1px solid #d2c19f',
    background: '#dfe8cc',
    cursor: 'pointer',
    fontWeight: '600'
  });

  const filler1 = mkHeaderCell('', '#f6edd8');
  const filler2 = mkHeaderCell('', '#f6edd8');
  const filler3 = mkHeaderCell('', '#f6edd8');
  const filler4 = mkHeaderCell('', '#f6edd8');

  headerRow.appendChild(btnTitle);
  headerRow.appendChild(btnTao);
  headerRow.appendChild(btnDong);
  headerRow.appendChild(filler1);
  headerRow.appendChild(filler2);
  headerRow.appendChild(filler3);

  const btnX = document.createElement('button');
  btnX.textContent = '✕';
  Object.assign(btnX.style, {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700'
  });
  headerRow.appendChild(btnX);

  const table = document.createElement('table');
  Object.assign(table.style, {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  });

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');

  function mkTh(text) {
    const th = document.createElement('th');
    th.textContent = text;
    th.style.border = '1px solid #d2c19f';
    th.style.padding = '6px 8px';
    th.style.background = '#fff';
    return th;
  }

  function mkThWithCheckbox(text, checkboxEl) {
    const th = document.createElement('th');
    th.style.border = '1px solid #d2c19f';
    th.style.padding = '4px 6px';
    th.style.background = '#fff';

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'space-between';
    wrap.style.gap = '6px';

    const span = document.createElement('span');
    span.textContent = text;

    wrap.appendChild(span);
    wrap.appendChild(checkboxEl);
    th.appendChild(wrap);

    return th;
  }

  const cbAllChuyen = document.createElement('input');
  cbAllChuyen.type = 'checkbox';

  const cbAllAdmin = document.createElement('input');
  cbAllAdmin.type = 'checkbox';
  cbAllAdmin.disabled = !isAdmin;

  trh.appendChild(mkThWithCheckbox('chuyen CN', cbAllChuyen));
  trh.appendChild(mkTh('mã sp'));
  trh.appendChild(mkTh(getDirByPageKind(context.pageKind)));
  trh.appendChild(mkTh('GHI CHÚ'));
  trh.appendChild(mkThWithCheckbox('admin', cbAllAdmin));

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  const rowCheckRefs = [];
  const noteRefs = [];
  const adminRefs = [];

  rows.forEach((row) => {
    const tr = document.createElement('tr');

    const tdSel = document.createElement('td');
    tdSel.style.border = '1px solid #d2c19f';
    tdSel.style.textAlign = 'center';
    tdSel.style.padding = '6px 8px';
    const cbSel = document.createElement('input');
    cbSel.type = 'checkbox';
    tdSel.appendChild(cbSel);
    tr.appendChild(tdSel);

    const tdMasp = document.createElement('td');
    tdMasp.textContent = row.masp;
    tdMasp.style.border = '1px solid #d2c19f';
    tdMasp.style.padding = '6px 8px';
    tdMasp.style.cursor = 'pointer';
    tdMasp.addEventListener('click', (e) => {
      e.stopPropagation();
      openQuickStock(row.masp);
    });
    tr.appendChild(tdMasp);

    const tdSai = document.createElement('td');
    tdSai.textContent = row.displayText;
    tdSai.style.border = '1px solid #d2c19f';
    tdSai.style.padding = '6px 8px';
    tr.appendChild(tdSai);

    const tdNote = document.createElement('td');
    tdNote.style.border = '1px solid #d2c19f';
    tdNote.style.padding = '4px 6px';
    const inpNote = document.createElement('input');
    inpNote.type = 'text';
    inpNote.placeholder = '';
    inpNote.style.width = '100%';
    inpNote.style.boxSizing = 'border-box';
    tdNote.appendChild(inpNote);
    tr.appendChild(tdNote);

    const tdAdmin = document.createElement('td');
    tdAdmin.style.border = '1px solid #d2c19f';
    tdAdmin.style.textAlign = 'center';
    tdAdmin.style.padding = '6px 8px';
    const cbAdmin = document.createElement('input');
    cbAdmin.type = 'checkbox';
    cbAdmin.disabled = !isAdmin;
    tdAdmin.appendChild(cbAdmin);
    tr.appendChild(tdAdmin);

    rowCheckRefs.push({ row, cb: cbSel });
    noteRefs.push({ row, input: inpNote });
    adminRefs.push({ row, cb: cbAdmin });

    tbody.appendChild(tr);
  });

  // checkbox tổng cột "chuyen CN"
  cbAllChuyen.addEventListener('change', () => {
    rowCheckRefs.forEach(x => {
      x.cb.checked = cbAllChuyen.checked;
    });
  });

  // checkbox tổng cột "admin"
  cbAllAdmin.addEventListener('change', () => {
    if (!isAdmin) return;
    adminRefs.forEach(x => {
      if (!x.cb.disabled) {
        x.cb.checked = cbAllAdmin.checked;
      }
    });
  });

  // đồng bộ trạng thái checkbox tổng "chuyen CN" khi user tick lẻ
  rowCheckRefs.forEach(x => {
    x.cb.addEventListener('change', () => {
      const allChecked = rowCheckRefs.length > 0 && rowCheckRefs.every(r => r.cb.checked);
      const anyChecked = rowCheckRefs.some(r => r.cb.checked);
      cbAllChuyen.checked = allChecked;
      cbAllChuyen.indeterminate = !allChecked && anyChecked;
    });
  });

  // đồng bộ trạng thái checkbox tổng "admin" khi user tick lẻ
  adminRefs.forEach(x => {
    x.cb.addEventListener('change', () => {
      const enabledAdmins = adminRefs.filter(r => !r.cb.disabled);
      const allChecked = enabledAdmins.length > 0 && enabledAdmins.every(r => r.cb.checked);
      const anyChecked = enabledAdmins.some(r => r.cb.checked);
      cbAllAdmin.checked = allChecked;
      cbAllAdmin.indeterminate = !allChecked && anyChecked;
    });
  });

  box.appendChild(headerRow);
  box.appendChild(table);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  async function closePopup() {
    try {
      const adminMasps = adminRefs
        .filter(x => x.cb.checked)
        .map(x => x.row.masp);

      if (adminMasps.length) {
        await persistAdminConfirmByMasp({
          masps: adminMasps,
          sohds: context.recentSohds || []
        });
      }
    } catch (e) {
      console.error('[CK Popup] Lỗi khi đóng popup:', e);
      alert('Có lỗi khi lưu xác nhận admin chuyển kho.');
      return;
    } finally {
      popupChuyenKhoDangMo = false;
      overlay.remove();
    }
  }

  btnDong.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopup();
  });

  btnX.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopup();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePopup();
  });

  btnTao.addEventListener('click', () => {
    const pickedRows = rowCheckRefs
      .filter(x => x.cb.checked)
      .map(x => x.row);

    if (!pickedRows.length) {
      alert('Bạn chưa chọn mã nào để tạo hóa đơn chuyển kho.');
      return;
    }

    const payload = buildPrefillPayload(pickedRows, context.pageKind);
    localStorage.setItem('ccn_prefill_payload', JSON.stringify(payload));
    window.open(targetUrl, '_blank');
  });
}

async function runChuyenKhoCheck(contextOverride) {
  const ctx = contextOverride || window.__popupChuyenKhoContext;
  if (!ctx) return;
  if (popupChuyenKhoDangMo) return;

  const headers = await fetchRecentSaleHeaders();
  console.log('[CK Popup] headers =', headers);
  if (!headers.length) return;

  const sohds = [...new Set(headers.map(x => String(x.sohd || '').trim()).filter(Boolean))];
  console.log('[CK Popup] sohds =', sohds);
  if (!sohds.length) return;

  const ctRowsAll = await fetchRecentSaleDetails(sohds);
  console.log('[CK Popup] ctRowsAll =', ctRowsAll);
  if (!ctRowsAll.length) return;

  // chỉ giữ các dòng chưa admin xác nhận
  const ctRows = ctRowsAll; // tạm thời chưa có cột admin
  if (!ctRows.length) return;

  const saleCtMapByMasp = new Map();
  for (const row of ctRows) {
    const masp = normalizeMasp(row.masp);
    if (!masp) continue;
    if (!saleCtMapByMasp.has(masp)) saleCtMapByMasp.set(masp, []);
    saleCtMapByMasp.get(masp).push(row);
  }

  const masps = [...saleCtMapByMasp.keys()];
  if (!masps.length) return;

  const xntRows = await fetchXntNhanhRows(masps);
  console.log('[CK Popup] xntRows =', xntRows);
  if (!xntRows.length) return;

  const dir = getDirByPageKind(ctx.pageKind);
  const popupRows = buildPopupRows({
    xntRows,
    dir,
    saleCtMapByMasp
  });

  console.log('[CK Popup] popupRows =', popupRows, 'dir =', dir, 'pageKind =', ctx.pageKind);
  if (!popupRows.length) return;

  showPopupChuyenKho(popupRows, {
    ...ctx,
    recentSohds: sohds
  });
}

export function initPopupChuyenKhoContext({ pageKind, manvDangNhap }) {
  window.__popupChuyenKhoContext = { pageKind, manvDangNhap };
}

export function triggerChuyenKhoCheckNgay() {
  runChuyenKhoCheck();
}

window.triggerChuyenKhoCheckNgay = triggerChuyenKhoCheckNgay;
