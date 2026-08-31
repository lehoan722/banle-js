import {layNhomNguyenLieu,layNguyenLieu,themNguyenLieu,suaNguyenLieu,taoPhieuNhap,layLichSu,layChiTietPhieu,huyPhieu} from '../services/service_nguyenlieu.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>new Intl.NumberFormat('vi-VN').format(Number(n||0));
const today=()=>new Date().toISOString().slice(0,10);
const manv=sessionStorage.getItem('manv')||localStorage.getItem('manv')||'UNKNOWN';
const tennv=sessionStorage.getItem('tennv')||localStorage.getItem('tennv')||manv;
const diadiem=sessionStorage.getItem('diadiem')||localStorage.getItem('diadiem')||'';
const isAdmin=(sessionStorage.getItem('is_admin')||localStorage.getItem('is_admin'))==='true';
let nhoms=[], nguyenlieus=[];
$('#who').textContent=`${tennv}${diadiem?' · '+diadiem:''}${isAdmin?' · ADMIN':''}`;
if(!isAdmin) $$('.admin-only').forEach(x=>x.classList.add('hidden'));
$('#ngayMua').value=today(); $('#nguoiMua').value=tennv;

function toast(msg){alert(msg)}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function bootstrap(){
  try{nhoms=await layNhomNguyenLieu(); nguyenlieus=await layNguyenLieu(); renderNhomSelects(); renderDanhMuc(); addPurchaseRow(); await loadHistory();}
  catch(e){console.error(e);toast('Không nạp được dữ liệu nguyên liệu: '+e.message)}
}
function renderNhomSelects(){
 const ops=nhoms.map(n=>`<option value="${n.id}">${esc(n.ten_nhom)}</option>`).join('');
 $('#filterNhom').insertAdjacentHTML('beforeend',ops); $('#fNhom').innerHTML=ops;
}
function nlOptions(){return '<option value="">-- Chọn nguyên liệu --</option>'+nguyenlieus.map(n=>`<option value="${n.id}">${esc(n.ten_nguyenlieu)}</option>`).join('')}
function addPurchaseRow(){
 const div=document.createElement('div'); div.className='purchase-row';
 div.innerHTML=`<select class="r-nl">${nlOptions()}</select><input class="r-sl" type="number" min="0.001" step="0.001" value="1"><input class="r-dvt"><input class="r-qc qc" readonly><input class="r-gia" type="number" min="0" step="100"><button class="btn btn-danger r-del">×</button><div class="warn" style="grid-column:1/-1"></div>`;
 $('#purchaseRows').appendChild(div);
 const sel=div.querySelector('.r-nl'), gia=div.querySelector('.r-gia'), sl=div.querySelector('.r-sl');
 sel.onchange=()=>{const n=nguyenlieus.find(x=>x.id==sel.value); if(!n)return; div.querySelector('.r-dvt').value=n.don_vi_mua_mac_dinh; div.querySelector('.r-qc').value=n.quy_cach_mac_dinh||''; gia.value=Number(n.gia_tham_khao||0); updateWarn(div,n); calcTotal();};
 gia.oninput=()=>{const n=nguyenlieus.find(x=>x.id==sel.value);updateWarn(div,n);calcTotal()}; sl.oninput=calcTotal;
 div.querySelector('.r-del').onclick=()=>{div.remove(); if(!$('#purchaseRows').children.length)addPurchaseRow();calcTotal()};
}
function updateWarn(row,n){const w=row.querySelector('.warn'); if(!n){w.textContent='';return} const actual=Number(row.querySelector('.r-gia').value||0), ref=Number(n.gia_tham_khao||0); if(!ref||!actual){w.textContent='';return} const pct=(actual-ref)/ref*100; w.textContent=Math.abs(pct)>=15?`Giá ${pct>0?'tăng':'giảm'} ${Math.abs(pct).toFixed(0)}% so với tham khảo ${fmt(ref)}đ/${n.don_vi_mua_mac_dinh}`:'';}
function calcTotal(){let t=0; $$('#purchaseRows .purchase-row').forEach(r=>t+=Number(r.querySelector('.r-sl').value||0)*Number(r.querySelector('.r-gia').value||0));$('#tongTien').textContent=fmt(t)}
$('#btnAddRow').onclick=addPurchaseRow;
$('#btnSave').onclick=async()=>{
 const items=$$('#purchaseRows .purchase-row').map(r=>({nguyenlieu_id:Number(r.querySelector('.r-nl').value),so_luong:Number(r.querySelector('.r-sl').value),don_vi_mua:r.querySelector('.r-dvt').value.trim(),don_gia:Number(r.querySelector('.r-gia').value),ghi_chu:''})).filter(x=>x.nguyenlieu_id);
 if(!items.length)return toast('Chưa có nguyên liệu trong phiếu.'); if(items.some(x=>!x.so_luong||x.so_luong<=0||x.don_gia<0))return toast('Kiểm tra số lượng và đơn giá.');
 if(!confirm(`Lưu phiếu ${items.length} mặt hàng, tổng ${$('#tongTien').textContent}đ? Sau khi lưu nhân viên không sửa được trên giao diện.`))return;
 $('#btnSave').disabled=true;
 try{const r=await taoPhieuNhap({p_ngay_mua:$('#ngayMua').value,p_nha_cung_cap:$('#nhaCungCap').value,p_nguoi_mua:$('#nguoiMua').value,p_nguoi_tao:manv,p_dia_diem:diadiem,p_ghi_chu:$('#ghiChuPhieu').value,p_chi_tiet:items}); toast(`Đã lưu ${r.so_phieu} · ${fmt(r.tong_tien)}đ`); $('#purchaseRows').innerHTML='';addPurchaseRow();$('#nhaCungCap').value='';$('#ghiChuPhieu').value='';calcTotal();await loadHistory();}catch(e){console.error(e);toast('Lỗi lưu phiếu: '+e.message)}finally{$('#btnSave').disabled=false}
};

