// Standalone Online V1.3 product search interface. Never calls sales modules.
export function initProductSearch({rpc,getQuestion,getCart}){
 const $=id=>document.getElementById(id);
 const root=$('v13-products');let last=[],lastQuestion='';
 function info(s,bad=false){$('v13-status').textContent=s;$('v13-status').className='status '+(bad?'error':'ok')}
 const money=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
 const img=masp=>'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/'+encodeURIComponent(masp)+'.JPG';
 function render(data){last=data.items||[];root.replaceChildren();
  if(!last.length){root.textContent=data.message||'Không có sản phẩm phù hợp.';return;}
  for(const p of last){
   const card=document.createElement('div');card.className='v13-card';
   const photo=document.createElement('img');photo.src=img(p.masp);photo.alt=p.masp;photo.loading='lazy';photo.onclick=()=>window.open(photo.src,'_blank','noopener');
   photo.onerror=()=>{photo.alt='Không có ảnh';photo.style.display='none'};
   const label=document.createElement('strong');label.textContent=p.ten+' · '+p.masp;
   const price=document.createElement('div');price.textContent=money(p.gia_ban);
   const sizes=document.createElement('small');sizes.textContent=Object.entries(p.ton_sizes||{}).filter(([_,v])=>Number(v.ton_cs1||0)+Number(v.ton_cs2||0)>0).map(([s,v])=>`${s}: CS1 ${v.ton_cs1||0} / CS2 ${v.ton_cs2||0}`).join(' · ')||'Không rõ size';
   const add=document.createElement('button');add.type='button';add.textContent='Lấy mã';add.className='secondary';add.onclick=()=>{navigator.clipboard.writeText(p.masp).then(()=>info('Đã copy mã '+p.masp+'; mở giỏ ảnh để thêm sản phẩm.')).catch(()=>info('Mã: '+p.masp));};
   card.append(photo,label,price,sizes,add);root.append(card);
  }
 }
 async function run(){const question=getQuestion().trim();if(question.length<3){info('Nhập câu hỏi có loại sản phẩm trước.',true);return;}
  $('v13-search').disabled=true;info('Đang truy vấn danh mục và tồn kho sau kiểm...');
  try{const data=await rpc('online_v13_product_search',{question});lastQuestion=question;render(data);info(`${last.length} mẫu tìm được. ${data.message||''}`)}
  catch(e){last=[];root.replaceChildren();info('Không xác thực được dữ liệu kho: '+e.message,true)}
  finally{$('v13-search').disabled=false}
 }
 $('v13-search').onclick=run;
 $('v13-copy-codes').onclick=()=>{if(!last.length){info('Chưa có mẫu được tìm thấy.',true);return;}const lines=last.map(p=>p.masp).join('\n');navigator.clipboard.writeText(lines).then(()=>info('Đã sao chép '+last.length+' mã sản phẩm.')).catch(()=>info(lines));};
 return {run,setResults:(data)=>{render(data);info(`${last.length} mẫu tìm được từ dữ liệu kho.`);},getProducts:()=>last,getLastQuestion:()=>lastQuestion};
}
