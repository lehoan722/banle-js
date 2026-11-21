// HOANTUYET V3 - only new task workflow; legacy clock events are handled by chamcong_v3_legacy.js
// V3 tasks use an isolated HttpOnly task cookie, never the warehouse Supabase session.
const API='/api/qlnv-v3';
const api=async(action,payload={})=>{
 const r=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-QLNV-V3':'1'},body:JSON.stringify({action,...payload})});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;
};
let taskIdentity=null;
const staff=()=>String(localStorage.getItem('manv')||sessionStorage.getItem('manv')||'').trim().toUpperCase();
const branch=/chamcong_v3_cs2/.test(location.pathname)?'cs2':'cs1';
const panel=document.getElementById('qlnv-v3-panel');
const bucket='qlnv-task-images';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idStaff=()=>taskIdentity?.manv||staff();
const ms=(v)=>new Date(v).getTime();
const fmt=(mins)=>Math.max(0,mins).toFixed(1).replace('.',',')+' phút';
let current=[],busy=false;
const state=(m)=> {if(m.report_status==='approved'&&m.approved_at&&m.approved_minutes!=null)return 'Đã duyệt'; if(!m.started_at)return 'Chưa bắt đầu'; if(m.reported_at)return m.report_status==='reported_incomplete'?'Chưa hoàn thành – Chờ quản lý xử lý':'Đã báo hoàn thành – Chờ duyệt'; if(Date.now()>=ms(m.deadline_at))return 'Hết giờ miễn khoán – Chờ báo cáo';return 'Đang miễn khoán';};
const elapsed=(m,end)=>Math.max(0,(ms(end||new Date())-ms(m.started_at))/60000);
const candidate=(m)=>!m.started_at?0:Math.min(Number(m.assigned_minutes), elapsed(m,m.reported_at||new Date()));
function msg(t){alert(t);}
function askReportText(incomplete){
 return new Promise(resolve=>{
  const overlay=document.createElement('div'); overlay.className='v3-report-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;';
  const dialog=document.createElement('section');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.style.cssText='width:min(100%,480px);max-height:90dvh;overflow:auto;background:white;border-radius:14px;padding:18px;box-sizing:border-box;color:#172033;box-shadow:0 20px 60px #0005;';
  const h=document.createElement('h3');h.textContent=incomplete?'Báo cáo CHƯA HOÀN THÀNH':'Báo cáo HOÀN THÀNH';h.style.margin='0 0 10px';
  const label=document.createElement('label');label.textContent=incomplete?'Phần đã làm, phần chưa làm và lý do (bắt buộc)':'Kết quả công việc (bắt buộc)';label.style.cssText='display:block;font-weight:600;margin-bottom:8px';
  const input=document.createElement('textarea');input.rows=5;input.placeholder=incomplete?'Ví dụ: Đã dọn 3/5 kệ; còn 2 kệ vì đang thiếu người...':'Ví dụ: Đã sắp xếp đủ 50 sản phẩm theo từng size...';
  input.style.cssText='display:block;box-sizing:border-box;width:100%;min-height:130px;padding:12px;border:1px solid #94a3b8;border-radius:8px;font-size:16px;line-height:1.5;background:#fff;color:#111;resize:vertical;';
  const error=document.createElement('div');error.style.cssText='min-height:22px;color:#b91c1c;font-size:13px;margin-top:6px';
  const row=document.createElement('div');row.style.cssText='display:flex;gap:10px;justify-content:flex-end;margin-top:12px;';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Hủy';cancel.style.cssText='padding:12px 16px;background:#e2e8f0;color:#111;border:0;border-radius:8px;font-size:16px;';
  const ok=document.createElement('button');ok.type='button';ok.textContent='Tiếp tục';ok.style.cssText='padding:12px 16px;background:#0877e8;color:white;border:0;border-radius:8px;font-size:16px;';
  const finish=(v)=>{overlay.remove();resolve(v)};
  cancel.onclick=()=>finish(null);
  ok.onclick=()=>{const v=input.value.trim();if(!v){error.textContent='Bạn phải nhập nội dung báo cáo vào ô phía trên.';input.focus();return;}finish(v);};
  row.append(cancel,ok);dialog.append(h,label,input,error,row);overlay.append(dialog);document.body.append(overlay);
  // Do not auto-open the iOS keyboard, but keep the field visible and tappable.
 });
}

