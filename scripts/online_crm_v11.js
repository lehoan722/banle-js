// HOANTUYET ONLINE V1.1 - CRM khach can tu van; KHONG tac dong Sales Copilot / hoa don.
import {getSupabaseClient,getCurrentUserInfo,logoutAndClear} from './authModulemoi.js';
const $=id=>document.getElementById(id);
const state={rows:[],carts:[],staff:[],current:null,table:null,admin:false,uid:null};
const channels={facebook:'Facebook',zalo:'Zalo',zalo_oa:'Zalo OA',instagram:'Instagram',dien_thoai:'Điện thoại',khac:'Khác'};
const statuses={moi:'Mới hỏi',dang_tu_van:'Đang tư vấn',da_gui_mau:'Đã gửi mẫu',cho_khach:'Chờ khách',da_chot:'Đã chốt',khong_chot:'Không chốt'};
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=s=>s?new Date(s).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short'}):'';
const asLocal=s=>{if(!s)return '';const d=new Date(s);const two=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`};
function msg(text,error=false){$('message').textContent=text;$('message').className='status '+(error?'error':'ok')}
function setPending(v){for(const id of ['save','reload'])$(id).disabled=v}
async function rpc(name,args){
  const sb=getSupabaseClient();
  const {data:{session}}=await sb.auth.getSession();
  const headers={'Content-Type':'application/json'};
  if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  const res=await fetch('/api/online/session',{method:'POST',headers,credentials:'same-origin',body:JSON.stringify({action:name,args:args||{}})});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(json.error||`Lỗi máy chủ ${res.status}`);
  return json.data;
}
async function loadOptions(){
 state.carts=await rpc('online_v11_cart_choices');const cart=$('gio');cart.replaceChildren(new Option('Chưa gắn giỏ',''));
 for(const c of state.carts)cart.add(new Option(`${c.title} · ${(c.created_at||'').slice(0,16).replace('T',' ')} · ${c.item_count??'?'} SP · #${c.id.slice(0,8)} (${c.status})`,c.id));
 if(state.admin){state.staff=await rpc('online_v11_staff_choices');const target=$('phutrach');target.replaceChildren(new Option('Tôi (Admin)',''));
  for(const p of state.staff)target.add(new Option(`${p.manv} – ${p.tennv||''}`,p.uid));
 }else{$('phutrach').disabled=true;$('phutrach').title='Chỉ Admin được phân công';}
}
function extract(){
 const link=$('linkchat').value.trim();if(link&&!/^https:\/\/\S+$/i.test(link))throw new Error('Đường dẫn hội thoại phải bắt đầu bằng https://');
 return {p_id:state.current,p_ten_khach:$('ten').value.trim(),p_lien_he:$('lienhe').value.trim(),p_duong_dan_chat:link,
 p_kenh:$('kenh').value,p_nhu_cau:$('nhucau').value.trim(),p_trang_thai:$('trangthai').value,
 p_gio_id:$('gio').value||null,p_ghi_chu:$('ghichu').value.trim(),p_ngay_hen:$('ngayhen').value?new Date($('ngayhen').value).toISOString():null,
 p_phu_trach_uid:state.admin?($('phutrach').value||state.uid):null};
}
async function save(event){event.preventDefault();setPending(true);try{
 const id=await rpc('online_v11_save',extract());state.current=id;msg('Đã lưu phiên tư vấn.');await reload();
 }catch(e){console.error(e);msg(e.message,true)}finally{setPending(false)}}
