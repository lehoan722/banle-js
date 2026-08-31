import {layNhomNguyenLieu,layNguyenLieu,themNguyenLieu,suaNguyenLieu,taoPhieuNhap,layLichSu,layChiTietPhieu,huyPhieu} from '../services/service_nguyenlieu.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0));
const localToday=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};
const manv=sessionStorage.getItem('manv')||localStorage.getItem('manv')||'UNKNOWN';
const tennv=sessionStorage.getItem('tennv')||localStorage.getItem('tennv')||manv;
const diadiem=sessionStorage.getItem('diadiem')||localStorage.getItem('diadiem')||'';
const isAdmin=(sessionStorage.getItem('is_admin')||localStorage.getItem('is_admin'))==='true';
let nhoms=[],nguyenlieus=[],lookupTarget=null,lookupFiltered=[];

$('#who').textContent=`${tennv}${diadiem?' · '+diadiem:''}${isAdmin?' · ADMIN':''}`;
if(!isAdmin) $$('.admin-only').forEach(x=>x.classList.add('hidden'));
const homNay=localToday();
$('#ngayMua').value=homNay; $('#tuNgay').value=homNay; $('#denNgay').value=homNay; $('#nguoiMua').value=tennv;

function toast(msg){alert(msg)}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function norm(s=''){
 return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function codeFromName(s=''){return norm(s)}
function matchesNL(n,q){const k=norm(q); if(!k)return true; return norm(n.ma_nguyenlieu).includes(k)||norm(n.ten_nguyenlieu).includes(k)}
function rankNL(n,q){const k=norm(q),m=norm(n.ma_nguyenlieu),t=norm(n.ten_nguyenlieu);if(!k)return 9;if(m===k)return 0;if(m.startsWith(k))return 1;if(m.includes(k))return 2;if(t.startsWith(k))return 3;if(t.includes(k))return 4;return 9}
function filterNL(q=''){return nguyenlieus.filter(n=>matchesNL(n,q)).sort((a,b)=>rankNL(a,q)-rankNL(b,q)||a.ten_nguyenlieu.localeCompare(b.ten_nguyenlieu,'vi'))}

async function bootstrap(){
 try{
  nhoms=await layNhomNguyenLieu(); nguyenlieus=await layNguyenLieu();
  renderNhomSelects(); renderDanhMuc(); addPurchaseRow(); await loadHistory();
 }catch(e){console.error(e);toast('Không nạp được dữ liệu nguyên liệu: '+e.message)}
}
function renderNhomSelects(){const ops=nhoms.map(n=>`<option value="${n.id}">${esc(n.ten_nhom)}</option>`).join('');$('#filterNhom').insertAdjacentHTML('beforeend',ops);$('#fNhom').innerHTML=ops}

function addPurchaseRow(){
 const div=document.createElement('div'); div.className='purchase-row'; div.dataset.nlid='';
 div.innerHTML=`
  <div class="nl-picker">
   <div class="picker-line"><input class="r-search" autocomplete="off" placeholder="Nhập mã hoặc tên nguyên liệu..."><button type="button" class="btn btn-light search-btn" title="Xem toàn bộ nguyên liệu">🔍</button></div>
   <div class="selected-meta">Chưa chọn nguyên liệu</div><div class="suggest-list hidden"></div>
  </div>
  <input class="r-sl" type="number" min="0.001" step="0.001" value="1">
  <input class="r-dvt">
  <input class="r-qc" readonly>
  <input class="r-gia" type="number" min="0" step="100">
  <input class="r-thanhtien money-read" readonly value="0">
  <button class="btn btn-danger r-del">×</button>
  <div class="mobile-detail-grid hidden">
   <div class="mobile-cell"><div class="mini-label">Số lượng</div><input class="cell-input m-sl" type="number" min="0.001" step="0.001" value="1"></div>
   <div class="mobile-cell"><div class="mini-label">ĐVT</div><input class="cell-input m-dvt"></div>
   <div class="mobile-cell"><div class="mini-label">Đơn giá thực tế</div><input class="cell-input m-gia" type="number" min="0" step="100"></div>
   <div class="mobile-cell"><div class="mini-label">Thành tiền</div><input class="cell-input m-thanhtien money-read" readonly value="0"></div>
  </div>
  <div class="r-del-wrap hidden"><button class="btn btn-danger r-del-mobile">Xóa dòng</button></div>
  <div class="warn" style="grid-column:1/-1"></div>`;
 $('#purchaseRows').appendChild(div);
 const search=div.querySelector('.r-search'), sugg=div.querySelector('.suggest-list');
 const sl=div.querySelector('.r-sl'),dvt=div.querySelector('.r-dvt'),gia=div.querySelector('.r-gia'),tt=div.querySelector('.r-thanhtien');
 const msl=div.querySelector('.m-sl'),mdvt=div.querySelector('.m-dvt'),mgia=div.querySelector('.m-gia'),mtt=div.querySelector('.m-thanhtien');

 function sync(from,to){to.value=from.value}
 function onQty(src){if(src===sl)sync(sl,msl);else sync(msl,sl);updateRowMoney(div)}
 function onDvt(src){if(src===dvt)sync(dvt,mdvt);else sync(mdvt,dvt)}
 function onGia(src){if(src===gia)sync(gia,mgia);else sync(mgia,gia);updateWarn(div);updateRowMoney(div)}
 sl.oninput=()=>onQty(sl);msl.oninput=()=>onQty(msl);dvt.oninput=()=>onDvt(dvt);mdvt.oninput=()=>onDvt(mdvt);gia.oninput=()=>onGia(gia);mgia.oninput=()=>onGia(mgia);

 search.oninput=()=>{div.dataset.nlid='';renderSuggestions(div,search.value)};
 search.onfocus=()=>{if(search.value && !div.dataset.nlid)renderSuggestions(div,search.value)};
 search.onkeydown=e=>{if(e.key==='Enter'){const first=sugg.querySelector('.suggest-item');if(first){e.preventDefault();first.click()}}else if(e.key==='Escape')sugg.classList.add('hidden')};
 div.querySelector('.search-btn').onclick=()=>openLookup(div);
 const del=()=>{div.remove();if(!$('#purchaseRows').children.length)addPurchaseRow();calcTotal()};
 div.querySelector('.r-del').onclick=del;div.querySelector('.r-del-mobile').onclick=del;
 updateResponsiveRows();
}
function renderSuggestions(row,q){
 const box=row.querySelector('.suggest-list'),list=filterNL(q).slice(0,12);
 if(!q.trim()||!list.length){box.classList.add('hidden');box.innerHTML='';return}
 box.innerHTML=list.map(n=>`<div class="suggest-item" data-id="${n.id}"><div class="s-code">${esc(n.ma_nguyenlieu)}</div><div class="s-name">${esc(n.ten_nguyenlieu)}</div><div class="s-extra">${esc(n.don_vi_mua_mac_dinh)} · ${esc(n.quy_cach_mac_dinh||'')} · ${fmt(n.gia_tham_khao)}đ</div></div>`).join('');
 box.classList.remove('hidden'); box.querySelectorAll('.suggest-item').forEach(x=>x.onclick=()=>selectNL(row,Number(x.dataset.id)));
}
function selectNL(row,id){
 const n=nguyenlieus.find(x=>x.id===id);if(!n)return; row.dataset.nlid=String(n.id);
 row.querySelector('.r-search').value=`${n.ma_nguyenlieu} - ${n.ten_nguyenlieu}`;
 row.querySelector('.r-dvt').value=n.don_vi_mua_mac_dinh;row.querySelector('.m-dvt').value=n.don_vi_mua_mac_dinh;
 row.querySelector('.r-qc').value=n.quy_cach_mac_dinh||'';
 row.querySelector('.r-gia').value=Number(n.gia_tham_khao||0);row.querySelector('.m-gia').value=Number(n.gia_tham_khao||0);
 row.querySelector('.selected-meta').innerHTML=`<b>${esc(n.ten_nguyenlieu)}</b> · Quy cách: ${esc(n.quy_cach_mac_dinh||'-')} · Giá tham khảo: ${fmt(n.gia_tham_khao)}đ/${esc(n.don_vi_mua_mac_dinh)}`;
 row.querySelector('.suggest-list').classList.add('hidden'); updateWarn(row);updateRowMoney(row);
 const target=window.matchMedia('(max-width:800px)').matches?row.querySelector('.m-sl'):row.querySelector('.r-sl');target.focus();target.select();
}
function updateWarn(row){const n=nguyenlieus.find(x=>String(x.id)===row.dataset.nlid),w=row.querySelector('.warn');if(!n){w.textContent='';return}const actual=Number(row.querySelector('.r-gia').value||0),ref=Number(n.gia_tham_khao||0);if(!ref||!actual){w.textContent='';return}const pct=(actual-ref)/ref*100;w.textContent=Math.abs(pct)>=15?`Giá ${pct>0?'tăng':'giảm'} ${Math.abs(pct).toFixed(0)}% so với tham khảo ${fmt(ref)}đ/${n.don_vi_mua_mac_dinh}`:''}
function updateRowMoney(row){const v=Number(row.querySelector('.r-sl').value||0)*Number(row.querySelector('.r-gia').value||0);row.querySelector('.r-thanhtien').value=fmt(v);row.querySelector('.m-thanhtien').value=fmt(v);calcTotal()}
function calcTotal(){let t=0;$$('#purchaseRows .purchase-row').forEach(r=>t+=Number(r.querySelector('.r-sl').value||0)*Number(r.querySelector('.r-gia').value||0));$('#tongTien').textContent=fmt(t)}
function updateResponsiveRows(){const mobile=window.matchMedia('(max-width:800px)').matches;$$('.purchase-row').forEach(r=>{r.querySelector('.mobile-detail-grid')?.classList.toggle('hidden',!mobile);r.querySelector('.r-del-wrap')?.classList.toggle('hidden',!mobile)})}
window.addEventListener('resize',updateResponsiveRows);
$('#btnAddRow').onclick=addPurchaseRow;

function openLookup(row){lookupTarget=row;$('#lookupSearch').value='';renderLookup('');$('#lookupModal').classList.remove('hidden');setTimeout(()=>$('#lookupSearch').focus(),30)}
function renderLookup(q){lookupFiltered=filterNL(q);$('#lookupList').innerHTML=lookupFiltered.length?lookupFiltered.map(n=>`<div class="lookup-item" data-id="${n.id}"><div class="lookup-code">${esc(n.ma_nguyenlieu)}</div><div class="lookup-name">${esc(n.ten_nguyenlieu)}</div><div class="lookup-sub">${esc(n.nhom?.ten_nhom||'')} · ${esc(n.don_vi_mua_mac_dinh)} · ${esc(n.quy_cach_mac_dinh||'')} · ${fmt(n.gia_tham_khao)}đ</div></div>`).join(''):'<div class="lookup-item muted">Không tìm thấy nguyên liệu.</div>';$('#lookupList').querySelectorAll('[data-id]').forEach(x=>x.onclick=()=>{if(lookupTarget)selectNL(lookupTarget,Number(x.dataset.id));closeLookup()})}
function closeLookup(){$('#lookupModal').classList.add('hidden');lookupTarget=null}
$('#lookupSearch').oninput=e=>renderLookup(e.target.value);$('#btnCloseLookup').onclick=closeLookup;

$('#btnSave').onclick=async()=>{
 const rows=$$('#purchaseRows .purchase-row');const missing=rows.find(r=>!r.dataset.nlid && r.querySelector('.r-search').value.trim());if(missing)return toast('Có dòng đã nhập chữ nhưng chưa chọn nguyên liệu từ danh sách.');
 const items=rows.map(r=>({nguyenlieu_id:Number(r.dataset.nlid||0),so_luong:Number(r.querySelector('.r-sl').value),don_vi_mua:r.querySelector('.r-dvt').value.trim(),don_gia:Number(r.querySelector('.r-gia').value),ghi_chu:''})).filter(x=>x.nguyenlieu_id);
 if(!items.length)return toast('Chưa có nguyên liệu trong phiếu.');if(items.some(x=>!x.so_luong||x.so_luong<=0||x.don_gia<0))return toast('Kiểm tra số lượng và đơn giá.');
 if(!confirm(`Lưu phiếu ${items.length} mặt hàng, tổng ${$('#tongTien').textContent}đ? Sau khi lưu nhân viên không sửa được trên giao diện.`))return;
 $('#btnSave').disabled=true;
 try{const r=await taoPhieuNhap({p_ngay_mua:$('#ngayMua').value,p_nha_cung_cap:$('#nhaCungCap').value,p_nguoi_mua:$('#nguoiMua').value,p_nguoi_tao:manv,p_dia_diem:diadiem,p_ghi_chu:$('#ghiChuPhieu').value,p_chi_tiet:items});toast(`Đã lưu ${r.so_phieu} · ${fmt(r.tong_tien)}đ`);$('#purchaseRows').innerHTML='';addPurchaseRow();$('#nhaCungCap').value='';$('#ghiChuPhieu').value='';calcTotal();$('#tuNgay').value=$('#ngayMua').value||homNay;$('#denNgay').value=$('#ngayMua').value||homNay;await loadHistory()}catch(e){console.error(e);toast('Lỗi lưu phiếu: '+e.message)}finally{$('#btnSave').disabled=false}
};

function renderDanhMuc(){const kw=$('#searchNL').value.trim(),gid=$('#filterNhom').value;const list=nguyenlieus.filter(n=>(!kw||matchesNL(n,kw))&&(!gid||String(n.nhom_id)===gid)).sort((a,b)=>rankNL(a,kw)-rankNL(b,kw)||a.ten_nguyenlieu.localeCompare(b.ten_nguyenlieu,'vi'));$('#nlBody').innerHTML=list.map(n=>`<tr><td><b>${esc(n.ma_nguyenlieu)}</b></td><td>${esc(n.nhom?.ten_nhom||'')}</td><td>${esc(n.ten_nguyenlieu)}</td><td>${esc(n.don_vi_mua_mac_dinh)}</td><td>${esc(n.quy_cach_mac_dinh||'')}</td><td class="num">${fmt(n.gia_tham_khao)}</td>${isAdmin?`<td><button class="btn btn-light edit-nl" data-id="${n.id}">Sửa</button></td>`:''}</tr>`).join('');$$('.edit-nl').forEach(b=>b.onclick=()=>openNL(Number(b.dataset.id)))}
$('#searchNL').oninput=renderDanhMuc;$('#filterNhom').onchange=renderDanhMuc;
function openNL(id=null){const n=nguyenlieus.find(x=>x.id===id);delete $('#fMa').dataset.touched;$('#editId').value=n?.id||'';$('#modalTitle').textContent=n?'Sửa nguyên liệu':'Thêm nguyên liệu';$('#fMa').value=n?.ma_nguyenlieu||'';$('#fTen').value=n?.ten_nguyenlieu||'';$('#fNhom').value=n?.nhom_id||nhoms[0]?.id||'';$('#fDvt').value=n?.don_vi_mua_mac_dinh||'';$('#fQuyCach').value=n?.quy_cach_mac_dinh||'';$('#fGia').value=Number(n?.gia_tham_khao||0);$('#fGhiChu').value=n?.ghi_chu||'';$('#modal').classList.remove('hidden')}
$('#btnNewNL').onclick=()=>openNL();$('#btnCloseModal').onclick=()=>$('#modal').classList.add('hidden');
$('#fTen').oninput=()=>{if(!$('#editId').value&&!$('#fMa').dataset.touched)$('#fMa').value=codeFromName($('#fTen').value)};$('#fMa').oninput=()=>{$('#fMa').dataset.touched='1';$('#fMa').value=codeFromName($('#fMa').value)};
$('#btnSaveNL').onclick=async()=>{if(!isAdmin)return toast('Chỉ admin được sửa danh mục.');const id=Number($('#editId').value||0);const p={ma_nguyenlieu:codeFromName($('#fMa').value),ten_nguyenlieu:$('#fTen').value.trim(),nhom_id:Number($('#fNhom').value),don_vi_mua_mac_dinh:$('#fDvt').value.trim(),quy_cach_mac_dinh:$('#fQuyCach').value.trim(),gia_tham_khao:Number($('#fGia').value||0),ghi_chu:$('#fGhiChu').value.trim(),updated_by:manv};if(!p.ma_nguyenlieu||!p.ten_nguyenlieu||!p.don_vi_mua_mac_dinh)return toast('Thiếu mã, tên hoặc đơn vị.');try{id?await suaNguyenLieu(id,p):await themNguyenLieu({...p,created_by:manv});nguyenlieus=await layNguyenLieu({caAn:true});$('#modal').classList.add('hidden');renderDanhMuc();toast('Đã lưu danh mục.')}catch(e){toast('Lỗi: '+e.message)}};

async function loadHistory(){
 if(!$('#tuNgay').value)$('#tuNgay').value=homNay;if(!$('#denNgay').value)$('#denNgay').value=homNay;
 try{const rows=await layLichSu({tuNgay:$('#tuNgay').value,denNgay:$('#denNgay').value});
  const empty=`<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Không có phiếu trong khoảng ngày đã chọn.</td></tr>`;
  $('#historyBody').innerHTML=rows.length?rows.map(p=>`<tr><td><b>${esc(p.so_phieu)}</b></td><td>${esc(p.ngay_mua)}</td><td>${esc(p.nguoi_tao||'')}</td><td>${esc(p.nha_cung_cap||'')}</td><td class="num">${fmt(p.tong_tien)}</td><td><span class="pill ${p.trang_thai==='da_huy'?'cancel':''}">${p.trang_thai==='da_huy'?'Đã hủy':'Đã lưu'}</span></td><td><button class="btn btn-light view-p" data-id="${p.id}">Xem</button>${isAdmin&&p.trang_thai!=='da_huy'?` <button class="btn btn-danger cancel-p" data-id="${p.id}">Hủy</button>`:''}</td></tr>`).join(''):empty;
  $('#historyCards').innerHTML=rows.length?rows.map(p=>`<div class="history-card"><div class="history-top"><div><div class="history-no">${esc(p.so_phieu)}</div><div class="muted">${esc(p.ngay_mua)}</div></div><div><div class="history-money">${fmt(p.tong_tien)} đ</div><span class="pill ${p.trang_thai==='da_huy'?'cancel':''}">${p.trang_thai==='da_huy'?'Đã hủy':'Đã lưu'}</span></div></div><div class="history-grid"><div><b>Người nhập:</b> ${esc(p.nguoi_tao||'')}</div><div><b>Nơi mua:</b> ${esc(p.nha_cung_cap||'-')}</div></div><div class="history-actions"><button class="btn btn-light view-p" data-id="${p.id}">Xem chi tiết</button>${isAdmin&&p.trang_thai!=='da_huy'?`<button class="btn btn-danger cancel-p" data-id="${p.id}">Hủy</button>`:''}</div></div>`).join(''):'<div class="card muted" style="text-align:center">Không có phiếu trong khoảng ngày đã chọn.</div>';
  bindHistoryButtons();
 }catch(e){console.error(e);toast('Lỗi nạp lịch sử: '+e.message)}
}
function bindHistoryButtons(){$$('.view-p').forEach(b=>b.onclick=()=>viewPhieu(Number(b.dataset.id)));$$('.cancel-p').forEach(b=>b.onclick=()=>cancelPhieu(Number(b.dataset.id)))}
$('#btnLoadHistory').onclick=loadHistory;
async function viewPhieu(id){try{const ct=await layChiTietPhieu(id);alert(ct.map(x=>`${x.ten_nguyenlieu_snapshot}: ${x.so_luong} ${x.don_vi_mua} × ${fmt(x.don_gia)} = ${fmt(x.thanh_tien)}đ`).join('\n')||'Không có chi tiết')}catch(e){toast('Lỗi xem chi tiết: '+e.message)}}
async function cancelPhieu(id){if(!isAdmin)return;const lydo=prompt('Lý do hủy phiếu:');if(!lydo)return;try{await huyPhieu(id,manv,lydo);await loadHistory();toast('Đã hủy phiếu, lịch sử vẫn được giữ.')}catch(e){toast('Lỗi hủy: '+e.message)}}
$$('.nl-tab').forEach(b=>b.onclick=()=>{$$('.nl-tab').forEach(x=>x.classList.remove('active'));$$('.nl-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`#p-${b.dataset.tab}`).classList.add('active');if(b.dataset.tab==='lichsu'){if(!$('#tuNgay').value)$('#tuNgay').value=homNay;if(!$('#denNgay').value)$('#denNgay').value=homNay;loadHistory()}});
document.addEventListener('click',e=>{if(!e.target.closest('.nl-picker'))$$('.suggest-list').forEach(x=>x.classList.add('hidden'))});
bootstrap();