async function requireTaskLogin(){
 const manv=staff();if(!manv||!panel)return false;
 if(taskIdentity?.manv===manv && taskIdentity?.diadiem===branch)return true;
 try{const r=await api('whoami');if(r.manv===manv&&r.diadiem===branch){taskIdentity={manv:r.manv,diadiem:r.diadiem};return true;}}
 catch(_){ /* No V3 session yet */ }
 v3Loaded=false;current=[];
 panel.replaceChildren();
 const h=document.createElement('h2');h.textContent='🔐 Xác thực nhiệm vụ V3';
 const info=document.createElement('p');info.textContent=`Nhân viên ${manv} · ${branch.toUpperCase()}. Nhập mật khẩu nhân viên để nhận và xử lý nhiệm vụ. Phiên này độc lập với bán hàng.`;
 const form=document.createElement('form');form.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
 const inp=document.createElement('input');inp.type='password';inp.placeholder='Mật khẩu nhân viên';inp.autocomplete='off';inp.required=true;inp.style.cssText='font-size:16px;padding:10px;min-width:180px;flex:1';
 const btn=document.createElement('button');btn.type='submit';btn.textContent='Xác thực nhiệm vụ';btn.className='primary';
 const err=document.createElement('p');err.style.cssText='color:#b91c1c;width:100%';
 form.append(inp,btn,err);panel.append(h,info,form);
 form.addEventListener('submit',async e=>{e.preventDefault();btn.disabled=true;err.textContent='Đang xác thực...';try{const r=await api('login',{manv,diadiem:branch,password:inp.value});inp.value='';taskIdentity={manv:r.manv,diadiem:r.diadiem};await load(true);}catch(ex){err.textContent=ex.message;}finally{btn.disabled=false;}});
 return false;
}
async function load(force=false){
 if(!panel||!staff())return;
 if(!await requireTaskLogin())return;
 let rows;
 try{const r=await api('list');rows=r.items||[];}
 catch(e){v3Loaded=false;taskIdentity=null;panel.innerHTML='<h2>📋 Nhiệm vụ V3</h2><p class="v3-error">'+esc(e.message)+'</p>';return;}
 current=rows.map(x=>{const {task,...m}=x;return {...m,__task:task};});v3Loaded=true;
 panel.replaceChildren();const title=document.createElement('h2');title.textContent='📋 Nhiệm vụ hôm nay & việc chưa báo cáo – V3';panel.append(title);
 if(!current.length){const p=document.createElement('p');p.textContent='Chưa có nhiệm vụ V3 được giao.';panel.append(p);return;}
 const wanted=Number(new URLSearchParams(location.search).get('task'));
 for(const m of current){const t=m.__task||{};const box=document.createElement('div');box.className='v3task';box.dataset.taskId=m.task_id;
 if(wanted===m.task_id){box.style.cssText='outline:3px solid #2563eb;outline-offset:3px;scroll-margin-top:24px';}
 let raw=`<b>#${m.task_id} – ${esc(t.title||'Nhiệm vụ')}</b><div>${esc(t.description||'')}</div><div class="v3-muted">Được giao: ${m.assigned_minutes} phút • ${esc(state(m))}</div>`;
 if(m.started_at)raw+=`<div class="v3-muted">Bắt đầu: ${new Date(m.started_at).toLocaleString('vi-VN')} • Miễn khoán dự kiến: <b>${fmt(candidate(m))}</b> / ${m.assigned_minutes} phút${!m.reported_at?` • <span class="v3countdown" data-deadline="${esc(m.deadline_at)}"></span>`:''}</div>`;
 if(m.reported_at)raw+=`<div class="v3-muted">Báo cáo: ${esc(m.report_note||'(không ghi chú)')}</div>`;
 if(m.report_status==='approved'&&m.approved_at&&m.approved_minutes!=null)raw+=`<div style="margin:7px 0;background:#dcfce7;color:#166534;border-radius:6px;padding:8px"><b>✓ ĐÃ DUYỆT: ${fmt(Number(m.approved_minutes))}</b></div>`;
 else if(m.reported_at)raw+='<div style="margin:7px 0;background:#fef3c7;color:#92400e;border-radius:6px;padding:8px"><b>⏳ CHỜ QUẢN LÝ DUYỆT</b></div>';
 box.innerHTML=raw;
 if(!m.started_at)button(box,'📷 Ảnh trước & Bắt đầu',()=>begin(m,t));
 else if(!m.reported_at){button(box,'✅ Báo hoàn thành',()=>report(m,t,'reported_done'));button(box,'⚠️ Báo chưa hoàn thành',()=>report(m,t,'reported_incomplete'));}
 panel.append(box);
 }
 if(wanted){const target=panel.querySelector(`[data-task-id="${wanted}"]`);if(target&&force)target.scrollIntoView({behavior:'smooth',block:'center'});}
}
function button(el,label,fn){const b=document.createElement('button');b.className='primary';b.textContent=label;b.type='button';b.addEventListener('click',()=>wrap(fn));el.append(b);}
async function wrap(fn){if(busy)return;busy=true;try{await fn();}catch(e){console.error(e);msg('Lỗi V3: '+e.message);}finally{busy=false;await load();}}
function chooseImages(kind,required){return new Promise(resolve=>{
 const dlg=document.createElement('div');dlg.style.cssText='position:fixed;inset:0;z-index:99999;background:#000a;display:grid;place-items:center;padding:12px';
 dlg.innerHTML=`<div style="background:white;padding:20px;border-radius:12px;max-width:420px;width:100%;color:#111"><h3>${kind==='before'?'Ảnh TRƯỚC khi làm':'Ảnh SAU khi làm'}</h3><p>Chọn đúng 1 ảnh. ${required?'Bắt buộc tối thiểu một ảnh.':'Có thể bỏ qua nếu quản lý không yêu cầu.'}</p><input type="file" accept="image/*" style="width:100%"><p class="v3-error" id="v3picerr"></p><button id="v3picok">Tiếp tục</button> <button id="v3piccancel">Hủy</button></div>`;
 document.body.append(dlg);const inp=dlg.querySelector('input');
 dlg.querySelector('#v3piccancel').onclick=()=>{dlg.remove();resolve(null);};
 dlg.querySelector('#v3picok').onclick=()=>{const files=Array.from(inp.files||[]);if(files.length>1||(required&&files.length!==1)){dlg.querySelector('#v3picerr').textContent='Chọn '+(required?'đúng 1':'tối đa 1')+' ảnh.';return;}dlg.remove();resolve(files);};
 });}