function reset(){state.current=null;$('crm-form').reset();$('form-title').textContent='1. Tạo phiên tư vấn';$('gio').value='';$('phutrach').value='';msg('Đang tạo phiên mới.');}
function edit(row){state.current=row.id;$('form-title').textContent='1. Sửa phiên tư vấn – '+row.ten_khach;
 $('ten').value=row.ten_khach||'';$('lienhe').value=row.lien_he||'';$('linkchat').value=row.duong_dan_chat||'';
 $('kenh').value=row.kenh;$('trangthai').value=row.trang_thai;$('nhucau').value=row.nhu_cau||'';
 $('ghichu').value=row.ghi_chu||'';$('ngayhen').value=asLocal(row.ngay_hen);
 if(row.gio_id&&!Array.from($('gio').options).some(o=>o.value===row.gio_id))$('gio').add(new Option((row.ten_gio||'Giỏ nhân viên khác')+' · #'+row.gio_id.slice(0,8)+' (chỉ xem)',row.gio_id));
 $('gio').value=row.gio_id||'';
 if(state.admin){if(row.phu_trach_uid&&!Array.from($('phutrach').options).some(o=>o.value===row.phu_trach_uid))$('phutrach').add(new Option(row.phu_trach||'Tài khoản hiện tại',row.phu_trach_uid));$('phutrach').value=row.phu_trach_uid||'';}
 msg('Đang chỉnh sửa phiên đã chọn.');window.scrollTo({top:0,behavior:'smooth'});
}
async function previewCart(){
 const id=$('gio').value;
 if(!id){msg('Chưa chọn giỏ ảnh.',true);return;}
 try{
  // Một giỏ chưa được lưu vào phiên vẫn xem được nếu là giỏ do chính mình tạo.
  const data=await rpc('online_v11_cart_preview',{p_gio_id:id,p_phien_id:state.current});
  if(!data)throw new Error('Không có quyền xem giỏ hoặc giỏ đã bị xóa.');
  const panel=$('cart-preview'),items=$('preview-items');items.replaceChildren();
  $('preview-title').textContent=data.title||'Giỏ ảnh tư vấn';
  for(const p of data.items||[]){
    const card=document.createElement('article');card.className='preview-card';
    const img=document.createElement('img');img.src='https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/'+encodeURIComponent(p.masp)+'.JPG';img.alt=p.masp;img.onerror=()=>img.style.display='none';
    img.onclick=()=>{window.open(img.src,'_blank','noopener')};
    const info=document.createElement('div');info.textContent=`${p.tensp||p.masp} | ${p.masp} | Size ${p.size||'chưa chọn'} | ${Number(p.gia_bao||0).toLocaleString('vi-VN')}đ${p.ghichu?' | '+p.ghichu:''}`;
    card.append(img,info);items.append(card);
  }
  panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){msg('Không mở được giỏ: '+e.message,true)}
}
function editCart(){
 const id=$('gio').value;if(!id){msg('Chọn giỏ trước.',true);return;}
 // Sửa giỏ chỉ được phép khi tài khoản Online hiện tại sở hữu giỏ. V1.0 kiểm tra RLS lần nữa.
 if(!state.carts.some(c=>c.id===id)){msg('Giỏ này thuộc tài khoản khác: chỉ xem trong CRM, không có quyền sửa.',true);return;}
 location.href='/hoantuyet_online_v1.html?gio='+encodeURIComponent(id)+'&back='+encodeURIComponent('/hoantuyet_online_crm_v11.html');
}
function viewPublic(){
 const id=$('gio').value;const row=state.rows.find(x=>x.id===state.current);
 if(row?.gio_id!==id||!row.gio_token||!row.gio_expires_at||new Date(row.gio_expires_at)<=new Date()){msg('Giỏ chưa có link chia sẻ hợp lệ. Hãy mở V1.0 để tạo link, rồi tải lại CRM.',true);return;}
 window.open('/hoantuyet_gio_tuvan.html?t='+encodeURIComponent(row.gio_token),'_blank','noopener');
}
function openChat(){const link=$('linkchat').value.trim();if(!/^https:\/\/\S+$/i.test(link)){msg('Chưa có link hội thoại hợp lệ.',true);return;}window.open(link,'_blank','noopener,noreferrer')}
function getSearchRows(){const needle=$('search').value.toLocaleLowerCase('vi').trim();return state.rows.filter(r=>Object.values(r).some(v=>typeof v==='string'&&v.toLocaleLowerCase('vi').includes(needle)))}
function stats(){const counts={};for(const p of state.rows)counts[p.trang_thai]=(counts[p.trang_thai]||0)+1;$('stats').replaceChildren();
 const add=(s,n)=>{const el=document.createElement('span');el.textContent=`${s}: ${n}`;$('stats').append(el)};add('Tổng',state.rows.length);
 for(const [k,label] of Object.entries(statuses))if(counts[k])add(label,counts[k]);
}
function viewData(){return getSearchRows()}
function showFallback(){const dest=$('fallback');dest.hidden=false;dest.replaceChildren();$('crm-table').textContent='';
 const table=document.createElement('table');const head=document.createElement('thead'),hr=document.createElement('tr');
 for(const x of ['Khách','Kênh','Nhu cầu','Phụ trách','Trạng thái','Ngày hẹn','Giỏ','Sửa']){const th=document.createElement('th');th.textContent=x;hr.append(th)}head.append(hr);table.append(head);
 const body=document.createElement('tbody');for(const r of viewData()){
  const tr=document.createElement('tr');for(const value of [r.ten_khach,channels[r.kenh]||r.kenh,r.nhu_cau,r.phu_trach,statuses[r.trang_thai]||r.trang_thai,fmtDate(r.ngay_hen),r.ten_gio||'']){const td=document.createElement('td');td.textContent=value||'';tr.append(td)}
  const td=document.createElement('td'),btn=document.createElement('button');btn.textContent='Sửa';btn.addEventListener('click',()=>edit(r));td.append(btn);tr.append(td);body.append(tr)
 }table.append(body);dest.append(table);
}
async function ensureTabulator(){if(window.Tabulator)return true;return new Promise(resolve=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tabulator-tables@6.6.1/dist/js/tabulator.min.js';s.onload=()=>resolve(!!window.Tabulator);s.onerror=()=>resolve(false);document.head.append(s);})}
const filterText={headerFilter:'input',headerFilterPlaceholder:'Tìm...',headerFilterFunc:'like',headerFilterLiveFilterDelay:250};
function createTable(){const columns=[
 {title:'Ngày tạo',field:'created_at',width:140,formatter:cell=>fmtDate(cell.getValue()),sorter:'datetime'},
 {title:'Khách',field:'ten_khach',width:165,...filterText},
 {title:'Kênh',field:'kenh',width:110,formatter:cell=>channels[cell.getValue()]||'',headerFilter:'list',headerFilterParams:{values:{'':'Tất cả',...channels},clearable:true}},
 {title:'Liên hệ',field:'lien_he',width:135,...filterText},
 {title:'Nhu cầu',field:'nhu_cau',minWidth:210,widthGrow:3,...filterText},
 {title:'NV phụ trách',field:'phu_trach',width:135,...filterText},
 {title:'Trạng thái',field:'trang_thai',width:170,formatter:cell=>statuses[cell.getValue()]||'',headerFilter:'list',headerFilterParams:{values:{'':'Tất cả',...statuses},clearable:true}},
 {title:'Hẹn lại',field:'ngay_hen',width:150,formatter:cell=>fmtDate(cell.getValue())},
 {title:'Giỏ đã gửi',field:'ten_gio',width:190,...filterText},
 {title:'Ghi chú',field:'ghi_chu',width:180,...filterText},
 {title:'Thao tác',width:100,headerSort:false,formatter:()=>'<button type="button" class="secondary">Sửa</button>',cellClick:(_e,cell)=>edit(cell.getRow().getData())}
 ];
 state.table=new window.Tabulator('#crm-table',{data:viewData(),layout:'fitColumns',responsiveLayout:'collapse',height:'min(68vh,650px)',placeholder:'Chưa có khách cần tư vấn',columns,initialSort:[{column:'created_at',dir:'desc'}],pagination:true,paginationSize:25,paginationSizeSelector:[10,25,50,100],movableColumns:true,clipboard:true,selectableRows:true});
}
function paint(){stats();if(state.table){state.table.replaceData(viewData()).catch(e=>console.warn(e));}else showFallback()}
async function reload(){state.rows=await rpc('online_v11_list');paint()}
function clearFilters(){ $('search').value='';if(state.table){state.table.clearHeaderFilter();state.table.clearFilter(true);state.table.clearSort();}paint();msg('Đã xóa các ô tìm kiếm và bộ lọc; không xóa dữ liệu.');}
async function copyVisible(){let data=state.table?state.table.getRows('active').map(r=>r.getData()):viewData();
 const cols=['Khách','Kênh','Nhu cầu','Nhân viên','Trạng thái','Hẹn lại','Giỏ'];
 const lines=data.map(r=>[r.ten_khach,channels[r.kenh]||r.kenh,r.nhu_cau,r.phu_trach,statuses[r.trang_thai],fmtDate(r.ngay_hen),r.ten_gio||''].map(x=>String(x??'').replaceAll('\t',' ').replaceAll('\n',' ')).join('\t'));
 try{await navigator.clipboard.writeText([cols.join('\t'),...lines].join('\n'));msg(`Đã copy ${data.length} dòng đang lọc.`)}catch(e){msg('Không thể copy: '+e.message,true)}
}
async function start(){try{
 const sb=getSupabaseClient();
 const {data:{session}}=await sb.auth.getSession();
 if(!session?.access_token){location.replace('/login.html?redirect='+encodeURIComponent(location.pathname));return;}
 const user=await rpc('identity');state.uid=user.id;
 if(await rpc('online_v1_staff_ok')!==true)throw new Error('Tài khoản chưa được cấp quyền nhân viên hoặc Admin.');
 state.admin=await rpc('online_v11_admin_ok');await loadOptions();state.rows=await rpc('online_v11_list');
 $('loader').hidden=true;$('app').hidden=false;stats();if(await ensureTabulator())createTable();else{showFallback();msg('CDN Tabulator chưa tải được. Trang sử dụng bảng dự phòng; hãy kiểm tra mạng.',true)};
 $('crm-form').addEventListener('submit',save);$('reset').onclick=reset;$('open-cart').onclick=previewCart;$('edit-cart').onclick=editCart;$('public-cart').onclick=viewPublic;$('open-chat').onclick=openChat;
 $('reload').onclick=async()=>{setPending(true);try{await loadOptions();await reload();msg('Đã đồng bộ dữ liệu.')}catch(e){msg(e.message,true)}finally{setPending(false)}};
 $('search').addEventListener('input',paint);$('clearfilters').onclick=clearFilters;$('copyrows').onclick=copyVisible;
 $('online-account').textContent=user.manv||user.name||'NV';$('logout-online').onclick=async()=>{await logoutAndClear();location.replace('/login.html?redirect='+encodeURIComponent(location.pathname))};msg(`Đã xác thực Online cá nhân · ${state.admin?'Admin':'Nhân viên'}.`);
 }catch(e){console.error(e);$('loader').textContent='Không thể mở Online CRM: '+(e.message||e);$('loader').classList.add('error')}}
start();
