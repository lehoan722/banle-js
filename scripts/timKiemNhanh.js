import { getSupabaseClient, khoiTaoDangNhapDungChung } from "./authModule.js";
import { setupScanner } from "./scanner.js";
import { playSuccessBeep, setupBeepUnlockOnce } from "./soundBeep.js";
import { initYeuCauBayMau } from "./yeuCauBayMau.js?v=3";

window.TIM_KIEM_NHANH_BUILD = "1.2.11";
console.log("[TimKiemNhanh] BUILD 1.2.11");

const supabase = getSupabaseClient();

const SIZE_LIST=["38","39","40","41","42","43","44","45","46"];
const SIZE_CONVERSION={
  "38":["38","2","S","46","240","165"],
  "39":["39","3","M","48","245","170"],
  "40":["40","4","L","50","250","175"],
  "41":["41","5","XL","52","255","180"],
  "42":["42","6","2XL","54","260","185"],
  "43":["43","7","3XL","56","265","190"],
  "44":["44","8","4XL","58","270","195"],
  "45":["45","9","5XL","60","275","200"],
  "46":["46","10","6XL","62","280","205"]
};
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
  sourceMasp:"",sourceProduct:null,sourceStockAfterCheck:null,sizeGuideOpen:false,products:[],offset:0,total:0,loading:false,selected:[],scanner:null
};

function refreshAuthState(){
  state.manv=String(localStorage.getItem("manv")||"").trim();
  state.tennv=String(localStorage.getItem("tennv")||"").trim();
  state.diadiem=String(localStorage.getItem("diadiem")||"").trim().toLowerCase();
  const info=$("nvInfo");
  if(info)info.textContent=`V1.2.9 · ${state.tennv||state.manv||"Chưa đăng nhập"} · ${validBranch()?state.diadiem.toUpperCase():"CHƯA CÓ CS"}`;
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
function setLoading(v,visual=true){
  state.loading=!!v;
  if(visual)document.body.classList.toggle("loading",!!v);
  else if(!v)document.body.classList.remove("loading");
  const auto=$("autoLoadStatus");
  if(auto)auto.classList.toggle("show",!!v&&!visual);
}
function stockFor(sp,size){const x=sp?.ton_sizes?.[String(size)]||{};return Number(state.diadiem==="cs2"?x.ton_cs2:x.ton_cs1)||0}
function availableSizes(sp){return SIZE_LIST.filter(s=>stockFor(sp,s)>0)}
function compactFormSizes(sp){
  const form=formLabel(sp?.form)||"-";
  const sizes=availableSizes(sp);
  return `${form} . ${sizes.join(" ")||"-"}`;
}
function locationParts(sp){
  if(!sp)return {kho:"",mau:""};
  const isCs2=state.diadiem==="cs2";
  return {
    kho:String((isCs2?sp.vitrikho2:sp.vitrikho1)||"").trim(),
    mau:String((isCs2?sp.treomaucs2:sp.treomaucs1)||"").trim()
  };
}
function locationText(sp){
  const {kho,mau}=locationParts(sp);
  const parts=[];
  if(kho)parts.push(`Kho: ${kho}`);
  if(mau)parts.push(`Mẫu: ${mau}`);
  return parts.join(", ");
}
function renderSourceLocation(){
  const el=$("sourceLocation");
  if(!el)return;
  if(!state.sourceMasp){
    el.textContent="";
    el.classList.remove("show");
    el.removeAttribute("data-stock");
    return;
  }
  const {kho,mau}=locationParts(state.sourceProduct);
  el.innerHTML=`<span class="source-kho">KHO: ${esc((kho||"-").toUpperCase())}</span>   <span class="source-mau">MẪU: ${esc((mau||"-").toUpperCase())}</span>`;
  el.dataset.stock=state.sourceMasp;
  el.classList.add("show");
}
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

  // Sau khi quét/Enter mã: bung bảng quy đổi 9 cột x 6 dòng để nhân viên chọn đúng size.
  if(state.sizeGuideOpen&&hasSource&&hasStock&&!state.size){
    box.classList.add("guide-open");
    box.innerHTML=SIZE_LIST.map(s=>{
      const qty=sourceQty(s);
      const vals=SIZE_CONVERSION[s]||[s,"-","-","-","-","-"];
      return `<button type="button" class="size-guide-col ${qty>0?"has":"no"}" data-size="${s}" title="Tồn sau kiểm ${state.diadiem.toUpperCase()}: ${qty}">${vals.map((v,i)=>`<span class="size-guide-cell">${esc(i===0&&qty>0?`${v}.${qty}`:v)}</span>`).join("")}</button>`;
    }).join("");
    box.querySelectorAll(".size-guide-col").forEach(b=>b.onclick=()=>selectSizeFromUi(b.dataset.size,true));
    return;
  }

  box.classList.remove("guide-open");
  box.innerHTML=SIZE_LIST.map(s=>{
    const qty=hasStock?sourceQty(s):0;
    const cls=["size"];
    if(state.size===s)cls.push("on");
    if(hasSource&&hasStock)cls.push(qty>0?"has":"no");
    return `<button type="button" class="${cls.join(" ")}" data-size="${s}" title="${hasSource&&hasStock?`Tồn sau kiểm ${state.diadiem.toUpperCase()}: ${qty}`:""}">${s}</button>`;
  }).join("");
  box.querySelectorAll(".size").forEach(b=>b.onclick=()=>selectSizeFromUi(b.dataset.size,false));
}

