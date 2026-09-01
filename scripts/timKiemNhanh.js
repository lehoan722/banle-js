import { getSupabaseClient, khoiTaoDangNhapDungChung } from "./authModule.js";
import { setupScanner } from "./scanner.js";
import { playSuccessBeep, setupBeepUnlockOnce } from "./soundBeep.js";

window.TIM_KIEM_NHANH_BUILD = "1.2.0";
console.log("[TimKiemNhanh] BUILD 1.2.0");

const supabase = getSupabaseClient();

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
  diadiem:String(localStorage.getItem("diadiem")||"").trim().toLowerCase(),
  groups:[],colors:[],mainGroup:"",group:"",form:"",color:"",size:"",mode:"similar",referencePrice:0,
  sourceMasp:"",sourceProduct:null,sourceStockAfterCheck:null,products:[],offset:0,total:0,loading:false,selected:[],scanner:null
};

function refreshAuthState(){
  state.manv=String(localStorage.getItem("manv")||"").trim();
  state.tennv=String(localStorage.getItem("tennv")||"").trim();
  state.diadiem=String(localStorage.getItem("diadiem")||"").trim().toLowerCase();
  const info=$("nvInfo");
  if(info)info.textContent=`V1.2.0 · ${state.tennv||state.manv||"Chưa đăng nhập"} · ${validBranch()?state.diadiem.toUpperCase():"CHƯA CÓ CS"}`;
}

const AFTER_CHECK_CACHE=new Map();
let pendingMissingSize="";
const $=id=>document.getElementById(id);
const norm=v=>String(v??"").trim().toUpperCase();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("vi-VN");
const validBranch=()=>["cs1","cs2"].includes(state.diadiem);
function sourceQty(size){
  const row=state.sourceStockAfterCheck?.[String(size)]||{};
  return Number(state.diadiem==="cs2"?row.ton_cs2:row.ton_cs1)||0;
}

function businessDate(){
  try{
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const map=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }catch{return new Date().toISOString().slice(0,10)}
}
function formNorm(v){const x=norm(v).replace(/\s+/g,"_");if(["RONG","RỘNG","FORM_RONG"].includes(x))return"RONG";if(["VUA","VỪA","FORM_VUA"].includes(x))return"VUA";if(["BO","BÓ","OM","ÔM","FORM_BO"].includes(x))return"BO";return x}
function formLabel(v){return({RONG:"Rộng",VUA:"Vừa",BO:"Bó"})[formNorm(v)]||String(v||"")}
function toast(msg,ms=2300){const el=$("toast");el.textContent=msg;el.style.display="block";clearTimeout(window.__tknToast);window.__tknToast=setTimeout(()=>el.style.display="none",ms)}
function setLoading(v){state.loading=!!v;document.body.classList.toggle("loading",!!v)}
function stockFor(sp,size){const x=sp?.ton_sizes?.[String(size)]||{};return Number(state.diadiem==="cs2"?x.ton_cs2:x.ton_cs1)||0}
function availableSizes(sp){return SIZE_LIST.filter(s=>stockFor(sp,s)>0)}
function mainKeyForGroup(code){for(const [k,cfg] of Object.entries(MAIN_GROUPS))if(cfg.groups.some(x=>norm(x)===norm(code)))return k;return""}
function groupRow(code){return state.groups.find(x=>norm(x.manhom)===norm(code))||null}
function groupDisplayName(code){const row=groupRow(code);return String(row?.ten_hien_thi||row?.manhom||code||"").trim()}
function saveSelected(){localStorage.setItem(CART_KEY,JSON.stringify(state.selected))}
function loadSelected(){try{const x=JSON.parse(localStorage.getItem(CART_KEY)||"[]");state.selected=Array.isArray(x)?x:[]}catch{state.selected=[]}}

function clearResults(message=""){
  state.products=[];state.offset=0;state.total=0;
  $("resultCount").textContent="";
  $("btnMore").style.display="none";
  $("productList").innerHTML=message?`<div class="empty initial-empty" style="grid-column:1/-1">${esc(message)}</div>`:"";
}
function showSizeWarning(text="Chọn size để tìm sản phẩm phù hợp"){
  const el=$("sizeWarning");
  el.textContent=text;
  el.classList.add("show");
}
function hideSizeWarning(){$("sizeWarning").classList.remove("show")}

