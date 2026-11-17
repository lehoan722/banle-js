import {getSupabaseClient,getCurrentUserInfo} from '../scripts/authModule.js';
const sp=getSupabaseClient(),panel=document.getElementById('v3-admin-list');
const branch=()=>document.getElementById('selectDiadiem')?.value||'cs1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mins=m=>!m.started_at?0:Math.max(0,Math.min(Number(m.assigned_minutes),(new Date(m.reported_at||Date.now()).getTime()-new Date(m.started_at).getTime())/60000));
const img=(path)=>sp.storage.from('qlnv-task-images').getPublicUrl(path).data.publicUrl;
let busy=false;
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

async function load(){if(!panel)return;const {data,error}=await sp.schema('qlnv').from('task_v3_meta').select('*').eq('diadiem',branch()).order('created_at',{ascending:false}).limit(80);
 if(error){panel.textContent='Lỗi đọc V3: '+error.message;return;}const rows=data||[];
 const ids=rows.map(r=>r.task_id);let tasks=[];if(ids.length){const r=await sp.schema('qlnv').from('tasks').select('id,title,description,status').in('id',ids);tasks=r.data||[];}
 const names=new Map(tasks.map(t=>[t.id,t]));panel.replaceChildren();
 if(!rows.length){panel.textContent='Chưa có nhiệm vụ V3 tại cơ sở này.';return;}
 for(const m of rows){const t=names.get(m.task_id)||{};const box=document.createElement('div');box.style.cssText='border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:10px 0';
 const deadline=m.deadline_at?new Date(m.deadline_at).getTime():0;const timedOut=m.started_at&&!m.reported_at&&Date.now()>=deadline;
 const s=m.reported_at?(m.report_status==='reported_done'?'Đã báo hoàn thành':m.report_status==='reported_incomplete'?'Đã báo chưa hoàn thành':m.report_status):(m.started_at?(timedOut?'Hết miễn khoán – Chờ báo cáo':'Đang chạy'):'Chưa bắt đầu');
 box.innerHTML=`<strong>#${m.task_id}: ${esc(t.title||'Nhiệm vụ')} — ${esc(m.assigned_to)}</strong><div>${esc(t.description||'')}</div><small>Giao ${m.assigned_minutes} phút • ${esc(s)} • Tối đa theo thời gian: ${mins(m).toFixed(2)} phút</small><div>${esc(m.report_note||'')}</div>`;
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
   const file=document.createElement('input');file.type='file';file.accept='image/*';file.multiple=true;
   const hint=document.createElement('div');hint.textContent=m.image_required?'Quản lý hoàn thành thay: chọn 1–4 ảnh SAU':'Ảnh sau (tùy chọn, tối đa 4)';group.append(hint,file);
   const done=document.createElement('button');done.textContent='Quản lý hoàn thành thay nhân viên';done.onclick=()=>act(async()=>{
     const note=await askAdminText('Quản lý hoàn thành thay #'+m.task_id,'Nhập kết quả công việc và lý do phải hoàn thành thay nhân viên.');if(note===null)return;
     const files=Array.from(file.files||[]);if(files.length>4||(m.image_required&&!files.length)){alert('Chọn 1–4 ảnh sau để xác nhận kết quả.');return;}
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
 const btn=document.createElement('button');btn.textContent='Duyệt phút miễn khoán';btn.onclick=()=>act(async()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<0||v>m.assigned_minutes||v>mins(m)+0.01){alert('Phút duyệt phải từ 0 đến tối đa số phút thực tế trong khung được giao.');return;}
 const reason=await askAdminText('Duyệt giờ miễn khoán #'+m.task_id,'Nhập căn cứ duyệt hoặc lý do điều chỉnh số phút.');if(reason===null)return;
 const user=getCurrentUserInfo();const r=await sp.schema('qlnv').from('task_v3_meta').update({approved_minutes:v,approved_by:user.manv||'ADMIN',approved_at:new Date().toISOString(),review_note:reason.trim(),report_status:'approved'}).eq('task_id',m.task_id).not('reported_at','is',null);if(r.error)throw Error(r.error.message);alert('Đã ghi duyệt V3. Lương chính thức CHƯA được thay đổi.');});review.append(btn);box.append(review);
 }
 panel.append(box);}
}
async function act(fn){if(busy)return;busy=true;try{await fn();}catch(e){alert('Lỗi: '+e.message);}finally{busy=false;await load();}}
document.getElementById('selectDiadiem')?.addEventListener('change',()=>setTimeout(load,400));
setInterval(()=>{if(document.visibilityState==='visible')load();},6000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});setTimeout(load,2000);
