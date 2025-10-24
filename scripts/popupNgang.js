// popupNgang.js — Popup xem nhanh bảng ngang (read-only)
export const popupNgang = (() => {
  let styleEl, wrap, tableEl, closeBtn, overlay;

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
        .pn-close{border:0;background:#fff;color:#0aa;border-radius:8px;padding:6px 10px;cursor:pointer}
        .pn-body{padding:10px;overflow:auto;background:#f8fafc}
        .pn-table{width:100%;border-collapse:collapse;background:#fff}
        .pn-table th,.pn-table td{border:1px solid #e5e7eb;padding:6px 8px;text-align:center;white-space:nowrap}
        .pn-table th{position:sticky;top:0;background:#eef;z-index:1}
        .pn-col-left{text-align:left}
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
          <div class="pn-title">Bảng ngang (chỉ xem)</div>
          <button class="pn-close" type="button">Đóng (Esc)</button>
        </div>
        <div class="pn-body"></div>
      `;
      document.body.appendChild(wrap);
      closeBtn = wrap.querySelector('.pn-close');
      closeBtn.addEventListener('click', close);
      document.addEventListener('keydown', (e)=>{
        if (wrap.style.display==='none') return;
        if (e.key === 'Escape') close();
      }, true);
    }
  }

  function groupToWide(rows, sizes=DEFAULT_SIZES) {
    // rows: [{masp, size, sl, tenhang?}]
    const map = new Map();
    rows.forEach(r=>{
      const masp = String(r.masp||'').trim().toUpperCase();
      if (!masp) return;
      const size = parseInt(r.size,10);
      const sl   = Number(r.sl)||0;
      const key  = masp;
      if (!map.has(key)) {
        map.set(key, { masp, tenhang: r.tenhang||'', bySize: new Map(), total:0 });
      }
      const obj = map.get(key);
      obj.bySize.set(size, (obj.bySize.get(size)||0) + sl);
      obj.total += sl;
      if (r.tenhang && !obj.tenhang) obj.tenhang = r.tenhang;
    });
    // build array
    const out = [];
    for (const obj of map.values()) {
      const row = { masp: obj.masp, tenhang: obj.tenhang, total: obj.total };
      sizes.forEach(s=> row[s] = obj.bySize.get(s)||0);
      out.push(row);
    }
    return out;
  }

  function renderTable(wideRows, sizes=DEFAULT_SIZES) {
    const body = wrap.querySelector('.pn-body');
    body.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'pn-table';

    // header
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const h1 = document.createElement('th'); h1.textContent='Mã SP'; h1.className='pn-col-left'; trh.appendChild(h1);
    sizes.forEach(s=>{ const th=document.createElement('th'); th.textContent=String(s); trh.appendChild(th); });
    const ht = document.createElement('th'); ht.textContent='Tổng SL'; trh.appendChild(ht);
    thead.appendChild(trh);

    // body
    const tbody = document.createElement('tbody');
    wideRows.forEach(r=>{
      const tr = document.createElement('tr');
      const td0 = document.createElement('td'); td0.textContent = r.masp; td0.className='pn-col-left'; tr.appendChild(td0);
      sizes.forEach(s=>{
        const td=document.createElement('td'); td.textContent = (r[s]||0); tr.appendChild(td);
      });
      const tdt = document.createElement('td'); tdt.textContent = r.total; tr.appendChild(tdt);
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    body.appendChild(table);
    tableEl = table;
  }

  function open(rows, opts={}) {
    ensureDom();
    const sizes = Array.isArray(opts.sizes) && opts.sizes.length ? opts.sizes : DEFAULT_SIZES;
    const wide = groupToWide(rows, sizes);
    renderTable(wide, sizes);
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