async function loadConfig(){
  const [g,c]=await Promise.all([
    supabase.from("cauhinh_nhom_tu_van").select("*").eq("active",true).order("thu_tu"),
    supabase.from("dmmausac").select("mamau,tenmau").order("tenmau")
  ]);
  if(g.error)throw g.error;
  if(c.error)throw c.error;
  state.groups=g.data||[];state.colors=c.data||[];
  $("colorSelect").innerHTML='<option value="">Màu</option>'+state.colors.map(x=>`<option value="${esc(x.mamau)}">${esc(x.tenmau)}</option>`).join("");
}

function renderSizes(){
  const hasSource=!!state.sourceMasp;
  const hasStock=!!state.sourceStockAfterCheck;
  const box=$("sizeRow");
  box.innerHTML=SIZE_LIST.map(s=>{
    const qty=hasStock?sourceQty(s):0;
    const cls=["size"];
    if(state.size===s)cls.push("on");
    if(hasSource&&hasStock)cls.push(qty>0?"has":"no");
    return `<button type="button" class="${cls.join(" ")}" data-size="${s}" title="${hasSource&&hasStock?`Tồn sau kiểm ${state.diadiem.toUpperCase()}: ${qty}`:""}">${s}</button>`;
  }).join("");

  box.querySelectorAll(".size").forEach(b=>b.onclick=async()=>{
    const selected=b.dataset.size;
    state.size=state.size===selected?"":selected;
    renderSizes();
    if(!state.size){
      if(state.sourceMasp)showSizeWarning();
      clearResults("Chọn size để bắt đầu tìm sản phẩm.");
      return;
    }

    // Mã vừa quét/nhập là sản phẩm đầu tiên khách đang quan tâm:
    // khi xác nhận size, tự đưa mã nguồn vào khu vực Sản phẩm đã chọn.
    if(state.sourceMasp&&state.sourceProduct){
      addSelected(state.sourceMasp,state.size);
    }

    if(state.sourceMasp&&state.sourceStockAfterCheck&&sourceQty(state.size)<=0){
      showMissingSizePrompt(state.size);
      return;
    }
    hideSizeWarning();
    if(state.group)await search(true);
  });
}

function showMissingSizePrompt(size){
  pendingMissingSize=String(size||"");
  const qty=sourceQty(pendingMissingSize);
  const text=$("stockCheckText");
  if(text)text.textContent=`Mã ${state.sourceMasp} hiện không còn tồn size ${pendingMissingSize} tại ${state.diadiem.toUpperCase()} theo tồn sau kiểm (tồn ${qty}). Bạn có muốn kiểm kho cho sản phẩm này không?`;
  const modal=$("stockCheckModal");
  modal?.classList.add("show");
  modal?.setAttribute("aria-hidden","false");
}
function closeMissingSizePrompt(){
  const modal=$("stockCheckModal");
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden","true");
}
function openStockCheckPage(maspRaw){
  const masp=norm(maspRaw);
  if(!masp||!validBranch())return;
  const page=state.diadiem==="cs2"?"kiem_tonkho_cs2.html":"kiem_tonkho_cs1.html";
  const child=window.open(`${location.origin}/${page}`,"_blank");
  if(!child){toast("Trình duyệt đang chặn mở trang kiểm kho.",5000);return}
  let attempts=0;
  const timer=setInterval(()=>{
    attempts++;
    try{
      if(child.closed){clearInterval(timer);return}
      const doc=child.document;
      const input=doc?.getElementById("masp");
      if(input&&doc.readyState==="complete"){
        clearInterval(timer);
        setTimeout(()=>{
          try{
            input.value=masp;
            input.dispatchEvent(new child.Event("input",{bubbles:true}));
            input.dispatchEvent(new child.Event("change",{bubbles:true}));
            input.focus();
            input.dispatchEvent(new child.KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true,cancelable:true}));
          }catch(e){console.warn("[TimKiemNhanh] Không đẩy được mã sang kiểm kho",e)}
        },500);
      }
    }catch(e){
      // Cùng domain app.hoantuyet.vn thì sẽ truy cập được sau khi trang tải xong.
    }
    if(attempts>=60){clearInterval(timer);toast("Đã mở trang kiểm kho nhưng chưa tự điền được mã. Hãy nhập mã thủ công.",5000)}
  },250);
}