async function selectSizeFromUi(selected,fromGuide=false){
  selected=String(selected||"");
  if(!SIZE_LIST.includes(selected))return;

  // Trong bảng quy đổi: chạm cột là xác nhận luôn. Ở hàng gọn: bấm lại size đang chọn thì bỏ chọn như trước.
  state.size=fromGuide?selected:(state.size===selected?"":selected);
  state.sizeGuideOpen=false;
  renderSizes();

  if(!state.size){
    if(state.sourceMasp)showSizeWarning();
    return;
  }

  // Mã vừa quét/nhập là sản phẩm đầu tiên khách đang quan tâm.
  if(state.sourceMasp&&state.sourceProduct){
    addSelected(state.sourceMasp,state.size);
  }

  if(state.sourceMasp&&state.sourceStockAfterCheck&&sourceQty(state.size)<=0){
    showMissingSizePrompt(state.size);
    return;
  }
  hideSizeWarning();
  if(state.group)await search(true);
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
    if(state.size)await search(true);
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
    if(state.size)await search(true);
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

  // Quan trọng: tìm mới không xóa bảng cũ trước khi RPC thành công.
  // Chỉ khi đã nhận/xử lý được bộ kết quả mới mới thay bảng đang xem.
  setLoading(true,reset);
  try{
    const {data,error}=await supabase.rpc("sales_copilot_tim_san_pham_v1111",params(off));if(error)throw error;
    const raw=(data||[]).map(x=>({...x}));
    const nextTotal=Number(raw[0]?.total_count||(reset?0:state.total)||0);
    const checked=await enrichProductsAfterCheck(raw);
    const rows=checked.filter(sp=>stockFor(sp,state.size)>0);

    if(reset){
      state.products=rows;
      state.offset=raw.length;
      state.total=nextTotal;
    }else{
      state.products=state.products.concat(rows);
      state.offset=off+raw.length;
      state.total=nextTotal||state.total;
    }

    renderProducts({reset,rows});
    $("resultCount").textContent=`${state.products.length}/${state.total||state.products.length}`;
    $("btnMore").style.display="none";
  }catch(e){
    console.error(e);
    toast("Lỗi tìm sản phẩm: "+(e.message||e),5000);
  }finally{
    setLoading(false,reset);
    requestAnimationFrame(maybeAutoLoadMore);
  }
}
function openImage(src,alt=""){
  const overlay=$("imageOverlay"),img=$("imageOverlayImg");
  img.src=src;img.alt=alt;overlay.classList.add("show");document.body.classList.add("image-open");
}
function closeImage(){$("imageOverlay").classList.remove("show");$("imageOverlayImg").src="";document.body.classList.remove("image-open")}

