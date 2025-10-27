// popupNgang.js — Popup bảng ngang (NHẬP NHANH size + Lưu về bangKetQua)
// Bản đã gồm: save-close, Tổng SL bỏ size 0, wrap Mã SP, ô nhập như text,
// và colgroup/biến --sizeW để cột Mã rộng gấp 3 lần các cột size.
export const popupNgang = (() => {
  let styleEl, wrap, tableEl, overlay, saveBtn, closeBtn;
  let currentSizes = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  function ensureDom() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = `
        .pn-overlay{position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:9997;}
        .pn-wrap{
          position:fixed;left:50%;top:6%;transform:translateX(-50%);
          width:min(1150px,96vw);height:88vh;background:#fff;border-radius:12px;
          box-shadow:0 20px 60px rgba(0,0,0,.25);z-index:9998;display:flex;flex-direction:column;overflow:hidden;
          font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;
          /* (NEW) kích thước cột qua biến: Mã = 3×sizeW */
          --sizeW: 72px;
        }
        .pn-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0aa;color:#fff}
        .pn-title{font-weight:600;font-size:16px;flex:1}
        .pn-status{margin-left:8px;font-weight:600}
        .pn-btn{border:0;background:#fff;color:#0aa;border-radius:8px;padding:6px 10px;cursor:pointer}
        .pn-btn-save{background:#ffe066;color:#5a3d00;font-weight:600}
        .pn-body{padding:10px;overflow:auto;background:#f8fafc}
        .pn-table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed}
        .pn-table th,.pn-table td{border:1px solid #e5e7eb;padding:6px 8px;text-align:center;white-space:nowrap}
        .pn-table th{position:sticky;top:0;background:#eef;z-index:1}
        /* (3) Mã SP: cho phép xuống dòng để không che cột size */
        .pn-col-left{text-align:left;white-space:normal;word-break:break-word;line-height:1.2}

        /* (NEW) kiểm soát độ rộng cột bằng colgroup */
        .pn-table .pn-col-masp{ width: calc(var(--sizeW) * 3); }
        .pn-table .pn-col-size{ width: var(--sizeW); }
        .pn-table .pn-col-total{ width: var(--sizeW); }

        /* (4) Ô nhập như text: borderless, trong suốt */
        .pn-input{width:100%;max-width:100%;border:0;background:transparent;padding:0;text-align:center;font:inherit;-webkit-appearance:none;appearance:none;height:28px}
        .pn-input:focus{outline:0;box-shadow:inset 0 -2px 0 rgba(0,170,170,.6)}
        .pn-total-cell{font-weight:600;background:#f6fff6}
        tfoot .pn-total-cell{background:#f0fdf4}
        body.pn-locked{overflow:hidden}

        /* Mobile: co nhỏ một chút vẫn giữ tỉ lệ Mã = 3× size */
        @media (max-width: 480px){
          .pn-wrap{ --sizeW: 30px; }
        }
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
          <div class="pn-status"></div>
          <button type="button" class="pn-btn pn-btn-save">💾 Lưu dữ liệu</button>
          <button type="button" class="pn-btn pn-btn-close">Đóng (Esc)</button>
        </div>
        <div class="pn-body"></div>
      `;
      document.body.appendChild(wrap);

      saveBtn = wrap.querySelector('.pn-btn-save');
      closeBtn = wrap.querySelector('.pn-btn-close');

      saveBtn.addEventListener('click', onSaveClick);
      closeBtn.addEventListener('click', close);
      document.addEventListener('keydown', (e) => {
        if (wrap.style.display === 'none') return;
        if (e.key === 'Escape') close();
      }, true);
    }
  }

  // rows: [{masp, size, sl, tensp/tenhang?}]
  function groupToWide(rows, sizes = currentSizes) {
    const map = new Map();
    for (const r of rows || []) {
      const masp = String(r.masp || '').trim().toUpperCase();
      if (!masp) continue;
      const size = parseInt(r.size, 10);
      const sl = Number(r.sl) || 0;
      if (!map.has(masp)) {
        map.set(masp, { masp, tenhang: r.tenhang || r.tensp || '', bySize: new Map(), total: 0 });
      }
      const obj = map.get(masp);
      obj.bySize.set(size, (obj.bySize.get(size) || 0) + sl);
      obj.total += sl;
      if ((r.tenhang || r.tensp) && !obj.tenhang) obj.tenhang = r.tenhang || r.tensp;
    }
    const out = [];
    for (const obj of map.values()) {
      const row = { masp: obj.masp, tenhang: obj.tenhang, total: obj.total };
      sizes.forEach(s => row[s] = obj.bySize.get(s) || 0);
      out.push(row);
    }
    return out;
  }

  function renderTableEditable(wideRows, sizes = currentSizes) {
    const body = wrap.querySelector('.pn-body');
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'pn-table';
    tableEl = table;

    // (NEW) colgroup: 1 cột Mã, N cột size, 1 cột Tổng
    const colgroup = document.createElement('colgroup');
    const colM = document.createElement('col');
    colM.className = 'pn-col-masp';
    colgroup.appendChild(colM);
    sizes.forEach(() => {
      const c = document.createElement('col');
      c.className = 'pn-col-size';
      colgroup.appendChild(c);
    });
    const colT = document.createElement('col');
    colT.className = 'pn-col-total';
    colgroup.appendChild(colT);
    table.appendChild(colgroup);

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

      // (2) Tổng SL theo dòng: chỉ cộng 38→45 (bỏ size 0)
      let rowTotal = 0;

      sizes.forEach((s, colIdx) => {
        const td = document.createElement('td');
        const v = Number(r[s]) || 0;
        if (String(s) !== '0') rowTotal += v;

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'numeric';
        inp.className = 'pn-input';
        inp.value = v > 0 ? String(v) : '';
        inp.dataset.masp = r.masp;
        inp.dataset.size = String(s);
        inp.dataset.row = String(rowIdx);
        inp.dataset.col = String(colIdx);

        // Chọn hết khi focus
        inp.addEventListener('focus', () => inp.select());

        // Chuẩn hóa & tính lại tổng (bỏ 0)
        const normalize = () => {
          let val = inp.value.replace(/[^0-9]/g, '');
          if (val === '') val = '';
          else val = String(Math.max(0, parseInt(val, 10) || 0));
          if (inp.value !== val) inp.value = val;

          // recalc row total (skip size 0)
          let sum = 0;
          tr.querySelectorAll('input.pn-input').forEach(i => {
            if (i.dataset.size === '0') return;
            const vv = Number(i.value) || 0;
            sum += vv;
          });
          const cell = tr.querySelector('td[data-role="row-total"]');
          if (cell) cell.textContent = sum > 0 ? String(sum) : '';

          // recalc footer
          recalcFooterTotals();
        };
        inp.addEventListener('input', normalize);
        inp.addEventListener('blur', normalize);

        // Enter → nhảy ô; hết hàng → xuống hàng dưới, size đầu
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

    // footer totals
    const tfoot = document.createElement('tfoot');
    const trf = document.createElement('tr');
    const tf0 = document.createElement('td');
    tf0.className = 'pn-col-left';
    tf0.textContent = 'TỔNG CỘNG';
    trf.appendChild(tf0);

    sizes.forEach((s) => {
      let csum = 0;
      wideRows.forEach(r => csum += Number(r[s]) || 0);
      const td = document.createElement('td');
      td.className = 'pn-total-cell';
      td.dataset.role = 'col-total';
      td.dataset.size = String(s);
      td.textContent = csum > 0 ? String(csum) : '';
      trf.appendChild(td);
    });

    // Grand total: chỉ tính 38→45 (bỏ size 0)
    const tfT = document.createElement('td');
    tfT.className = 'pn-total-cell';
    tfT.dataset.role = 'grand-total';
    const grand = sizes.reduce((acc, s) => {
      if (String(s) === '0') return acc;
      let csum = 0;
      wideRows.forEach(r => csum += Number(r[s]) || 0);
      return acc + csum;
    }, 0);
    tfT.textContent = grand > 0 ? String(grand) : '';
    trf.appendChild(tfT);

    tfoot.appendChild(trf);

    table.appendChild(thead);
    table.appendChild(tbody);
    table.appendChild(tfoot);
    body.appendChild(table);

    // focus ô đầu tiên
    const firstInput = table.querySelector('tbody input.pn-input');
    if (firstInput) firstInput.focus();
  }

  function recalcFooterTotals() {
    if (!tableEl) return;
    let grand = 0;
    currentSizes.forEach((s) => {
      let csum = 0;
      tableEl.querySelectorAll('tbody tr').forEach(tr => {
        const inp = tr.querySelector(`input.pn-input[data-size="${s}"]`);
        const v = Number(inp && inp.value ? inp.value : 0) || 0;
        csum += v;
      });
      const cell = tableEl.querySelector(`tfoot td[data-role="col-total"][data-size="${s}"]`);
      if (cell) cell.textContent = csum > 0 ? String(csum) : '';
      if (String(s) !== '0') grand += csum; // bỏ size 0 khi cộng grand
    });
    const gcell = tableEl.querySelector('tfoot td[data-role="grand-total"]');
    if (gcell) gcell.textContent = grand > 0 ? String(grand) : '';
  }

  function moveFocusToNext(inp, sizes) {
    const row = parseInt(inp.dataset.row, 10);
    const col = parseInt(inp.dataset.col, 10);
    let targetRow = row, targetCol = col + 1;
    if (targetCol >= sizes.length) { targetRow = row + 1; targetCol = 0; }
    const next = tableEl.querySelector(`input.pn-input[data-row="${targetRow}"][data-col="${targetCol}"]`);
    if (next) next.focus();
  }

  // Đọc DOM → mảng wide [{masp, [size], total}]
  function readTableAsWide() {
    const wide = [];
    const tbody = tableEl?.querySelector('tbody');
    if (!tbody) return wide;
    Array.from(tbody.rows).forEach(tr => {
      const masp = (tr.cells[0]?.textContent || '').trim().toUpperCase();
      if (!masp) return;
      const row = { masp, tenhang: '', total: 0 };
      currentSizes.forEach((s) => {
        const inp = tr.querySelector(`input.pn-input[data-size="${s}"]`);
        const v = Number(inp && inp.value ? inp.value : 0) || 0;
        row[s] = v;
        if (String(s) !== '0') row.total += v; // total bỏ 0
      });
      wide.push(row);
    });
    return wide;
  }

  // Ghi về window.bangKetQua và refresh bảng dọc
  function updateBangKetQuaFromWide(wide) {
    const bang = window.bangKetQua || {};
    const sanPhamData = window.sanPhamData || {};
    for (const row of wide) {
      const masp = row.masp;
      const existed = bang[masp] || {};
      const sp = sanPhamData[masp] || {};
      const tensp = existed.tensp || sp.tensp || '';
      const gia = existed.gia ?? sp.gianhap ?? 0;
      const dvt = existed.dvt || sp.dvt || '';
      const km = existed.km ?? 0;

      const sizes = [];
      const soluongs = [];
      currentSizes.forEach(s => {
        const sl = Number(row[s]) || 0;
        if (sl > 0) { sizes.push(String(s)); soluongs.push(sl); }
      });

      bang[masp] = { masp, tensp, sizes, soluongs, gia, km, dvt };
    }
    window.bangKetQua = bang;
  }

  function flashStatus(msg = '', ms = 2000) {
    const st = wrap?.querySelector('.pn-status');
    if (!st) return;
    st.textContent = msg;
    if (ms > 0) setTimeout(() => { if (st.textContent === msg) st.textContent = ''; }, ms);
  }

  function callRendersIfAny() {
    let ok = false;
    try {
      if (typeof window.capNhatBangHTML === 'function') {
        window.capNhatBangHTML(window.bangKetQua);
        ok = true;
      }
    } catch(e) {}
    try {
      if (typeof window.capNhatThongTinTong === 'function') {
        window.capNhatThongTinTong(window.bangKetQua);
      }
    } catch(e) {}
    return ok;
  }

  async function onSaveClick() {
    try {
      flashStatus('Đang lưu…', 0);
      const wide = readTableAsWide();
      updateBangKetQuaFromWide(wide);
      const refreshed = callRendersIfAny();
      flashStatus(refreshed ? 'Đã lưu vào bảng kết quả ✓' : 'Đã lưu ✓ (chưa refresh bảng dọc)');
      // Đóng popup ngay sau khi lưu để quay về bảng kết quả
      close();
    } catch (err) {
      console.error('[popupNgang] Lỗi khi lưu:', err);
      flashStatus('Lỗi khi lưu! Xem console.', 3000);
      alert('Không lưu được dữ liệu. Vui lòng mở Console để xem chi tiết lỗi.');
    }
  }

  function open(rows, opts = {}) {
    ensureDom();
    currentSizes = Array.isArray(opts.sizes) && opts.sizes.length ? opts.sizes.slice() : currentSizes;
    const wide = groupToWide(rows, currentSizes);
    renderTableEditable(wide, currentSizes);
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

  return { open, close, groupToWide };
})();