function renderGroups(){
  const main=$("mainGroups");
  main.innerHTML=Object.entries(MAIN_GROUPS).map(([k,c])=>{
    const active=k===state.mainGroup;
    const subText=active&&state.group?groupDisplayName(state.group):"";
    return `<button type="button" class="main-group ${active?"on":""}" data-main="${k}">${esc(c.label)}${subText?`<small>${esc(subText)}</small>`:""}</button>`;
  }).join("");

  main.querySelectorAll(".main-group").forEach(b=>b.onclick=async()=>{
    const key=b.dataset.main;
    state.mainGroup=key;
    const cfg=MAIN_GROUPS[key];
    if(!cfg.groups.some(x=>norm(x)===norm(state.group)))state.group=cfg.defaultGroup;
    clearSourceForManualFilter();
    renderGroups();renderSubgroups(true);renderSizes();
    if(state.size)await search(true);else clearResults("Chọn size để bắt đầu tìm sản phẩm.");
  });
  renderSubgroups(false);
}

function renderSubgroups(forceOpen=false){
  const box=$("subGroups"),cfg=MAIN_GROUPS[state.mainGroup];
  if(!cfg){box.innerHTML="";box.classList.remove("show");return}
  const rows=state.groups.filter(g=>cfg.groups.some(x=>norm(x)===norm(g.manhom)));
  const known=new Set(rows.map(x=>norm(x.manhom)));
  if(state.group&&cfg.groups.some(x=>norm(x)===norm(state.group))&&!known.has(norm(state.group))){rows.unshift({manhom:state.group,ten_hien_thi:state.group})}
  box.innerHTML=rows.map(g=>`<button type="button" class="subgroup ${norm(g.manhom)===norm(state.group)?"on":""}" data-group="${esc(g.manhom)}">${esc(g.ten_hien_thi||g.manhom)}</button>`).join("");
  box.classList.toggle("show",forceOpen);
  box.querySelectorAll(".subgroup").forEach(b=>b.onclick=async()=>{
    state.group=b.dataset.group;clearSourceForManualFilter();renderGroups();box.classList.remove("show");renderSizes();
    if(state.size)await search(true);else clearResults("Chọn size để bắt đầu tìm sản phẩm.");
  });
}

function renderModes(){
  document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("on",b.dataset.mode===state.mode));
  $("refPriceBox").classList.toggle("show",["cheaper","premium"].includes(state.mode));
}

function params(offset){return{
  p_diadiem:state.diadiem,p_nhomhang:state.group,p_sizes:state.size?[state.size]:[],
  p_form:state.form||null,p_mausac:state.color||null,p_mode:state.mode,p_reference_price:Number(state.referencePrice||0),
  p_keyword:null,p_source_masp:state.sourceMasp||null,p_offset:offset,p_limit:40,p_den_ngay:businessDate()
}}

function normalizeSizeKey(value){
  const raw=String(value??"").replace(/^size\s+/i,"").trim();
  const m=raw.match(/\d{1,2}/);return m?m[0]:raw;
}

async function fetchAfterCheckStockForMasp(maspRaw,{force=false}={}){
  const masp=norm(maspRaw);if(!masp)return{};
  const denNgay=businessDate();const key=`${masp}|${denNgay}`;
  if(!force&&AFTER_CHECK_CACHE.has(key))return await AFTER_CHECK_CACHE.get(key);

  const promise=(async()=>{
    const [stockRes,checkRes]=await Promise.all([
      supabase.rpc("xntnhanh",{p_masps:[masp],p_den_ngay:denNgay,p_tonghop_size:false}),
      supabase.rpc("rpc_stockquick_kiemton",{p_masp:masp})
    ]);
    if(stockRes?.error)throw stockRes.error;
    if(checkRes?.error)console.warn("[TimKiemNhanh] Không đọc được chênh lệch kiểm",masp,checkRes.error);

    const base={};
    (Array.isArray(stockRes?.data)?stockRes.data:[]).forEach(row=>{
      const s=normalizeSizeKey(row.size);if(!s)return;
      base[s]={ton_cs1:Number(row.ton_cs1||0),ton_cs2:Number(row.ton_cs2||0)};
    });
    const check=checkRes?.data||{};const out={};
    SIZE_LIST.forEach(s=>{
      const b=base[s]||{ton_cs1:0,ton_cs2:0};
      const lech1=Number(check?.cs1?.lech?.[s]||0);const lech2=Number(check?.cs2?.lech?.[s]||0);
      out[s]={
        ton_cs1:Math.max(0,Number(b.ton_cs1||0)+lech1),
        ton_cs2:Math.max(0,Number(b.ton_cs2||0)+lech2)
      };
    });
    return out;
  })();

  AFTER_CHECK_CACHE.set(key,promise);
  try{const result=await promise;AFTER_CHECK_CACHE.set(key,result);return result}catch(e){AFTER_CHECK_CACHE.delete(key);throw e}
}