function productCardHtml(sp,orderNo=0,totalNo=0){
  const img=`${IMAGE_BASE}${encodeURIComponent(norm(sp.masp))}.JPG`;
  const {kho,mau}=locationParts(sp);
  const formSizes=compactFormSizes(sp);
  const orderText=orderNo>0?`${orderNo}/${totalNo||orderNo}`:"";
  return `<article class="product" data-card="${esc(sp.masp)}"><div class="product-image-wrap"><img class="product-image" loading="lazy" decoding="async" src="${img}" alt="${esc(sp.masp)}" onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'"></div><div class="pb"><button type="button" class="stock-link" data-stock="${esc(sp.masp)}">${esc(sp.masp)}</button><div class="product-info-line product-meta">${esc(formSizes)}</div><div class="product-info-line product-kho">Kho: ${esc(kho||"-")}</div><div class="product-info-line product-mau">Mẫu: ${esc(mau||"-")}</div><div class="price-row"><div class="price">${money(sp.giale)} đ</div><div class="product-order">${esc(orderText)}</div></div><button type="button" class="pick" data-pick="${esc(sp.masp)}">Chọn</button><div class="pick-sizes" data-sizes="${esc(sp.masp)}">${SIZE_LIST.map(s=>`<button type="button" class="pick-size ${stockFor(sp,s)>0?"has":"no"}" data-add="${esc(sp.masp)}" data-size="${s}" ${stockFor(sp,s)>0?"":"disabled"}>${s}</button>`).join("")}</div></div></article>`;
}
function bindProductCards(cards){
  cards.forEach(card=>{
    card.querySelectorAll(".stock-link").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.stock));
    card.querySelectorAll(".product-image").forEach(img=>img.onclick=e=>{e.preventDefault();e.stopPropagation();openImage(img.src,img.alt)});
    card.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{const el=card.querySelector(`[data-sizes="${CSS.escape(b.dataset.pick)}"]`);el?.classList.toggle("show")});
    card.querySelectorAll(".pick-size").forEach(b=>b.onclick=()=>{if(!b.disabled)addSelected(b.dataset.add,b.dataset.size)});
  });
}
function renderProducts({reset=true,rows=[]}={}){
  const box=$("productList");
  if(reset){
    if(!state.products.length){box.innerHTML='<div class="empty" style="grid-column:1/-1">Không có sản phẩm còn đúng size tại cơ sở này theo tồn sau kiểm.</div>';return}
    box.innerHTML=state.products.map((sp,i)=>productCardHtml(sp,i+1,state.total||state.products.length)).join("");
    bindProductCards(Array.from(box.querySelectorAll(".product")));
    return;
  }
  if(!rows.length)return;
  box.querySelector(".empty")?.remove();
  const holder=document.createElement("div");
  const startNo=Math.max(0,state.products.length-rows.length);
  holder.innerHTML=rows.map((sp,i)=>productCardHtml(sp,startNo+i+1,state.total||state.products.length)).join("");
  const cards=Array.from(holder.children);
  cards.forEach(card=>box.appendChild(card));
  bindProductCards(cards);
}

let autoLoadObserver=null;
function maybeAutoLoadMore(){
  if(state.loading||!state.group||!state.size||state.offset>=state.total)return;
  const sentinel=$("loadMoreSentinel");if(!sentinel)return;
  const rect=sentinel.getBoundingClientRect();
  if(rect.top<=window.innerHeight+1200)search(false);
}
function initAutoLoad(){
  const sentinel=$("loadMoreSentinel");if(!sentinel)return;
  if("IntersectionObserver" in window){
    autoLoadObserver?.disconnect?.();
    autoLoadObserver=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting))maybeAutoLoadMore();
    },{root:null,rootMargin:"1200px 0px",threshold:0});
    autoLoadObserver.observe(sentinel);
  }else{
    window.addEventListener("scroll",maybeAutoLoadMore,{passive:true});
  }
}
let pageJumpTicking=false;
function isNearPageTop(){
  return (window.scrollY||document.documentElement.scrollTop||0) <= 80;
}
function updatePageJumpButton(){
  const btn=$("pageJumpBtn");if(!btn)return;
  const goBottom=isNearPageTop();
  btn.textContent=goBottom?"↓":"↑";
  btn.title=goBottom?"Cuối trang":"Đầu trang";
  btn.setAttribute("aria-label",goBottom?"Đi đến cuối trang":"Trở về đầu trang");
}
function jumpPageEdge(){
  const goBottom=isNearPageTop();
  const root=document.documentElement;
  const prev=root.style.scrollBehavior;root.style.scrollBehavior="auto";
  if(goBottom){window.scrollTo({top:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight),behavior:"auto"});}
  else{window.scrollTo({top:0,behavior:"auto"});}
  requestAnimationFrame(()=>{root.style.scrollBehavior=prev;updatePageJumpButton();});
}
function initPageJump(){
  const btn=$("pageJumpBtn");if(!btn)return;
  btn.addEventListener("click",jumpPageEdge);
  window.addEventListener("scroll",()=>{
    if(pageJumpTicking)return;pageJumpTicking=true;
    requestAnimationFrame(()=>{pageJumpTicking=false;updatePageJumpButton();});
  },{passive:true});
  updatePageJumpButton();
}

