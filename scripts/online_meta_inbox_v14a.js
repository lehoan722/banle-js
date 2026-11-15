// HOANTUYET ONLINE V1.4B — Gom hoi thoai Messenger theo khach.
// CHI DOC / chuyen cau hoi vao AI; khong gui Facebook, khong can API moi.
import {getSupabaseClient} from './authModulemoi.js';
const $=id=>document.getElementById(id);
let messages=[],selectedSender=null,loading=false;
const shortId=id=>{const s=String(id||'');return s.length>12?s.slice(0,5)+'…'+s.slice(-4):s};
const stamp=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'})};
function setStatus(s){const el=$('meta-inbox-status');if(el)el.textContent=s}
async function requestInbox(){
 const sb=getSupabaseClient();const {data,error}=await sb.auth.getSession();
 if(error)throw error;
 const headers={'Content-Type':'application/json'};
 if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
 const response=await fetch('/api/online/session',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action:'meta_inbox_list'})});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(json.error||'HTTP '+response.status);
 if(!Array.isArray(json.data))throw new Error('Du lieu hop thu khong hop le');
 return json.data;
}
function putQuestion(item){
 const target=$('ai-question');if(!target){setStatus('Khong tim thay o cau hoi AI.');return}
 if(!item.message_text)return;
 // Ghi de ro rang de tranh ghep nham cau hoi cua hai khach.
 target.value=item.message_text;
 target.dispatchEvent(new Event('input',{bubbles:true}));
 target.scrollIntoView({behavior:'smooth',block:'center'});target.focus();
 setStatus('Đã đưa tin của khách '+shortId(item.sender_id)+' vào câu hỏi AI. Chưa gửi tin trả lời cho khách.');
}
function draw(){
 const root=$('meta-inbox-rows');if(!root)return;root.replaceChildren();
 if(!messages.length){root.textContent='Chưa có tin nhắn Messenger được nhận qua webhook.';return}
 const groups=new Map();
 for(const item of messages){
  const key=String(item.page_id||'')+':'+String(item.sender_id||'');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
 }
 const threads=[...groups.entries()].sort((a,b)=>new Date(b[1][0].received_at)-new Date(a[1][0].received_at));
 if(!selectedSender||!groups.has(selectedSender))selectedSender=threads[0][0];
 const layout=document.createElement('div');layout.className='meta-inbox-layout';
 const sidebar=document.createElement('div');sidebar.className='meta-inbox-threads';sidebar.setAttribute('aria-label','Danh sách hội thoại');
 const search=$('meta-inbox-search')?.value?.trim().toLocaleLowerCase('vi')||'';
 let shown=0;
 for(const [key,items] of threads){
  const newest=items[0],title='Khách '+shortId(newest.sender_id);
  if(search&&!((title+' '+newest.sender_id+' '+items.map(x=>x.message_text||'').join(' ')).toLocaleLowerCase('vi').includes(search)))continue;
  shown++;
  const b=document.createElement('button');b.type='button';b.className='meta-thread-choice'+(selectedSender===key?' active':'');
  const head=document.createElement('strong');head.textContent=title+' · '+items.length+' tin';
  const snippet=document.createElement('span');snippet.textContent=newest.message_text||'[Tệp đính kèm]';
  const date=document.createElement('small');date.textContent=stamp(newest.received_at);
  b.append(head,snippet,date);b.onclick=()=>{selectedSender=key;draw()};sidebar.append(b);
 }
 if(!shown){const x=document.createElement('p');x.textContent='Không có hội thoại phù hợp bộ lọc.';sidebar.append(x)}
 const detail=document.createElement('div');detail.className='meta-inbox-detail';
 const items=groups.get(selectedSender)||[];
 const heading=document.createElement('h3');heading.textContent=items.length?'Hội thoại: Khách '+shortId(items[0].sender_id):'Chọn hội thoại';
 detail.append(heading);
 if(items.length){
  const hint=document.createElement('p');hint.className='hint';hint.textContent='Tin mới ở dưới. Chỉ xem và chuyển từng câu hỏi sang AI, chưa gửi phản hồi về Facebook.';detail.append(hint);
  for(const item of [...items].reverse()){
   const row=document.createElement('article');row.className='meta-inbox-row';
   const meta=document.createElement('small');meta.textContent=stamp(item.received_at)+' · '+(item.message_type==='attachment'?'Đính kèm':'Tin nhắn');
   const body=document.createElement('div');body.className='meta-inbox-text';body.textContent=item.message_text||'[Có tệp đính kèm; chưa hỗ trợ đọc nội dung]';
   const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Đưa câu này vào AI';b.disabled=!item.message_text;b.onclick=()=>putQuestion(item);
   row.append(meta,body,b);detail.append(row);
  }
 }
 layout.append(sidebar,detail);root.append(layout);
}
async function load(){
 if(loading)return;loading=true;const btn=$('meta-inbox-refresh');if(btn)btn.disabled=true;
 setStatus('Đang tải tin nhắn…');
 try{messages=await requestInbox();draw();
  const unique=new Set(messages.map(x=>String(x.page_id)+':'+String(x.sender_id))).size;
  setStatus('Đã tải '+messages.length+' tin từ '+unique+' khách (giới hạn 100 tin mới nhất; chỉ Admin). Không tự gửi tin nhắn.');
 }catch(e){setStatus('Không tải được hộp thư: '+(e?.message||'Lỗi không xác định'))}
 finally{loading=false;if(btn)btn.disabled=false}
}
$('meta-inbox-refresh')?.addEventListener('click',load);
$('meta-inbox-search')?.addEventListener('input',draw);
// Thu cong de khong lam tang so request Supabase. 
