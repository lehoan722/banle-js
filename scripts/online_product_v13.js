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
 // V1.3.3: tải và sử dụng trực tiếp StockQuickPopup gốc của toàn bộ dự án.
 // Không sao chép logic StockQuick, không đụng tới tìm kiếm nhanh hoặc bán lẻ.
 let sharedStockLoader = null;
 function loadSharedStockQuick(){
  if (typeof window.StockQuick?.showFor === 'function') return Promise.resolve();
  if (sharedStockLoader) return sharedStockLoader;
  sharedStockLoader = new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='/scripts/stockQuickPopup.js';
   script.dataset.onlineStockQuick='shared';
   script.onload=()=>typeof window.StockQuick?.showFor==='function'?resolve():reject(new Error('Module StockQuick gốc chưa khởi tạo'));
   script.onerror=()=>reject(new Error('Không tải được /scripts/stockQuickPopup.js'));
   document.head.appendChild(script);
  }).catch(e=>{sharedStockLoader=null;throw e});
  return sharedStockLoader;
 }
 async function openSharedStockQuick(p){
  const sb=window.supabase;
  // Popup gốc lấy dữ liệu qua RLS của Supabase: phải có phiên thực.
  if (!sb?.auth || typeof sb.rpc!=='function') throw new Error('Supabase client chưa sẵn sàng');
  const {data,error}=await sb.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Chưa có phiên Supabase hợp lệ');
  await loadSharedStockQuick();
  await window.StockQuick.showFor(document.body, String(p.masp||'').trim().toUpperCase());
 }
 async function openStockPreferred(p){
  try{await openSharedStockQuick(p)}
  catch(e){
   console.warn('[HOANTUYET ONLINE] StockQuick gốc chưa mở được, dùng xem nhanh dự phòng:', e);
   openStock(p);
   info('StockQuick gốc chưa khả dụng: '+e.message+'. Đang hiển thị bản xem nhanh.',true);
  }
 }
 function openStock(p){
  // CRM dùng cookie phiên Online; không có Supabase Auth của trang bán lẻ.
  // Mở popup StockQuick dạng XEM NHANH NGAY TRONG CRM bằng dữ liệu tồn sau kiểm
  // đã trả về qua RPC Online, không tải hay sửa StockQuickPopup.js của V2.
  let overlay=document.getElementById('v13-stock-overlay');
  if(!overlay){
   overlay=document.createElement('div');overlay.id='v13-stock-overlay';overlay.className='v13-stock-overlay';overlay.hidden=true;
   overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Thông tin nhanh sản phẩm');
   overlay.innerHTML='<section class="v13-stock-dialog"><button type="button" class="v13-stock-close" aria-label="Đóng popup">✕</button><div class="v13-stock-body"></div></section>';
   document.body.append(overlay);
   overlay.querySelector('.v13-stock-close').onclick=()=>{overlay.hidden=true};
   overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};
   document.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.hidden=true});
  }
  const body=overlay.querySelector('.v13-stock-body');body.replaceChildren();
  const heading=document.createElement('h2');heading.textContent=p.masp;
  const desc=document.createElement('p');desc.textContent=[p.ten,p.form,p.mau].filter(Boolean).join(' · ');
  const photo=document.createElement('img');photo.src=img(p.masp);photo.alt='Ảnh '+p.masp;photo.onclick=()=>zoom(photo.src);photo.onerror=()=>{photo.alt='Sản phẩm chưa có ảnh';};
  const price=document.createElement('strong');price.className='v13-price';price.textContent=money(p.gia_ban);
  const c1=document.createElement('div');c1.className='v13-cs v13-cs1';c1.textContent='CS1: '+sizeLine(p,'cs1');
  const c2=document.createElement('div');c2.className='v13-cs v13-cs2';c2.textContent='CS2: '+sizeLine(p,'cs2');
  const note=document.createElement('p');note.className='hint';note.textContent='Tồn sau kiểm tại thời điểm tra cứu. Cần kiểm tra lại trước khi chốt đơn. Popup xem nhanh Online chỉ đọc, không cho sửa hay đặt hàng.';
  body.append(heading,desc,photo,price,c1,c2);
  if(p.requested_size){const selected=document.createElement('p');selected.className='v13-requested-size';selected.textContent='Size khách hỏi → size kho '+p.requested_size;body.append(selected)}
  if(p.detail_unverified){const warn=document.createElement('p');warn.className='v13-unverified';warn.textContent='Chưa xác nhận đặc điểm rách; cần đối chiếu ảnh thật.';body.append(warn)}
  body.append(note);overlay.hidden=false;
 }
 function render(data){last=data.items||[];root.replaceChildren();
  if(!last.length){root.textContent=data.message||'Không có sản phẩm phù hợp.';return;}
  for(const p of last){
   const card=document.createElement('article');card.className='v13-card';
   const photo=document.createElement('img');photo.src=img(p.masp);photo.alt=p.masp;photo.loading='lazy';photo.title='Nhấn xem ảnh lớn';photo.onclick=()=>zoom(photo.src);photo.onerror=()=>{photo.alt='Không có ảnh';photo.style.display='none'};
   const code=document.createElement('button');code.type='button';code.className='v13-code';code.textContent=p.masp;code.title='Mở StockQuickPopup gốc dùng chung';code.onclick=()=>{void openStockPreferred(p)};
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