async function enrichProductsAfterCheck(rows){
  const result=(rows||[]).map(x=>({...x}));
  let cursor=0;const concurrency=Math.min(6,result.length);
  async function worker(){
    while(cursor<result.length){
      const i=cursor++;const sp=result[i];
      try{sp.ton_sizes=await fetchAfterCheckStockForMasp(sp.masp)}catch(e){console.warn("[TimKiemNhanh] Lỗi tồn sau kiểm",sp.masp,e)}
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  return result;
}

async function search(reset=true){
  if(!validBranch()){toast("Không xác định được cơ sở đăng nhập. Hãy đăng nhập lại.",5000);return}
  if(!state.group||!state.size||state.loading)return;
  const off=reset?0:state.offset;
  if(reset){state.offset=0;state.products=[];$("productList").innerHTML=""}
  setLoading(true);
  try{
    const {data,error}=await supabase.rpc("sales_copilot_tim_san_pham_v1111",params(off));if(error)throw error;
    const raw=(data||[]).map(x=>({...x}));
    state.total=Number(raw[0]?.total_count||state.total||0);
    const checked=await enrichProductsAfterCheck(raw);
    const rows=checked.filter(sp=>stockFor(sp,state.size)>0);
    state.products=reset?rows:state.products.concat(rows);
    state.offset=off+raw.length;
    renderProducts();
    $("resultCount").textContent=`${state.products.length}/${state.total||state.products.length}`;
    $("btnMore").style.display=state.offset<state.total?"block":"none";
  }catch(e){console.error(e);toast("Lỗi tìm sản phẩm: "+(e.message||e),5000)}finally{setLoading(false)}
}

function openImage(src,alt=""){
  const overlay=$("imageOverlay"),img=$("imageOverlayImg");
  img.src=src;img.alt=alt;overlay.classList.add("show");document.body.classList.add("image-open");
}
function closeImage(){$("imageOverlay").classList.remove("show");$("imageOverlayImg").src="";document.body.classList.remove("image-open")}

function renderProducts(){
  const box=$("productList");
  if(!state.products.length){box.innerHTML='<div class="empty" style="grid-column:1/-1">Không có sản phẩm còn đúng size tại cơ sở này theo tồn sau kiểm.</div>';return}
  box.innerHTML=state.products.map(sp=>{
    const av=availableSizes(sp);const img=`${IMAGE_BASE}${encodeURIComponent(norm(sp.masp))}.JPG`;
    return `<article class="product" data-card="${esc(sp.masp)}"><div class="product-image-wrap"><img class="product-image" loading="lazy" decoding="async" src="${img}" alt="${esc(sp.masp)}" onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'"></div><div class="pb"><button type="button" class="stock-link" data-stock="${esc(sp.masp)}">${esc(sp.masp)}</button><div class="price">${money(sp.giale)} đ</div><div class="meta">${esc(formLabel(sp.form)||"-")} · Còn size: <b>${esc(av.join(" ")||"-")}</b></div><button type="button" class="pick" data-pick="${esc(sp.masp)}">Chọn</button><div class="pick-sizes" data-sizes="${esc(sp.masp)}">${SIZE_LIST.map(s=>`<button type="button" class="pick-size ${stockFor(sp,s)>0?"has":"no"}" data-add="${esc(sp.masp)}" data-size="${s}" ${stockFor(sp,s)>0?"":"disabled"}>${s}</button>`).join("")}</div></div></article>`;
  }).join("");
  box.querySelectorAll(".stock-link").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.stock));
  box.querySelectorAll(".product-image").forEach(img=>img.onclick=e=>{e.preventDefault();e.stopPropagation();openImage(img.src,img.alt)});
  box.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{const el=box.querySelector(`[data-sizes="${CSS.escape(b.dataset.pick)}"]`);el?.classList.toggle("show")});
  box.querySelectorAll(".pick-size").forEach(b=>b.onclick=()=>{if(!b.disabled)addSelected(b.dataset.add,b.dataset.size)});
}

