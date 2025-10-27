// popupNgang.js — Popup bảng ngang (NHẬP NHANH size + Lưu về bangKetQua)
// Nâng cấp từ phiên bản chỉ xem: thêm ô nhập size, tổng theo dòng & tổng cuối bảng, Enter để nhảy ô, và nút Lưu.
export const popupNgang = (() => {
  let styleEl, wrap, tableEl, closeBtn, overlay, saveBtn, titleEl;
  const DEFAULT_SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  function ensureDom() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = `
        .pn-overlay{position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:9997;}
        .pn-wrap{
          position:fixed;inset:auto;left:50%;top:6%;
          transform:translateX(-50%);width:min(1150px,96vw);height:88vh;
          background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.25);
          z-index:9998;display:flex;flex-direction:column;overflow:hidden;
          font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif
        }
        .pn-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0aa; color:#fff;}
        .pn-title{font-weight:600;font-size:16px;flex:1}
        .pn-close,.pn-save{border:0;background:#fff;color:#0aa;border-radius:8px;padding:6px 10px;cursor:pointer}
        .pn-save{background:#ffe066;color:#5a3d00;font-weight:600}
        .pn-body{padding:10px;overflow:auto;background:#f8fafc}
        .pn-table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed}
        .pn-table th,.pn-table td{border:1px solid #e5e7eb;padding:6px 8px;text-align:center;white-space:nowrap}
        .pn-table th{position:sticky;top:0;background:#eef;z-index:1}
        .pn-col-left{text-align:left}
        .pn-input{width:68px;max-width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:3px 6px;text-align:center;font:inherit}
        .pn-input:focus{outline:2px solid #0aa;outline-offset:0}
        .pn-total-cell{font-weight:600;background:#f6fff6}
        tfoot .pn-total-cell{background:#f0fdf4}
        body.pn-locked{overflow:hidden}
      `;
      document.head.appendChild(styleEl);
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'pn-overlay';
      overlay.style.display = 'none';
      overlay.addEventListener('click', close);
      document.body.appendChild(overlay);
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'pn-wrap';
      wrap.style.display = 'none';
      wrap.innerHTML = `
        <div class="pn-head">
          <div class="pn-title">Bảng ngang (nhập nhanh size)</div>
          <button class="pn-save" type="button">💾 Lưu dữ liệu</button>
          <button class="pn-close" type="button">Đóng (Esc)</button>
        </div>
        <div class="pn-body"></div>
      `;
      document.body.appendChild(wrap);
      titleEl = wrap.querySelector('.pn-title');
      closeBtn = wrap.querySelector('.pn-close');
      saveBtn = wrap.querySelector('.pn-save');
      closeBtn.addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (wrap.style.display === 'none') return;
        if (e.key === 'Escape') close();
      }, true);
      saveBtn.addEventListener('click', onSaveClick);
    }
  }

  function groupToWide(rows, sizes = DEFAULT_SIZES) {
    // rows: [{masp, size, sl, tenhang?}]
    const map = new Map();
    rows.forEach(r => {
      const masp = String(r.masp || '').trim().toUpperCase();
      if (!masp) return;
      const size = parseInt(r.size, 10);
      const sl = Number(r.sl) || 0;
      if (!map.has(masp)) {
        map.set(masp, { masp, tenhang: r.tenhang || '', bySize: new Map(), total: 0 });
      }
      const obj = map.get(masp);
      obj.bySize.set(size, (obj.bySize.get(size) || 0) + sl);
      obj.total += sl;
      if (r.tenhang && !obj.tenhang) obj.tenhang = r.tenhang;
    });
    const out = [];
    for (const obj of map.values()) {
      const row = { masp: obj.masp, tenhang: obj.tenhang, total: obj.total };
      sizes.forEach(s => row[s] = obj.bySize.get(s) || 0);
      out.push(row);
    }
    return out;
  }

  function renderTableEditable(wideRows, sizes = DEFAULT_SIZES) {
    const body = wrap.querySelector('.pn-body');
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'pn-table';
    tableEl = table;

    // header
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const h0 = document.createElement('th');
    h0.textContent = 'Mã SP';
    h0.className = 'pn-col-left';
    trh.appendChild(h0);
    sizes.forEach(s => {
      const th = document.createElement('th');
      th.textContent = String(s);
      trh.appendChild(th);
    });
    const ht = document.createElement('th');
    ht.textContent = 'Tổng SL';
    trh.appendChild(ht);
    thead.appendChild(trh);

    // body
    const tbody = document.createElement('tbody');

    wideRows.forEach((r, rowIdx) => {
      const tr = document.createElement('tr');

      const td0 = document.createElement('td');
      td0.className = 'pn-col-left';
      td0.textContent = r.masp;
      td0.title = r.tenhang || '';
      tr.appendChild(td0);

      let rowTotal = 0;
      sizes.forEach((s, colIdx) => {
        const td = document.createElement('td');
        const v = Number(r[s]) || 0;
        rowTotal += v;

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'numeric';
        inp.className = 'pn-input';
        inp.value = v > 0 ? String(v) : '';
        inp.dataset.masp = r.masp;
        inp.dataset.size = String(s);
        inp.dataset.row = String(rowIdx);
        inp.dataset.col = String(colIdx);

        // Bôi đen khi focus
        inp.addEventListener('focus', () => { inp.select(); });

        // Chuẩn hoá & tính lại tổng khi nhập
        const normalize = () => {
          let val = inp.value.replace(/[^0-9]/g, '');
          if (val === '') val = '';
          else val = String(Math.max(0, parseInt(val, 10) || 0));
          if (inp.value !== val) inp.value = val;
          recalcRowTotal(tr);
          recalcFooterTotals();
        };
        inp.addEventListener('input', normalize);
        inp.addEventListener('blur', normalize);

        // Enter để nhảy ô (0→38→…→45); hết hàng → xuống hàng dưới size 0
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          moveFocusToNext(inp, sizes);
        });

        td.appendChild(inp);
        tr.appendChild(td);
      });

      const tdt = document.createElement('td');
      tdt.className = 'pn-total-cell';
      tdt.textContent = rowTotal > 0 ? String(rowTotal) : '';
      tdt.dataset.role = 'row-total';
      tr.appendChild(tdt);

      tbody.appendChild(tr);
    });

    // footer totals row
    const tfoot = document.createElement('tfoot');
    const trf = document.createElement('tr');
    const tf0 = document.createElement('td');
    tf0.className = 'pn-col-left';
    tf0.textContent = 'TỔNG CỘNG';
    trf.appendChild(tf0);

    sizes.forEach((s) => {
      const td = document.createElement('td');
      td.className = 'pn-total-cell';
      td.dataset.role = 'col-total';
      td.dataset.size = String(s);
      trf.appendChild(td);
    });
    const tfT = document.createElement('td');
    tfT.className = 'pn-total-cell';
    tfT.dataset.role = 'grand-total';
    trf.appendChild(tfT);
    tfoot.appendChild(trf);

    table.appendChild(thead);
    table.appendChild(tbody);
    table.appendChild(tfoot);
    body.appendChild(table);

    // initial totals
    recalcFooterTotals();
    // focus ô đầu tiên
    const firstInput = table.querySelector('tbody input.pn-input');
    if (firstInput) firstInput.focus();
  }

  function recalcRowTotal(tr) {
    let sum = 0;
    tr.querySelectorAll('input.pn-input').forEach(inp => {
      const v = Number(inp.value) || 0;
      sum += v;
    });
    const cell = tr.querySelector('td[data-role="row-total"]');
    if (cell) cell.textContent = sum > 0 ? String(sum) : '';
  }

  function recalcFooterTotals() {
    if (!tableEl) return;
    const sizes = DEFAULT_SIZES;
    let grand = 0;
    // per column
    sizes.forEach((s) => {
      let csum = 0;
      tableEl.querySelectorAll('tbody tr').forEach(tr => {
        const inp = tr.querySelector(`input.pn-input[data-size="${s}"]`);
        const v = Number(inp && inp.value ? inp.value : 0) || 0;
        csum += v;
      });
      const cell = tableEl.querySelector(`tfoot td[data-role="col-total"][data-size="${s}"]`);
      if (cell) cell.textContent = csum > 0 ? String(csum) : '';
      grand += csum;
    });
    const gcell = tableEl.querySelector('tfoot td[data-role="grand-total"]');
    if (gcell) gcell.textContent = grand > 0 ? String(grand) : '';
  }

  function moveFocusToNext(inp, sizes) {
    const row = parseInt(inp.dataset.row, 10);
    const col = parseInt(inp.dataset.col, 10);
    const nextCol = col + 1;
    const tbody = tableEl.querySelector('tbody');
    const rowCount = tbody ? tbody.rows.length : 0;

    let targetRow = row, targetCol = nextCol;
    if (nextCol >= sizes.length) {
      targetRow = row + 1;
      targetCol = 0;
    }
    if (targetRow >= rowCount) return;
    const next = tableEl.querySelector(`input.pn-input[data-row="${targetRow}"][data-col="${targetCol}"]`);
    if (next) next.focus();
  }

  function readTableAsWide() {
    // DOM → [{masp, [size], total}]
    const wide = [];
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return wide;
    const sizes = DEFAULT_SIZES;
    Array.from(tbody.rows).forEach(tr => {
      const masp = (tr.cells[0]?.textContent || '').trim().toUpperCase();
      if (!masp) return;
      const row = { masp, tenhang: '', total: 0 };
      sizes.forEach((s) => {
        const inp = tr.querySelector(`input.pn-input[data-size="${s}"]`);
        const v = Number(inp && inp.value ? inp.value : 0) || 0;
        row[s] = v;
        row.total += v;
      });
      wide.push(row);
    });
    return wide;
  }

  function onSaveClick() {
    // 1) Đọc bảng popup → wideRows
    const wide = readTableAsWide(); // [{masp, [size], total}]
    // 2) Ghi về window.bangKetQua (dọc): mỗi (masp, size) với sl>0 là một entry
    const bang = window.bangKetQua || {};
    const sizes = DEFAULT_SIZES;

    function ensureMasP(masp) {
      if (!bang[masp]) {
        // Thử lấy meta từ window.sanPhamData nếu có
        const sp = (window.sanPhamData && window.sanPhamData[masp]) || {};
        bang[masp] = {
          masp,
          tensp: sp.tensp || '',
          sizes: [],
          soluongs: [],
          gia: sp.gianhap || 0,
          km: 0,
          dvt: sp.dvt || ''
        };
      }
    }

    // Ghi đè hoàn toàn theo số đang có ở popup (giữ bangKetQua gọn)
    wide.forEach(row => {
      const masp = row.masp;
      ensureMasP(masp);
      bang[masp].sizes = [];
      bang[masp].soluongs = [];
      sizes.forEach(s => {
        const sl = Number(row[s]) || 0;
        if (sl > 0) {
          bang[masp].sizes.push(String(s));
          bang[masp].soluongs.push(sl);
        }
      });
    });

    window.bangKetQua = bang;

    // 3) Render lại bảng dọc + tổng nếu có hàm
    if (typeof window.capNhatBangHTML === 'function') {
      window.capNhatBangHTML(window.bangKetQua);
    }
    if (typeof window.capNhatThongTinTong === 'function') {
      window.capNhatThongTinTong(window.bangKetQua);
    }
    // Không auto-đóng để bạn có thể nhập tiếp. Muốn đóng ngay thì gọi close();
  }

  function renderTable(wideRows, sizes = DEFAULT_SIZES) {
    // API cũ: nếu nơi khác gọi renderTable, vẫn hoạt động
    renderTableEditable(wideRows, sizes);
  }

  function open(rows, opts = {}) {
    ensureDom();
    const sizes = Array.isArray(opts.sizes) && opts.sizes.length ? opts.sizes : DEFAULT_SIZES;
    const wide = groupToWide(rows, sizes);
    renderTableEditable(wide, sizes);
    document.body.classList.add('pn-locked');
    overlay.style.display = 'block';
    wrap.style.display = 'flex';
  }

  function close() {
    if (!wrap) return;
    wrap.style.display = 'none';
    overlay.style.display = 'none';
    document.body.classList.remove('pn-locked');
  }

  return { open, close, groupToWide, renderTable };
})();
