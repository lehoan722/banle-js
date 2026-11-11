/* HOANTUYET - Layer kiem tra anh tung dong truoc khi luu hoa don CS1/CS2.
 * Chi thao tac UI; khong sua hoadon.js, bangketqua.js, Supabase/RPC.
 * NV: bat buoc, an checkbox. Admin: tich "Bo XN anh" moi bo qua; mac dinh khong tich.
 */
(() => {
  'use strict';
  if (!/\/banlemtcs[12]\.html$/i.test(location.pathname)) return;
  const table = document.querySelector('#bangketqua');
  const tbody = table?.querySelector('tbody');
  const save = document.querySelector('#btn-luu');
  const toggle = document.querySelector('#ht-check-image-required');
  const adminArea = document.querySelector('#ht-check-image-admin-area');
  if (!table || !tbody || !save || !toggle || !adminArea) return;

  const BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
  const approvals = new Map();
  let adminVerified = false;
  let authPending = false;
  let invoiceIdentity = '';
  let popup = null;
  let popupToken = 0;
  let lastRows = new Set();

  const style = document.createElement('style');
  style.textContent = `
    #bangketqua tbody td:nth-child(8){cursor:pointer;position:relative}
    #bangketqua tbody tr.ht-img-ok>td:nth-child(8){box-shadow:inset 0 -3px #16803c}
    #bangketqua tbody tr.ht-img-ok>td:nth-child(8)::after{content:' ✓';color:#12813a;font-weight:800}
    #bangketqua tbody tr.ht-img-missing>td:nth-child(8){box-shadow:inset 0 -3px #db8a17}
    #ht-img-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.77);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}
    #ht-img-dialog{background:white;color:#111;border-radius:12px;padding:12px;max-width:min(620px,95vw);max-height:95vh;width:100%;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
    #ht-img-clickarea{border:3px solid #12813a;background:#f7f8f9;min-height:220px;max-height:65vh;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:auto;border-radius:8px;font-weight:700}
    #ht-img-clickarea img{max-height:55vh;max-width:100%;object-fit:contain}
    #ht-img-dialog button{cursor:pointer;padding:9px;font-size:15px}
  `;
  document.head.appendChild(style);

  // Chi dong bo khi nhan thay hoa don khac; khong dong cham du lieu ban.
  function identity() {
    const sohd = String(document.querySelector('#sohd')?.value || '').trim();
    const mode = String(document.querySelector('#hd_state')?.value || '').trim().toLowerCase();
    return `${sohd}\u0001${mode === 'moi' ? 'moi' : 'old'}`;
  }
  function syncInvoice() {
    const now = identity();
    if (invoiceIdentity === now) return;
    invoiceIdentity = now;
    approvals.clear();
    lastRows = new Set();
    toggle.checked = false; // Hoa don moi: mac dinh BAT BUOC xac nhan anh (o BO XN khong tich)
    closePopup();
  }

  function rows() { return [...tbody.querySelectorAll('tr')].filter(r => r.cells.length >= 8 && String(r.cells[0]?.textContent || '').trim()); }
  function rowKey(tr) {
    const entry = String(tr.dataset.entryKey || '').trim();
    const line = String(tr.dataset.lineKey || '').trim();
    const idx = String(tr.dataset.lineIndex || '').trim();
    if (!entry || !line || idx === '') return null;
    return `${entry}\u0001${line}\u0001${idx}`;
  }
  function fingerprint(tr) {
    // Moi thong tin nghiep vu co the anh huong den dong: khi thay doi phai xac nhan lai.
    return [tr.dataset.entryKey,tr.dataset.lineKey,tr.dataset.lineIndex,
      ...[0,1,2,3,4,5,6,7,8].map(i=>String(tr.cells[i]?.textContent||'').trim()),
      tr.dataset.manvBan,tr.dataset.tuVanCtId,tr.dataset.tuVanSohd]
      .map(v=>String(v??'')).join('\u0002');
  }
  function isApproved(tr) { const k=rowKey(tr); return !!k && approvals.get(k) === fingerprint(tr); }
  function countAndPaint() {
    const rr = rows();
    let yes = 0;
    rr.forEach(tr=>{const done=isApproved(tr); if(done)yes++; tr.classList.toggle('ht-img-ok',done); tr.classList.toggle('ht-img-missing',!done); tr.cells[7].title=done?'Ảnh đã xác nhận':'Nhấn Thành tiền để kiểm tra ảnh';});
    return {yes,total:rr.length,first:rr.find(tr=>!isApproved(tr))};
  }

  function closePopup() { if(popup){popup.remove();popup=null;} popupToken++; }
  function openPopup(tr) {
    syncInvoice();
    closePopup();
    const key = rowKey(tr), sig = fingerprint(tr);
    if (!key) { alert('Không nhận diện được dòng sản phẩm. Hãy cập nhật bảng trước khi xác nhận ảnh.'); return; }
    const masp = String(tr.cells[0]?.textContent||'').trim();
    const sz = String(tr.cells[2]?.textContent||'').trim();
    const token = popupToken;
    const overlay = document.createElement('div'); overlay.id='ht-img-overlay';
    const dialog = document.createElement('div'); dialog.id='ht-img-dialog';
    const title = document.createElement('div'); title.style.cssText='font-size:17px;font-weight:700'; title.textContent=`Kiểm tra ảnh: ${masp} | size ${sz}`;
    const clickArea = document.createElement('div'); clickArea.id='ht-img-clickarea'; clickArea.setAttribute('role','button'); clickArea.tabIndex=0;
    const status = document.createElement('div'); status.textContent='Đang tải ảnh...'; clickArea.appendChild(status);
    const hint=document.createElement('div');hint.style.cssText='color:#b42318;font-size:14px;text-align:center';hint.textContent='Chỉ bấm vào ẢNH / NO IMAGE khi đúng sản phẩm. Ảnh sai: đóng cửa sổ và sửa dòng.';
    const close=document.createElement('button');close.type='button';close.textContent='Ảnh không đúng – Đóng để sửa';
    close.addEventListener('click', () => {
      // Anh bi xac nhan sai: thu hoi ca dau tick xanh da co truoc do cua dung dong.
      approvals.delete(key);
      closePopup();
      countAndPaint();
    });
    dialog.append(title,clickArea,hint,close);overlay.appendChild(dialog);document.body.appendChild(overlay);popup=overlay;
    let ready=false;
    const showMissing=()=>{if(token!==popupToken)return;ready=true;clickArea.replaceChildren();const no=document.createElement('div');no.textContent='NO IMAGE';no.style.cssText='color:#c40000;font-size:38px;text-align:center';clickArea.append(no);};
    const img=new Image();
    img.onload=()=>{if(token!==popupToken)return;ready=true;clickArea.replaceChildren(img);};
    img.onerror=showMissing;
    img.alt=`Ảnh mã ${masp}`;
    img.src=BASE+encodeURIComponent(masp)+'.JPG';
    // Neu mang treo khong phan hoi, cho phep nhan vao NO IMAGE sau 12 giay.
    setTimeout(()=>{if(token===popupToken&&!ready)showMissing();},12000);
    function accept(){
      if (!ready) return;
      syncInvoice();
      const live=rows().find(r=>rowKey(r)===key);
      if(!live || fingerprint(live)!==sig){closePopup();alert('Dòng sản phẩm đã thay đổi. Vui lòng mở ảnh và xác nhận lại.');return;}
      approvals.set(key,sig);closePopup();countAndPaint();
    }
    clickArea.addEventListener('click',accept);
    clickArea.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();accept();}});
    // Không xác nhận khi bấm ngoài popup, Esc hoặc dấu X.
    overlay.addEventListener('click',e=>{if(e.target===overlay)closePopup();});
  }

  async function refreshAdmin() {
    if(authPending || !window.supabase?.rpc) return;
    authPending=true;
    let ok=false;
    try{if(window.supabase?.rpc){const {data,error}=await window.supabase.rpc('is_admin');ok=!error&&data===true;}}catch(_){}
    adminVerified=ok;adminArea.style.display=ok?'flex':'none';
    if(!ok)toggle.checked=false;
    authPending=false;
  }
  toggle.addEventListener('change',()=>{if(!adminVerified){toggle.checked=false;alert('Chỉ Admin mới được bỏ xác nhận ảnh.');}});
  tbody.addEventListener('click',e=>{
    const td=e.target.closest('td');
    if(!td||td.cellIndex!==7)return;
    const tr=td.closest('tr');if(!tr||!tbody.contains(tr))return;
    openPopup(tr);
  });

  // Mỗi lần bảng bị dựng lại: vô hiệu hóa xác nhận của dòng DOM vừa bị thay.
  // Đảm bảo F3, xóa dòng, nạp hóa đơn khác không sử dụng xác nhận cũ.
  const observer=new MutationObserver(muts=>{
    let structural=false;
    for(const m of muts)if(m.type==='childList' && [...m.addedNodes,...m.removedNodes].some(n=>n.nodeType===1 && (n.matches?.('tr') || n.querySelector?.('tr')))){structural=true;break;}
    if(structural){
      const nowRows=new Set(rows());
      for(const old of lastRows){if(!nowRows.has(old)){const k=rowKey(old);if(k)approvals.delete(k);}}
      lastRows=nowRows;
    }
    syncInvoice();countAndPaint();
  });
  lastRows=new Set(rows());
  observer.observe(tbody,{childList:true,subtree:true});

  // Chặn ngay trong capturing phase trước mọi onclick + F2 (F2 gọi .click()).
  // Module lưu gốc hoàn toàn không thay đổi.
  save.addEventListener('click',e=>{
    syncInvoice();
    if(!adminVerified)toggle.checked=false;
    if(adminVerified&&toggle.checked)return;
    const {yes,total,first}=countAndPaint();
    if(total===0)return; // Luồng lưu cũ tự xử lý hóa đơn rỗng.
    if(yes===total)return;
    e.preventDefault();e.stopImmediatePropagation();
    alert(`Chưa xác nhận ảnh đủ ${total} dòng sản phẩm (mới ${yes}/${total}).\nHãy nhấn ô THÀNH TIỀN từng dòng, sau đó nhấn vào ảnh hoặc NO IMAGE để xác nhận.`);
    if(first){first.scrollIntoView({block:'center',behavior:'smooth'});first.cells[7]?.focus?.();}
  },true);

  // Chống trường hợp đổi hóa đơn qua các thao tác giao diện thông thường.
  document.addEventListener('click',()=>{syncInvoice();countAndPaint();},false);
  window.addEventListener('focus',refreshAdmin);
  window.addEventListener('storage',refreshAdmin);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAdmin();});
  // Hiển thị checkbox ngay nếu đã có gợi ý admin từ phiên đăng nhập; sau đó xác thực lại bằng RPC.
  const adminHint = String(localStorage.getItem('is_admin') || '').toLowerCase() === 'true';
  adminArea.style.display = adminHint ? 'flex' : 'none';
  toggle.checked=false;syncInvoice();countAndPaint();refreshAdmin();
  // Trong trường hợp đăng nhập sau khi trang tải, theo dõi gợi ý quyền trong ít giây đầu.
  let lastAdminHint = adminHint;
  let initChecks = 0;
  let attemptedAfterClientReady = !!window.supabase?.rpc;
  const initTimer = setInterval(() => {
    if (++initChecks > 30) { clearInterval(initTimer); return; }
    let hint = false;
    try { hint = localStorage.getItem('is_admin') === 'true'; } catch (_) {}
    if (hint !== lastAdminHint) {
      lastAdminHint = hint;
      if (!hint) { adminVerified = false; adminArea.style.display = 'none'; toggle.checked = false; }
      else if (!adminVerified) adminArea.style.display = 'flex';
      refreshAdmin();
    } else if (!attemptedAfterClientReady && window.supabase?.rpc) {
      attemptedAfterClientReady = true;
      refreshAdmin();
    }
  }, 500);
})();