async function upload(files,m,kind){
 const paths=[];
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Chỉ nhận JPEG/PNG/WebP');
  if(file.size>6*1024*1024)throw Error('Ảnh vượt 6MB, vui lòng giảm kích thước');
  const base64=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result).split(',')[1]);fr.onerror=()=>reject(Error('Không đọc được ảnh'));fr.readAsDataURL(file);});
  const r=await api('upload',{task_id:m.task_id,kind,mime:file.type,base64});paths.push(r.path);
 }
 return paths;
}
async function begin(m,t){
 if(!confirm(`Bắt đầu "${t.title||m.task_id}" (${m.assigned_minutes} phút)? Đồng hồ chạy liên tục kể cả khi bán hàng.`))return;
 const files=await chooseImages('before',m.image_required);if(files===null)return;
 const paths=await upload(files,m,'before');
 await api('start',{task_id:m.task_id,paths});
}
async function report(m,t,status){
 const incomplete=status==='reported_incomplete';const note=await askReportText(incomplete);if(note===null)return;
 const files=await chooseImages('after',m.image_required&&!incomplete);if(files===null)return;
 const paths=await upload(files,m,'after');
 const r=await api('report',{task_id:m.task_id,status,note,paths});
 msg('Đã gửi báo cáo. Giờ miễn khoán dự kiến: '+fmt(r.estimated_minutes)+'. Chờ quản lý duyệt.');
}
// Chặn TANCA trong capture-phase với dữ liệu V3 đã tải gần nhất.
// Nếu dữ liệu V3 chưa tải được, chặn để tránh bỏ kiểm tra khi mất mạng.
let v3Loaded=false;
document.getElementById('btn-tanca')?.addEventListener('click',(e)=>{
 if(!v3Loaded){e.stopImmediatePropagation();e.preventDefault();msg('Chưa tải xong danh sách nhiệm vụ V3. Vui lòng thử lại khi có mạng.');return;}
 if(current.some(m=>m.started_at&&!m.reported_at)){e.stopImmediatePropagation();e.preventDefault();msg('Bạn cần báo cáo mọi nhiệm vụ V3 đang làm trước khi tan ca.');}
},true);
setInterval(()=>{if(document.visibilityState==='visible' && document.getElementById('qlnv-v3-panel')?.offsetParent && taskIdentity && !busy)load();},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&taskIdentity)load();});
window.addEventListener('focus',()=>{if(taskIdentity)load();});
setTimeout(()=>load(true),2500);

// Countdown purely visual, actual time is derived from Supabase timestamps.
setInterval(()=>{document.querySelectorAll('.v3countdown').forEach(n=>{
 const left=Math.max(0,Math.ceil((new Date(n.dataset.deadline).getTime()-Date.now())/1000));
 n.textContent=left?`Còn ${Math.floor(left/60)} phút ${left%60} giây`:'HẾT GIỜ MIỄN KHOÁN – CHỜ BÁO CÁO';
});},1000);
