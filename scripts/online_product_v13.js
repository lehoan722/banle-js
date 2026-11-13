// HOANTUYET ONLINE V1.3.1 – size V2, hien thi CS1/CS2, anh lon, StockQuick qua trang V2.
export function initProductSearch({rpc,getQuestion,getCart}){
 const $=id=>document.getElementById(id);
 const root=$('v13-products');let last=[],lastQuestion='';
 function info(s,bad=false){$('v13-status').textContent=s;$('v13-status').className='status '+(bad?'error':'ok')}
 const money=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
 const img=masp=>'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/'+encodeURIComponent(masp)+'.JPG';
 const stock=v=>Math.max(0,Number(v||0));
 const sorted=(a,b)=>Number(a)-Number(b);
 function sizeLine(p,branch){return Object.entries(p.ton_sizes||{}).filter(([k,v])=>stock(v['ton_'+branch])>0).sort(([a],[b])=>sorted(a,b)).map(([k,v])=>`${k}(${stock(v['ton_'+branch])})`).join(' ')||'Không có tồn';}
 function zoom(url){let overlay=document.getElementById('v13-zoom');if(!overlay){overlay=document.createElement('div');overlay.id='v13-zoom';overlay.className='v13-zoom';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Xem ảnh lớn');overlay.innerHTML='<button type="button" class="v13-zoom-close" aria-label="Đóng ảnh">✕ Đóng</button><img alt="Ảnh sản phẩm lớn">';document.body.append(overlay);overlay.addEventListener('click',e=>{if(e.target!==overlay.querySelector('img'))overlay.hidden=true;});document.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.hidden=true})}overlay.querySelector('img').src=url;overlay.hidden=false;}
 function openStock(p){
  // StockQuick V2 su dung Supabase Auth cua cong cu noi bo, khong dung cookie Online API.
  // Chuyen ma qua URL dung cong doc da co trong V2; trang V2 tu nhan ma, nguoi dung nhan vao ma de mo popup.
  const u=new URL('/timkiemnhanh_v2.html',location.origin);u.searchParams.set('masp',p.masp);u.searchParams.set('stockquick','1');
  if(p.requested_size)u.searchParams.set('size',p.requested_size);
  window.open(u.toString(),'_blank','noopener');
  info('Đã mở mã '+p.masp+' trong Tìm kiếm nhanh V2. StockQuickPopup sẽ tự mở khi trang V2 xác thực xong (cần đăng nhập hệ thống bán hàng).');
 }
 function render(data){last=data.items||[];root.replaceChildren();
  if(!last.length){root.textContent=data.message||'Không có sản phẩm phù hợp.';return;}
  for(const p of last){
   const card=document.createElement('article');card.className='v13-card';
   const photo=document.createElement('img');photo.src=img(p.masp);photo.alt=p.masp;photo.loading='lazy';photo.title='Nhấn xem ảnh lớn';photo.onclick=()=>zoom(photo.src);photo.onerror=()=>{photo.alt='Không có ảnh';photo.style.display='none'};
   const code=document.createElement('button');code.type='button';code.className='v13-code';code.textContent=p.masp;code.title='Xem StockQuickPopup qua Tìm kiếm nhanh V2';code.onclick=()=>openStock(p);
   const title=document.createElement('div');title.className='v13-product-name';title.textContent=[p.ten,p.form].filter(Boolean).join(' · ');
   const price=document.createElement('div');price.className='v13-price';price.textContent=money(p.gia_ban);
   const cs1=document.createElement('div');cs1.className='v13-cs v13-cs1';cs1.textContent='CS1: '+sizeLine(p,'cs1');
   const cs2=document.createElement('div');cs2.className='v13-cs v13-cs2';cs2.textContent='CS2: '+sizeLine(p,'cs2');
   const add=document.createElement('button');add.type='button';add.textContent='Lấy mã';add.className='secondary';add.onclick=()=>{navigator.clipboard.writeText(p.masp).then(()=>info('Đã sao chép mã '+p.masp)).catch(()=>info('Mã: '+p.masp));};
   card.append(photo,code,title,price,cs1,cs2);
   if(p.detail_unverified){const note=document.createElement('div');note.className='v13-unverified';note.textContent='Chưa xác nhận kiểu rách – kiểm tra ảnh thật';card.append(note);}
   card.append(add);root.append(card);
  }
 }
 async function run(){const question=getQuestion().trim();if(question.length<3){info('Nhập câu hỏi có loại sản phẩm trước.',true);return;}
  $('v13-search').disabled=true;info('Đang tìm sản phẩm, đổi size và kiểm tra tồn sau kiểm...');
  try{const data=await rpc('online_v13_product_search',{question});lastQuestion=question;render(data);info(`${last.length} mẫu đúng điều kiện. ${data.message||''}`)}
  catch(e){last=[];root.replaceChildren();info('Không xác thực được dữ liệu kho: '+e.message,true)}
  finally{$('v13-search').disabled=false}
 }
 $('v13-search').onclick=run;
 $('v13-copy-codes').onclick=()=>{if(!last.length){info('Chưa có mẫu được tìm thấy.',true);return;}const lines=last.map(p=>p.masp).join('\n');navigator.clipboard.writeText(lines).then(()=>info('Đã sao chép '+last.length+' mã sản phẩm.')).catch(()=>info(lines));};
 return {run,setResults:(data)=>{render(data);info(`${last.length} mẫu từ dữ liệu kho.`);},getProducts:()=>last,getLastQuestion:()=>lastQuestion};
}