function renderDanhMuc(){const kw=$('#searchNL').value.trim().toLowerCase(), gid=$('#filterNhom').value; const list=nguyenlieus.filter(n=>(!kw||n.ten_nguyenlieu.toLowerCase().includes(kw))&&(!gid||String(n.nhom_id)===gid)); $('#nlBody').innerHTML=list.map(n=>`<tr><td>${esc(n.ma_nguyenlieu)}</td><td>${esc(n.nhom?.ten_nhom||'')}</td><td><b>${esc(n.ten_nguyenlieu)}</b></td><td>${esc(n.don_vi_mua_mac_dinh)}</td><td>${esc(n.quy_cach_mac_dinh||'')}</td><td class="num">${fmt(n.gia_tham_khao)}</td>${isAdmin?`<td><button class="btn btn-light edit-nl" data-id="${n.id}">Sửa</button></td>`:''}</tr>`).join(''); $$('.edit-nl').forEach(b=>b.onclick=()=>openNL(Number(b.dataset.id)))}
$('#searchNL').oninput=renderDanhMuc;$('#filterNhom').onchange=renderDanhMuc;
function openNL(id=null){const n=nguyenlieus.find(x=>x.id===id);$('#editId').value=n?.id||'';$('#modalTitle').textContent=n?'Sửa nguyên liệu':'Thêm nguyên liệu';$('#fMa').value=n?.ma_nguyenlieu||'';$('#fTen').value=n?.ten_nguyenlieu||'';$('#fNhom').value=n?.nhom_id||nhoms[0]?.id||'';$('#fDvt').value=n?.don_vi_mua_mac_dinh||'';$('#fQuyCach').value=n?.quy_cach_mac_dinh||'';$('#fGia').value=Number(n?.gia_tham_khao||0);$('#fGhiChu').value=n?.ghi_chu||'';$('#modal').classList.remove('hidden')}
$('#btnNewNL').onclick=()=>openNL();$('#btnCloseModal').onclick=()=>$('#modal').classList.add('hidden');
$('#btnSaveNL').onclick=async()=>{if(!isAdmin)return toast('Chỉ admin được sửa danh mục.');const id=Number($('#editId').value||0);const p={ma_nguyenlieu:$('#fMa').value.trim().toUpperCase(),ten_nguyenlieu:$('#fTen').value.trim(),nhom_id:Number($('#fNhom').value),don_vi_mua_mac_dinh:$('#fDvt').value.trim(),quy_cach_mac_dinh:$('#fQuyCach').value.trim(),gia_tham_khao:Number($('#fGia').value||0),ghi_chu:$('#fGhiChu').value.trim(),updated_by:manv};if(!p.ma_nguyenlieu||!p.ten_nguyenlieu||!p.don_vi_mua_mac_dinh)return toast('Thiếu mã, tên hoặc đơn vị.');try{id?await suaNguyenLieu(id,p):await themNguyenLieu({...p,created_by:manv});nguyenlieus=await layNguyenLieu({caAn:true});$('#modal').classList.add('hidden');renderDanhMuc();toast('Đã lưu danh mục.')}catch(e){toast('Lỗi: '+e.message)}};

async function loadHistory(){try{const rows=await layLichSu({tuNgay:$('#tuNgay').value,denNgay:$('#denNgay').value});$('#historyBody').innerHTML=rows.map(p=>`<tr><td><b>${esc(p.so_phieu)}</b></td><td>${p.ngay_mua}</td><td>${esc(p.nguoi_tao)}</td><td>${esc(p.nha_cung_cap||'')}</td><td class="num">${fmt(p.tong_tien)}</td><td><span class="pill ${p.trang_thai==='da_huy'?'cancel':''}">${p.trang_thai==='da_huy'?'Đã hủy':'Đã lưu'}</span></td><td><button class="btn btn-light view-p" data-id="${p.id}">Xem</button>${isAdmin&&p.trang_thai!=='da_huy'?` <button class="btn btn-danger cancel-p" data-id="${p.id}">Hủy</button>`:''}</td></tr>`).join('');$$('.view-p').forEach(b=>b.onclick=()=>viewPhieu(Number(b.dataset.id)));$$('.cancel-p').forEach(b=>b.onclick=()=>cancelPhieu(Number(b.dataset.id)))}catch(e){toast('Lỗi nạp lịch sử: '+e.message)}}
$('#btnLoadHistory').onclick=loadHistory;
async function viewPhieu(id){const ct=await layChiTietPhieu(id);alert(ct.map(x=>`${x.ten_nguyenlieu_snapshot}: ${x.so_luong} ${x.don_vi_mua} × ${fmt(x.don_gia)} = ${fmt(x.thanh_tien)}đ`).join('\n')||'Không có chi tiết')}
async function cancelPhieu(id){if(!isAdmin)return;const lydo=prompt('Lý do hủy phiếu:');if(!lydo)return;try{await huyPhieu(id,manv,lydo);await loadHistory();toast('Đã hủy phiếu, lịch sử vẫn được giữ.')}catch(e){toast('Lỗi hủy: '+e.message)}}
$$('.nl-tab').forEach(b=>b.onclick=()=>{$$('.nl-tab').forEach(x=>x.classList.remove('active'));$$('.nl-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`#p-${b.dataset.tab}`).classList.add('active');if(b.dataset.tab==='lichsu')loadHistory()});
bootstrap();