function addSelected(masp,size){
  const sp=state.products.find(x=>norm(x.masp)===norm(masp))||state.sourceProduct;if(!sp)return;
  if(state.selected.some(x=>norm(x.masp)===norm(masp)&&String(x.size)===String(size))){toast("Mã + size này đã có trong Sản phẩm đã chọn.");scrollSelectedIntoView();return}
  state.selected=[...state.selected,{id:`${Date.now()}_${Math.random().toString(36).slice(2,7)}`,masp:sp.masp,size:String(size),soluong:1,giale:sp.giale,form:sp.form,mausac:sp.mausac,treomaucs1:sp.treomaucs1,treomaucs2:sp.treomaucs2,vitrikho1:sp.vitrikho1,vitrikho2:sp.vitrikho2,ton_sizes:sp.ton_sizes||{}}];
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

function resetToInitialState(){
  closeMissingSizePrompt();
  try{state.scanner?.stopScan?.()}catch{}
  $("scanOverlay")?.classList.remove("show");
  $("suggestBox").style.display="none";
  $("codeInput").value="";
  state.mainGroup="";state.group="";state.form="";state.color="";state.size="";
  state.mode="similar";state.referencePrice=0;state.sourceMasp="";state.sourceProduct=null;state.sourceStockAfterCheck=null;state.sizeGuideOpen=false;
  state.products=[];state.offset=0;state.total=0;state.loading=false;
  state.selected=[];saveSelected();
  $("formSelect").value="";$("colorSelect").value="";$("refPrice").value="";
  hideSizeWarning();renderSourceLocation();renderSelected();renderSizes();renderGroups();renderModes();
  clearResults("Quét mã hoặc nhập mã sản phẩm rồi nhấn Enter để bắt đầu.");
  jumpToElement($("selectedSection"),"start");
  setTimeout(()=>$("codeInput")?.focus(),0);
  toast("Đã tạo lượt tìm kiếm mới.");
}

async function researchSelected(id){
  const row=state.selected.find(x=>String(x.id)===String(id));
  if(!row)return;
  await processCode(row.masp,{preselectedSize:String(row.size||""),autoSearch:true});
  jumpToElement(document.querySelector("main.wrap > section.card:not(#selectedSection)"),"start");
}

function renderSelected(){
  const box=$("selectedList");$("selectedCount").textContent=`${state.selected.length} sản phẩm`;
  if(!state.selected.length){box.innerHTML='<div class="empty selected-empty">Chưa chọn sản phẩm.</div>';return}
  box.innerHTML=state.selected.map(r=>{
    const {kho,mau}=locationParts(r);
    const formSizes=compactFormSizes(r);
    return `<div class="selected-item"><div class="sel-line"><button type="button" class="sel-code" data-sel-stock="${esc(r.masp)}">${esc(r.masp)}</button><span class="sel-size">Size ${esc(r.size)}</span></div><div class="selected-info-line"><span class="selected-kho">Kho: ${esc(kho||"-")}</span><span class="selected-mau">Mẫu: ${esc(mau||"-")}</span><span class="selected-formstock">${esc(formSizes)}</span></div><div class="sel-actions"><button type="button" class="continue" data-continue="${esc(r.masp)}">Tìm tiếp</button><button type="button" class="research" data-research="${esc(r.id)}">Tìm lại</button><button type="button" class="remove" data-remove="${esc(r.id)}">Bỏ</button><button type="button" class="sale" data-sale="${esc(r.id)}">Sang bán</button></div></div>`
  }).join("");
  box.querySelectorAll("[data-sel-stock]").forEach(b=>b.onclick=e=>window.StockQuick?.showFor(e.currentTarget,b.dataset.selStock));
  box.querySelectorAll("[data-research]").forEach(b=>b.onclick=()=>researchSelected(b.dataset.research));
  box.querySelectorAll("[data-continue]").forEach(b=>b.onclick=()=>scrollToProduct(b.dataset.continue));
  box.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{state.selected=state.selected.filter(x=>String(x.id)!==String(b.dataset.remove));saveSelected();renderSelected()});
  box.querySelectorAll("[data-sale]").forEach(b=>b.onclick=()=>pushOneToSale(b.dataset.sale));
}

