// HOANTUYET_NOTIFICATION_V1 - universal employee inbox + optional Web Push
// To reuse: <script type="module" src="/scripts/ht_notify_v1.js"></script>
import {getCurrentUserInfo} from './authModule.js';
const API='/api/ht-notify-v1';
const el=(tag,props={},children=[])=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k==='text')n.textContent=v;else if(k==='className')n.className=v;else n.setAttribute(k,v);}children.forEach(c=>n.append(c));return n;};
const style=el('style',{text:`
.htn-wrap{background:#fff;border:1px solid #b6d6ff;border-radius:12px;padding:12px;margin:12px 0;color:#10283e;font:14px system-ui,sans-serif}
.htn-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.htn-btn{border:1px solid #b6d6ff;border-radius:8px;padding:9px 12px;background:#0878ed;color:white;cursor:pointer;font-size:14px}
.htn-ghost{background:#eff6ff;color:#17345d}.htn-small{color:#64748b;font-size:12px}.htn-entry{padding:10px 2px;border-bottom:1px solid #e2e8f0}.htn-entry a{color:#005eb8;text-decoration:underline}.htn-status{font-size:13px;color:#475569;margin:6px 0}.htn-surface{margin-top:10px;max-height:330px;overflow:auto}
.htn-dialog{position:fixed;inset:0;z-index:2147483643;background:#0009;display:grid;place-items:center;padding:12px}.htn-panel{background:white;color:#1e293b;width:min(100%,420px);padding:18px;border-radius:12px;box-sizing:border-box}.htn-panel input{display:block;font-size:16px;padding:12px;margin:9px 0;width:100%;box-sizing:border-box}
`});document.head.append(style);
const isEmployeePage=()=>/chamcong_v3_cs[12]\.html/.test(location.pathname);
const site=()=>isEmployeePage()?(/cs2/.test(location.pathname)?'cs2':'cs1'):null;
const getIdentity=()=>{const p=getCurrentUserInfo();return {manv:String(p.manv||'').trim().toUpperCase(),diadiem:site()||String(p.diadiem||'').toLowerCase()};};
const key=()=>`ht_notify_v1_device_${getIdentity().diadiem}_${getIdentity().manv}`;
const token=()=>localStorage.getItem(key())||'';
let root,summary,list,btnShow,btnPair,btnPush,boxOpen=false,loading=false;
const json=async(action,method='GET',body=null,secret=token())=>{
 const r=await fetch(API+'?action='+encodeURIComponent(action),{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(secret?{Authorization:'Bearer '+secret}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.error||'HTTP '+r.status);return v;
};
function msg(s){summary.textContent=s;}
function passwordDialog(){return new Promise(resolve=>{
 const overlay=el('div',{className:'htn-dialog'});const panel=el('section',{className:'htn-panel'});
 const title=el('h3',{text:'Đăng ký thiết bị nhận thông báo'});const info=el('p',{text:'Nhập mật khẩu nhân viên một lần để xác nhận điện thoại này thuộc đúng tài khoản. Không lưu mật khẩu.'});
 const input=el('input',{type:'password',placeholder:'Mật khẩu nhân viên',autocomplete:'current-password'});
 const row=el('div');row.style='display:flex;gap:8px;justify-content:flex-end';const cancel=el('button',{type:'button',className:'htn-btn htn-ghost',text:'Hủy'}),ok=el('button',{type:'button',className:'htn-btn',text:'Đăng ký'});
 const finish=v=>{overlay.remove();resolve(v)};cancel.onclick=()=>finish(null);ok.onclick=()=>{if(!input.value.trim())return;finish(input.value)};
 row.append(cancel,ok);panel.append(title,info,input,row);overlay.append(panel);document.body.append(overlay);
 });}
async function enroll(){
 if(!getIdentity().manv){msg('Vui lòng đăng nhập tài khoản nhân viên trước.');return;}
 const pass=await passwordDialog();if(pass===null)return;
 try {const r=await json('enroll','POST',{...getIdentity(),password:pass});localStorage.setItem(key(),r.device_token);msg('Đã đăng ký thông báo trong trang. Bấm “Bật Push” để nhận trên màn hình khóa.');await refresh();}
 catch(e){msg('Không đăng ký được: '+e.message);}
}
function uint8(key){const b64=(key+'='.repeat((4-key.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');const a=atob(b64);return Uint8Array.from(a,c=>c.charCodeAt(0));}
async function enablePush(){
 if(!token()){msg('Đăng ký thông báo trong trang trước khi bật Push.');return;}
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){msg('Thiết bị/trình duyệt không hỗ trợ Push; hộp thư trong trang vẫn hoạt động.');return;}
 if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.navigator.standalone&&!matchMedia('(display-mode: standalone)').matches){msg('iPhone: mở Safari → Chia sẻ → Thêm vào Màn hình chính, rồi mở biểu tượng HOÀN TUYẾT để bật Push.');return;}
 // Permission request must originate directly from a user click.
 const granted=await Notification.requestPermission();if(granted!=='granted'){msg('Chưa được cấp quyền thông báo của điện thoại.');return;}
 try {
  const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await reg.update();
  const r=await json('config','GET',null,'');if(!r.vapid_public_key)throw Error('Chưa cấu hình VAPID_PUBLIC_KEY trên Vercel');
  const pub=uint8(r.vapid_public_key);
  let sub=await reg.pushManager.getSubscription();
  if(sub){const old=sub.options?.applicationServerKey;if(old){const bytes=new Uint8Array(old);if(bytes.length!==pub.length||bytes.some((x,i)=>x!==pub[i])){await sub.unsubscribe();sub=null;}}}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pub});
  await json('enable-push','POST',{subscription:sub.toJSON()});
  msg('Đã bật thông báo đẩy trên thiết bị này.');
 }catch(e){msg('Không bật được Push: '+e.message);}
}
async function refresh(){
 if(loading||!root)return;
 if(!token()){msg('Chưa đăng ký thiết bị. Bạn có thể đăng ký hộp thư trong trang ngay cả khi chưa bật Push.');btnShow.textContent='🔔 Thông báo';return;}
 loading=true;
 try {const data=await json('inbox');const arr=data.items||[];const unread=arr.filter(x=>!x.is_read).length;btnShow.textContent='🔔 Thông báo'+(unread?' ('+unread+')':'');
  msg(unread?`Có ${unread} thông báo chưa đọc.`:'Đã kết nối trung tâm thông báo.');
  list.replaceChildren();
  for(const n of arr){const item=el('div',{className:'htn-entry'});const title=el('div',{text:n.title});title.style.fontWeight=n.is_read?'400':'700';
   const text=el('div',{text:n.body}),date=el('small',{className:'htn-small',text:new Date(n.created_at).toLocaleString('vi-VN')});
   const open=el('button',{className:'htn-btn htn-ghost',type:'button',text:'Mở công việc'});open.style.marginTop='6px';
   open.onclick=async()=>{try{await json('read','POST',{id:n.id});}catch(_){}if(/^\/(?!\/)/.test(n.url))location.href=n.url;};
   item.append(title,text,date,el('div',{},[open]));list.append(item);
  }
  if(!arr.length)list.append(el('p',{text:'Chưa có thông báo.'}));
 }catch(e){if(/chưa đăng ký|hết hạn/i.test(e.message))msg('Thiết bị cần đăng ký lại.');else msg('Chưa tải được thông báo: '+e.message);}
 finally{loading=false;}
}
function mount(){
 if(!isEmployeePage())return;const identity=getIdentity();if(!identity.manv){setTimeout(mount,2000);return;}
 if(document.getElementById('ht-notify-v1'))return;
 const panel=document.getElementById('qlnv-v3-panel')||document.getElementById('log-panel');
 root=el('section',{id:'ht-notify-v1',className:'htn-wrap'});
 const head=el('div',{className:'htn-head'});btnShow=el('button',{type:'button',className:'htn-btn',text:'🔔 Thông báo'});btnPair=el('button',{type:'button',className:'htn-btn htn-ghost',text:'Đăng ký thiết bị'});btnPush=el('button',{type:'button',className:'htn-btn htn-ghost',text:'Bật Push'});
 head.append(btnShow);const actions=el('div');actions.style='display:flex;gap:6px;flex-wrap:wrap';actions.append(btnPair,btnPush);root.append(head,actions);
 summary=el('div',{className:'htn-status',text:'Đang tải thông báo…'});list=el('div',{className:'htn-surface'});list.hidden=true;root.append(summary,list);
 btnShow.onclick=()=>{boxOpen=!boxOpen;list.hidden=!boxOpen;if(boxOpen)refresh();};btnPair.onclick=enroll;btnPush.onclick=enablePush;
 if(panel?.parentElement)panel.parentElement.insertBefore(root,panel);else document.getElementById('app-container')?.prepend(root);
 refresh();setInterval(()=>{if(document.visibilityState==='visible')refresh();},20000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
