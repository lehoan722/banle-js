import {getSupabaseClient,getCurrentUserInfo} from '../scripts/authModule.js';
const sp=getSupabaseClient(),panel=document.getElementById('v3-admin-list');
const branch=()=>document.getElementById('selectDiadiem')?.value||'cs1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mins=m=>!m.started_at?0:Math.max(0,Math.min(Number(m.assigned_minutes),(new Date(m.reported_at||Date.now()).getTime()-new Date(m.started_at).getTime())/60000));
const img=(path)=>sp.storage.from('qlnv-task-images').getPublicUrl(path).data.publicUrl;
let busy=false;
let v3StatusFilter='all';
const v3DayKey=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const v3Today=()=>v3DayKey(Date.now());
const v3IsApproved=m=>m.report_status==='approved' && m.approved_at!=null && m.approved_minutes!=null;
const v3State=(m,t)=>{
 if(t?.status==='cancelled')return {name:'Đã hủy',category:'cancelled',bg:'#fee2e2',fg:'#991b1b'};
 if(v3IsApproved(m))return {name:'Đã duyệt',category:'approved',bg:'#dcfce7',fg:'#166534'};
 if(m.reported_at)return m.report_status==='reported_incomplete'
    ? {name:'Chưa hoàn thành – Chờ xử lý',category:'incomplete',bg:'#ffedd5',fg:'#9a3412'}
    : {name:'Đã báo cáo – Chờ duyệt',category:'pending',bg:'#fef3c7',fg:'#92400e'};
 if(m.started_at)return new Date(m.deadline_at).getTime()<=Date.now()
    ? {name:'Hết giờ – Chờ báo cáo',category:'working',bg:'#fee2e2',fg:'#991b1b'}
    : {name:'Đang chạy',category:'working',bg:'#dbeafe',fg:'#1d4ed8'};
 return {name:'Chưa bắt đầu',category:'not_started',bg:'#f1f5f9',fg:'#475569'};
};
const v3Format=n=>Number(n||0).toLocaleString('vi-VN',{minimumFractionDigits:0,maximumFractionDigits:2});

function askAdminText(title,description=''){return new Promise(resolve=>{
 const shade=document.createElement('div');shade.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#0f172aa6;display:flex;align-items:center;justify-content:center;padding:15px';
 const wrap=document.createElement('div');wrap.style.cssText='background:#fff;border-radius:12px;padding:20px;width:min(100%,480px);box-sizing:border-box';
 const heading=document.createElement('h3');heading.textContent=title;
 const text=document.createElement('p');text.textContent=description;text.style.cssText='font-size:14px;color:#475569';
 const input=document.createElement('textarea');input.rows=4;input.placeholder='Nhập nội dung và lý do...';input.style.cssText='box-sizing:border-box;width:100%;min-height:105px;padding:10px;border:1px solid #94a3b8;border-radius:8px;font-size:16px';
 const err=document.createElement('p');err.style.cssText='color:#b91c1c;font-size:13px;min-height:15px';
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;justify-content:flex-end;gap:8px';
 const no=document.createElement('button');no.textContent='Không thực hiện';const yes=document.createElement('button');yes.textContent='Xác nhận';
 no.onclick=()=>{shade.remove();resolve(null)};
 yes.onclick=()=>{const v=input.value.trim();if(!v){err.textContent='Bạn cần nhập nội dung/lý do trước khi tiếp tục.';input.focus();return;}shade.remove();resolve(v);};
 buttons.append(no,yes);wrap.append(heading,text,input,err,buttons);shade.append(wrap);document.body.append(shade);
});}

