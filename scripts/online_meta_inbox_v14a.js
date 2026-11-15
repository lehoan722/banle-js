// V1.4A: Chi xem tin nhan Facebook va dua cau hoi vao cong cu AI co san.
import {getSupabaseClient} from './authModulemoi.js';
const $=id=>document.getElementById(id);
async function requestInbox(){
 const {data:{session}}=await getSupabaseClient().auth.getSession();
 const headers={'Content-Type':'application/json'};
 if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 const response=await fetch('/api/online/session',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action:'meta_inbox_list'})});
 const json=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(json.error||'HTTP '+response.status);
 return json.data||[];
}
function render(items){
 const root=$('meta-inbox-rows');root.replaceChildren();
 if(!items.length){root.textContent='Chưa có tin nhắn Messenger được nhận qua webhook.';return;}
 for(const item of items){
  const row=document.createElement('article');row.className='meta-inbox-row';
  const stamp=document.createElement('small');stamp.textContent=new Date(item.received_at).toLocaleString('vi-VN')+' · Facebook';
  const body=document.createElement('div');body.className='meta-inbox-text';body.textContent=item.message_text||'[Tin nhắn đính kèm — chưa đọc nội dung]';
  const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Đưa vào câu hỏi AI';b.disabled=!item.message_text;
  b.onclick=()=>{const target=$('ai-question');if(!target)return;target.value=item.message_text;target.dispatchEvent(new Event('input',{bubbles:true}));target.scrollIntoView({behavior:'smooth',block:'center'});target.focus();$('meta-inbox-status').textContent='Đã điền câu hỏi; nhân viên chọn tìm kho / trả lời nhanh / Gemini. Chưa gửi tin nhắn cho khách.'};
  row.append(stamp,body,b);root.append(row);
 }
}
async function load(){
 const btn=$('meta-inbox-refresh'),status=$('meta-inbox-status');btn.disabled=true;status.textContent='Đang tải tin nhắn…';
 try{const data=await requestInbox();render(data);status.textContent='Đã nhận '+data.length+' tin nhắn gần nhất (chỉ Admin). Không tự gửi trả lời.'}
 catch(e){status.textContent='Không tải được hộp thư: '+e.message}
 finally{btn.disabled=false}
}
$('meta-inbox-refresh')?.addEventListener('click',load);
// Khong tu dong polling, tranh tang do tre hoac chi phi Supabase.
