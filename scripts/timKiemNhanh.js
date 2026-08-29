import { supabase } from "./supabaseClient.js";
import { setupScanner } from "./scanner.js";
import { playSuccessBeep, setupBeepUnlockOnce } from "./soundBeep.js";

window.TIM_KIEM_NHANH_BUILD = "1.0.0";
console.log("[TimKiemNhanh] BUILD 1.0.0");

const SIZE_LIST=["38","39","40","41","42","43","44","45","46"];
const IMAGE_BASE="https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const PENDING_KEY="sales_copilot_pending_v1";
const ACK_KEY="sales_copilot_ack_v1";
const CART_KEY="tim_kiem_nhanh_selected_v1";
const MAIN_GROUPS={
  AO_HE:{label:"Áo hè",defaultGroup:"AP",groups:["AP","SM","3LO","BOC"]},
  QUAN:{label:"Quần",defaultGroup:"QB",groups:["QB","QT","QV","NGO","QNI"]},
  AO_RET:{label:"Áo rét",defaultGroup:"AOKHOAC",groups:["AOKHOAC","TD","SO","LEN","AODA","BOD"]},
  GIAY_DEP:{label:"Giày dép",defaultGroup:"GIAYTHOITRANG",groups:["DEP","GIAYDA","GIAYSUC","GIAYTHOITRANG"]}
};
const state={
  manv:String(localStorage.getItem("manv")||"").trim(),
  tennv:String(localStorage.getItem("tennv")||"").trim(),
  diadiem:String(localStorage.getItem("diadiem")||"cs1").trim().toLowerCase(),
  groups:[],colors:[],mainGroup:"AO_HE",group:"AP",form:"",color:"",size:"",mode:"similar",referencePrice:0,
  sourceMasp:"",sourceProduct:null,products:[],offset:0,total:0,loading:false,selected:[],scanner:null,lastSearchKey:""
};
const $=id=>document.getElementById(id);
const norm=v=>String(v??"").trim().toUpperCase();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("vi-VN");
function formNorm(v){const x=norm(v).replace(/\s+/g,"_");if(["RONG","RỘNG","FORM_RONG"].includes(x))return"RONG";if(["VUA","VỪA","FORM_VUA"].includes(x))return"VUA";if(["BO","BÓ","OM","ÔM","FORM_BO"].includes(x))return"BO";return x}
function formLabel(v){return({RONG:"Rộng",VUA:"Vừa",BO:"Bó"})[formNorm(v)]||String(v||"")}
function toast(msg,ms=2300){const el=$("toast");el.textContent=msg;el.style.display="block";clearTimeout(window.__tknToast);window.__tknToast=setTimeout(()=>el.style.display="none",ms)}
function stockFor(sp,size){const x=sp?.ton_sizes?.[String(size)]||{};return Number(state.diadiem==="cs2"?x.ton_cs2:x.ton_cs1)||0}
function availableSizes(sp){return SIZE_LIST.filter(s=>stockFor(sp,s)>0)}
function mainKeyForGroup(code){for(const [k,cfg] of Object.entries(MAIN_GROUPS))if(cfg.groups.some(x=>norm(x)===norm(code)))return k;return"AO_HE"}
function groupRow(code){return state.groups.find(x=>norm(x.manhom)===norm(code))||null}
function saveSelected(){localStorage.setItem(CART_KEY,JSON.stringify(state.selected))}
function loadSelected(){try{const x=JSON.parse(localStorage.getItem(CART_KEY)||"[]");state.selected=Array.isArray(x)?x:[]}catch{state.selected=[]}}
function setLoading(v){state.loading=!!v;document.body.classList.toggle("loading",!!v)}