function saleBridgeName(){return `BAN_NV_HOAN_TUYET_${state.diadiem.toUpperCase()}`}
function saleBridgeChannelName(){return `sales_copilot_bridge_v2_${state.diadiem}`}
function waitAck(id,timeout=20000){
  return new Promise(resolve=>{
    let finished=false;
    let channel=null;
    const finish=value=>{
      if(finished)return;finished=true;
      clearInterval(timer);clearTimeout(timeoutTimer);
      window.removeEventListener("storage",onStorage);
      try{channel?.close()}catch{}
      resolve(value);
    };
    const check=value=>{
      try{
        const ack=typeof value==="string"?JSON.parse(value):value;
        if(ack?.id===id)finish(ack);
      }catch{}
    };
    const onStorage=event=>{if(event.key===ACK_KEY&&event.newValue)check(event.newValue)};
    window.addEventListener("storage",onStorage);
    try{
      channel=new BroadcastChannel(saleBridgeChannelName());
      channel.onmessage=event=>{if(event?.data?.type==="ACK")check(event.data.ack)};
    }catch{}
    const timer=setInterval(()=>check(localStorage.getItem(ACK_KEY)),200);
    const timeoutTimer=setTimeout(()=>finish(null),timeout);
    check(localStorage.getItem(ACK_KEY));
  });
}
async function pushOneToSale(id){
  const row=state.selected.find(x=>String(x.id)===String(id));if(!row)return;
  if(!validBranch()){toast("Không xác định được cơ sở bán.",5000);return}
  const payloadId=`TKN_${Date.now()}_${row.masp}_${row.size}`;
  const payload={id:payloadId,created_at:new Date().toISOString(),phien_id:null,diadiem:state.diadiem,makh:null,tenkh:null,items:[{masp:row.masp,size:row.size,soluong:Number(row.soluong||1)}]};
  const ackPromise=waitAck(payloadId);
  localStorage.removeItem(PENDING_KEY);localStorage.removeItem(ACK_KEY);localStorage.setItem(PENDING_KEY,JSON.stringify(payload));
  try{
    const signalChannel=new BroadcastChannel(saleBridgeChannelName());
    signalChannel.postMessage({type:"PENDING",payload});
    setTimeout(()=>signalChannel.close(),1000);
  }catch{}
  const saleWindow=window.open(state.diadiem==="cs2"?"/bannvcs2.html":"/bannvcs1.html",saleBridgeName());
  try{saleWindow?.focus()}catch{}
  toast("Đã gửi sang trang bán. Đang chờ trang bán xác nhận...");
  const ack=await ackPromise;
  if(!ack){toast("Trang bán chưa xác nhận. Hãy chuyển sang tab bán để nhận sản phẩm.",7000);return}
  toast(`Đã đưa ${row.masp} / ${row.size} sang trang bán.`)
}

let suggestTimer=null;
async function loadSuggestions(text){
  const q=String(text||"").trim();if(!q){$("suggestBox").style.display="none";return}
  const {data,error}=await supabase.rpc("sales_copilot_goi_y_ma_v1111",{p_text:q,p_limit:12});if(error)return;
  const box=$("suggestBox");box.innerHTML=(data||[]).map(x=>`<button type="button" data-code="${esc(x.masp)}"><b>${esc(x.masp)}</b><small>${esc(x.tensp||"")}</small></button>`).join("");box.style.display=(data||[]).length?"block":"none";
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>processCode(b.dataset.code));
}

