// public/scripts/nhaptammobile.controller.js
;(() => {
  'use strict';

  /*** CẤU HÌNH ***/
  const SIZES = [0,38,39,40,41,42,43,44,45];
  const STORAGE_KEY = 'nhaptammobilecs1_draft_v1';
  const CS = 'cs1';
  const DEFAULT_QUAN_SIZE_ON = true; // mặc định bật quản size khi chưa xác định từ DM/API

  /*** TIỆN ÍCH DOM ***/
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /*** STATE ***/
  let lastSnapshot = null;              // cho Undo 1 bước
  let quanLySizeCache = new Map();      // masp -> boolean

  /*** KHỞI TẠO ***/
  async function init(){
    // hiển thị nhanh thông tin đầu trang (nếu có)
    try{
      $('#lblDiaDiem') && ($('#lblDiaDiem').textContent = 'CS1');
      $('#lblNgayGio') && ($('#lblNgayGio').textContent = new Date().toLocaleString());
      if (window.AppUser) $('#lblTenNV') && ($('#lblTenNV').textContent = window.AppUser.ten || window.AppUser.email || '-');
    }catch(_){}

    // phát sinh số HĐ dự kiến (nếu module sohoadon đã nạp)
    try{
      const so = await (window.SoHoaDon?.goiSoDuKien?.('nhaptamcs1'));
      if (so) $('#lblSoHD') && ($('#lblSoHD').textContent = so);
      // đồng thời nếu trang có #sohd (input ẩn) thì set để các module khác dùng
      if ($('#sohd')) $('#sohd').value = so || '';
    }catch(_){}

    // Gắn sự kiện
    $('#inpMa')?.addEventListener('keydown', onEnterMa);

    // gắn Enter & tính tổng đang nhập cho 9 ô size
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

    // callback từ grid
    window.NTMobile.onGridChanged = onGridChanged;

    // khôi phục draft (nếu có)
    restoreDraft();

    // set lock/mở size theo mã đang có
    await applyQuanLySizeForCurrentMa();

    // tính tổng đang nhập lần đầu
    recalcNhapHienTai();
  }

  /*** TÍNH TỔNG SỐ LƯỢNG ĐANG NHẬP (9 ô) ***/
  function recalcNhapHienTai(){
    let s = 0;
    SIZES.forEach(sz=>{
      const v = parseInt(($(`#q${sz}`)?.value || '0').trim(),10);
      if(!isNaN(v) && v>0) s += v;
    });
    const box = $('#inpTongNhapHienTai');
    if (box) box.value = s;
  }

  /*** QUẢN SIZE THEO MÃ ***/
  async function isQuanLySize(masp){
    // 1) từ danh mục đã cache
    const sp = (window.sanPhamData||{})[masp];
    if (sp){
      const cl = String(sp.chungloai||'').trim().toUpperCase();
      if (cl==='GD' || cl==='GIAYDEP') return true;
      if (sp.quanlysize !== undefined) return !!sp.quanlysize;
    }
    // 2) từ API (nếu dự án có)
    try{
      const flag = await window.AppAPI?.isQuanLySizeTheoCoSo?.(masp, CS);
      if (typeof flag === 'boolean') return flag;
    }catch(_){}
    // 3) mặc định
    return !!DEFAULT_QUAN_SIZE_ON;
  }

  function toggleSizeInputs(qls){
    // qls=true => mở 38..45; khóa 0
    const open = (id,on)=>{
      const el = $(id); if(!el) return;
      el.disabled = !on;
      if (!on) el.value = '';
    };
    open('#q0', !qls);
    [38,39,40,41,42,43,44,45].forEach(sz=> open(`#q${sz}`, qls));

    // cột hiển thị size (nếu bạn dùng input cho nhãn)
    open('#sz0', !qls);
    [38,39,40,41,42,43,44,45].forEach(sz=> open(`#sz${sz}`, qls));
  }

  async function applyQuanLySizeForCurrentMa(){
    const masp = ($('#inpMa')?.value || '').trim().toUpperCase();
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
    const inp = $('#inpMa');
    if(!inp) return;
    const masp = (inp.value||'').trim().toUpperCase();
    if(!masp){ box && (box.style.display='none'); return; }

    // kiểm tra danh mục: ưu tiên cache, thiếu thì kéo về 1 mã
    let ok = !!(window.sanPhamData && window.sanPhamData[masp]);
    if(!ok){
      try{
        if (window.AppAPI?.ensureSanPhamDataFor){
          await window.AppAPI.ensureSanPhamDataFor([masp]);
        } else if (window.supabase){
          const { data, error } = await window.supabase
            .from('dmhanghoa').select('masp,ten,chungloai,nhomhang,gianhap').eq('masp',masp).maybeSingle();
          if(!error && data){
            window.sanPhamData = Object.assign(window.sanPhamData||{}, {[masp]:data});
          }
        }
      }catch(_){}
      ok = !!(window.sanPhamData && window.sanPhamData[masp]);
    }
    if(!ok){ box && (box.style.display='block', box.textContent='Mã chưa có DM: '+masp); return; }
    box && (box.style.display='none');

    await applyQuanLySizeForCurrentMa();

    // nhảy tới ô hợp lệ đầu
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
    // nếu đã ở size cuối -> quay về ô mã
    $('#inpMa')?.focus(); $('#inpMa')?.select();
  }

  /*** CHUYỂN 1: lấy 9 ô -> bảng ***/
  function handleChuyen1(){
    const masp = ($('#inpMa')?.value || '').trim().toUpperCase();
    if(!masp) return;
    snapshot();

    const patch = { qty:{} };
    SIZES.forEach(sz=>{
      const v = parseInt(($(`#q${sz}`)?.value || '0').trim(),10) || 0;
      if(v>0) patch.qty[sz] = v;
    });
    if(!Object.keys(patch.qty).length) return;

    NTGrid.setRow(masp, patch);
    fetchVitriTonBatch([masp]); // lấy vị trí, tồn
    clearInputsKeepMa();
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
    saveDraft();
  }

  /*** CHUYỂN 2: định dạng mới (mã 1 dòng, mỗi size 1 dòng) ***/
  function handleChuyen2(){
    const raw = ($('#taQuick')?.value || '').trim();
    if(!raw) return;
    snapshot();

    const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const isCode = (s)=> /^[A-Z0-9._-]{4,}$/i.test(s) && !/^(0|3[8-9]|4[0-5])$/.test(s);
    const isSize = (s)=> /^(0|3[8-9]|4[0-5])$/.test(s);

    const push = new Map();   // masp -> {size:qty}
    const unknown = new Set();
    let cur = null;

    for(const ln of lines){
      if(isCode(ln)){
        cur = ln.toUpperCase();
        if(!push.has(cur)) push.set(cur,{});
        if(!(window.sanPhamData && window.sanPhamData[cur])) unknown.add(cur);
        continue;
      }
      if(isSize(ln) && cur){
        const n = parseInt(ln,10);
        const m = push.get(cur);
        m[n] = (m[n]||0) + 1;
      }
    }

    const list=[]; // các mã mới để lấy tồn/ vị trí
    push.forEach((qty, masp)=>{ NTGrid.setRow(masp, {qty}); list.push(masp); });
    if(list.length) fetchVitriTonBatch(list);

    // cảnh báo mã chưa có thật sự
    const box = $('#unknownSku');
    const warns = [...unknown].filter(m => !(window.sanPhamData && window.sanPhamData[m]));
    if(warns.length){ box && (box.style.display='block', box.textContent='Mã chưa có DM: '+warns.join(', ')); }
    else { box && (box.style.display='none'); }

    // xóa textarea để tránh nhầm lần sau
    $('#taQuick').value = '';
    saveDraft();
  }

  /*** LẤY VỊ TRÍ/TỒN THEO BATCH ***/
  async function fetchVitriTonBatch(masps){
    try{
      const rows = await window.AppAPI?.getVitriTonBatch?.(masps, CS); // [{masp, vitri, ton1, ton2}]
      if(Array.isArray(rows)){
        rows.forEach(r=> NTGrid.setRow(r.masp, { vitri:r.vitri, ton1:r.ton1, ton2:r.ton2 }));
      }
    }catch(_){}
  }

  /*** VALIDATE + TỔNG ***/
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
        if(has0){ ok=false; cells.push({masp,size:0}); }
        if(!hasAny){ ok=false; cells.push({masp,size:38}); }
      }else{
        if(!has0 && hasAny) ok=false;
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
    $('#inpMa') && ($('#inpMa').value = '');
    SIZES.forEach(sz=>{ const el = $(`#q${sz}`); if(el) el.value=''; });
    $('#taQuick') && ($('#taQuick').value = '');
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
    saveDraft();
  }
  function clearInputsKeepMa(){
    SIZES.forEach(sz=>{ const el = $(`#q${sz}`); if(el) el.value=''; });
    $('#inpMa')?.focus(); $('#inpMa')?.select();
    $('#inpTongNhapHienTai') && ($('#inpTongNhapHienTai').value = 0);
  }

  /*** DRAFT ***/
  const saveDraft = debounce(()=>{
    try{
      const draft = {
        grid: NTGrid.getState(),
        ma: $('#inpMa')?.value || '',
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
      if ($('#inpMa')) $('#inpMa').value = d.ma || '';
      SIZES.forEach(sz=>{ const el=$(`#q${sz}`); if(el) el.value = d.q?.[sz] || ''; });
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

  /*** AUTOCOMPLETE #inpMa ***/
  !function(){
    const inp = $('#inpMa');
    if(!inp) return;

    const box = document.createElement('div');
    box.id='ac-ma';
    box.style.cssText='position:absolute;z-index:9999;background:#fff;border:1px solid #ccc;display:none;max-height:200px;overflow:auto';
    document.body.appendChild(box);

    function ensureDataLoaded(){
      // nếu chưa có danh mục thì cố tải ~2000 mã để gợi ý
      if (window.sanPhamData && Object.keys(window.sanPhamData).length) return Promise.resolve();
      if (window.loadSKUCache) return window.loadSKUCache();
      if (window.supabase){
        return window.supabase.from('dmhanghoa').select('masp,ten').limit(2000).then(({data})=>{
          window.sanPhamData = window.sanPhamData||{};
          (data||[]).forEach(r=> window.sanPhamData[r.masp] = Object.assign(window.sanPhamData[r.masp]||{}, r));
        });
      }
      return Promise.resolve();
    }

    function show(items){
      if(!items.length){ box.style.display='none'; return; }
      const r = inp.getBoundingClientRect();
      box.style.left  = (r.left + window.scrollX) + 'px';
      box.style.top   = (r.bottom + window.scrollY) + 'px';
      box.style.width = r.width + 'px';
      box.innerHTML   = items.map(it=>`<div data-m="${it.masp}" style="padding:6px;cursor:pointer"><b>${it.masp}</b> – ${it.ten||''}</div>`).join('');
      box.style.display='';
      [...box.children].forEach(div=>{
        div.onclick = ()=>{ inp.value = div.dataset.m; box.style.display='none'; inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); };
      });
    }

    inp.addEventListener('input', async ()=>{
      const q = (inp.value||'').trim().toUpperCase();
      if(q.length<2){ box.style.display='none'; return; }
      await ensureDataLoaded();
      const d = window.sanPhamData||{};
      const all = Object.keys(d).map(k=>({ masp:k, ten:d[k].ten||'' }));
      const list = all.filter(it => it.masp.includes(q) || it.ten.toUpperCase().includes(q)).slice(0,50);
      show(list);
    });

    document.addEventListener('click', (e)=>{ if(e.target!==inp && !box.contains(e.target)) box.style.display='none'; });
  }();

})();
