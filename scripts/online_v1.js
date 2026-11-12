// HOANTUYET ONLINE V1 - doc lap, su dung AuthModule hien co.
import {getSupabaseClient,getCurrentUserInfo} from './authModule.js';
const sb=getSupabaseClient();
const $=id=>document.getElementById(id);
const IMG_BASE='https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';
let items=[], cartId=null, shareToken=null, busy=false;
const fmt=n=>Number(n||0).toLocaleString('vi-VN')+' đ';
function say(msg,isError=false){$('status').textContent=msg;$('status').className='status '+(isError?'bad':'ok');}
function setBusy(v){busy=v;for(const id of ['lookup','bulkAdd','save','share','revoke'])$(id).disabled=v;}
function imageUrl(masp){return IMG_BASE+encodeURIComponent(masp)+'.JPG';}
function getJsonItems(){return items.map(({masp,size,ghichu})=>({masp,size,ghichu}));}
function render(){
  $('count').textContent=items.length;const root=$('cart');root.replaceChildren();
  items.forEach((p,i)=>{
    const card=document.createElement('article');card.className='item';
    const im=document.createElement('img');im.alt=p.masp;im.src=imageUrl(p.masp);im.loading='lazy';
    im.onerror=()=>{im.style.display='none';};
    const name=document.createElement('div');name.className='meta';
    name.textContent=`${p.masp} · ${p.tensp||''}\nGiá niêm yết: ${fmt(p.giale)}`;
    const stock=document.createElement('div');stock.className='meta';
    stock.textContent='Size/tồn: '+Object.entries(p.ton_sizes||{}).map(([sz,x])=>`${sz}: CS1 ${x.ton_cs1||0}/CS2 ${x.ton_cs2||0}`).join(' · ');
    const sizeLabel=document.createElement('label');sizeLabel.textContent='Size tư vấn';
    const size=document.createElement('input');size.value=p.size||'';size.maxLength=30;
    size.addEventListener('input',()=>{p.size=size.value;shareToken=null;$('url').value='';});sizeLabel.append(size);
    const noteLabel=document.createElement('label');noteLabel.textContent='Ghi chú hiển thị cho khách';
    const note=document.createElement('input');note.value=p.ghichu||'';note.maxLength=300;
    note.addEventListener('input',()=>{p.ghichu=note.value;shareToken=null;$('url').value='';});noteLabel.append(note);
    const remove=document.createElement('button');remove.className='danger';remove.textContent='Bỏ sản phẩm';
    remove.onclick=()=>{items.splice(i,1);shareToken=null;$('url').value='';render();};
    card.append(im,name,stock,sizeLabel,noteLabel,remove);root.append(card);
  });
}
async function lookup(code){
  const masp=String(code||'').trim().toUpperCase();if(!masp)return;
  if(items.some(x=>x.masp===masp)){say(`Mã ${masp} đã có trong giỏ.`);return;}
  if(items.length>=50)throw new Error('Một giỏ tối đa 50 mã.');
  const {data,error}=await sb.rpc('timkiemnhanh_lay_san_pham_v2',{
    p_masp:masp,p_diadiem:$('branch').value
  });
  if(error)throw new Error(error.message);
  const p=Array.isArray(data)?data[0]:data;
  if(!p||p.active===false)throw new Error('Không tìm thấy mã hàng đang kinh doanh: '+masp);
  items.push({masp:p.masp,tensp:p.tensp,giale:p.giale,ton_sizes:p.ton_sizes||{},size:'',ghichu:''});
  shareToken=null;$('url').value='';render();say('Đã thêm '+masp);
}
async function run(fn){if(busy)return;setBusy(true);try{await fn();}catch(e){console.error(e);say(e.message||'Có lỗi xảy ra',true);}finally{setBusy(false);}}
$('lookup').onclick=()=>run(async()=>{await lookup($('masp').value);$('masp').value='';$('masp').focus();});
$('masp').addEventListener('keydown',e=>{if(e.key==='Enter'){$('lookup').click();}});
$('bulkAdd').onclick=()=>run(async()=>{
  const lines=[...new Set($('bulk').value.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))].slice(0,50);
  let ok=0,errors=[];for(const code of lines){try{await lookup(code);ok++;}catch(e){errors.push(code+': '+e.message);}}
  say(`Đã thêm ${ok} mã.`+(errors.length?'\nKhông thêm: '+errors.join(' | '):''),errors.length>0);
});
$('clear').onclick=()=>{if(items.length&&!confirm('Xóa danh sách đang soạn trên màn hình? Giỏ đã lưu vẫn còn.'))return;items=[];cartId=null;shareToken=null;$('url').value='';render();};
async function save(){
  if(!items.length)throw new Error('Giỏ chưa có sản phẩm.');
  const {data,error}=await sb.rpc('online_v1_luu_gio',{
    p_id:cartId,p_tieu_de:$('title').value,p_kenh:$('channel').value,
    p_diadiem:$('branch').value,p_items:getJsonItems()
  });if(error)throw new Error(error.message);
  cartId=data;shareToken=null;$('url').value='';say('Đã lưu giỏ thành công.');await loadHistory();
}
$('save').onclick=()=>run(save);
$('share').onclick=()=>run(async()=>{
  await save();const {data,error}=await sb.rpc('online_v1_chia_se',{p_id:cartId});
  if(error)throw new Error(error.message);
  shareToken=data;
  $('url').value=new URL('/hoantuyet_gio_tuvan.html?t='+encodeURIComponent(shareToken),location.origin).href;
  say('Đã tạo link 7 ngày. Copy link gửi Messenger/Zalo.');await loadHistory();
});
$('revoke').onclick=()=>run(async()=>{
  if(!cartId)throw new Error('Chưa mở giỏ đã lưu.');
  if(!confirm('Thu hồi link đang chia sẻ của giỏ này?'))return;
  const {data,error}=await sb.rpc('online_v1_thu_hoi',{p_id:cartId});
  if(error||!data)throw new Error(error?.message||'Không thu hồi được.');
  $('url').value='';shareToken=null;say('Đã thu hồi link.');await loadHistory();
});
async function copyText(s){if(!s){say('Chưa có nội dung để sao chép.',true);return;}
  await navigator.clipboard.writeText(s);say('Đã sao chép.');}