async function processCode(raw,options={}){
  const code=norm(raw);if(!code||state.loading)return;
  if(!validBranch()){toast("Không xác định được cơ sở đăng nhập. Hãy đăng nhập lại.",6000);return}
  // Đọc mã nguồn là thao tác xem nhanh: không làm mờ/xóa bảng kết quả hiện tại.
  setLoading(true,false);
  try{
    const {data,error}=await supabase.rpc("sales_copilot_lay_san_pham_theo_ma_v1111",{p_masp:code,p_den_ngay:businessDate()});
    if(error)throw error;const sp=(data||[])[0];if(!sp){toast("Mã sản phẩm không tồn tại.");return}

    $("codeInput").value=sp.masp;$("suggestBox").style.display="none";
    state.sourceMasp=sp.masp;state.sourceProduct={...sp};state.group=String(sp.nhomhang||"").trim();state.mainGroup=mainKeyForGroup(state.group);
    state.form=formNorm(sp.form);state.color=String(sp.mausac||"").trim();state.referencePrice=Number(sp.giale||0);state.size=SIZE_LIST.includes(String(options.preselectedSize||""))?String(options.preselectedSize):"";
    state.sourceStockAfterCheck=null;state.sizeGuideOpen=false;
    $("formSelect").value=state.form||"";$("colorSelect").value=state.color||"";$("refPrice").value=state.referencePrice||"";
    renderSourceLocation();renderGroups();renderSizes();

    const stock=await fetchAfterCheckStockForMasp(sp.masp,{force:true});
    state.sourceStockAfterCheck=stock;state.sourceProduct.ton_sizes=stock;state.sizeGuideOpen=!(options.autoSearch&&state.size);renderSizes();
    if(options.autoSearch&&state.size){
      hideSizeWarning();
      // processCode đang giữ loading=true; nhả khóa trước khi gọi search().
      setLoading(false);
      await search(true);
    }else{
      const any=SIZE_LIST.some(s=>sourceQty(s)>0);
      if(any){
        showSizeWarning("Chọn size để tìm sản phẩm phù hợp");
      }else{
        showSizeWarning(`Mã này hiện không còn size tồn tại ${state.diadiem.toUpperCase()} theo tồn sau kiểm. Bạn vẫn có thể chọn size cần tìm.`);
      }
    }
    playSuccessBeep();$("codeInput").blur();
  }catch(e){console.error(e);toast("Không lấy được mã sản phẩm: "+(e.message||e),5000)}finally{setLoading(false)}
}

function clearSourceForManualFilter(){
  state.sourceMasp="";state.sourceProduct=null;state.sourceStockAfterCheck=null;state.sizeGuideOpen=false;hideSizeWarning();renderSourceLocation();
}

function bind(){
  setupBeepUnlockOnce(document);
  $("btnNew").onclick=resetToInitialState;
  $("codeInput").addEventListener("input",e=>{clearTimeout(suggestTimer);suggestTimer=setTimeout(()=>loadSuggestions(e.target.value),150)});
  $("codeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();processCode(e.currentTarget.value)}});
  $("sourceLocation").onclick=e=>{
    const masp=state.sourceMasp||norm($("codeInput")?.value);
    if(masp)window.StockQuick?.showFor(e.currentTarget,masp);
  };
  $("sourceLocation").onkeydown=e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();e.currentTarget.click()}
  };
  document.addEventListener("click",e=>{if(!e.target.closest(".codebox"))$("suggestBox").style.display="none"});
  $("formSelect").onchange=async e=>{state.form=e.target.value;clearSourceForManualFilter();renderSizes();if(state.group&&state.size)await search(true)};
  $("colorSelect").onchange=async e=>{state.color=e.target.value;clearSourceForManualFilter();renderSizes();if(state.group&&state.size)await search(true)};
  document.querySelectorAll(".mode").forEach(b=>b.onclick=async()=>{state.mode=b.dataset.mode;renderModes();if(state.group&&state.size)await search(true)});
  $("refPrice").onchange=async e=>{state.referencePrice=Number(e.target.value||0);if(state.group&&state.size)await search(true)};
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
  initAutoLoad();
  initPageJump();
}

async function initScanner(){
  state.scanner=setupScanner({videoEl:$("scanVideo"),selectEl:$("cameraSelect"),statusEl:$("scanStatus"),onResult:async text=>{state.scanner.stopScan();$("scanOverlay").classList.remove("show");await processCode(text)}})
}

let appStarted=false;
async function startApp(){
  if(appStarted)return;
  appStarted=true;
  refreshAuthState();
  loadSelected();renderSourceLocation();renderSelected();renderSizes();renderModes();clearResults("Quét mã hoặc nhập mã sản phẩm rồi nhấn Enter để bắt đầu.");
  try{
    if(!validBranch())throw new Error("Không xác định được CS1/CS2 từ phiên đăng nhập.");
    await loadConfig();renderGroups();bind();await initScanner();
    initYeuCauBayMau({
      supabase,
      diadiem: state.diadiem,
      manvDangNhap: state.manv
    });
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
