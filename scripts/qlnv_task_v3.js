// HOANTUYET V3 - only new task workflow; legacy clock events are handled by chamcong_v3_legacy.js
import {getSupabaseClient} from './authModule.js';
const sp=getSupabaseClient();
const branch=/chamcong_v3_cs2/.test(location.pathname)?'cs2':'cs1';
const panel=document.getElementById('qlnv-v3-panel');
const bucket='qlnv-task-images';
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idStaff=()=>String(localStorage.getItem('manv')||sessionStorage.getItem('manv')||'').trim().toUpperCase();
const ms=(v)=>new Date(v).getTime();
const fmt=(mins)=>Math.max(0,mins).toFixed(1).replace('.',',')+' phút';
let current=[],busy=false;
const state=(m)=> { if(!m.started_at)return 'Chưa bắt đầu'; if(m.reported_at)return m.report_status==='reported_done'?'Đã báo hoàn thành':m.report_status==='reported_incomplete'?'Đã báo chưa hoàn thành':m.report_status; if(Date.now()>=ms(m.deadline_at))return 'Hết giờ miễn khoán – Chờ báo cáo';return 'Đang miễn khoán';};
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

async function load(){
 const manv=idStaff();if(!manv||!panel)return;
 const {data,error}=await sp.schema('qlnv').from('task_v3_meta').select('*').eq('assigned_to',manv).eq('diadiem',branch).order('created_at',{ascending:false}).limit(30);
 if(error){panel.innerHTML='<h2>📋 Nhiệm vụ V3</h2><p class="v3-error">Không đọc được dữ liệu V3: '+esc(error.message)+'. Kiểm tra đăng nhập Supabase và chạy SQL_V3_CHAY_TRUOC.sql.</p>';return;}
 current=data||[];v3Loaded=true;
 const ids=current.map(m=>m.task_id);let tasks=[];
 if(ids.length){let r=await sp.schema('qlnv').from('tasks').select('id,title,description,status,created_at').in('id',ids);if(r.error){msg(r.error.message);return;}tasks=r.data||[];}
 const map=new Map(tasks.map(t=>[t.id,t]));current=current.filter(m=>map.get(m.task_id)?.status!=='cancelled');
 panel.replaceChildren();const title=document.createElement('h2');title.textContent='📋 Nhiệm vụ được quản lý giao – V3';panel.append(title);
 if(!current.length){const p=document.createElement('p');p.textContent='Chưa có nhiệm vụ V3 được giao.';panel.append(p);return;}
 for(const m of current){const t=map.get(m.task_id)||{};const box=document.createElement('div');box.className='v3task';
 let raw= ` <b>#${m.task_id} – ${esc(t.title||'Nhiệm vụ')}</b><div>${esc(t.description||'')}</div><div class="v3-muted">Được giao: ${m.assigned_minutes} phút • ${esc(state(m))}</div>`;
 if(m.started_at){raw+=`<div class="v3-muted">Bắt đầu: ${new Date(m.started_at).toLocaleString('vi-VN')} • Miễn khoán dự kiến: <b>${fmt(candidate(m))}</b> / ${m.assigned_minutes} phút${!m.reported_at?` • <span class="v3countdown" data-deadline="${esc(m.deadline_at)}"></span>`:""}</div>`;}
 if(m.reported_at){raw+=`<div class="v3-muted">Báo cáo: ${esc(m.report_note||'(không ghi chú)')}</div>`;}
 if(m.approved_minutes!==null)raw+=`<div><b>Quản lý duyệt: ${fmt(Number(m.approved_minutes))}</b></div>`;
 box.innerHTML=raw;
 if(t.status==='cancelled')continue;
 if(!m.started_at){button(box,'📷 Ảnh trước & Bắt đầu',()=>begin(m,t));}
 else if(!m.reported_at){button(box,'✅ Báo hoàn thành',()=>report(m,t,'reported_done'));button(box,'⚠️ Báo chưa hoàn thành',()=>report(m,t,'reported_incomplete'));}
 panel.append(box);
 }
}
function button(el,label,fn){const b=document.createElement('button');b.className='primary';b.textContent=label;b.type='button';b.addEventListener('click',()=>wrap(fn));el.append(b);}
async function wrap(fn){if(busy)return;busy=true;try{await fn();}catch(e){console.error(e);msg('Lỗi V3: '+e.message);}finally{busy=false;await load();}}
function chooseImages(kind,required){return new Promise(resolve=>{
 const dlg=document.createElement('div');dlg.style.cssText='position:fixed;inset:0;z-index:99999;background:#000a;display:grid;place-items:center;padding:12px';
 dlg.innerHTML=`<div style="background:white;padding:20px;border-radius:12px;max-width:420px;width:100%;color:#111"><h3>${kind==='before'?'Ảnh TRƯỚC khi làm':'Ảnh SAU khi làm'}</h3><p>Chọn 1–4 ảnh. ${required?'Bắt buộc tối thiểu một ảnh.':'Có thể bỏ qua nếu quản lý không yêu cầu.'}</p><input type="file" accept="image/*" multiple style="width:100%"><p class="v3-error" id="v3picerr"></p><button id="v3picok">Tiếp tục</button> <button id="v3piccancel">Hủy</button></div>`;
 document.body.append(dlg);const inp=dlg.querySelector('input');
 dlg.querySelector('#v3piccancel').onclick=()=>{dlg.remove();resolve(null);};
 dlg.querySelector('#v3picok').onclick=()=>{const files=Array.from(inp.files||[]);if(files.length>4||(required&&files.length<1)){dlg.querySelector('#v3picerr').textContent='Chọn '+(required?'1–4':'tối đa 4')+' ảnh.';return;}dlg.remove();resolve(files);};
 });}
