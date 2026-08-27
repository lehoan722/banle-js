import { supabase } from "./supabaseClient.js";

const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const norm=v=>String(v??"").trim().toLowerCase();
const endedStates=new Set(["DA_DAY_SANG_BAN","KET_THUC_KHONG_MUA","HUY_NHAP_NHAM"]);

function localDateStr(d=new Date()){
  const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return x.toISOString().slice(0,10);
}
function startIso(dateStr){ return new Date(`${dateStr}T00:00:00`).toISOString(); }
function nextDayIso(dateStr){ const d=new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate()+1); return d.toISOString(); }
function fmtTime(v){ if(!v)return "—"; return new Date(v).toLocaleString("vi-VN",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"}); }
function secondsBetween(a,b){ if(!a||!b)return null; const n=(new Date(b)-new Date(a))/1000; return Number.isFinite(n)&&n>=0?n:null; }
function fmtDuration(sec){ if(sec==null)return "—"; sec=Math.round(sec); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; if(h)return `${h}g ${m}p`; if(m)return `${m}p ${s}s`; return `${s}s`; }
function pct(a,b){ return b?`${(a*100/b).toFixed(1).replace('.',',')}%`:'0%'; }
function average(arr){ const a=arr.filter(v=>v!=null&&Number.isFinite(v)); return a.length?a.reduce((x,y)=>x+y,0)/a.length:null; }
function showLoading(v){$("loading").classList.toggle("show",!!v)}

function sessionResult(p){
  if(p.trang_thai==="DA_DAY_SANG_BAN")return {label:"Sang bán",cls:"good"};
  if(p.trang_thai==="KET_THUC_KHONG_MUA")return {label:"Không mua",cls:"bad"};
  if(p.trang_thai==="HUY_NHAP_NHAM")return {label:"Hủy nhập nhầm",cls:"muted"};
  return {label:"Đang tư vấn",cls:"muted"};
}
async function loadData(){
  const tu=$("tuNgay").value, den=$("denNgay").value;
  if(!tu||!den){alert("Chọn từ ngày và đến ngày.");return;}
  if(new Date(tu)>new Date(den)){alert("Từ ngày không được sau đến ngày.");return;}
  const days=(new Date(den)-new Date(tu))/86400000;
  if(days>92){alert("Mỗi lần nên xem tối đa 93 ngày để trang tải nhanh.");return;}
  showLoading(true);
  try{
    const {data:all,error}=await supabase.rpc("sales_copilot_bao_cao_hieu_qua",{
      p_tu_ngay:tu,
      p_den_ngay:den,
      p_diadiem:$("coSo").value||null
    });
    if(error)throw error;
    const allRows=all||[];
    fillEmployeeFilter(allRows);
    const manv=$("nhanVien").value;
    const sessions=manv?allRows.filter(x=>String(x.manv)===String(manv)):allRows;
    render(sessions);
  }catch(e){console.error(e);alert("Không tải được dữ liệu Hiệu quả tư vấn: "+(e.message||e));}
  finally{showLoading(false)}
}

function fillEmployeeFilter(rows){
  const sel=$("nhanVien"), current=sel.value;
  const map=new Map();
  (rows||[]).forEach(r=>{if(r.manv)map.set(String(r.manv),r.tennv||r.manv)});
  sel.innerHTML='<option value="">Tất cả</option>'+[...map.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'vi')).map(([id,name])=>`<option value="${esc(id)}">${esc(name)} (${esc(id)})</option>`).join('');
  if([...map.keys()].includes(current))sel.value=current;
}

function render(sessions){
  const countMap=new Map((sessions||[]).map(p=>[Number(p.id),Number(p.so_mon_sang_ban||0)]));
  const pushed=sessions.filter(x=>x.trang_thai==="DA_DAY_SANG_BAN");
  const noBuy=sessions.filter(x=>x.trang_thai==="KET_THUC_KHONG_MUA");
  const ended=sessions.filter(x=>endedStates.has(x.trang_thai)&&x.ket_thuc_luc);
  const serviceAvg=average(ended.map(x=>secondsBetween(x.created_at,x.ket_thuc_luc)));
  const firstCartAvg=average(sessions.map(x=>secondsBetween(x.created_at,x.vao_gio_dau_luc)));
  const pushedItems=pushed.reduce((n,p)=>n+(countMap.get(Number(p.id))||0),0);
  const itemPer=pushed.length?pushedItems/pushed.length:0;
  const cards=[
    [sessions.length,"Khách được phục vụ"],[pushed.length,"Đã chuyển sang bán"],[noBuy.length,"Không mua"],[pct(pushed.length,sessions.length),"Tỷ lệ chuyển sang bán"],[fmtDuration(serviceAvg),"TG phục vụ TB"],[itemPer.toFixed(1).replace('.',','),"Món/khách sang bán"],[fmtDuration(firstCartAvg),"TG đến món đầu tiên"]
  ];
  $("stats").innerHTML=cards.map(([v,l])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  renderHours(sessions);
  renderStaff(sessions,countMap);
  renderSessions(sessions,countMap);
}

const hourBuckets=[[7,10,"07:00–10:00"],[10,13,"10:00–13:00"],[13,17,"13:00–17:00"],[17,20,"17:00–20:00"],[20,23,"20:00–23:00"]];
function renderHours(rows){
  const groups=hourBuckets.map(([a,b,label])=>({a,b,label,rows:[]}));
  for(const r of rows){ const h=new Date(r.created_at).getHours(); const g=groups.find(x=>h>=x.a&&h<x.b); if(g)g.rows.push(r); }
  $("hourRows").innerHTML=groups.map(g=>{const p=g.rows.filter(x=>x.trang_thai==="DA_DAY_SANG_BAN").length;return `<tr><td>${g.label}</td><td>${g.rows.length}</td><td>${p}</td><td>${pct(p,g.rows.length)}</td></tr>`}).join('')||'<tr><td colspan="4" class="empty">Chưa có dữ liệu</td></tr>';
}
function renderStaff(rows,countMap){
  const map=new Map();
  for(const r of rows){const k=String(r.manv||'');if(!map.has(k))map.set(k,{name:r.tennv||r.manv||'-',rows:[]});map.get(k).rows.push(r)}
  $("staffRows").innerHTML=[...map.values()].map(g=>{
    const pushed=g.rows.filter(x=>x.trang_thai==="DA_DAY_SANG_BAN");
    const nb=g.rows.filter(x=>x.trang_thai==="KET_THUC_KHONG_MUA").length;
    const service=average(g.rows.filter(x=>endedStates.has(x.trang_thai)).map(x=>secondsBetween(x.created_at,x.ket_thuc_luc)));
    const first=average(g.rows.map(x=>secondsBetween(x.created_at,x.vao_gio_dau_luc)));
    const items=pushed.reduce((n,p)=>n+(countMap.get(Number(p.id))||0),0);
    return `<tr><td><b>${esc(g.name)}</b></td><td>${g.rows.length}</td><td>${pushed.length}</td><td>${nb}</td><td>${pct(pushed.length,g.rows.length)}</td><td>${fmtDuration(service)}</td><td>${fmtDuration(first)}</td><td>${pushed.length?(items/pushed.length).toFixed(1).replace('.',','):'0'}</td></tr>`;
  }).join('')||'<tr><td colspan="8" class="empty">Chưa có dữ liệu</td></tr>';
}
function renderSessions(rows,countMap){
  $("sessionRows").innerHTML=rows.map(p=>{const res=sessionResult(p),dur=secondsBetween(p.created_at,p.ket_thuc_luc);return `<tr><td>${fmtTime(p.created_at)}</td><td>${esc(p.tennv||p.manv||'-')}</td><td>${esc(String(p.diadiem||'').toUpperCase())}</td><td>${fmtDuration(dur)}</td><td>${Number(p.so_sp_da_tu_van||0)} SP</td><td>${countMap.get(Number(p.id))||0}</td><td class="${res.cls}">${res.label}</td></tr>`}).join('')||'<tr><td colspan="7" class="empty">Chưa có phiên tư vấn trong khoảng đã chọn.</td></tr>';
}

async function init(){
  const today=localDateStr(); $("tuNgay").value=today; $("denNgay").value=today;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){$("who").textContent="Chưa có phiên đăng nhập Supabase. Hãy đăng nhập hệ thống trước.";return;}
  $("who").textContent=`${localStorage.getItem('tennv')||localStorage.getItem('manv')||'Đã đăng nhập'} · BUILD 1.10.7`;
  $("btnTai").onclick=loadData;
  $("coSo").onchange=loadData;
  $("nhanVien").onchange=()=>{ loadData(); };
  await loadData();
}
init();
