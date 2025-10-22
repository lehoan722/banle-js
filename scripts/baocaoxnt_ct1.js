// FILE: public/scripts/baocaoxnt_ct1.js
import { supabase } from './supabaseClient.js';

let hot;

const $ = (sel) => document.querySelector(sel);
const fmtInt = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('vi-VN'));

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
    p_diadiem: f.diadiem
  });

  if (error) {
    console.error(error);
    $('#summary').textContent = 'Lỗi tải dữ liệu: ' + (error.message || error);
    return;
  }

  // Chuẩn dữ liệu cho HOT
  const rows = (data || []).map(r => ([
    r.stt,
    r.sohd,
    r.loaict,
    r.ngay ? new Date(r.ngay) : null,
    r.dvt,
    r.dauky,
    r.sl_nhap,
    r.sl_xuat,
    r.ton_chay,
    r.doitac
  ]));

  // Tính tổng hợp nhanh
  let dauky = 0, tongNhap = 0, tongXuat = 0, cuoiky = 0;
  if (data && data.length) {
    const first = data[0];
    dauky = first?.dauky || 0;
    tongNhap = data.reduce((s, r) => s + (r.sl_nhap || 0), 0);
    tongXuat = data.reduce((s, r) => s + (r.sl_xuat || 0), 0);
    cuoiky = data[data.length - 1]?.ton_chay || dauky + (tongNhap - tongXuat);
  }

  $('#summary').innerHTML =
    `Mã <b>${f.masp}</b> — Đầu kỳ: <b>${fmtInt(dauky)}</b> | `
    + `Nhập: <b>${fmtInt(tongNhap)}</b> | `
    + `Xuất: <b>${fmtInt(tongXuat)}</b> | `
    + `Cuối kỳ: <b>${fmtInt(cuoiky)}</b>`;

  renderHOT(rows);
}

function renderHOT(rows) {
  const container = $('#grid');

  if (!hot) {
    hot = new Handsontable(container, {
      data: rows,
      rowHeaders: true,
      colHeaders: [
        'STT', 'Chứng từ', 'Loại CT', 'Ngày giờ', 'ĐVT',
        'Đầu kỳ', 'SL Nhập', 'SL Xuất', 'Tồn chạy', 'Khách hàng / NCC'
      ],
      columns: [
        { type: 'numeric', readOnly: true, width: 60 },
        { readOnly: true, renderer: linkSohdRenderer, width: 160 },
        { readOnly: true, width: 160 },
        { readOnly: true, renderer: dateVNRenderer, width: 170 },
        { readOnly: true, width: 70 },
        { readOnly: true, type: 'numeric', width: 90 },
        { readOnly: true, type: 'numeric', width: 90 },
        { readOnly: true, type: 'numeric', width: 90 },
        { readOnly: true, type: 'numeric', width: 90 },
        { readOnly: true, width: 240 }
      ],
      stretchH: 'all',
      licenseKey: 'non-commercial-and-evaluation', // hoặc license của bạn
      height: 'auto',
      afterRender: function () {
        // làm nổi bật dòng "Mở sổ" (STT=0)
        const ht = this; // <- instance
        const count = ht.countRows ? ht.countRows() : 0;
        for (let r = 0; r < count; r++) {
          const stt = ht.getDataAtCell(r, 0);
          if (stt === 0) {
            ht.setCellMeta(r, 0, 'className', 'htDimmed');
            ht.setCellMeta(r, 1, 'className', 'htDimmed');
            ht.setCellMeta(r, 2, 'className', 'htDimmed');
            ht.setCellMeta(r, 3, 'className', 'htDimmed');
            ht.setCellMeta(r, 4, 'className', 'htDimmed');
            ht.setCellMeta(r, 9, 'className', 'htDimmed');
          }
        }
      }

    });
  } else {
    hot.loadData(rows);
  }
}

function linkSohdRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  const sohd = value || '';
  if (sohd && sohd !== 'Mở sổ') {
    td.innerHTML = `<u>${sohd}</u>`;
    td.style.color = '#1a73e8';
    td.style.cursor = 'pointer';
    td.onclick = (e) => {
      e.stopPropagation();
      window.open(`/xemhoadon111.html?sohd=${encodeURIComponent(sohd)}`, '_blank');
    };
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
  const fname = `xnt_chitiet_${masp}_${tu?.slice(0, 10)}_${den?.slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
}

function dateVNRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  if (!value) { td.textContent = ''; return; }
  const d = new Date(value);
  const z = (n) => String(n).padStart(2, '0');
  const s = `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}h${z(d.getMinutes())}`;
  td.textContent = s;
}


// Sự kiện
$('#btnRun').addEventListener('click', runReport);
$('#btnExport').addEventListener('click', exportExcel);

// Enter để chạy
['#masp', '#tu', '#den'].forEach(sel => {
  $(sel).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runReport();
  });
});

// Gợi ý: gán mặc định khoảng thời gian hôm nay
(function initDefaults() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  $('#tu').value = new Date(start.getTime() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 16); // mặc định lùi 30 ngày
  $('#den').value = end.toISOString().slice(0, 16);
})();
