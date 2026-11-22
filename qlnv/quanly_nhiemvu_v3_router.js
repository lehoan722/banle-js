/* QLNV V3 module router. Chỉ chuyển vùng nội dung; không thay đổi authModule */
const main=document.querySelector('.dashboard-page');
const select=document.getElementById('selectDiadiem');
const nav=document.querySelector('.sidebar-menu');
const menu=document.getElementById('qnv-task-menu');
const overview=document.querySelector('.sidebar-menu .menu-item');
let moduleApi=null,loadingPromise=null,view=null;
function setSelected(mode){
  if(overview)overview.classList.toggle('active',mode==='overview');
  if(menu)menu.classList.toggle('active',mode==='tasks');
}
function importScript(src){return new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Không tải được thư viện: '+src));document.head.append(s);
})}
async function initModule(){
  if(moduleApi)return moduleApi;
  if(loadingPromise)return loadingPromise;
  loadingPromise=(async()=>{
    if(!main)throw Error('Không tìm thấy vùng dashboard-page');
    view=document.createElement('section');view.id='qlnv-task-view';view.hidden=true;
    main.append(view);
    const response=await fetch('quanly_nhiemvu_v3_view.html?v=20261122_module01',{cache:'no-store'});
    if(!response.ok)throw Error('Không tải được giao diện: HTTP '+response.status);
    view.innerHTML=await response.text();
    const css=document.createElement('link');css.rel='stylesheet';css.href='quanly_nhiemvu_v3.css?v=20261122_module01';document.head.append(css);
    if(!window.Tabulator){
      const tc=document.createElement('link');tc.rel='stylesheet';tc.href='https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator.min.css';document.head.append(tc);
      await importScript('https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js');
    }
    moduleApi=await import('./quanly_nhiemvu_v3.js?v=20261122_module01');
    // Chỉ dời phần duyệt cũ vào thẻ mở rộng, giữ nguyên DOM và mã xử lý cũ.
    const legacy=document.getElementById('v3-admin-panel');
    const legacySettings=document.getElementById('v305-auto-approve');
    const target=document.getElementById('qnv-legacy-container');
    if(legacySettings)target.append(legacySettings);
    if(legacy)target.append(legacy);
    document.getElementById('qnv-advanced').addEventListener('toggle',e=>{
      window.__qlnvTaskLegacyVisible=!!e.target.open;
      if(e.target.open)document.dispatchEvent(new Event('qlnv:legacy-open'));
    });
    return moduleApi;
  })();
  try{return await loadingPromise;}catch(e){loadingPromise=null;if(view){view.remove();view=null;}throw e;}
}
export async function showTaskModule(){
  if(document.body.classList.contains('qnv-task-mode'))return;
  document.body.classList.add('qnv-task-mode');setSelected('tasks');
  try{
    const api=await initModule();view.hidden=false;
    api.mountTaskManagerV3(select?.value||'cs1');
    if(history.replaceState) history.replaceState(null,'',location.pathname+'#quanly-nhiemvu');
  }catch(e){console.error('[QLNV Task Module]',e);document.body.classList.remove('qnv-task-mode');setSelected('overview');alert('Không mở được module quản lý nhiệm vụ: '+e.message);}
}
export function showOverview(){
  window.__qlnvTaskLegacyVisible=false;
  if(moduleApi)moduleApi.unmountTaskManagerV3();
  if(view)view.hidden=true;
  document.body.classList.remove('qnv-task-mode');setSelected('overview');
  if(location.hash==='#quanly-nhiemvu')history.replaceState(null,'',location.pathname);
}
menu?.addEventListener('click',e=>{e.preventDefault();showTaskModule();});
overview?.addEventListener('click',e=>{e.preventDefault();showOverview();});
select?.addEventListener('change',()=>{
  if(document.body.classList.contains('qnv-task-mode')&&moduleApi)moduleApi.mountTaskManagerV3(select.value);
});
window.addEventListener('hashchange',()=>{if(location.hash==='#quanly-nhiemvu')showTaskModule();else showOverview();});
// Để phiên login chung khởi tạo trước, chỉ mở module khi đã đăng nhập.
if(location.hash==='#quanly-nhiemvu'){
  const poll=()=>{const app=document.getElementById('app-container');if(app&&getComputedStyle(app).display!=='none'){showTaskModule();return true;}return false;};
  if(!poll()){
    const observer=new MutationObserver(()=>{if(poll())observer.disconnect();});
    observer.observe(document.getElementById('app-container')||document.body,{attributes:true,childList:true,subtree:false});
  }
}