async function upload(files,m,kind){let paths=[];for(const file of files){if(!file.type.startsWith('image/'))throw Error('Tệp không phải ảnh');if(file.size>12*1024*1024)throw Error('Ảnh vượt 12 MB, vui lòng giảm kích thước');const path=`${branch}/${idStaff()}/v3/task_${m.task_id}_${kind}_${crypto.randomUUID()}.${/png/.test(file.type)?'png':'jpg'}`;const r=await sp.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});if(r.error)throw Error('Không tải được ảnh: '+r.error.message);paths.push(path);}return paths;}
async function begin(m,t){if(!confirm(`Bắt đầu "${t.title||m.task_id}" (${m.assigned_minutes} phút)? Đồng hồ chạy liên tục kể cả khi bán hàng.`))return;
 const start=new Date();start.setHours(0,0,0,0);const end=new Date();end.setHours(23,59,59,999);
 const cc=await sp.from('chamcong_log').select('su_kien,created_at').eq('manv',idStaff()).eq('diadiem',branch)
   .gte('created_at',start.toISOString()).lte('created_at',end.toISOString()).order('created_at',{ascending:false}).limit(1);
 if(cc.error)throw Error('Khong kiem tra duoc vao ca: '+cc.error.message);
 if(!['VAOCA','NTRD','NCHD'].includes(cc.data?.[0]?.su_kien))throw Error('Ban phai Vao ca va khong dang trong gio nghi / Tan ca moi duoc bat dau nhiem vu.');
 const files=await chooseImages('before',m.image_required);if(files===null)return;
 const paths=await upload(files,m,'before');
 // Guard against concurrent activity and stale UI
 const {data:existing,error:exErr}=await sp.schema('qlnv').from('task_v3_meta').select('task_id,started_at,reported_at').eq('assigned_to',idStaff()).eq('diadiem',branch).not('started_at','is',null).is('reported_at',null);
 if(exErr)throw Error(exErr.message);if((existing||[]).some(x=>x.task_id!==m.task_id))throw Error('Đang có nhiệm vụ chưa báo cáo. Hãy hoàn thành hoặc báo cáo trước khi bắt đầu nhiệm vụ khác.');
 const now=new Date();const deadline=new Date(now.getTime()+Number(m.assigned_minutes)*60000);
 const r=await sp.schema('qlnv').from('task_v3_meta').update({started_at:now.toISOString(),deadline_at:deadline.toISOString(),before_images:paths,report_status:'working',updated_at:now.toISOString()}).eq('task_id',m.task_id).is('started_at',null).select('task_id');
 if(r.error)throw Error(r.error.message);if(!r.data?.length)throw Error('Nhiệm vụ đã được bắt đầu ở nơi khác');
 const taskUpdate=await sp.schema('qlnv').from('tasks').update({status:'in_progress',started_at:now.toISOString(),deadline_at:deadline.toISOString(),before_image_path:paths[0]||null,before_image_at:paths.length?now.toISOString():null}).eq('id',m.task_id).eq('status','pending');
 if(taskUpdate.error)msg('Đã bắt đầu đồng hồ V3, nhưng cần đồng bộ trạng thái nhiệm vụ: '+taskUpdate.error.message);
}
async function report(m,t,status){const incomplete=status==='reported_incomplete';const note=await askReportText(incomplete);if(note===null)return;
 const files=await chooseImages('after',m.image_required&&!incomplete);if(files===null)return;
 const paths=await upload(files,m,'after');const now=new Date();const min=Math.min(Number(m.assigned_minutes),elapsed(m,now));
 const r=await sp.schema('qlnv').from('task_v3_meta').update({reported_at:now.toISOString(),report_status:status,after_images:paths,report_note:note.trim(),updated_at:now.toISOString()}).eq('task_id',m.task_id).is('reported_at',null).select('task_id');if(r.error)throw Error(r.error.message);if(!r.data?.length)throw Error('Đã có báo cáo từ phiên khác');
 const upd=await sp.schema('qlnv').from('tasks').update({status:incomplete?'timeout':'done',completed_at:incomplete?null:now.toISOString(),actual_minutes:Math.ceil(elapsed(m,now)),payroll_minutes:Math.min(Number(m.assigned_minutes),Math.ceil(min)),after_image_path:paths[0]||null,after_image_at:paths.length?now.toISOString():null}).eq('id',m.task_id);
 if(upd.error)msg('Báo cáo V3 đã lưu, nhưng trạng thái task cũ chưa đồng bộ: '+upd.error.message);
 msg('Đã gửi báo cáo. Miễn khoán đề xuất: '+fmt(min)+'. Quản lý sẽ xác nhận.');
}
// Chặn TANCA trong capture-phase với dữ liệu V3 đã tải gần nhất.
// Nếu dữ liệu V3 chưa tải được, chặn để tránh bỏ kiểm tra khi mất mạng.
let v3Loaded=false;
document.getElementById('btn-tanca')?.addEventListener('click',(e)=>{
 if(!v3Loaded){e.stopImmediatePropagation();e.preventDefault();msg('Chưa tải xong danh sách nhiệm vụ V3. Vui lòng thử lại khi có mạng.');return;}
 if(current.some(m=>m.started_at&&!m.reported_at)){e.stopImmediatePropagation();e.preventDefault();msg('Bạn cần báo cáo mọi nhiệm vụ V3 đang làm trước khi tan ca.');}
},true);
setInterval(()=>{if(document.visibilityState==='visible' && document.getElementById('qlnv-v3-panel')?.offsetParent)load();},5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load();});
window.addEventListener('focus',()=>load());
setTimeout(load,2500);

// Countdown purely visual, actual time is derived from Supabase timestamps.
setInterval(()=>{document.querySelectorAll('.v3countdown').forEach(n=>{
 const left=Math.max(0,Math.ceil((new Date(n.dataset.deadline).getTime()-Date.now())/1000));
 n.textContent=left?`Còn ${Math.floor(left/60)} phút ${left%60} giây`:'HẾT GIỜ MIỄN KHOÁN – CHỜ BÁO CÁO';
});},1000);