$('copyUrl').onclick=()=>run(()=>copyText($('url').value));
$('copy').onclick=()=>run(()=>copyText('Shop Hoàn Tuyết xin gửi các mẫu để anh/chị tham khảo:\n'+
  items.map((x,i)=>`${i+1}. ${x.tensp||x.masp} | ${x.masp} | ${fmt(x.giale)}${x.size?' | Size '+x.size:''}`).join('\n')+
  ($('url').value?'\nAlbum: '+$('url').value:'')+'\nGiá và size sẽ được xác nhận lại khi đặt mua.'));
async function loadHistory(){
  const {data,error}=await sb.from('online_gio_anh').select('id,tieu_de,kenh,trang_thai,created_at,share_token,share_expires_at').order('updated_at',{ascending:false}).limit(100);
  if(error)throw new Error(error.message);
  const body=$('history');body.replaceChildren();
  for(const x of data||[]){const tr=document.createElement('tr');
    for(const txt of [new Date(x.created_at).toLocaleString('vi-VN'),x.tieu_de,x.kenh,x.trang_thai]){
      const td=document.createElement('td');td.textContent=txt;tr.append(td);
    }
    const td=document.createElement('td');const button=document.createElement('button');button.textContent='Mở giỏ';button.className='secondary';
    button.onclick=()=>run(()=>openCart(x));td.append(button);tr.append(td);body.append(tr);
  }
}
async function openCart(x){
  const {data,error}=await sb.from('online_gio_anh_ct').select('masp,tensp,size,gia_bao,ghichu').eq('gio_id',x.id).order('stt');
  if(error)throw new Error(error.message);
  cartId=x.id;shareToken=x.share_token;$('title').value=x.tieu_de;$('channel').value=x.kenh;
  items=(data||[]).map(p=>({...p,giale:p.gia_bao,ton_sizes:{}}));
  $('url').value=(shareToken&&new Date(x.share_expires_at)>new Date())?
    new URL('/hoantuyet_gio_tuvan.html?t='+encodeURIComponent(shareToken),location.origin).href:'';
  render();say('Đã mở giỏ. Khi lưu lại, giá được cập nhật từ danh mục hiện tại.');window.scrollTo({top:0,behavior:'smooth'});
}
$('reload').onclick=()=>run(loadHistory);
async function start(){
  try{
    const {data:{user},error}=await sb.auth.getUser();if(error||!user){location.replace('/login.html?redirect='+encodeURIComponent(location.pathname));return;}
    const check=await sb.rpc('online_v1_staff_ok');
    if(check.error||check.data!==true)throw new Error('Tài khoản chưa được xác minh là nhân viên hoặc Admin đang hoạt động.');
    const me=getCurrentUserInfo();$('branch').value=me.diadiem==='cs2'?'cs2':'cs1';
    $('loading').hidden=true;$('app').hidden=false;await loadHistory();
  }catch(e){$('loading').textContent='Không thể mở Online V1: '+(e.message||e);console.error(e);}
}
start();
