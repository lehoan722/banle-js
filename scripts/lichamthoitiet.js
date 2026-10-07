import { getSupabaseClient } from "./authModule.js"; 
const sb = getSupabaseClient();

const $=id=>document.getElementById(id);
const grid=$("grid"), statusEl=$("status"), locationEl=$("location");
let cursor = new Date(); cursor.setDate(1);
let selectedISO = new Date().toISOString().slice(0,10);
let rowsByDate = new Map();

function iso(d){return d.toISOString().slice(0,10)}
function localISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function fmtDate(isoStr){const [y,m,d]=isoStr.split("-");return `${d}-${m}-${y}`}
function weatherText(code){
  const m={0:"Trời quang",1:"Khá quang",2:"Có mây",3:"Nhiều mây",45:"Sương mù",48:"Sương mù",51:"Mưa phùn",53:"Mưa phùn",55:"Mưa phùn",61:"Mưa nhẹ",63:"Mưa",65:"Mưa lớn",80:"Mưa rào",81:"Mưa rào",82:"Mưa rào mạnh",95:"Dông",96:"Dông",99:"Dông mạnh"};
  return m[code] || (code==null?"":`Mã ${code}`);
}
function badgeType(t){return t==="LICH_SU_THUC_TE"?"hist":t==="DU_BAO_CU_THE"?"fc":"trend"}
function badgeLabel(t){return t==="LICH_SU_THUC_TE"?"Lịch sử":t==="DU_BAO_CU_THE"?"Dự báo":"Xu hướng"}