async function loadConfig(){
  const [g,c]=await Promise.all([
    supabase.from("cauhinh_nhom_tu_van").select("*").eq("active",true).order("thu_tu"),
    supabase.from("dmmausac").select("mamau,tenmau").order("tenmau")
  ]);
  if(g.error)throw g.error;state.groups=g.data||[];state.colors=c.data||[];
  $("colorSelect").innerHTML='<option value="">Màu</option>'+state.colors.map(x=>`<option value="${esc(x.mamau)}">${esc(x.tenmau)}</option>`).join("");
}
function renderSizes(){
  const box=$("sizeRow");box.innerHTML=SIZE_LIST.map(s=>`<button type="button" class="size ${state.size===s?"on":""}" data-size="${s}">${s}</button>`).join("");
  box.querySelectorAll(".size").forEach(b=>b.onclick=()=>{state.size=state.size===b.dataset.size?"":b.dataset.size;renderSizes();search(true)});
}
function renderGroups(){
  const main=$("mainGroups");
  main.innerHTML=Object.entries(MAIN_GROUPS).map(([k,c])=>{
    const sub=k===state.mainGroup?groupRow(state.group):null;const subText=sub&&norm(sub.manhom)!==norm(c.defaultGroup)?String(sub.ten_hien_thi||sub.manhom):"";
    return `<button type="button" class="main-group ${k===state.mainGroup?"on":""}" data-main="${k}">${esc(c.label)}${subText?`<small>${esc(subText)}</small>`:""}</button>`
  }).join("");
  main.querySelectorAll(".main-group").forEach(b=>b.onclick=()=>{
    const key=b.dataset.main;state.mainGroup=key;
    const cfg=MAIN_GROUPS[key];if(!cfg.groups.some(x=>norm(x)===norm(state.group)))state.group=cfg.defaultGroup;
    state.sourceMasp="";state.sourceProduct=null;renderGroups();renderSubgroups(true);search(true);
  });
  renderSubgroups(false);
}
function renderSubgroups(forceOpen=false){
  const box=$("subGroups"),cfg=MAIN_GROUPS[state.mainGroup];
  const rows=state.groups.filter(g=>cfg.groups.some(x=>norm(x)===norm(g.manhom)));
  box.innerHTML=rows.map(g=>`<button type="button" class="subgroup ${norm(g.manhom)===norm(state.group)?"on":""}" data-group="${esc(g.manhom)}">${esc(g.ten_hien_thi||g.manhom)}</button>`).join("");
  box.classList.toggle("show",forceOpen);
  box.querySelectorAll(".subgroup").forEach(b=>b.onclick=()=>{state.group=b.dataset.group;state.sourceMasp="";state.sourceProduct=null;renderGroups();box.classList.remove("show");search(true)});
}
function renderModes(){document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("on",b.dataset.mode===state.mode));$("refPriceBox").classList.toggle("show",["cheaper","premium"].includes(state.mode))}
function params(offset){return{
  p_diadiem:state.diadiem,p_nhomhang:state.group,p_sizes:state.size?[state.size]:SIZE_LIST,
  p_form:state.form||null,p_mausac:state.color||null,p_mode:state.mode,p_reference_price:Number(state.referencePrice||0),
  p_keyword:null,p_source_masp:state.sourceMasp||null,p_offset:offset,p_limit:40,p_den_ngay:new Date().toISOString().slice(0,10)
}}
async function search(reset=true){
  if(!state.group||state.loading)return;const off=reset?0:state.offset;
  if(reset){state.offset=0;state.products=[];$("productList").innerHTML=""}
  setLoading(true);try{
    const {data,error}=await supabase.rpc("sales_copilot_tim_san_pham_v1111",params(off));if(error)throw error;
    const rows=(data||[]).map(x=>({...x}));state.total=Number(rows[0]?.total_count||0);state.products=reset?rows:state.products.concat(rows);state.offset=state.products.length;
    renderProducts(reset);$("resultCount").textContent=`${state.products.length}/${state.total||state.products.length}`;$("btnMore").style.display=state.offset<state.total?"block":"none";
  }catch(e){console.error(e);toast("Lỗi tìm sản phẩm: "+(e.message||e),5000)}finally{setLoading(false)}
}
function renderProducts(){
  const box=$("productList");if(!state.products.length){box.innerHTML='<div class="empty" style="grid-column:1/-1">Không có sản phẩm phù hợp.</div>';return}
  box.innerHTML=state.products.map(sp=>{
    const av=availableSizes(sp);const img=`${IMAGE_BASE}${encodeURIComponent(norm(sp.masp))}.JPG`;
    return `<article class="product" data-card="${esc(sp.masp)}"><img loading="lazy" decoding="async" src="${img}" onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'"><div class="pb"><button type="button" class="stock-link" data-stock="${esc(sp.masp)}">${esc(sp.masp)}</button><div class="price">${money(sp.giale)} đ</div><div class="meta">${esc(formLabel(sp.form)||"-")} · Còn size: <b>${esc(av.join(" ")||"-")}</b></div><button type="button" class="pick" data-pick="${esc(sp.masp)}">Chọn</button><div class="pick-sizes" data-sizes="${esc(sp.masp)}">${SIZE_LIST.map(s=>`<button type="button" class="pick-size ${stockFor(sp,s)>0?"has":"no"}" data-add="${esc(sp.masp)}" data-size="${s}">${s}</button>`).join("")}</div></div></article>`
  }).join("");
  box.querySelectorAll(".stock-link").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.stock));
  box.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{const el=box.querySelector(`[data-sizes="${CSS.escape(b.dataset.pick)}"]`);el?.classList.toggle("show")});
  box.querySelectorAll(".pick-size").forEach(b=>b.onclick=()=>addSelected(b.dataset.add,b.dataset.size));
}
function addSelected(masp,size){
  const sp=state.products.find(x=>norm(x.masp)===norm(masp))||state.sourceProduct;if(!sp)return;
  if(state.selected.some(x=>norm(x.masp)===norm(masp)&&String(x.size)===String(size))){toast("Mã + size này đã có trong Sản phẩm đã chọn.");return}
  state.selected=[{id:`${Date.now()}_${Math.random().toString(36).slice(2,7)}`,masp:sp.masp,size:String(size),soluong:1,giale:sp.giale,form:sp.form,mausac:sp.mausac},...state.selected];saveSelected();renderSelected();
  if(stockFor(sp,size)<=0)toast(`Đã chọn ${sp.masp} / ${size}. Size này hiện không còn tại ${state.diadiem.toUpperCase()}.`,3800);else toast(`Đã chọn ${sp.masp} / ${size}`)
}
function renderSelected(){
  const box=$("selectedList");$("selectedCount").textContent=`${state.selected.length} sản phẩm`;
  if(!state.selected.length){box.innerHTML='<div class="empty">Chưa chọn sản phẩm.</div>';return}
  box.innerHTML=state.selected.map(r=>`<div class="selected-item"><div class="sel-line"><button type="button" class="sel-code" data-sel-stock="${esc(r.masp)}">${esc(r.masp)}</button><span class="sel-size">Size ${esc(r.size)}</span></div><div class="sel-actions"><button type="button" class="remove" data-remove="${esc(r.id)}">Bỏ khỏi giỏ</button><button type="button" class="sale" data-sale="${esc(r.id)}">Đưa sang bán</button></div></div>`).join("");
  box.querySelectorAll("[data-sel-stock]").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.selStock));
  box.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{state.selected=state.selected.filter(x=>String(x.id)!==String(b.dataset.remove));saveSelected();renderSelected()});
  box.querySelectorAll("[data-sale]").forEach(b=>b.onclick=()=>pushOneToSale(b.dataset.sale));
}
function waitAck(id,timeout=12000){return new Promise(resolve=>{const start=Date.now();const t=setInterval(()=>{try{const a=JSON.parse(localStorage.getItem(ACK_KEY)||"null");if(a?.id===id){clearInterval(t);return resolve(a)}}catch{}if(Date.now()-start>timeout){clearInterval(t);resolve(null)}},180)})}
async function pushOneToSale(id){
  const row=state.selected.find(x=>String(x.id)===String(id));if(!row)return;const payloadId=`TKN_${Date.now()}_${row.masp}_${row.size}`;
  const payload={id:payloadId,created_at:new Date().toISOString(),phien_id:null,diadiem:state.diadiem,makh:null,tenkh:null,items:[{masp:row.masp,size:row.size,soluong:Number(row.soluong||1)}]};
  localStorage.removeItem(PENDING_KEY);localStorage.removeItem(ACK_KEY);localStorage.setItem(PENDING_KEY,JSON.stringify(payload));
  window.open(state.diadiem==="cs2"?"/bannvcs2.html":"/bannvcs1.html","BAN_NV_HOAN_TUYET");toast("Đang đưa sang trang bán...");
  const ack=await waitAck(payloadId);if(!ack){toast("Trang bán chưa xác nhận. Sản phẩm vẫn được giữ lại.",5000);return}toast(`Đã đưa ${row.masp} / ${row.size} sang trang bán.`)
}