async function renderAutoApprovalSettings(){
 let mount=document.getElementById('v305-auto-approve');
 if(!mount){mount=document.createElement('section');mount.id='v305-auto-approve';mount.style.cssText='border:1px solid #94a3b8;border-radius:10px;padding:14px;margin:10px 0;background:#f8fafc';panel.parentElement.insertBefore(mount,panel);}
 const site=branch();const {data,error}=await sp.schema('qlnv').from('task_v3_settings').select('auto_approve_enabled,updated_at,updated_by').eq('diadiem',site).maybeSingle();
 mount.replaceChildren();const heading=document.createElement('strong');heading.textContent='⚙️ Tự động duyệt nhiệm vụ V3 – '+site.toUpperCase();mount.append(heading);
 if(error||!data){const txt=document.createElement('p');txt.textContent='Không tải được cài đặt tự duyệt: '+(error?.message||'chưa có dữ liệu')+'. Kiểm tra SQL V3.05.';mount.append(txt);return;}
 const line=document.createElement('label');line.style.cssText='display:flex;gap:10px;align-items:center;margin-top:10px';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!data.auto_approve_enabled;toggle.style.width='20px';toggle.style.height='20px';
 const name=document.createElement('span');name.textContent=toggle.checked?'ĐANG BẬT – tự duyệt công việc hoàn thành hợp lệ':'ĐANG TẮT – quản lý duyệt thủ công';line.append(toggle,name);mount.append(line);
 const hint=document.createElement('small');hint.textContent='Lưu lâu dài trên Supabase theo từng cơ sở. Sau khi nhân viên báo hoàn thành đủ ảnh, chờ tối thiểu 5 phút rồi hệ thống mới tự duyệt. Chưa hoàn thành vẫn chờ quản lý; quản lý có thể duyệt thủ công trước. Phút đưa vào lương còn phải đối chiếu giờ công.';mount.append(hint);
 toggle.addEventListener('change',async()=>{
  const checked=toggle.checked;toggle.disabled=true;
  try{
   const who=getCurrentUserInfo();const r=await sp.schema('qlnv').from('task_v3_settings').update({auto_approve_enabled:checked,updated_at:new Date().toISOString(),updated_by:who.manv||'ADMIN'}).eq('diadiem',site).select('diadiem');
   if(r.error)throw Error(r.error.message);if(!r.data?.length)throw Error('Không được phép cập nhật. Hãy đăng nhập tài khoản quản lý.');
   name.textContent=checked?'ĐANG BẬT – tự duyệt công việc hoàn thành hợp lệ':'ĐANG TẮT – quản lý duyệt thủ công';
  }catch(e){toggle.checked=!checked;alert('Không lưu được công tắc tự duyệt: '+e.message);}finally{toggle.disabled=false;}
 });
}
async function load(){if(!panel)return;await renderAutoApprovalSettings();const {data,error}=await sp.schema('qlnv').from('task_v3_meta').select('*').eq('diadiem',branch()).order('created_at',{ascending:false}).limit(300);
 if(error){panel.textContent='Lỗi đọc V3: '+error.message;return;}const rows=data||[];
 const ids=rows.map(r=>r.task_id);let tasks=[];if(ids.length){const r=await sp.schema('qlnv').from('tasks').select('id,title,description,status').in('id',ids);tasks=r.data||[];}
 const names=new Map(tasks.map(t=>[t.id,t]));panel.replaceChildren();
 const today=v3Today(),todayRows=rows.filter(m=>m.created_at&&v3DayKey(m.created_at)===today);
 const live=todayRows.filter(m=>names.get(m.task_id)?.status!=='cancelled');
 const approved=live.filter(m=>v3IsApproved(m));
 const awaiting=live.filter(m=>m.reported_at&&!v3IsApproved(m));
 const sum=xs=>xs.reduce((a,m)=>a+Number(m.approved_minutes||0),0);
 const summary=document.createElement('div');summary.style.cssText='background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:10px 0';
 summary.innerHTML=`<strong>Thống kê nhiệm vụ giao hôm nay (${esc(today)})</strong><div style="margin-top:7px;display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px">
 <div>Đã giao: <b>${live.length} việc</b></div><div>Chờ duyệt/xử lý: <b style="color:#92400e">${awaiting.length} việc</b></div>
 <div>Đã duyệt: <b style="color:#166534">${approved.length} việc</b></div><div>Phút giao: <b>${v3Format(live.reduce((a,m)=>a+Number(m.assigned_minutes||0),0))}</b></div>
 <div>Phút đã duyệt: <b style="color:#166534">${v3Format(sum(approved))}</b></div></div><small style="color:#64748b">Chỉ tính việc giao hôm nay tại cơ sở đang chọn; không tính việc đã hủy. Phút duyệt chưa phải giờ lương chính thức.</small>`;
 panel.append(summary);
 const byStaff=new Map();for(const m of live){const k=m.assigned_to||'KHÔNG RÕ';if(!byStaff.has(k))byStaff.set(k,{count:0,assigned:0,approved:0,pending:0});const r=byStaff.get(k);r.count++;r.assigned+=Number(m.assigned_minutes||0);if(v3IsApproved(m))r.approved+=Number(m.approved_minutes||0);else if(m.reported_at)r.pending++;}
 if(byStaff.size){const detail=document.createElement('details');detail.style.cssText='margin:10px 0;padding:8px;border:1px solid #e2e8f0;border-radius:8px';
 const heading=document.createElement('summary');heading.textContent='Theo từng nhân viên (bấm để xem)';heading.style.cursor='pointer';detail.append(heading);
 const table=document.createElement('div');table.style.cssText='overflow-x:auto;margin-top:8px';
 table.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>Nhân viên</th><th>Việc</th><th>Phút giao</th><th>Chờ duyệt/xử lý</th><th>Phút duyệt</th></tr></thead><tbody>'+[...byStaff.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([staff,r])=>`<tr><td>${esc(staff)}</td><td>${r.count}</td><td>${v3Format(r.assigned)}</td><td>${r.pending}</td><td><b>${v3Format(r.approved)}</b></td></tr>`).join('')+'</tbody></table>';
 detail.append(table);panel.append(detail);}
 const filterBar=document.createElement('div');filterBar.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0';
 const filterLabel=document.createElement('label');filterLabel.textContent='Lọc trạng thái: ';filterLabel.htmlFor='v3-review-filter';
 const select=document.createElement('select');select.id='v3-review-filter';select.style.cssText='padding:8px;border:1px solid #94a3b8;border-radius:7px';
 for(const [v,label] of [['all','Tất cả'],['pending','Chờ duyệt'],['approved','Đã duyệt'],['incomplete','Chưa hoàn thành'],['working','Đang làm/chờ báo cáo'],['not_started','Chưa bắt đầu'],['cancelled','Đã hủy']]){const opt=document.createElement('option');opt.value=v;opt.textContent=label;select.append(opt);}select.value=v3StatusFilter;
 select.addEventListener('change',()=>{v3StatusFilter=select.value;load();});filterBar.append(filterLabel,select);panel.append(filterBar);
 if(!rows.length){const empty=document.createElement('p');empty.textContent='Chưa có nhiệm vụ V3 tại cơ sở này.';panel.append(empty);return;}
 const visible=rows.filter(m=>v3StatusFilter==='all'||v3State(m,names.get(m.task_id)).category===v3StatusFilter);
 if(!visible.length){const empty=document.createElement('p');empty.textContent='Không có nhiệm vụ thuộc trạng thái đã chọn.';panel.append(empty);return;}
 for(const m of visible){const t=names.get(m.task_id)||{};const box=document.createElement('div');box.style.cssText='border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:10px 0';
 const deadline=m.deadline_at?new Date(m.deadline_at).getTime():0;const timedOut=m.started_at&&!m.reported_at&&Date.now()>=deadline;
 const s=m.reported_at?(m.report_status==='reported_done'?'Đã báo hoàn thành':m.report_status==='reported_incomplete'?'Đã báo chưa hoàn thành':m.report_status):(m.started_at?(timedOut?'Hết miễn khoán – Chờ báo cáo':'Đang chạy'):'Chưa bắt đầu');
 const st=v3State(m,t);
 const badge=`<span style="display:inline-block;margin:2px 0;padding:4px 9px;border-radius:15px;background:${st.bg};color:${st.fg};font-weight:700;font-size:12px">${esc(st.name)}</span>`;
 box.innerHTML=`<strong>#${m.task_id}: ${esc(t.title||'Nhiệm vụ')} — ${esc(m.assigned_to)}</strong><div>${badge}</div><div>${esc(t.description||'')}</div><small>Giao ${m.assigned_minutes} phút • ${esc(s)} • Tối đa theo thời gian: ${mins(m).toFixed(2)} phút</small><div>${esc(m.report_note||'')}</div>${v3IsApproved(m)?`<div style="color:#166534;font-weight:700;margin:5px 0">ĐÃ DUYỆT: ${v3Format(m.approved_minutes)} phút • ${esc(m.approved_by||'Quản lý')} • ${esc(new Date(m.approved_at).toLocaleString('vi-VN'))}</div>`:m.reported_at?'<div style="color:#92400e;font-weight:700;margin:5px 0">Chưa được chốt phút miễn khoán – chờ quản lý xử lý (nếu bật tự duyệt: xét sau 5 phút)</div>':''}`;
 if(t.status==='cancelled'){
  const cancelled=document.createElement('p');cancelled.style.cssText='color:#b91c1c;font-weight:700;margin:8px 0';cancelled.textContent='ĐÃ HỦY – '+(m.report_note||'');box.append(cancelled);panel.append(box);continue;
 }
 if(!m.reported_at){
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='🗑️ Hủy nhiệm vụ V3';cancel.style.cssText='margin:8px 0;background:#fee2e2;color:#991b1b;padding:9px 14px;border:1px solid #fecaca;border-radius:8px';
  cancel.onclick=()=>act(async()=>{
   const reason=await askAdminText('Hủy nhiệm vụ #'+m.task_id,'Hủy nhiệm vụ đã giao sẽ dừng miễn khoán (nếu đã bắt đầu), không thể tự mở lại. Bắt buộc ghi lý do.');
   if(reason===null)return;
   if(!confirm('Xác nhận HỦY nhiệm vụ #'+m.task_id+'?'))return;
   const {error}=await sp.schema('qlnv').rpc('task_v3_cancel', {p_task_id:m.task_id,p_reason:reason});
   if(error)throw Error(error.message);
   alert('Đã hủy nhiệm vụ V3 #'+m.task_id+'.');
  });
  box.append(cancel);
 }
 const photos=document.createElement('div');for(const [label,paths] of [['Trước',m.before_images],['Sau',m.after_images]]){if(!Array.isArray(paths)||!paths.length)continue;const tag=document.createElement('span');tag.textContent=label+': ';photos.append(tag);for(const path of paths){const a=document.createElement('a');a.href=img(path);a.target='_blank';a.rel='noopener noreferrer';const im=document.createElement('img');im.src=img(path);im.style.cssText='width:64px;height:64px;object-fit:cover;margin:3px;border-radius:5px';a.append(im);photos.append(a);}}box.append(photos);

 if(m.started_at&&!m.reported_at){
   const group=document.createElement('div');group.style.marginTop='9px';
   const file=document.createElement('input');file.type='file';file.accept='image/*';file.multiple=false;
   const hint=document.createElement('div');hint.textContent=m.image_required?'Quản lý hoàn thành thay: chọn đúng 1 ảnh SAU':'Ảnh sau (tùy chọn, tối đa 1)';group.append(hint,file);
   const done=document.createElement('button');done.textContent='Quản lý hoàn thành thay nhân viên';done.onclick=()=>act(async()=>{
     const note=await askAdminText('Quản lý hoàn thành thay #'+m.task_id,'Nhập kết quả công việc và lý do phải hoàn thành thay nhân viên.');if(note===null)return;
     const files=Array.from(file.files||[]);if(files.length>1||(m.image_required&&files.length!==1)){alert('Chọn đúng 1 ảnh sau để xác nhận kết quả.');return;}
     let paths=[];
     for(const f of files){if(!f.type.startsWith('image/')||f.size>12*1024*1024)throw Error('Chỉ nhận ảnh dưới 12MB');const path=`${branch()}/${m.assigned_to}/v3/task_${m.task_id}_after_admin_${crypto.randomUUID()}.${f.type==='image/png'?'png':'jpg'}`;
       const up=await sp.storage.from('qlnv-task-images').upload(path,f,{upsert:false,contentType:f.type});if(up.error)throw Error(up.error.message);paths.push(path);
     }
     const now=new Date(),minutes=Math.max(0,Math.min(Number(m.assigned_minutes),(now-new Date(m.started_at))/60000));
     const r=await sp.schema('qlnv').from('task_v3_meta').update({reported_at:now.toISOString(),report_status:'reported_done',report_note:'QUẢN LÝ HOÀN THÀNH THAY: '+note.trim(),after_images:paths,updated_at:now.toISOString()}).eq('task_id',m.task_id).is('reported_at',null).select('task_id');if(r.error)throw Error(r.error.message);if(!r.data?.length)throw Error('Task đã được báo cáo trong phiên khác');
     const upd=await sp.schema('qlnv').from('tasks').update({status:'done',completed_at:now.toISOString(),actual_minutes:Math.ceil((now-new Date(m.started_at))/60000),payroll_minutes:Math.ceil(minutes),after_image_path:paths[0]||null,after_image_at:paths.length?now.toISOString():null}).eq('id',m.task_id);
     if(upd.error)alert('Báo cáo V3 lưu nhưng lỗi đồng bộ task cũ: '+upd.error.message);
   });group.append(done);box.append(group);
 }
 if(m.reported_at){const review=document.createElement('div');review.style.marginTop='8px';const input=document.createElement('input');input.type='number';input.min='0';input.max=String(m.assigned_minutes);input.step='0.01';input.value=m.approved_minutes??mins(m).toFixed(2);input.style.width='100px';review.append('Phút duyệt: ',input,' ');
 const btn=document.createElement('button');btn.textContent=v3IsApproved(m)?'Điều chỉnh phút đã duyệt':'Duyệt phút miễn khoán';btn.onclick=()=>act(async()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<0||v>m.assigned_minutes||v>mins(m)+0.01){alert('Phút duyệt phải từ 0 đến tối đa số phút thực tế trong khung được giao.');return;}
 const reason=await askAdminText('Duyệt giờ miễn khoán #'+m.task_id,'Nhập căn cứ duyệt hoặc lý do điều chỉnh số phút.');if(reason===null)return;
 const user=getCurrentUserInfo();const r=await sp.schema('qlnv').from('task_v3_meta').update({approved_minutes:v,approved_by:user.manv||'ADMIN',approved_at:new Date().toISOString(),review_note:reason.trim(),report_status:'approved'}).eq('task_id',m.task_id).not('reported_at','is',null);if(r.error)throw Error(r.error.message);alert('Đã ghi duyệt V3. Lương chính thức CHƯA được thay đổi.');});review.append(btn);box.append(review);
 }
 panel.append(box);}
}
async function act(fn){if(busy)return;busy=true;try{await fn();}catch(e){alert('Lỗi: '+e.message);}finally{busy=false;await load();}}
document.getElementById('selectDiadiem')?.addEventListener('change',()=>setTimeout(load,400));
setInterval(()=>{if(document.visibilityState==='visible' && !panel.contains(document.activeElement))load();},12000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});setTimeout(load,2000);