async function loadLocations(){
  const {data,error}=await sb.from("dm_dia_diem_thoitiet").select("ma_dia_diem,ten_dia_diem").eq("dang_ap_dung",true).order("ten_dia_diem");
  if(error) throw error;
  locationEl.innerHTML=(data||[]).map(x=>`<option value="${x.ma_dia_diem}">${x.ten_dia_diem}</option>`).join("");
  if(!locationEl.value) locationEl.innerHTML='<option value="THAI_NGUYEN">Thái Nguyên</option>';
}
function monthRange(){
  const first=new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const start=addDays(first,-((first.getDay()+6)%7));
  const last=new Date(cursor.getFullYear(),cursor.getMonth()+1,0);
  const end=addDays(last,6-((last.getDay()+6)%7));
  return {start,end};
}
async function loadMonth(){
  const {start,end}=monthRange();
  statusEl.textContent="Đang tải...";
  const {data,error}=await sb.rpc("rpc_lich_thoitiet_khoang_v1",{
    p_tu:localISO(start),p_den:localISO(end),p_dia_diem:locationEl.value||"THAI_NGUYEN"
  });
  if(error) throw error;
  rowsByDate=new Map((data||[]).map(r=>[r.ngay_duong,r]));
  render();
  statusEl.textContent=`${data?.length||0} ngày`;
}
function render(){
  $("monthTitle").textContent=`Tháng ${cursor.getMonth()+1}/${cursor.getFullYear()}`;
  const {start,end}=monthRange();
  grid.innerHTML="";
  const today=localISO(new Date());
  for(let d=new Date(start);d<=end;d=addDays(d,1)){
    const key=localISO(d),r=rowsByDate.get(key);
    const cell=document.createElement("div");
    cell.className="day"+(d.getMonth()!==cursor.getMonth()?" out":"")+(key===today?" today":"")+(key===selectedISO?" selected":"");
    const lunar = r ? `${r.ngay_am}/${r.thang_am}${r.thang_am_nhuan?" nhuận":""}` : "";
    const isTet = r?.la_tet_am || r?.la_ngay_cuoi_nam_am;
    cell.innerHTML=`
      <div class="solar">${d.getDate()}</div>
      <div class="lunar ${isTet?"tet":""}">${lunar}${r?.la_tet_am?" • TẾT":r?.la_ngay_cuoi_nam_am?" • 30 TẾT":""}</div>
      ${r?.loai_du_lieu?`
      <div class="wx">
        <span class="temp">${r.nhiet_do_min??"?"}°–${r.nhiet_do_max??"?"}°</span>
        <span class="more"> • ${weatherText(r.ma_thoi_tiet)}</span><br>
        <span class="source">${badgeLabel(r.loai_du_lieu)}${r.luong_mua!=null?` • mưa ${Number(r.luong_mua).toFixed(1)}mm`:""}</span>
      </div>`:""}
    `;
    cell.onclick=()=>selectDay(key);
    grid.appendChild(cell);
  }
}
async function selectDay(key){
  selectedISO=key;render();
  const r=rowsByDate.get(key);
  if(!r){$("detailTitle").textContent=fmtDate(key);$("detailBody").innerHTML="Chưa có dữ liệu.";return}
  $("detailTitle").textContent=`${fmtDate(key)} • Âm ${r.ngay_am}/${r.thang_am}/${r.nam_am}${r.thang_am_nhuan?" nhuận":""}`;
  const rows=[
    ["Âm lịch",`${r.ngay_am}/${r.thang_am}/${r.nam_am}${r.thang_am_nhuan?" (nhuận)":""}`],
    ["Đến Tết",r.so_ngay_den_tet==null?"—":`${r.so_ngay_den_tet} ngày`],
    ["Loại dữ liệu",r.loai_du_lieu?`<span class="badge ${badgeType(r.loai_du_lieu)}">${badgeLabel(r.loai_du_lieu)}</span>`:"—"],
    ["Nhiệt độ TB",r.nhiet_do_tb==null?"—":`${Number(r.nhiet_do_tb).toFixed(1)}°C`],
    ["Thấp / cao",r.nhiet_do_min==null?"—":`${r.nhiet_do_min}° / ${r.nhiet_do_max}°`],
    ["Độ ẩm",r.do_am_tb==null?"—":`${r.do_am_tb}%`],
    ["Mưa",r.luong_mua==null?"—":`${Number(r.luong_mua).toFixed(1)} mm`],
    ["Xác suất mưa",r.xac_suat_mua==null?"—":`${r.xac_suat_mua}%`],
    ["Gió max",r.gio_max==null?"—":`${r.gio_max} km/h`],
    ["Trạng thái",weatherText(r.ma_thoi_tiet)||"—"],
    ["Mức tin cậy",r.muc_tin_cay||"—"],
    ["Nguồn",r.nguon_du_lieu||"—"]
  ];
  $("detailBody").innerHTML=rows.map(([k,v])=>`<div class="kv"><span>${k}</span><b>${v}</b></div>`).join("");
  await loadHistory(key);
}
async function loadHistory(key){
  const {data,error}=await sb.rpc("rpc_thoitiet_lichsu_cung_ngay_v1",{
    p_ngay:key,p_dia_diem:locationEl.value||"THAI_NGUYEN",p_so_nam:10
  });
  if(error){$("history").innerHTML="";return}
  if(!data?.length){$("history").innerHTML="<b>10 năm cùng ngày</b><p>Chưa có dữ liệu lịch sử.</p>";return}
  const avg=a=>a.reduce((s,x)=>s+(Number(x.nhiet_do_tb)||0),0)/a.length;
  $("history").innerHTML=`
    <b>10 năm cùng ngày • TB ${avg(data).toFixed(1)}°C</b>
    <table><thead><tr><th>Năm</th><th>TB</th><th>Min</th><th>Max</th><th>Mưa</th></tr></thead>
    <tbody>${data.map(x=>`<tr><td>${x.ngay.slice(0,4)}</td><td>${x.nhiet_do_tb??""}</td><td>${x.nhiet_do_min??""}</td><td>${x.nhiet_do_max??""}</td><td>${x.luong_mua??""}</td></tr>`).join("")}</tbody></table>`;
}
function goDate(key){
  const d=new Date(key+"T12:00:00");
  cursor=new Date(d.getFullYear(),d.getMonth(),1);
  selectedISO=key;
  loadMonth().then(()=>selectDay(key)).catch(showErr);
}
function showErr(e){console.error(e);statusEl.textContent=e?.message||String(e)}

$("prev").onclick=()=>{cursor.setMonth(cursor.getMonth()-1);loadMonth().catch(showErr)}
$("next").onclick=()=>{cursor.setMonth(cursor.getMonth()+1);loadMonth().catch(showErr)}
$("today").onclick=()=>goDate(localISO(new Date()))
$("goSolar").onclick=()=>{if($("solarInput").value) goDate($("solarInput").value)}
$("goLunar").onclick=async()=>{
  const m=$("lunarInput").value.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(!m) return alert("Nhập dạng ngày/tháng/năm âm, ví dụ 1/1/2027");
  const {data,error}=await sb.rpc("rpc_tim_ngay_am_v1",{p_ngay_am:+m[1],p_thang_am:+m[2],p_nam_am:+m[3],p_thang_nhuan:false});
  if(error) return showErr(error);
  if(!data?.length) return alert("Không tìm thấy ngày âm trong vùng dữ liệu.");
  goDate(data[0].ngay_duong);
}
locationEl.onchange=()=>loadMonth().then(()=>selectDay(selectedISO)).catch(showErr);

(async()=>{
  try{
    await loadLocations();
    await loadMonth();
    if(rowsByDate.has(selectedISO)) await selectDay(selectedISO);
  }catch(e){showErr(e)}
})();
