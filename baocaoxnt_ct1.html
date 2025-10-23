// FILE: /js/baocaoxnt_ct1.js
// Báo cáo XNT chi tiết 1 mã (không phân trang)
// - Gọi RPC: xnt17_ct_detail
// - Cột: STT | Chứng từ | Ngày giờ | Đầu kỳ | SL Nhập | SL Xuất | Tồn chạy | Khách hàng/NCC
// - Tô dòng: hover = xanh nhạt, selected = vàng
// - Click ô "Chứng từ" mở trang xemhoadon111.html?sohd=...

import { supabase } from './supabaseClient.js';

let hot;

// state cho tô dòng
let hoverRow = null;
let selectedRow = null;

const $ = (sel) => document.querySelector(sel);
const fmtInt = (v) =>
  v === null || v === undefined || isNaN(v) ? '' : Number(v).toLocaleString('vi-VN');

// Renderer ngày "22/10/2025 08h13"
function dateVNRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  if (!value) {
    td.textContent = '';
    return;
  }
  const d = new Date(value);
  const z = (n) => String(n).padStart(2, '0');
  td.textContent = `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(
    d.getHours()
  )}h${z(d.getMinutes())}`;
}

// tô/ bỏ tô 1 dòng với class cho toàn bộ cột
function paintRow(ht, row, className, on = true) {
  if (row == null || row < 0) return;
  const cols = ht.countCols ? ht.countCols() : 0;
  for (let c = 0; c < cols; c++) {
    const meta = ht.getCellMeta(row, c);
    const prev = meta.className || '';
    const parts = prev.split(' ').filter(Boolean);
    const has = parts.includes(className);
    if (on && !has) parts.push(className);
    if (!on && has) parts.splice(parts.indexOf(className), 1);
    const next = parts.join(' ');
    if (next !== prev) ht.setCellMeta(row, c, 'className', next);
  }
}

function getFilters() {
  const masp = ($('#masp').value || '').trim().toUpperCase();
  const tu = $('#tu').value ? new Date($('#tu').value).toISOString() : null;
  const den = $('#den').value ? new Date($('#den').value).toISOString() : null;
  const diadiem = $('#diadiem').value || null;
  return { masp, tu, den, diadiem };
}

async function runReport() {
  const f = getFilters();
  if (!f.masp) {
    alert('Nhập mã sản phẩm!');
    $('#masp').focus();
    return;
  }
  if (!f.tu || !f.den) {
    alert('Chọn khoảng thời gian (Từ/Đến)!');
    return;
  }

  $('#summary').textContent = 'Đang tải dữ liệu…';

  const { data, error } = await supabase.rpc('xnt17_ct_detail', {
    p_masp: f.masp,
    p_tu: f.tu,
    p_den: f.den,
    p_diadiem: f.diadiem,
  });

  if (error) {
    console.error(error);
    $('#summary').textContent = 'Lỗi tải dữ liệu: ' + (error.message || error);
    return;
  }

  // Chuẩn dữ liệu cho HOT
  const rows = (data || []).map((r) => [
    r.stt,
    r.sohd,
    r.ngay ? new Date(r.ngay) : null,
    r.dauky, // đầu kỳ từng dòng
    r.sl_nhap,
    r.sl_xuat,
    r.ton_chay,
    r.doitac,
  ]);

  // Tính tổng hợp nhanh
  let dauky = 0,
    tongNhap = 0,
    tongXuat = 0,
    cuoiky = 0;
  if (data && data.length) {
    dauky = data[0]?.dauky || 0; // dòng 0 là mở sổ
    tongNhap = data.reduce((s, r) => s + (r.sl_nhap || 0), 0);
    tongXuat = data.reduce((s, r) => s + (r.sl_xuat || 0), 0);
    cuoiky = data[data.length - 1]?.ton_chay || dauky + (tongNhap - tongXuat);
  }

  $('#summary').innerHTML =
    `Mã <b>${f.masp}</b> — Đầu kỳ: <b>${fmtInt(dauky)}</b> | ` +
    `Nhập: <b>${fmtInt(tongNhap)}</b> | ` +
    `Xuất: <b>${fmtInt(tongXuat)}</b> | ` +
    `Cuối kỳ: <b>${fmtInt(cuoiky)}</b>`;

  renderHOT(rows);
}