function addSelected(masp,size){
  const sp=state.products.find(x=>norm(x.masp)===norm(masp))||state.sourceProduct;if(!sp)return;
  if(state.selected.some(x=>norm(x.masp)===norm(masp)&&String(x.size)===String(size))){toast("Mã + size này đã có trong Sản phẩm đã chọn.");scrollSelectedIntoView();return}
  state.selected=[{id:`${Date.now()}_${Math.random().toString(36).slice(2,7)}`,masp:sp.masp,size:String(size),soluong:1,giale:sp.giale,form:sp.form,mausac:sp.mausac},...state.selected];
  saveSelected();renderSelected();toast(`Đã chọn ${sp.masp} / ${size}`);scrollSelectedIntoView();
}
function jumpToElement(el,block="start"){
  if(!el)return;
  const root=document.documentElement;
  const prev=root.style.scrollBehavior;
  root.style.scrollBehavior="auto";
  el.scrollIntoView({behavior:"auto",block});
  requestAnimationFrame(()=>{root.style.scrollBehavior=prev});
}
function scrollSelectedIntoView(){setTimeout(()=>jumpToElement($("selectedSection"),"start"),0)}
function scrollToProduct(masp){
  const card=$("productList").querySelector(`[data-card="${CSS.escape(String(masp))}"]`);
  if(!card){toast("Sản phẩm này không còn trong danh sách kết quả hiện tại.",3800);return}
  jumpToElement(card,"center");
  card.classList.add("product-focus");setTimeout(()=>card.classList.remove("product-focus"),1600);
}

function renderSelected(){
  const box=$("selectedList");$("selectedCount").textContent=`${state.selected.length} sản phẩm`;
  if(!state.selected.length){box.innerHTML='<div class="empty selected-empty">Chưa chọn sản phẩm.</div>';return}
  box.innerHTML=state.selected.map(r=>`<div class="selected-item"><div class="sel-line"><button type="button" class="sel-code" data-sel-stock="${esc(r.masp)}">${esc(r.masp)}</button><span class="sel-size">Size ${esc(r.size)}</span></div><div class="sel-actions"><button type="button" class="continue" data-continue="${esc(r.masp)}">Tìm tiếp</button><button type="button" class="remove" data-remove="${esc(r.id)}">Bỏ</button><button type="button" class="sale" data-sale="${esc(r.id)}">Sang bán</button></div></div>`).join("");
  box.querySelectorAll("[data-sel-stock]").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.selStock));
  box.querySelectorAll("[data-continue]").forEach(b=>b.onclick=()=>scrollToProduct(b.dataset.continue));
  box.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{state.selected=state.selected.filter(x=>String(x.id)!==String(b.dataset.remove));saveSelected();renderSelected()});
  box.querySelectorAll("[data-sale]").forEach(b=>b.onclick=()=>pushOneToSale(b.dataset.sale));
}

function waitAck(id,timeout=12000){return new Promise(resolve=>{const start=Date.now();const t=setInterval(()=>{try{const a=JSON.parse(localStorage.getItem(ACK_KEY)||"null");if(a?.id===id){clearInterval(t);return resolve(a)}}catch{}if(Date.now()-start>timeout){clearInterval(t);resolve(null)}},180)})}
async function pushOneToSale(id){
  const row=state.selected.find(x=>String(x.id)===String(id));if(!row)return;
  if(!validBranch()){toast("Không xác định được cơ sở bán.",5000);return}
  const payloadId=`TKN_${Date.now()}_${row.masp}_${row.size}`;
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
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>processCode(b.dataset.code));
}

async function processCode(raw){
  const code=norm(raw);if(!code||state.loading)return;
  if(!validBranch()){toast("Không xác định được cơ sở đăng nhập. Hãy đăng nhập lại.",6000);return}
  setLoading(true);
  try{
    const {data,error}=await supabase.rpc("sales_copilot_lay_san_pham_theo_ma_v1111",{p_masp:code,p_den_ngay:businessDate()});
    if(error)throw error;const sp=(data||[])[0];if(!sp){toast("Mã sản phẩm không tồn tại.");return}

    $("codeInput").value=sp.masp;$("suggestBox").style.display="none";
    state.sourceMasp=sp.masp;state.sourceProduct={...sp};state.group=String(sp.nhomhang||"").trim();state.mainGroup=mainKeyForGroup(state.group);
    state.form=formNorm(sp.form);state.color=String(sp.mausac||"").trim();state.referencePrice=Number(sp.giale||0);state.size="";
    state.sourceStockAfterCheck=null;
    $("formSelect").value=state.form||"";$("colorSelect").value=state.color||"";$("refPrice").value=state.referencePrice||"";
    renderGroups();renderSizes();clearResults("Đang đọc tồn sau kiểm của mã vừa quét...");

    const stock=await fetchAfterCheckStockForMasp(sp.masp,{force:true});
    state.sourceStockAfterCheck=stock;state.sourceProduct.ton_sizes=stock;renderSizes();
    const any=SIZE_LIST.some(s=>sourceQty(s)>0);
    if(any){showSizeWarning("Chọn size để tìm sản phẩm phù hợp");clearResults("Chọn size để bắt đầu tìm sản phẩm. Size nền vàng đang còn tồn sau kiểm.")}
    else{showSizeWarning(`Mã này hiện không còn size tồn tại ${state.diadiem.toUpperCase()} theo tồn sau kiểm. Bạn vẫn có thể chọn size cần tìm.`);clearResults("Chọn size cần tìm; hệ thống có thể gợi ý kiểm kho trước khi tìm sản phẩm khác.")}
    playSuccessBeep();$("codeInput").blur();
  }catch(e){console.error(e);toast("Không lấy được mã sản phẩm: "+(e.message||e),5000)}finally{setLoading(false)}
}