let suggestTimer=null;
async function loadSuggestions(text){
  const q=String(text||"").trim();if(!q){$("suggestBox").style.display="none";return}
  const {data,error}=await supabase.rpc("sales_copilot_goi_y_ma_v1111",{p_text:q,p_limit:12});if(error)return;
  const box=$("suggestBox");box.innerHTML=(data||[]).map(x=>`<button type="button" data-code="${esc(x.masp)}"><b>${esc(x.masp)}</b><small>${esc(x.tensp||"")}</small></button>`).join("");box.style.display=(data||[]).length?"block":"none";
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>processCode(b.dataset.code,true));
}
async function processCode(raw,fromChoice=false){
  const code=norm(raw);if(!code)return;setLoading(true);try{
    const {data,error}=await supabase.rpc("sales_copilot_lay_san_pham_theo_ma_v1111",{p_masp:code,p_den_ngay:new Date().toISOString().slice(0,10)});if(error)throw error;const sp=(data||[])[0];if(!sp){toast("Mã sản phẩm không tồn tại.");return}
    $("codeInput").value=sp.masp;$("suggestBox").style.display="none";state.sourceMasp=sp.masp;state.sourceProduct=sp;state.group=sp.nhomhang||state.group;state.mainGroup=mainKeyForGroup(state.group);state.form=formNorm(sp.form);state.color=String(sp.mausac||"").trim();
    $("formSelect").value=state.form||"";$("colorSelect").value=state.color||"";renderGroups();renderSizes();playSuccessBeep();await search(true);setTimeout(()=>{$("codeInput").focus();$("codeInput").select()},60)
  }catch(e){console.error(e);toast("Không lấy được mã sản phẩm: "+(e.message||e),5000)}finally{setLoading(false)}
}
function clearSourceForManualFilter(){state.sourceMasp="";state.sourceProduct=null}

