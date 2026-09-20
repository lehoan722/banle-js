import { getSupabaseClient } from './authModule.js';

const supabase = getSupabaseClient();
window.supabase = supabase;

let currentTab = 'overview';
let currentPage = 1;
let totalRows = 0;
let currentRows = [];
let currentSummary = {};
let loading = false;

const $ = id => document.getElementById(id);
const num = v => Number(v || 0) || 0;
const fmt = v => num(v).toLocaleString('vi-VN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtDate = v => v ? new Date(v+'T00:00:00').toLocaleDateString('vi-VN') : '';

function setStatus(text,isError=false){
  const el=$('statusMsg'); if(!el) return;
  el.textContent=text||''; el.classList.toggle('error',!!isError);
}

function getMaspList(){
  const raw=($('maspList')?.value||'').split(/\r?\n/).map(x=>x.trim().toUpperCase()).filter(Boolean);
  const one=($('maspInput')?.value||'').trim().toUpperCase();
  const arr=[...new Set([...(one?[one]:[]),...raw])];
  return arr.length?arr:null;
}

function filters(){
  return {
    p_tu_ngay:$('tuNgay').value,
    p_den_ngay:$('denNgay').value,
    p_dsmsp:getMaspList(),
    p_nhomhang:($('nhomhangInput').value||'').trim()||null,
    p_chungloai:($('chungloaiInput').value||'').trim()||null,
    p_mausac:($('mausacInput').value||'').trim()||null,
    p_nhacc:($('nhaccInput').value||'').trim()||null,
    p_size:($('sizeSelect').value||'').trim()||null
  };
}

function detailParams(page=currentPage){
  const f=filters();
  return {...f,p_coso:($('cosoSelect').value||'')||null,p_limit:Number($('pageSize').value||500),p_offset:(page-1)*Number($('pageSize').value||500)};
}
function overviewParams(page=currentPage){
  const f=filters();
  return {...f,p_limit:Number($('pageSize').value||500),p_offset:(page-1)*Number($('pageSize').value||500)};
}

function isTransientDbError(err){
  const s=`${err?.code||''} ${err?.message||''}`.toLowerCase();
  return s.includes('deadlock') || s.includes('40p01') || s.includes('serialization') || s.includes('40001');
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function ensureFresh(){
  const masps=getMaspList();
  // Nếu người dùng chỉ định mã, refresh đúng các mã đó để nhẹ DB.
  if(masps?.length){
    for(let attempt=1;attempt<=3;attempt++){
      const {data,error}=await supabase.rpc('refresh_xnt19_dirty_masps_v1',{p_masps:masps,p_limit:1000});
      if(!error) return data;
      if(!isTransientDbError(error) || attempt===3) throw error;
      await sleep(200*attempt);
    }
    return;
  }
  // Nếu lọc theo nhóm/chủng loại: refresh dirty chung theo batch nhỏ.
  for(let loop=0;loop<10;loop++){
    let lastErr=null;
    for(let attempt=1;attempt<=3;attempt++){
      const {data,error}=await supabase.rpc('refresh_xnt19_dirty_v2',{p_limit:500});
      if(!error){
        const row=Array.isArray(data)?data[0]:data;
        if(num(row?.remaining)<=0) return;
        lastErr=null; break;
      }
      lastErr=error;
      if(!isTransientDbError(error) || attempt===3) throw error;
      await sleep(200*attempt);
    }
    if(lastErr) throw lastErr;
  }
}

async function fetchOverview(page=currentPage){
  const {data,error}=await supabase.rpc('lichsuton_overview_bundle_v1',overviewParams(page));
  if(error) throw error;
  return Array.isArray(data)?(data[0]||{}):(data||{});
}
async function fetchDetail(page=currentPage){
  const {data,error}=await supabase.rpc('lichsuton_ngay_bundle_v1',detailParams(page));
  if(error) throw error;
  return Array.isArray(data)?(data[0]||{}):(data||{});
}

function renderOverview(rows){
  $('reportHead').innerHTML=`<tr>
    <th>Mã</th><th>Tên hàng</th><th>Nhóm</th><th>Chủng loại</th>
    <th>Bán CS1</th><th>Bán CS2</th><th>Tồn CS1</th><th>Tồn CS2</th>
    <th>Size còn CS1</th><th>Size còn CS2</th><th>Số size phát sinh</th>
    <th>Bán gần nhất</th><th>Nhập gần nhất</th><th>Giá lẻ</th>
  </tr>`;
  if(!rows.length){$('reportBody').innerHTML='<tr><td colspan="14" class="empty">Không có dữ liệu.</td></tr>';return;}
  $('reportBody').innerHTML=rows.map(r=>`<tr data-masp="${esc(r.masp)}">
    <td class="code">${esc(r.masp)}</td><td>${esc(r.tensp)}</td><td>${esc(r.nhomhang)}</td><td>${esc(r.chungloai)}</td>
    <td class="num sale">${fmt(r.ban_cs1)}</td><td class="num sale">${fmt(r.ban_cs2)}</td>
    <td class="num ${num(r.ton_cs1)===0?'stock-zero':''}">${fmt(r.ton_cs1)}</td><td class="num ${num(r.ton_cs2)===0?'stock-zero':''}">${fmt(r.ton_cs2)}</td>
    <td class="num">${fmt(r.size_con_cs1)}</td><td class="num">${fmt(r.size_con_cs2)}</td><td class="num">${fmt(r.so_size_phat_sinh)}</td>
    <td class="center">${fmtDate(r.ngay_ban_gannhat)}</td><td class="center">${fmtDate(r.ngay_nhap_gannhat)}</td><td class="num">${fmt(r.giale)}</td>
  </tr>`).join('');
}

function renderDetail(rows){
  $('reportHead').innerHTML=`<tr>
    <th>Ngày</th><th>Mã</th><th>Tên hàng</th><th>Size</th><th>Cơ sở</th>
    <th>Tồn đầu</th><th>Nhập mua</th><th>Chuyển vào</th><th>Bán</th><th>Chuyển ra</th>
    <th>Nhập khác</th><th>Xuất khác</th><th>Tổng tăng</th><th>Tổng giảm</th><th>Tồn cuối</th>
  </tr>`;
  if(!rows.length){$('reportBody').innerHTML='<tr><td colspan="15" class="empty">Không có dữ liệu.</td></tr>';return;}
  $('reportBody').innerHTML=rows.map(r=>`<tr data-masp="${esc(r.masp)}">
    <td class="center">${fmtDate(r.ngay)}</td><td class="code">${esc(r.masp)}</td><td>${esc(r.tensp)}</td><td class="center">${esc(r.size)}</td><td class="center">${String(r.diadiem||'').toUpperCase()}</td>
    <td class="num ${num(r.ton_dau)<0?'neg':''}">${fmt(r.ton_dau)}</td><td class="num">${fmt(r.nhapmua)}</td><td class="num">${fmt(r.chuyen_vao)}</td>
    <td class="num sale">${fmt(r.ban)}</td><td class="num">${fmt(r.chuyen_ra)}</td><td class="num">${fmt(r.nhap_khac)}</td><td class="num">${fmt(r.xuat_khac)}</td>
    <td class="num">${fmt(r.tong_tang)}</td><td class="num">${fmt(r.tong_giam)}</td><td class="num ${num(r.ton_cuoi)<0?'neg':''}">${fmt(r.ton_cuoi)}</td>
  </tr>`).join('');
}

function renderSummary(){
  if(currentTab==='overview'){
    $('summaryBox').innerHTML=`<b>Tổng:</b> Bán CS1 <b>${fmt(currentSummary.ban_cs1)}</b> | Bán CS2 <b>${fmt(currentSummary.ban_cs2)}</b> | Tồn CS1 <b>${fmt(currentSummary.ton_cs1)}</b> | Tồn CS2 <b>${fmt(currentSummary.ton_cs2)}</b>`;
  }else if(currentTab==='detail'){
    $('summaryBox').innerHTML=`<b>Tổng phát sinh trong kỳ:</b> Bán <b>${fmt(currentSummary.ban)}</b> | Nhập mua <b>${fmt(currentSummary.nhapmua)}</b> | Chuyển vào <b>${fmt(currentSummary.chuyen_vao)}</b> | Chuyển ra <b>${fmt(currentSummary.chuyen_ra)}</b> | Nhập khác <b>${fmt(currentSummary.nhap_khac)}</b> | Xuất khác <b>${fmt(currentSummary.xuat_khac)}</b>`;
  }else $('summaryBox').innerHTML='Ma trận tồn theo size của một mã sản phẩm.';
}

function updatePager(){
  const ps=Number($('pageSize').value||500); const pages=Math.max(1,Math.ceil(totalRows/ps));
  $('pageInfo').textContent=`Trang ${totalRows?currentPage:0}/${totalRows?pages:0} (Tổng ${fmt(totalRows)} dòng)`;
  $('btnPrev').disabled=currentPage<=1; $('btnNext').disabled=currentPage>=pages;
}

async function loadReport({skipFresh=false}={}){
  if(loading) return;
  const f=filters();
  if(!f.p_tu_ngay||!f.p_den_ngay) return alert('Vui lòng chọn đủ Từ ngày và Đến ngày.');
  if(f.p_tu_ngay>f.p_den_ngay) return alert('Từ ngày không được lớn hơn Đến ngày.');
  if(currentTab==='matrix') return loadMatrix();
  loading=true; $('btnView').disabled=true; setStatus(skipFresh?'Đang tải dữ liệu...':'Đang đồng bộ dữ liệu mới...');
  try{
    if(!skipFresh) await ensureFresh();
    setStatus('Đang tải báo cáo...');
    const payload=currentTab==='overview'?await fetchOverview():await fetchDetail();
    currentRows=payload.rows||[]; currentSummary=payload.summary||{}; totalRows=num(payload.total_rows);
    if(currentTab==='overview') renderOverview(currentRows); else renderDetail(currentRows);
    renderSummary(); updatePager(); setStatus(`${fmt(currentRows.length)}/${fmt(totalRows)} dòng.`);
  }catch(err){console.error(err);setStatus('Lỗi tải báo cáo: '+(err?.message||err),true);}
  finally{loading=false;$('btnView').disabled=false;}
}

function switchTab(tab){
  currentTab=tab; currentPage=1;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('tablePanel').style.display=tab==='matrix'?'none':'block';
  $('matrixPanel').style.display=tab==='matrix'?'block':'none';
  renderSummary();
  if(tab!=='matrix') loadReport({skipFresh:true}); else loadMatrix();
}

async function loadMatrix(){
  const masp=(($('maspInput').value||'').trim().toUpperCase()) || (getMaspList()?.[0]||'');
  if(!masp){$('matrixWrap').innerHTML='<div class="empty">Hãy nhập/chọn 1 mã sản phẩm.</div>';return;}
  $('maspInput').value=masp;
  const p={p_masp:masp,p_tu_ngay:$('tuNgay').value,p_den_ngay:$('denNgay').value,p_coso:$('matrixCoso').value||'cs1'};
  setStatus('Đang tải ma trận size...');
  try{
    const {data,error}=await supabase.rpc('lichsuton_size_matrix_v1',p); if(error) throw error;
    const payload=Array.isArray(data)?(data[0]||{}):(data||{}); const sizes=payload.sizes||[]; const rows=payload.rows||[];
    $('matrixTitle').textContent=`${masp} - ${(payload.coso||'').toUpperCase()}`;
    if(!rows.length||!sizes.length){$('matrixWrap').innerHTML='<div class="empty">Không có dữ liệu size.</div>';setStatus('');return;}
    let html='<table class="matrix-table"><thead><tr><th>Ngày</th>'+sizes.map(s=>`<th>${esc(s)}</th>`).join('')+'</tr></thead><tbody>';
    html+=rows.map(r=>`<tr><td>${fmtDate(r.ngay)}</td>${sizes.map(s=>{const v=num(r.stocks?.[s]);const cls=v<0?'neg':(v===0?'zero':'pos');return `<td class="${cls}">${fmt(v)}</td>`;}).join('')}</tr>`).join('');
    html+='</tbody></table>'; $('matrixWrap').innerHTML=html; setStatus(`${fmt(rows.length)} ngày × ${fmt(sizes.length)} size.`);
  }catch(err){console.error(err);setStatus('Lỗi ma trận: '+(err?.message||err),true);}
}

function csvEscape(v){
  const s=String(v??''); return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
function rowsToCsv(rows,mode){
  const cols=mode==='overview'
    ? ['masp','tensp','nhomhang','chungloai','mausac','nhacc','giale','quanlykichco','ban_cs1','ban_cs2','ton_cs1','ton_cs2','size_con_cs1','size_con_cs2','so_size_phat_sinh','ngay_ban_gannhat','ngay_nhap_gannhat']
    : ['ngay','masp','tensp','nhomhang','chungloai','mausac','nhacc','giale','quanlykichco','size','diadiem','ton_dau','nhapmua','chuyen_vao','ban','chuyen_ra','nhap_khac','xuat_khac','tong_tang','tong_giam','ton_cuoi'];
  const lines=[cols.join(',')]; rows.forEach(r=>lines.push(cols.map(c=>csvEscape(r[c])).join(','))); return '\ufeff'+lines.join('\r\n');
}

async function fetchAllRows(mode){
  const all=[]; const batch=5000; let offset=0; let total=Infinity; let idx=0;
  while(offset<total){
    idx++; setStatus(`Đang tải dữ liệu xuất: lượt ${idx}...`);
    let payload;
    if(mode==='overview'){
      const p={...overviewParams(1),p_limit:batch,p_offset:offset}; const {data,error}=await supabase.rpc('lichsuton_overview_bundle_v1',p); if(error) throw error; payload=Array.isArray(data)?(data[0]||{}):(data||{});
    }else{
      const p={...detailParams(1),p_limit:batch,p_offset:offset}; const {data,error}=await supabase.rpc('lichsuton_ngay_bundle_v1',p); if(error) throw error; payload=Array.isArray(data)?(data[0]||{}):(data||{});
    }
    total=num(payload.total_rows); const rows=payload.rows||[]; all.push(...rows); if(!rows.length) break; offset+=rows.length;
  }
  return all;
}

async function exportCsv(zip=false){
  if(currentTab==='matrix') return alert('Xuất CSV/ZIP áp dụng cho Tổng quan hoặc Lịch sử theo ngày.');
  if(loading) return; loading=true;
  try{
    await ensureFresh(); const rows=await fetchAllRows(currentTab); if(!rows.length)return alert('Không có dữ liệu để xuất.');
    const csv=rowsToCsv(rows,currentTab); const stamp=`${$('tuNgay').value}_${$('denNgay').value}`; const name=`lichsuton_${currentTab}_${stamp}.csv`;
    if(zip){
      if(typeof JSZip==='undefined') throw new Error('Thiếu thư viện JSZip.');
      const z=new JSZip(); z.file(name,csv); const blob=await z.generateAsync({type:'blob',compression:'DEFLATE'}); downloadBlob(blob,name.replace(/\.csv$/,'.zip'));
    }else downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),name);
    setStatus(`Đã xuất ${fmt(rows.length)} dòng.`);
  }catch(err){console.error(err);setStatus('Lỗi xuất dữ liệu: '+(err?.message||err),true);}
  finally{loading=false;}
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}

window.initLichSuTonKhoNgay=async function(){
  const now=new Date(); const from=new Date(now); from.setFullYear(now.getFullYear()-1);
  $('tuNgay').value=localISO(from); $('denNgay').value=localISO(now);
  document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('btnView').addEventListener('click',()=>{currentPage=1;loadReport();});
  $('btnCsv').addEventListener('click',()=>exportCsv(false)); $('btnZip').addEventListener('click',()=>exportCsv(true));
  $('btnClearMasp').addEventListener('click',()=>{$('maspInput').value='';$('maspList').value='';});
  $('btnPrev').addEventListener('click',()=>{if(currentPage>1){currentPage--;loadReport({skipFresh:true});}});
  $('btnNext').addEventListener('click',()=>{const max=Math.max(1,Math.ceil(totalRows/Number($('pageSize').value||500)));if(currentPage<max){currentPage++;loadReport({skipFresh:true});}});
  $('btnGoto').addEventListener('click',()=>{const max=Math.max(1,Math.ceil(totalRows/Number($('pageSize').value||500)));const n=Number($('gotoPage').value||1);if(n>=1&&n<=max){currentPage=n;loadReport({skipFresh:true});}});
  $('pageSize').addEventListener('change',()=>{currentPage=1;loadReport({skipFresh:true});});
  $('btnLoadMatrix').addEventListener('click',loadMatrix); $('matrixCoso').addEventListener('change',loadMatrix);
  $('reportBody').addEventListener('dblclick',e=>{
    const tr=e.target.closest('tr[data-masp]'); if(!tr)return; const masp=tr.dataset.masp; if(!masp)return;
    window.open(`sochitiettonkho.html?masp=${encodeURIComponent(masp)}`,'_blank');
  });
  $('reportBody').addEventListener('click',e=>{
    const td=e.target.closest('.code'); const tr=e.target.closest('tr[data-masp]'); if(!td||!tr)return;
    $('maspInput').value=tr.dataset.masp||'';
  });
  await loadReport();
};
