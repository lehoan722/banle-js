// public/scripts/nhaptammobile.controller.js
;(() => {
  'use strict';

  /*** CẤU HÌNH ***/
  const SIZES = [0,38,39,40,41,42,43,44,45];
  const STORAGE_KEY = 'nhaptammobilecs1_draft_v1';
  const CS = 'cs1';
  const DEFAULT_QUAN_SIZE_ON = true;      // Mặc định BẬT quản size khi không xác định được từ DM/API
  const USE_REMOTE_DM = false;            // Tắt gọi Supabase cho autocomplete/kiểm DM (giống PC)

  /*** TIỆN ÍCH DOM ***/
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const getMaInput = () => document.getElementById('masp') || document.getElementById('inpMa');

  /*** STATE ***/
  let lastSnapshot = null;              // Cho Undo 1 bước
  let quanLySizeCache = new Map();      // masp -> boolean

  /*** ===== DANH MỤC HÀNG HÓA: hợp nhất nhiều nguồn local (giống PC) ===== ***/
  async function ensureDanhMucHangHoa(){
    if (window.sanPhamData && Object.keys(window.sanPhamData).length) return;

    window.sanPhamData = window.sanPhamData || {};

    // 1) Nguồn local từ các module có sẵn trong dự án của bạn (trang PC đang dùng)
    const localSources = [
      window.banghanghoa,            // mảng [{masp,ten,chungloai,...}]
      window.DANH_MUC_HANG_HOA,
      window.dmhanghoa,
      window.hanghoaList
    ];
    for (const src of localSources){
      if (Array.isArray(src)){
        src.forEach(r=>{
          if(!r || !r.masp) return;
          window.sanPhamData[r.masp] = Object.assign(window.sanPhamData[r.masp]||{}, r);
        });
      }
    }

    // 2) Không gọi Supabase để tránh 400
    if (!USE_REMOTE_DM) return;

    // (Nếu sau này muốn bật remote thì bật cờ trên và cấu hình lại tên bảng/cột + RLS)
    if (Object.keys(window.sanPhamData).length < 50 && window.supabase){
      try{
        const { data, error } = await window.supabase
          .from('dmhanghoa')            // đổi nếu tên bảng khác
          .select('masp,ten,chungloai')
          .range(0,1999);
        if(!error && Array.isArray(data)){
          data.forEach(r=>{
            if(!r || !r.masp) return;
            window.sanPhamData[r.masp] = Object.assign(window.sanPhamData[r.masp]||{}, r);
          });
        }
      }catch(_){}
    }
  }
  const hasInDM = (masp) => !!(window.sanPhamData && window.sanPhamData[masp]);

  /*** KHỞI TẠO ***/
  async function init(){
    try{
      $('#lblDiaDiem') && ($('#lblDiaDiem').textContent = 'CS1');
      $('#lblNgayGio') && ($('#lblNgayGio').textContent = new Date().toLocaleString());
      if (window.AppUser) $('#lblTenNV') && ($('#lblTenNV').textContent = window.AppUser.ten || window.AppUser.email || '-');
    }catch(_){}

    // Số HĐ dự kiến (nếu module đã nạp)
    try{
      const so = await (window.SoHoaDon?.goiSoDuKien?.('nhaptamcs1'));
      if (so) {
        $('#lblSoHD') && ($('#lblSoHD').textContent = so);
        $('#sohd') && ($('#sohd').value = so);     // input ẩn phục vụ saver
      }
    }catch(_){}

    // Sự kiện cho ô mã (hỗ trợ #masp của PC và #inpMa cũ)
    const maEl = getMaInput();
    maEl && maEl.addEventListener('keydown', onEnterMa);

    // Sự kiện 9 ô size
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

    // Nạp DM local + áp quản size theo mã đang có
    await ensureDanhMucHangHoa();
    await applyQuanLySizeForCurrentMa();

    recalcNhapHienTai();

    // Khởi tạo Autocomplete kiểu PC cho ô mã
    initAutocompleteLikePC();
  }

  /*** TỔNG SỐ LƯỢNG ĐANG NHẬP (các ô q*) ***/
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
    const sp = (window.sanPhamData||{})[masp];
    if (sp){
      const cl = String(sp.chungloai||'').trim().toUpperCase();
      if (cl==='GD' || cl==='GIAYDEP') return true;          // Giày dép => quản size
      if (sp.quanlysize !== undefined) return !!sp.quanlysize;
    }
    try{
      const flag = await window.AppAPI?.isQuanLySizeTheoCoSo?.(masp, CS);
      if (typeof flag === 'boolean') return flag;
    }catch(_){}
    return !!DEFAULT_QUAN_SIZE_ON;                            // Mặc định BẬT
  }

  function toggleSizeInputs(qls){
    // qls=true => mở 38..45; khóa 0 | qls=false => mở 0; khóa 38..45
    const open = (id,on)=>{
      const el = $(id); if(!el) return;
      el.disabled = !on;
      if (!on) el.value = '';
    };
    open('#q0', !qls);
    [38,39,40,41,42,43,44,45].forEach(sz=> open(`#q${sz}`, qls));

    // Nếu cột hiển thị size (sz*) là input, giữ đồng bộ
    open('#sz0', !qls);
    [38,39,40,41,42,43,44,45].forEach(sz=> open(`#sz${sz}`, qls));
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
    const box = $('#unknownSku');
    const inp = getMaInput();
    if(!inp) return;
    const masp = (inp.value||'').trim().toUpperCase();
    if(!masp){ box && (box.style.display='none'); return; }

    await ensureDanhMucHangHoa();
    let ok = hasInDM(masp);
    if(!ok){
      // Nếu có API riêng để nạp 1 mã thì gọi, còn không thì thôi (không chặn UI)
      try{
        if (window.AppAPI?.ensureSanPhamDataFor){
          await window.AppAPI.ensureSanPhamDataFor([masp]);
        }
      }catch(_){}
      ok = hasInDM(masp);
    }
    if(!ok){ box && (box.style.display='block', box.textContent='Mã chưa có DM: '+masp); return; }
    box && (box.style.display='none');

    await applyQuanLySizeForCurrentMa();

    // Nhảy tới ô hợp lệ đầu tiên
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
    const maEl = getMaInput(); maEl?.focus(); maEl?.select(); // đứng ở 45 → quay về ô mã
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
    fetchVitriTonBatch([masp]);              // lấy vị trí, tồn theo batch (nếu có)
    clearInputsKeepMa();
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
    saveDraft();
  }

  /*** CHUYỂN 2 – Định dạng: MÃ 1 dòng, mỗi SIZE 1 dòng; xong thì xóa textarea ***/
  async function handleChuyen2(){
    const raw = ($('#taQuick')?.value || '').trim();
    if(!raw) return;
    snapshot();

    const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const isCode = (s)=> /^[A-Z0-9._-]{4,}$/i.test(s) && !/^(0|3[8-9]|4[0-5])$/.test(s);
    const isSize = (s)=> /^(0|3[8-9]|4[0-5])$/.test(s);

    await ensureDanhMucHangHoa();

    const push = new Map();   // masp -> {size:qty}
    const unknown = new Set();
    let cur = null;

    for(const ln of lines){
      if(isCode(ln)){
        cur = ln.toUpperCase();
        if(!push.has(cur)) push.set(cur,{});
        if(!hasInDM(cur)) unknown.add(cur);
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
    if(list.length) fetchVitriTonBatch(list);

    const warns = [...unknown].filter(m => !hasInDM(m));
    const box = $('#unknownSku');
    if(warns.length){ box && (box.style.display='block', box.textContent='Mã chưa có DM: '+warns.join(', ')); }
    else { box && (box.style.display='none'); }

    $('#taQuick').value = '';                 // XÓA textarea sau khi chuyển để tránh nhập nhầm
    saveDraft();
  }

  /*** VỊ TRÍ & TỒN ***/
  async function fetchVitriTonBatch(masps){
    try{
      const rows = await window.AppAPI?.getVitriTonBatch?.(masps, CS); // [{masp, vitri, ton1, ton2}]
      if(Array.isArray(rows)){
        rows.forEach(r=> NTGrid.setRow(r.masp, { vitri:r.vitri, ton1:r.ton1, ton2:r.ton2 }));
      }
    }catch(_){}
  }

  /*** GRID CHANGE / VALIDATE ***/
  function onGridChanged(){
    const { tongMH, tongSL } = NTGrid.computeTotals();
    $('#lblTongMatHang') && ($('#lblTongMatHang').textContent = String(tongMH));
    $('#lblTongSoLuong') && ($('#lblTongSoLuong').textContent = String(tongSL));

    const errors = validate();
    NTGrid.markViolations(errors.cells);
    renderBanner(errors);

    const allowSave = errors.ok && tongSL>0;
    if ($('#btnLuu')) $('#btnLuu').disabled = !allowSave;

    saveDraft();
  }

  function validate(){
    const st = NTGrid.getState();
    const cells = [];
    let ok = true;

    for(const [masp,row] of Object.entries(st)){
      const qls = (quanLySizeCache.has(masp) ? quanLySizeCache.get(masp) : DEFAULT_QUAN_SIZE_ON);
      const has0   = (row.qty[0]||0) > 0;
      const hasAny = [38,39,40,41,42,43,44,45].some(sz => (row.qty[sz]||0)>0);

      if(qls){
        if(has0){ ok=false; cells.push({masp,size:0}); }          // quản size mà có 0 => sai
        if(!hasAny){ ok=false; cells.push({masp,size:38}); }      // quản size mà không có size 38..45 nào
      }else{
        if(!has0 && hasAny) ok=false;                             // không quản size mà nhập size => sai
        [38,39,40,41,42,43,44,45].forEach(sz=>{
          if((row.qty[sz]||0)>0){ ok=false; cells.push({masp,size:sz}); }
        });
      }
    }
    return { ok, cells, msg: ok ? '' : 'Có dòng vi phạm quy tắc quản-size. Vui lòng sửa các ô tô màu đỏ.' };
  }

  function renderBanner({ok,msg}){
    const b = $('#banner'); if(!b) return;
    if(ok){ b.classList.remove('show'); b.textContent=''; return; }
    b.textContent = msg; b.classList.add('show');
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
    const v = validate();
    if(!v.ok){ window.AppAudio?.warn?.(); return; }

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

  /*** AUTOCOMPLETE Ô MÃ —— COPY CÁCH LÀM CỦA TRANG PC (#masp + #popup_masp) ***/
  function initAutocompleteLikePC(){
    const inp  = getMaInput();
    if(!inp) return;

    // Nếu chưa có popup thì tạo
    let popup = document.getElementById('popup_masp');
    if(!popup){
      popup = document.createElement('div');
      popup.id = 'popup_masp';
      popup.style.cssText = 'position:absolute;top:100%;left:0;width:300px;max-height:140px;background:#fff;border:1px solid #ccc;display:none;overflow-y:auto;z-index:10000;';
      // đảm bảo container là relative
      if (!inp.parentElement || getComputedStyle(inp.parentElement).position === 'static') {
        inp.parentElement && (inp.parentElement.style.position = 'relative');
      }
      (inp.parentElement || document.body).appendChild(popup);
    }

    let curIndex = -1;     // vị trí đang highlight
    let lastList = [];     // list đang hiển thị

    async function getAllDM(){
      await ensureDanhMucHangHoa();
      const d = window.sanPhamData || {};
      return Object.keys(d).map(k => ({ masp:k, ten: d[k].ten || '' }));
    }

    function positionPopup(){
      const r = inp.getBoundingClientRect();
      popup.style.width = r.width + 'px';
    }

    function highlight(i){
      curIndex = i;
      [...popup.children].forEach((el,idx)=>{
        el.style.background = (idx===i) ? '#eef6ff' : '';
      });
    }

    function choose(i){
      if(i<0 || i>=lastList.length) return;
      const masp = lastList[i].masp;
      inp.value = masp;
      popup.style.display='none';
      // Giống PC: bắn Enter để chạy tiếp flow onEnterMa
      inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
    }

    function render(list){
      lastList = list;
      curIndex = -1;
      if(!list.length){ popup.style.display='none'; popup.innerHTML=''; return; }
      popup.innerHTML = list.map((r,i)=>(
        `<div data-i="${i}" data-m="${r.masp}" style="padding:6px;cursor:pointer;white-space:nowrap">
           <b>${r.masp}</b> – ${r.ten||''}
         </div>`
      )).join('');
      popup.style.display = '';
      positionPopup();
      [...popup.children].forEach(div=>{
        div.onmouseenter = () => highlight(parseInt(div.dataset.i,10));
        div.onclick = () => choose(parseInt(div.dataset.i,10));
      });
    }

    // Gõ để gợi ý
    inp.addEventListener('input', async ()=>{
      const q = (inp.value||'').trim().toUpperCase();
      if(q.length<2){ popup.style.display='none'; return; }
      const all = await getAllDM();
      const list = all
        .filter(x => x.masp.includes(q) || (x.ten||'').toUpperCase().includes(q))
        .slice(0,50);
      render(list);
    });

    // Điều hướng ↑/↓/Enter/Esc
    inp.addEventListener('keydown', (e)=>{
      if(popup.style.display==='none') return;
      if(!lastList.length) return;

      if(e.key==='ArrowDown'){
        e.preventDefault();
        highlight( (curIndex+1) % lastList.length );
      }else if(e.key==='ArrowUp'){
        e.preventDefault();
        highlight( (curIndex-1+lastList.length) % lastList.length );
      }else if(e.key==='Enter'){
        if(curIndex>=0){ e.preventDefault(); choose(curIndex); }
      }else if(e.key==='Escape'){
        popup.style.display='none';
      }
    });

    // Click ngoài để đóng
    document.addEventListener('click', (e)=>{
      if(e.target!==inp && !popup.contains(e.target)) popup.style.display='none';
    });

    // Resize/rotate để cập nhật độ rộng popup
    window.addEventListener('resize', positionPopup);
  }

})();
