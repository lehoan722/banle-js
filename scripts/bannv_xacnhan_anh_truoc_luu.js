/* HOANTUYET - Xac nhan anh tung dong truoc khi luu hoa don BAN NHAN VIEN CS1/CS2.
 * Hoat dong tren dien thoai, khong can checkbox va khong ghi du lieu Supabase.
 * Luu y: chot chan duoc goi tai luuHoaDonNVKhongIn() cua 2 HTML trang NV,
 * bao phu nut Luu va F2; khong thay doi nghiep vu luu hoa don.
 */
(() => {
  'use strict';
  if (!/\/(?:bannvcs1|bannvcs2)\.html$/i.test(location.pathname)) return;

  const tbody = document.querySelector('#bangketqua tbody');
  if (!tbody) return;

  const BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
  const approved = new Map();
  const fallbackKeys = new WeakMap();
  let sequence = 0;
  let invoice = null;
  let overlay = null;
  let requestToken = 0;
  let lastRowNodes = new Set();

  const css = document.createElement('style');
  css.textContent = `
    #bangketqua tbody td:nth-child(8) { cursor:pointer; touch-action:manipulation; }
    #bangketqua tbody tr.ht-bannv-img-ok td:nth-child(8) { box-shadow:inset 0 -3px #15803d; }
    #bangketqua tbody tr.ht-bannv-img-ok td:nth-child(8)::after { content:' ✓'; color:#15803d; font-weight:900; }
    #bangketqua tbody tr.ht-bannv-img-pending td:nth-child(8) { box-shadow:inset 0 -3px #ed8b20; }
    #ht-bannv-photo-overlay { position:fixed; inset:0; z-index:2147483000; background:rgba(0,0,0,.83); padding:env(safe-area-inset-top, 10px) 10px env(safe-area-inset-bottom, 10px); display:flex; justify-content:center; align-items:center; box-sizing:border-box; }
    #ht-bannv-photo-panel { box-sizing:border-box; background:white; color:#111; border-radius:14px; width:min(650px,100%); max-height:96dvh; padding:12px; display:flex; flex-direction:column; gap:9px; }
    #ht-bannv-photo-title { font-size:17px; font-weight:800; overflow-wrap:anywhere; }
    #ht-bannv-photo-touch { flex:1; min-height:180px; max-height:70dvh; border:3px solid #15803d; border-radius:10px; background:#f6f6f6; display:flex; justify-content:center; align-items:center; flex-direction:column; cursor:pointer; touch-action:manipulation; overflow:auto; }
    #ht-bannv-photo-touch img { display:block; max-width:100%; max-height:62dvh; object-fit:contain; }
    #ht-bannv-photo-instruction { color:#b91c1c; font-size:14px; font-weight:700; text-align:center; }
    #ht-bannv-photo-reject { padding:14px 10px; font-size:16px; font-weight:700; border:1px solid #777; border-radius:9px; background:#fff; color:#991b1b; min-height:48px; }
    @media(max-width:600px) { #ht-bannv-photo-panel { max-height:98dvh; padding:9px; } #ht-bannv-photo-title { font-size:15px; } #ht-bannv-photo-touch { max-height:72dvh; } }
  `;
  document.head.appendChild(css);

  function rows() {
    return [...tbody.querySelectorAll('tr')].filter(tr => tr.cells.length >= 8 && String(tr.cells[0]?.textContent || '').trim());
  }
  function rowKey(tr) {
    const entry = String(tr.dataset.entryKey || '').trim();
    const line = String(tr.dataset.lineKey || '').trim();
    const index = String(tr.dataset.lineIndex || '').trim();
    if (entry && line && index !== '') return `line:${entry}\u0001${line}\u0001${index}`;
    if (!fallbackKeys.has(tr)) fallbackKeys.set(tr, `dom:${++sequence}`);
    return fallbackKeys.get(tr);
  }
  function signature(tr) {
    return [tr.dataset.entryKey,tr.dataset.lineKey,tr.dataset.lineIndex,
      ...[0,1,2,3,4,5,6,7].map(i=>String(tr.cells[i]?.textContent||'').trim()),
      tr.dataset.manvBan, tr.dataset.tuVanCtId, tr.dataset.tuVanSohd]
      .map(v=>String(v??'')).join('\u0002');
  }
  function identity() {
    return `${String(document.querySelector('#sohd')?.value || '').trim()}\u0001${String(document.querySelector('#hd_state')?.value || 'moi').trim()}`;
  }
  function clearPopup() {
    requestToken++;
    if (overlay) { overlay.remove(); overlay = null; }
  }
  function syncInvoice() {
    const key = identity();
    if (invoice === key) return;
    invoice = key;
    approved.clear();
    lastRowNodes = new Set(rows());
    clearPopup();
  }
  function isConfirmed(tr) { return approved.get(rowKey(tr)) === signature(tr); }
  function paint() {
    for (const tr of rows()) {
      const ok = isConfirmed(tr);
      tr.classList.toggle('ht-bannv-img-ok', ok);
      tr.classList.toggle('ht-bannv-img-pending', !ok);
      tr.cells[7].title = ok ? 'Đã xác nhận ảnh' : 'Chạm Thành tiền để xác nhận ảnh';
    }
  }
  function reject(tr, key) {
    approved.delete(key);
    clearPopup();
    paint();
  }
  function showPhoto(tr) {
    syncInvoice();
    clearPopup();
    const key = rowKey(tr);
    const sig = signature(tr);
    const token = requestToken;
    const masp = String(tr.cells[0]?.textContent || '').trim();
    const size = String(tr.cells[2]?.textContent || '').trim();

    const mask = document.createElement('div'); mask.id='ht-bannv-photo-overlay';
    const box = document.createElement('section'); box.id='ht-bannv-photo-panel'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    const title = document.createElement('div'); title.id='ht-bannv-photo-title'; title.textContent=`Kiểm tra ảnh: ${masp} | size ${size}`;
    const area = document.createElement('div'); area.id='ht-bannv-photo-touch'; area.tabIndex=0; area.setAttribute('role','button'); area.setAttribute('aria-label','Chạm để xác nhận đúng ảnh sản phẩm');
    const loading=document.createElement('span'); loading.textContent='Đang tải ảnh...'; area.appendChild(loading);
    const hint=document.createElement('div'); hint.id='ht-bannv-photo-instruction'; hint.textContent='Đúng sản phẩm: CHẠM VÀO ẢNH hoặc NO IMAGE để xác nhận.';
    const wrong=document.createElement('button'); wrong.id='ht-bannv-photo-reject'; wrong.type='button'; wrong.textContent='Ảnh không đúng – Đóng để sửa';
    wrong.addEventListener('click',()=>reject(tr,key));
    box.append(title,area,hint,wrong); mask.appendChild(box); document.body.appendChild(mask); overlay=mask;

    let ready=false;
    const noImage=()=>{
      if(token!==requestToken)return;
      ready=true;
      const node=document.createElement('div');node.textContent='NO IMAGE';node.style.cssText='color:#b91c1c;font-size:clamp(28px,8vw,44px);font-weight:900;text-align:center';
      area.replaceChildren(node);
    };
    const img=new Image();
    img.onload=()=>{if(token!==requestToken)return;ready=true;area.replaceChildren(img);};
    img.onerror=noImage;
    img.alt=`Ảnh sản phẩm ${masp}`;
    img.src=BASE+encodeURIComponent(masp)+'.JPG';
    // Neu anh khong phan hoi sau 12 giay, cho xac nhan NO IMAGE nhu nghiep vu da chot.
    setTimeout(()=>{if(token===requestToken&&!ready)noImage();},12000);
    function accept() {
      if (!ready) return;
      syncInvoice();
      const current=rows().find(r=>rowKey(r)===key);
      if(!current || signature(current)!==sig){ clearPopup(); paint(); alert('Dòng sản phẩm đã thay đổi. Vui lòng kiểm tra ảnh lại.'); return; }
      approved.set(key,sig); clearPopup(); paint();
    }
    area.addEventListener('click',accept);
    area.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();accept();}});
    // Bam ngoai popup khong duoc xac nhan; neu dang xem lai, giu trang thai cu khi dong ngoai.
    mask.addEventListener('click',e=>{if(e.target===mask)clearPopup();});
  }
  tbody.addEventListener('click',e=>{
    const td=e.target.closest('td');
    if (!td || td.cellIndex!==7 || !tbody.contains(td)) return;
    const tr=td.closest('tr');
    if(tr) showPhoto(tr);
  });
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>m.type==='childList' && [...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1 && (n.matches?.('tr')||n.querySelector?.('tr'))))){
      const current=new Set(rows());
      for(const old of lastRowNodes) if(!current.has(old)) approved.delete(rowKey(old));
      lastRowNodes=current;
    }
    syncInvoice();paint();
  });
  lastRowNodes=new Set(rows());
  observer.observe(tbody,{childList:true,subtree:true});

  function checkBeforeSave() {
    syncInvoice();
    paint();
    const rr=rows();
    if (!rr.length) return true; // de ham luu cu xu ly hoa don rong
    const first=rr.find(r=>!isConfirmed(r));
    if (!first) return true;
    alert('Chưa xác nhận ảnh của tất cả sản phẩm.\nHãy chạm vào ô THÀNH TIỀN của từng dòng rồi chạm vào ẢNH / NO IMAGE để xác nhận.');
    try{first.cells[7].scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}catch(_){}
    return false;
  }
  // Chan ca duong phim F2 du phong (shortcut.js co the goi luuHoaDonQuaAPI
  // neu ham LUU_HOADON_F2 chua san sang trong giay dau tien).
  document.addEventListener('keydown', e => {
    if (e.key !== 'F2') return;
    if (checkBeforeSave()) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  // Chot chan tai UI, song song voi chot chan trung tam trong 2 trang NV.
  document.getElementById('btn-luu')?.addEventListener('click', e => {
    if (checkBeforeSave()) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.BANNV_PHOTO_GUARD = Object.freeze({checkBeforeSave});
  syncInvoice();paint();
})();