function clearSourceForManualFilter(){
  state.sourceMasp="";state.sourceProduct=null;state.sourceStockAfterCheck=null;hideSizeWarning();
}

function bind(){
  setupBeepUnlockOnce(document);
  $("codeInput").addEventListener("input",e=>{clearTimeout(suggestTimer);suggestTimer=setTimeout(()=>loadSuggestions(e.target.value),150)});
  $("codeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();processCode(e.currentTarget.value)}});
  document.addEventListener("click",e=>{if(!e.target.closest(".codebox"))$("suggestBox").style.display="none"});
  $("formSelect").onchange=async e=>{state.form=e.target.value;clearSourceForManualFilter();renderSizes();if(state.group&&state.size)await search(true)};
  $("colorSelect").onchange=async e=>{state.color=e.target.value;clearSourceForManualFilter();renderSizes();if(state.group&&state.size)await search(true)};
  document.querySelectorAll(".mode").forEach(b=>b.onclick=async()=>{state.mode=b.dataset.mode;renderModes();if(state.group&&state.size)await search(true)});
  $("refPrice").onchange=async e=>{state.referencePrice=Number(e.target.value||0);if(state.group&&state.size)await search(true)};
  $("btnMore").onclick=()=>search(false);
  $("btnScan").onclick=async()=>{$("scanOverlay").classList.add("show");await state.scanner.startScan()};
  $("btnCloseScan").onclick=()=>{state.scanner.stopScan();$("scanOverlay").classList.remove("show")};
  $("flashBtn").onclick=()=>state.scanner.toggleTorch();
  $("pickImage").onchange=e=>state.scanner.decodeFromFile(e.target.files?.[0]);
  $("btnStockCheckLater").onclick=async()=>{
    closeMissingSizePrompt();
    hideSizeWarning();
    if(state.group&&state.size)await search(true);
  };
  $("btnStockCheckYes").onclick=()=>{
    closeMissingSizePrompt();
    openStockCheckPage(state.sourceMasp);
  };
  $("stockCheckModal").addEventListener("click",e=>{if(e.target===$("stockCheckModal"))closeMissingSizePrompt()});
  $("imageOverlay").onclick=closeImage;
}

async function initScanner(){
  state.scanner=setupScanner({videoEl:$("scanVideo"),selectEl:$("cameraSelect"),statusEl:$("scanStatus"),onResult:async text=>{state.scanner.stopScan();$("scanOverlay").classList.remove("show");await processCode(text)}})
}

let appStarted=false;
async function startApp(){
  if(appStarted)return;
  appStarted=true;
  refreshAuthState();
  loadSelected();renderSelected();renderSizes();renderModes();clearResults("Quét mã hoặc nhập mã sản phẩm rồi nhấn Enter để bắt đầu.");
  try{
    if(!validBranch())throw new Error("Không xác định được CS1/CS2 từ phiên đăng nhập.");
    await loadConfig();renderGroups();bind();await initScanner();
    setTimeout(()=>$("codeInput")?.focus(),50);
  }catch(e){
    appStarted=false;
    console.error(e);
    toast("Không khởi tạo được Tìm kiếm nhanh: "+(e.message||e),7000);
  }
}

khoiTaoDangNhapDungChung({
  loginContainerId:"login-container",
  appContainerId:"app-container",
  macDinhDiaDiem:"cs1",
  tuDongKhoaCoSo:false,
  onLoginSuccess:async()=>{
    refreshAuthState();
    await startApp();
    return true;
  }
});
