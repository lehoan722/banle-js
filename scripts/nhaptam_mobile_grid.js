// scripts/nhaptam_mobile_grid.js
;(() => {
  'use strict';

  const SIZES = [0,38,39,40,41,42,43,44,45];
  const tbl = document.querySelector('#bangketqua');
  const tbody = tbl?.querySelector('tbody');
  const rows = []; // { masp, qty:{}, vitri, t1, t2, qls }
  let activeMas = null;

  window.MobileKQ = { upsertRow, setQty, getAll, render, focusFirstSizeFor, moveRowToTopByMa, ensureVitriTonBatch };

  function getRowIdx(masp){ return rows.findIndex(r => r.masp === masp); }
  function makeEmptyRow(masp, qls=true){ const qty={}; SIZES.forEach(s=>qty[s]=0); return {masp, qty, vitri:'', t1:0, t2:0, qls}; }

  async function isQuanLySize(masp){
    if (typeof window.isQuanLySizeTheoDM === 'function') {
      try { return !!(await window.isQuanLySizeTheoDM(masp)); } catch(e){}
    }
    const sp = window.sanPhamData?.[masp];
    if (sp && String(sp.chungloai||'').toUpperCase()==='GD') return true;
    return true;
  }

  async function upsertRow(masp, {moveTop=true} = {}){
    masp = String(masp||'').trim().toUpperCase();
    if (!masp || !tbody) return;

    let i = getRowIdx(masp);
    if (i === -1){
      const qls = await isQuanLySize(masp);
      rows.unshift(makeEmptyRow(masp, qls));
      activeMas = masp;
    } else {
      if (moveTop && i !== 0){
        const r = rows.splice(i,1)[0];
        rows.unshift(r);
      }
      activeMas = masp;
      if (rows[0].qls === undefined) rows[0].qls = await isQuanLySize(masp);
      // KHÔNG reset số lượng – giữ nguyên đã nhập
    }
    render();
    focusFirstSizeFor(masp);
    ensureVitriTonBatch([masp]); // nạp vị trí + tồn

    // xóa #masp để gõ mã tiếp
    const mas = document.getElementById('masp'); if (mas) mas.value = '';
  }

  function setQty(masp, size, val){
    const i = getRowIdx(masp); if (i<0) return;
    const v = Math.max(0, parseInt(val||0,10) || 0);
    rows[i].qty[size] = v;
    paintCell(i,size); paintTotal(i);
  }

  function getAll(){
    return rows.map(r => ({ masp:r.masp, qty:{...r.qty}, vitri:r.vitri, t1:r.t1, t2:r.t2, qls:!!r.qls }));
  }

  function render(){
    if (!tbody) return;
    tbody.innerHTML = rows.map((r,ri)=>rowHtml(r,ri)).join('');
    rows.forEach((r,ri)=>{
      SIZES.forEach(sz=>{
        const inp = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${sz}"]`);
        if (!inp) return;
        inp.addEventListener('input', e=>{
          e.target.value = e.target.value.replace(/[^\d]/g,'');
          setQty(r.masp, sz, e.target.value);
        });
        inp.addEventListener('keydown', e=>{
          if (e.key==='Enter'){ e.preventDefault(); goNextCell(ri,sz); }
        });
        if (r.qls){ inp.disabled = (sz===0); } else { inp.disabled = (sz!==0); }
      });
    });
  }

  function rowHtml(r,ri){
    const t = sumSizes(r.qty);
    const cells = SIZES.map(sz=>`<td class="td-sz"><input data-sz="${sz}" value="${r.qty[sz]||''}" inputmode="numeric"></td>`).join('');
    return `<tr data-ri="${ri}" data-masp="${r.masp}">
      <td class="td-masp">${r.masp}</td>${cells}
      <td class="td-total" data-total>${t}</td>
      <td class="td-vitri">${r.vitri||''}</td>
      <td class="td-t1">${r.t1||0}</td>
      <td class="td-t2">${r.t2||0}</td>
    </tr>`;
  }

  function sumSizes(q){ return SIZES.reduce((s,k)=>s+(parseInt(q[k]||0,10)||0),0); }
  function paintCell(ri,sz){ const inp = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${sz}"]`); if (inp) inp.value = rows[ri].qty[sz]||''; }
  function paintTotal(ri){ const td = tbody.querySelector(`tr[data-ri="${ri}"] [data-total]`); if (td) td.textContent = sumSizes(rows[ri].qty); }

  function focusFirstSizeFor(masp){
    const i = getRowIdx(masp); if (i<0) return;
    const first = rows[i].qls ? 38 : 0;
    const el = tbody.querySelector(`tr[data-ri="${i}"] input[data-sz="${first}"]`);
    if (el){ el.focus(); el.select(); }
  }

  function goNextCell(ri,sz){
    const r = rows[ri]; const open = r.qls ? [38,39,40,41,42,43,44,45] : [0];
    const p = open.indexOf(sz);
    if (p < open.length-1){
      const next = open[p+1];
      const el = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${next}"]`);
      if (el){ el.focus(); el.select(); }
    } else {
      const mas = document.getElementById('masp'); mas?.focus(); mas?.select();
    }
  }

  function moveRowToTopByMa(masp){
    const i = getRowIdx(masp); if (i<=0) return;
    const r = rows.splice(i,1)[0]; rows.unshift(r); render();
  }

  async function ensureVitriTonBatch(listMas){
    try {
      const fn = window.AppAPI?.getVitriTonBatch || window.getVitriTonBatch;
      if (!fn) return;
      const cs = (localStorage.getItem('diadiem') || 'cs1').toLowerCase();
      const data = await fn(listMas, cs);
      if (!Array.isArray(data)) return;
      data.forEach(d=>{
        const i = getRowIdx(String(d.masp||'').toUpperCase());
        if (i>=0){ rows[i].vitri = d.vitri||''; rows[i].t1 = d.ton1||0; rows[i].t2 = d.ton2||0; }
      });
      rows.forEach((_,ri)=>{
        const tr = tbody.querySelector(`tr[data-ri="${ri}"]`);
        if (!tr) return;
        tr.querySelector('.td-vitri')?.replaceChildren(document.createTextNode(rows[ri].vitri||''));
        tr.querySelector('.td-t1')?.replaceChildren(document.createTextNode(rows[ri].t1||0));
        tr.querySelector('.td-t2')?.replaceChildren(document.createTextNode(rows[ri].t2||0));
      });
    } catch(e){}
  }

  // ENTER tại #masp → thêm/kéo dòng và focus size đầu
  const maspInp = document.getElementById('masp');
  maspInp?.addEventListener('keydown', async e=>{
    if (e.key!=='Enter') return;
    e.preventDefault(); e.stopImmediatePropagation();
    const ma = maspInp.value.trim(); if (!ma) return;
    await upsertRow(ma, {moveTop:true});
  });

  // Nút "Thêm mới" → xóa sạch grid + bộ nhớ cũ
  document.getElementById('them')?.addEventListener('click', ()=>{
    rows.length = 0; render();
    window.bangKetQua = {};
    ['masp','soluong','dvt','size','gia','khuyenmai','thanhtien','vitri'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('masp')?.focus();
  });

})();

// Vô hiệu hóa #size cũ – nếu lỡ focus thì đẩy về ô size đầu của dòng
(function(){
  const size = document.getElementById('size');
  if (!size) return;
  size.readOnly = true; size.tabIndex = -1;
  size.addEventListener('focus', e=>{
    e.preventDefault();
    const ma = (document.getElementById('masp')?.value||'').trim().toUpperCase();
    if (ma){ MobileKQ.focusFirstSizeFor(ma); }
  });
})();