function renderHOT(rows) {
  const container = $('#grid');

  const settings = {
    data: rows,
    rowHeaders: true,
    colHeaders: [
      'STT',
      'Chứng từ',
      'Ngày giờ',
      'Đầu kỳ',
      'SL Nhập',
      'SL Xuất',
      'Tồn chạy',
      'Khách hàng / NCC',
    ],
    columns: [
      { type: 'numeric', readOnly: true, width: 60 }, // STT
      { readOnly: true, width: 180 }, // Chứng từ (click mở ở hook)
      { readOnly: true, renderer: dateVNRenderer, width: 170 }, // Ngày giờ
      { readOnly: true, type: 'numeric', width: 90 }, // Đầu kỳ
      { readOnly: true, type: 'numeric', width: 90 }, // SL Nhập
      { readOnly: true, type: 'numeric', width: 90 }, // SL Xuất
      { readOnly: true, type: 'numeric', width: 90 }, // Tồn chạy
      { readOnly: true, width: 240 }, // Đối tác
    ],
    stretchH: 'all',
    licenseKey: 'non-commercial-and-evaluation',
    height: 'auto',

    // ----- TÔ DÒNG -----
    afterOnCellMouseOver: function (event, coords) {
      const ht = this;
      if (coords.row >= 0 && coords.row !== hoverRow) {
        if (hoverRow !== null) paintRow(ht, hoverRow, 'row-hover', false);
        hoverRow = coords.row;
        paintRow(ht, hoverRow, 'row-hover', true);
        ht.render();
      }
    },
    afterOnCellMouseOut: function () {
      const ht = this;
      if (hoverRow !== null) {
        paintRow(ht, hoverRow, 'row-hover', false);
        hoverRow = null;
        ht.render();
      }
    },
    afterSelection: function (r1) {
      const ht = this;
      if (selectedRow !== null) paintRow(ht, selectedRow, 'row-selected', false);
      selectedRow = r1 >= 0 ? r1 : null;
      if (selectedRow !== null) paintRow(ht, selectedRow, 'row-selected', true);
      ht.render();
    },

    // ----- CLICK Ô "CHỨNG TỪ" -> MỞ XEM HOÁ ĐƠN -----
    afterOnCellMouseDown: function (event, coords) {
      const ht = this;
      const { row, col } = coords;
      if (row >= 0 && col === 1) {
        const sohd = ht.getDataAtCell(row, col);
        if (sohd && sohd !== 'Mở sổ') {
          event.stopPropagation();
          // mở tab mới xem hoá đơn 111
          window.open(`/xemhoadon111.html?sohd=${encodeURIComponent(sohd)}`, '_blank');
        }
      }
    },

    // Giữ highlight "Mở sổ"
    afterRender: function () {
      const ht = this;
      const count = ht.countRows ? ht.countRows() : 0;
      for (let r = 0; r < count; r++) {
        const stt = ht.getDataAtCell(r, 0);
        if (stt === 0) {
          for (const c of [0, 1, 2, 7]) ht.setCellMeta(r, c, 'className', 'htDimmed');
        }
      }
    },
  };

  if (!hot) {
    hot = new Handsontable(container, settings);
  } else {
    hot.updateSettings(settings, false);
    hot.loadData(rows);
    hoverRow = null;
    selectedRow = null;
    hot.render();
  }
}

// Xuất Excel
function exportExcel() {
  if (!hot) return;
  const aoa = [hot.getColHeader()].concat(hot.getData());
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'XNT_CT_1MA');
  const { masp, tu, den } = getFilters();
  const fname = `xnt_chitiet_${masp}_${(tu || '').slice(0, 10)}_${(den || '').slice(
    0,
    10
  )}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// Sự kiện
$('#btnRun').addEventListener('click', runReport);
$('#btnExport').addEventListener('click', exportExcel);
['#masp', '#tu', '#den'].forEach((sel) => {
  $(sel).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runReport();
  });
});

// Mặc định khoảng 30 ngày gần nhất
(function initDefaults() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  $('#tu').value = new Date(start.getTime() - 1000 * 60 * 60 * 24 * 30)
    .toISOString()
    .slice(0, 16);
  $('#den').value = end.toISOString().slice(0, 16);
})();