function bind(){
  setupBeepUnlockOnce(document);
  $("codeInput").addEventListener("input",e=>{clearTimeout(suggestTimer);suggestTimer=setTimeout(()=>loadSuggestions(e.target.value),150)});
  $("codeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();processCode(e.currentTarget.value)}});
  document.addEventListener("click",e=>{if(!e.target.closest(".codebox"))$("suggestBox").style.display="none"});
  $("formSelect").onchange=e=>{state.form=e.target.value;clearSourceForManualFilter();search(true)};
  $("colorSelect").onchange=e=>{state.color=e.target.value;clearSourceForManualFilter();search(true)};
  document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;renderModes();search(true)});
  $("refPrice").onchange=e=>{state.referencePrice=Number(e.target.value||0);search(true)};
  $("btnMore").onclick=()=>search(false);
  $("btnScan").onclick=async()=>{$("scanOverlay").classList.add("show");await state.scanner.startScan()};
  $("btnCloseScan").onclick=()=>{state.scanner.stopScan();$("scanOverlay").classList.remove("show")};
  $("flashBtn").onclick=()=>state.scanner.toggleTorch();
  $("pickImage").onchange=e=>state.scanner.decodeFromFile(e.target.files?.[0]);
}
async function initScanner(){
  state.scanner=setupScanner({videoEl:$("scanVideo"),selectEl:$("cameraSelect"),statusEl:$("scanStatus"),onResult:async text=>{state.scanner.stopScan();$("scanOverlay").classList.remove("show");await processCode(text)}})
}
async function init(){
  $("nvInfo").textContent=`V1.0.0 · ${state.tennv||state.manv||"Chưa đăng nhập"} · ${state.diadiem.toUpperCase()}`;loadSelected();renderSelected();renderSizes();renderModes();
  try{const {data:{user}}=await supabase.auth.getUser();if(!user)toast("Chưa có phiên đăng nhập Supabase. Hãy đăng nhập hệ thống trước.",6000);await loadConfig();renderGroups();bind();await initScanner();await search(true)}catch(e){console.error(e);toast("Không khởi tạo được Tìm kiếm nhanh: "+(e.message||e),7000)}
}
init();
