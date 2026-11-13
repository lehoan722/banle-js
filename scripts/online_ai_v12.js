import {initProductSearch} from './online_product_v13.js?v=20261113_V131';
// HOANTUYET ONLINE AI HYBRID V1.2. Module doc lap, khong sua luong ban hang.
export function initOnlineAssistant({rpc,getSession,getCart,isAdmin}){
 const $=id=>document.getElementById(id);
 const finder=initProductSearch({rpc,getQuestion:()=> $('ai-question').value,getCart});
 let activeId=null,activeFeedback='chua_duyet',activeApproved=false,busy=false;
 const status=(msg,bad=false)=>{const el=$('ai-status');el.textContent=msg;el.className='status '+(bad?'error':'ok')};
 const enabled=v=>{busy=!v;for(const id of ['ai-template','ai-gemini','ai-history-refresh','ai-good','ai-bad','ai-reject','ai-approve'])$(id).disabled=!v};
 const ctx=()=>({crm_id:getSession()||null,cart_id:$('gio').value||null});
 function setSelected(item){activeId=item.id;activeFeedback=item.feedback||'chua_duyet';activeApproved=!!item.approved_for_knowledge;$('ai-answer').value=item.final_answer||item.ai_answer||item.template_answer||'';$('ai-question').value=item.question_redacted||'';
  $('ai-approve').hidden=!isAdmin();$('ai-approve').textContent=activeApproved?'Thu hồi duyệt tri thức':'Duyệt làm tri thức';}
 async function generate(ai){
  const question=$('ai-question').value.trim();if(question.length<3){status('Vui lòng nhập câu hỏi.',true);return;}
  enabled(false);status(ai?'Đang soạn câu trả lời Gemini…':'Đang soạn mẫu trả lời…');
  try{const result=await rpc(ai?'assist_ai':'assist_template',{question,...ctx()});
   activeId=result.id;activeFeedback='chua_duyet';activeApproved=false;
   $('ai-answer').value=(ai?result.ai:result.template)||result.template;
   $('ai-approve').hidden=!isAdmin();$('ai-approve').textContent='Duyệt làm tri thức';
   if(result.products?.length)finder.setResults({items:result.products});
   status((ai?'Gemini':'Mẫu miễn phí')+' đã soạn xong và lưu lịch sử. '+(result.has_verified_stock?'Đã tra tồn sau kiểm, kiểm tra lại khi chốt đơn.':'Không có dữ liệu tồn xác minh cho câu trả lời này.'));
   await loadHistory({silent:true});
  }catch(e){status('Không tạo được câu trả lời: '+e.message+(ai?' · Có thể thử nút Trả lời nhanh.':''),true)}finally{enabled(true)}
 }
 async function loadHistory({silent=false}={}){
  try{const data=await rpc('assist_history',{crm_id:getSession()||null});const root=$('ai-history');root.replaceChildren();
   if(!data?.length){root.textContent='Chưa có lịch sử tư vấn.';return;}
   for(const r of data){const b=document.createElement('button');b.type='button';
    const time=new Date(r.created_at).toLocaleString('vi-VN');b.textContent=`${time} · ${r.ai_model?'AI':'Mẫu'} · ${r.feedback||'chưa duyệt'}${r.approved_for_knowledge?' ✓ Tri thức':''} · ${(r.question_redacted||'').slice(0,110)}`;
    b.onclick=()=>{setSelected(r);status('Đã mở lịch sử. Có thể chỉnh sửa rồi lưu đánh giá.');};root.append(b)}
   if(!silent)status('Đã tải lịch sử trong phạm vi quyền.');
  }catch(e){status('Không tải được lịch sử: '+e.message,true)}
 }
 async function feedback(value){if(!activeId){status('Hãy tạo hoặc chọn một câu trả lời trước.',true);return;}const text=$('ai-answer').value.trim();
  if(text.length<5){status('Câu trả lời quá ngắn.',true);return;}
  enabled(false);try{await rpc('assist_feedback',{id:activeId,feedback:value,final_answer:text});activeFeedback=value;activeApproved=false;status('Đã lưu bản sửa và đánh giá. Chưa đưa vào kho tri thức.');await loadHistory({silent:true});}catch(e){status(e.message,true)}finally{enabled(true)}
 }
 async function approve(){if(!activeId){status('Chưa chọn câu trả lời.',true);return;}if(!isAdmin()){status('Chỉ Admin có quyền duyệt.',true);return;}
  if(!activeApproved&&activeFeedback!=='tot'){status('Chọn Lưu bản sửa · Tốt trước khi duyệt.',true);return;}
  enabled(false);try{const val=!activeApproved;await rpc('assist_approve',{id:activeId,approve:val});activeApproved=val;
   $('ai-approve').textContent=val?'Thu hồi duyệt tri thức':'Duyệt làm tri thức';status(val?'Đã duyệt làm tri thức tham khảo cho AI.':'Đã thu hồi duyệt tri thức.');await loadHistory({silent:true});}catch(e){status(e.message,true)}finally{enabled(true)}
 }
 $('ai-template').onclick=()=>generate(false);$('ai-gemini').onclick=()=>generate(true);
 $('ai-history-refresh').onclick=()=>loadHistory();
 $('ai-good').onclick=()=>feedback('tot');$('ai-bad').onclick=()=>feedback('can_sua');$('ai-reject').onclick=()=>feedback('khong_dung');$('ai-approve').onclick=approve;
 $('ai-copy').onclick=async()=>{const text=$('ai-answer').value.trim();if(!text){status('Chưa có câu trả lời.',true);return;}try{await navigator.clipboard.writeText(text);status('Đã sao chép. Nhân viên kiểm tra và gửi trên Facebook/Zalo.')}catch(e){status('Không thể sao chép: '+e.message,true)}};
 document.addEventListener('ht-online-crm-changed',()=>{activeId=null;activeFeedback='chua_duyet';activeApproved=false;$('ai-question').value='';$('ai-answer').value='';$('ai-approve').hidden=!isAdmin();loadHistory({silent:true})});
 $('ai-approve').hidden=!isAdmin();loadHistory({silent:true});
}
