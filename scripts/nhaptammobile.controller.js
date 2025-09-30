// public/scripts/nhaptammobile.controller.js
;(() => {
  'use strict';

  /*** CẤU HÌNH ***/
  const SIZES = [0,38,39,40,41,42,43,44,45];
  const STORAGE_KEY = 'nhaptammobilecs1_draft_v1';
  const CS = 'cs1';
  const DEFAULT_QUAN_SIZE_ON = true;

  /*** TIỆN ÍCH DOM ***/
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const getMaInput = () => document.getElementById('masp');

  /*** STATE ***/
  let lastSnapshot = null;
  let quanLySizeCache = new Map();

  /*** KHỞI TẠO ***/
  async function init(){
    try{
      $('#lblDiaDiem') && ($('#lblDiaDiem').textContent = 'CS1');
      $('#lblNgayGio') && ($('#lblNgayGio').textContent = new Date().toLocaleString());
      if (window.AppUser) $('#lblTenNV') && ($('#lblTenNV').textContent = window.AppUser.ten || window.AppUser.email || '-');
    }catch(_){}

    // Lấy số hóa đơn dự kiến
    try{
      const so = await window.SoHoaDon?.goiSoDuKien?.('nhaptamcs1');
      if (so) {
        $('#lblSoHD') && ($('#lblSoHD').textContent = so);
        $('#sohd') && ($('#sohd').value = so);
      }
    }catch(e){ console.warn('Không lấy được số hóa đơn', e); }

    // Sự kiện cho ô mã
    const maEl = getMaInput();
    maEl && maEl.addEventListener('keydown', onEnterMa);

    // Sự kiện cho size
    SIZES.forEach(sz=>{
      const el = $(`#q${sz}`);
      if(!el) return;
      el.addEventListener('keydown', (e)=>onEnterSize(e, sz));
      el.addEventListener('input', recalcNhapHienTai);
    });

    // Nút chức năng
    $('#btnChuyen1') && ($('#btnChuyen1').onclick = handleChuyen1);
    $('#btnChuyen2') && ($('#btnChuyen2').onclick = handleChuyen2);
    $('#btnThemMoi') && ($('#btnThemMoi').onclick = clearInputs);
    $('#btnLuu') && ($('#btnLuu').onclick = handleLuu);
    $('#btnXoaBang') && ($('#btnXoaBang').onclick = ()=>{ NTGrid.replaceState({}); localStorage.removeItem(STORAGE_KEY); onGridChanged(); });

    // Callback từ grid
    window.NTMobile.onGridChanged = onGridChanged;

    // Draft
    restoreDraft();
    recalcNhapHienTai();
  }

  /*** TỔNG SỐ LƯỢNG ĐANG NHẬP ***/
  function recalcNhapHienTai(){
    let s = 0;
    SIZES.forEach(sz=>{
      const v = parseInt(($(`#q${sz}`)?.value || '0').trim(),10);
      if(!isNaN(v) && v>0) s += v;
    });
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = s);
  }

  /*** QUẢN SIZE THEO MÃ ***/
  async function isQuanLySize(masp){
    // Tạm thời: nếu mã chứa "GD" => quản size
    if(masp.includes('GD')) return true;
    return !!DEFAULT_QUAN_SIZE_ON;
  }
  function toggleSizeInputs(qls){
    const open = (id,on)=>{
      const el = $(id); if(!el) return;
      el.disabled = !on;
      if (!on) el.value = '';
    };
    open('#q0', !qls);
    [38,39,40,41,42,43,44,45].forEach(sz=> open(`#q${sz}`, qls));
  }
  async function applyQuanLySizeForCurrentMa(){
    const el = getMaInput();
    const masp = (el?.value || '').trim().toUpperCase();
    if(!masp) return;
    const qls = await isQuanLySize(masp);
    quanLySizeCache.set(masp, qls);
    toggleSizeInputs(qls);
  }

  /*** ENTER FLOW ***/
  async function onEnterMa(e){
    if(e.key!=='Enter') return;
    e.preventDefault();
    const inp = getMaInput();
    if(!inp) return;
    const masp = (inp.value||'').trim().toUpperCase();
    if(!masp) return;

    await applyQuanLySizeForCurrentMa();

    if($('#q0') && !$('#q0').disabled){ $('#q0').focus(); $('#q0').select(); }
    else { $('#q38').focus(); $('#q38').select(); }
  }
  function onEnterSize(e, sz){
    if(e.key!=='Enter') return;
    e.preventDefault();
    const idx = SIZES.indexOf(sz);
    for(let i=idx+1;i<SIZES.length;i++){
      const nxt = SIZES[i];
      const el = $(`#q${nxt}`);
      if(el && !el.disabled){ el.focus(); el.select(); return; }
    }
    const maEl = getMaInput(); maEl?.focus(); maEl?.select();
  }

  /*** CHUYỂN 1 ***/
  function handleChuyen1(){
    const el = getMaInput();
    const masp = (el?.value || '').trim().toUpperCase();
    if(!masp) return;
    snapshot();

    const patch = { qty:{} };
    SIZES.forEach(sz=>{
      const v = parseInt(($(`#q${sz}`)?.value || '0').trim(),10) || 0;
      if(v>0) patch.qty[sz] = v;
    });
    if(!Object.keys(patch.qty).length) return;

    NTGrid.setRow(masp, patch);
    clearInputsKeepMa();
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
    saveDraft();
  }

  /*** CHUYỂN 2 (mã 1 dòng + size 1 dòng) ***/
  async function handleChuyen2(){
    const raw = ($('#taQuick')?.value || '').trim();
    if(!raw) return;
    snapshot();

    const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const isCode = (s)=> /^[A-Z0-9._-]{4,}$/i.test(s) && !/^(0|3[8-9]|4[0-5])$/.test(s);
    const isSize = (s)=> /^(0|3[8-9]|4[0-5])$/.test(s);

    const push = new Map();   // masp -> {size:qty}
    let cur = null;

    for(const ln of lines){
      if(isCode(ln)){
        cur = ln.toUpperCase();
        if(!push.has(cur)) push.set(cur,{});
        continue;
      }
      if(isSize(ln) && cur){
        const n = parseInt(ln,10);
        const m = push.get(cur);
        m[n] = (m[n]||0) + 1;
      }
    }

    const list=[];
    push.forEach((qty, masp)=>{ NTGrid.setRow(masp, {qty}); list.push(masp); });
    $('#taQuick').value = '';
    saveDraft();
  }

  /*** GRID CHANGE / VALIDATE ***/
  function onGridChanged(){
    const { tongMH, tongSL } = NTGrid.computeTotals();
    $('#lblTongMatHang') && ($('#lblTongMatHang').textContent = String(tongMH));
    $('#lblTongSoLuong') && ($('#lblTongSoLuong').textContent = String(tongSL));
    saveDraft();
  }

  /*** UNDO ***/
  function snapshot(){ lastSnapshot = NTGrid.getState(); }
  function undo(){ if(lastSnapshot) NTGrid.replaceState(lastSnapshot); }
  window.NTMobile = Object.assign(window.NTMobile||{}, { undo, onGridChanged:null });

  /*** INPUT HELPERS ***/
  function clearInputs(){
    const el = getMaInput(); el && (el.value = '');
    SIZES.forEach(sz=>{ const e = $(`#q${sz}`); if(e) e.value=''; });
    $('#taQuick') && ($('#taQuick').value = '');
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
    saveDraft();
  }
  function clearInputsKeepMa(){
    SIZES.forEach(sz=>{ const e = $(`#q${sz}`); if(e) e.value=''; });
    const el = getMaInput(); el?.focus(); el?.select();
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
  }

  /*** DRAFT ***/
  const saveDraft = debounce(()=>{
    try{
      const draft = {
        grid: NTGrid.getState(),
        ma: getMaInput()?.value || '',
        q: Object.fromEntries(SIZES.map(sz => [sz, $(`#q${sz}`)?.value || ''])),
        ta: $('#taQuick')?.value || ''
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }catch(_){}
  }, 600);

  function restoreDraft(){
    try{
      const s = localStorage.getItem(STORAGE_KEY);
      if(!s) return;
      const d = JSON.parse(s);
      NTGrid.replaceState(d.grid || {});
      const el = getMaInput(); if (el) el.value = d.ma || '';
      SIZES.forEach(sz=>{ const e=$(`#q${sz}`); if(e) e.value = d.q?.[sz] || ''; });
      if ($('#taQuick')) $('#taQuick').value = d.ta || '';
    }catch(_){}
  }

  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

  /*** LƯU HÓA ĐƠN ***/
  async function handleLuu(){
    const st = NTGrid.getState();
    const chitiet = [];
    Object.entries(st).forEach(([masp,row])=>{
      SIZES.forEach(sz=>{
        const sl = row.qty[sz]||0;
        if(sl>0) chitiet.push({ masp, size: sz, soluong: sl });
      });
    });
    if(!chitiet.length) return;

    if ($('#btnLuu')) $('#btnLuu').disabled = true;
    try{
      const rs = await window.LuuHoaDon?.luuHoaDonNhapTamCs1?.(chitiet);
      if(rs?.ok){
        localStorage.removeItem(STORAGE_KEY);
        alert('Đã lưu hóa đơn nhập tạm CS1.');
        location.reload();
      }else{
        alert('Lưu thất bại: ' + (rs?.message || ''));
      }
    }catch(e){
      alert('Lỗi lưu: ' + e.message);
    }finally{
      if ($('#btnLuu')) $('#btnLuu').disabled = false;
    }
  }

  /*** KHỞI ĐỘNG ***/
  document.addEventListener('DOMContentLoaded', init);
})();
