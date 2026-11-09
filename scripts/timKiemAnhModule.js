// ============================================================
// HOAN TUYET - TIM KIEM BANG ANH MODULE V1.0
// Tich hop vao timkiemnhanh_v2 ma KHONG sua loi logic tim kiem cu.
// Browser: SigLIP ONNX q8 -> vector 768 -> Supabase pgvector RPC.
// ============================================================

import { getSupabaseClient } from "./authModule.js";

const BUILD = "VISUAL-SEARCH-V2-ZALO-CART-1.4";
const MODEL_ID = "Xenova/siglip-base-patch16-224";
const DTYPE = "q8";
const VECTOR_VERSION = "python-fp32-v1";
const DEFAULT_TOP_K = 24;
const MAX_MANUAL_CODES = 500;
const IMAGE_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";

console.log("[TimKiemAnhModule]", BUILD);

const supabase = getSupabaseClient();

let hf = null;
let processor = null;
let model = null;
let modelLoadPromise = null;
let currentFile = null;
let currentObjectUrl = "";
let currentSearchId = null;
let currentResults = [];
let resultMode = "image";
let opening = false;
let resultGeneration = 0;
const detailCache = new Map();
// Gio anh tu van: KHONG dung chung gio ban hang, KHONG thay doi ket qua tim anh.
const zaloSelection = new Map();
const ZALO_BATCH_SIZE = 10; // Mot lo de iPhone tao anh full-size ma khong bi qua RAM.
const ZALO_SELECTION_LIMIT = 100;
let zaloPrepared = null;
let zaloPreviewUrl = "";
let zaloRevision = 0;
let zaloJob = 0;
let zaloBusy = false;


const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const norm = (v) => String(v ?? "").trim().toUpperCase();

function getBranch(){
  return String(
    sessionStorage.getItem("diadiem") ||
    localStorage.getItem("diadiem") ||
    ""
  ).trim().toLowerCase();
}
function getEmployee(){
  return String(localStorage.getItem("manv") || "").trim();
}
function setStatus(text, type=""){
  const el = $("visualSearchStatus");
  if(!el) return;
  el.textContent = text;
  el.className = `vs-status ${type}`.trim();
}
function l2Normalize(arr){
  let sum = 0;
  for(const x of arr) sum += Number(x) * Number(x);
  const n = Math.sqrt(sum) || 1;
  return Array.from(arr, x => Number(x) / n);
}
function pgVectorLiteral(v){
  return "[" + v.map(x => Number(x).toPrecision(9)).join(",") + "]";
}

async function ensureModel(){
  if(model && processor) return;
  // Một promise duy nhất cho cả preload và lượt Tìm: tránh tải SigLIP hai lần.
  if(modelLoadPromise) return modelLoadPromise;
  modelLoadPromise=(async()=>{
    const start=performance.now();
    setStatus("Đang chuẩn bị AI ảnh trên thiết bị…");
    if(!hf){
      hf=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      try{hf.env.allowLocalModels=false;hf.env.useBrowserCache=true;}catch{}
    }
    const {AutoProcessor,SiglipVisionModel}=hf;
    const nextProcessor=await AutoProcessor.from_pretrained(MODEL_ID);
    const nextModel=await SiglipVisionModel.from_pretrained(MODEL_ID,{dtype:DTYPE,device:"wasm"});
    // Chỉ đánh dấu đã sẵn sàng sau khi cả hai thành phần tải thành công.
    processor=nextProcessor;
    model=nextModel;
    setStatus(`AI ảnh đã sẵn sàng (${((performance.now()-start)/1000).toFixed(1)}s).`,"ok");
  })();
  try{await modelLoadPromise}
  catch(e){
    // Cho phép mở lại hoặc bấm Tìm để tải lại nếu mạng chập chờn.
    model=null;processor=null;
    setStatus("Không thể chuẩn bị AI ảnh. Bấm Tìm để thử lại.","err");
    throw e;
  }finally{
    modelLoadPromise=null;
  }
}

function preloadModelOnOpen(){
  // Không chặn việc mở cửa sổ, chụp ảnh hoặc thao tác trang V2 chính.
  if(model && processor){setStatus("AI ảnh đã sẵn sàng.","ok");return;}
  void ensureModel().catch(e=>console.warn("[TimKiemAnhModule] Preload SigLIP chưa thành công:",e));
}

async function fileToVector(file){
  await ensureModel();
  const { RawImage } = hf;
  const url = URL.createObjectURL(file);
  try{
    const raw = await RawImage.fromURL(url);
    const inputs = await processor(raw);
    const t = performance.now();
    const out = await model(inputs);
    const tensor = out.pooler_output;
    return {
      vector: l2Normalize(Array.from(tensor.data)),
      inferenceMs: Math.round(performance.now() - t)
    };
  }finally{
    URL.revokeObjectURL(url);
  }
}

async function searchVector(vector, topK=DEFAULT_TOP_K){
  const { data, error } = await supabase.rpc("tim_san_pham_tuong_tu_vector", {
    p_vector: pgVectorLiteral(vector),
    p_so_luong: topK,
    p_phien_ban_vector: VECTOR_VERSION
  });
  if(error) throw error;
  return data || [];
}

async function tryLogSearch({vector, inferenceMs, totalMs, rows}){
  currentSearchId = null;
  try{
    const payload = {
      p_query_vector: pgVectorLiteral(vector),
      p_diadiem: getBranch() || null,
      p_manv: getEmployee() || null,
      p_inference_ms: inferenceMs || null,
      p_total_ms: totalMs || null,
      p_top_results: (rows || []).slice(0, 40).map((r,i)=>({
        rank:i+1,
        masp:r.masp,
        diem_giong:Number(r.diem_giong||0)
      }))
    };
    const {data,error}=await supabase.rpc("ghi_nhat_ky_tim_kiem_anh",payload);
    if(!error){
      if(Array.isArray(data)) currentSearchId = data?.[0]?.id || data?.[0] || null;
      else currentSearchId = data?.id || data || null;
    }
  }catch(e){
    console.debug("[TimKiemAnhModule] Nhật ký chưa bật/không ghi được:",e);
  }
}

async function tryLogPick(masp){
  if(!currentSearchId) return;
  try{
    await supabase.rpc("cap_nhat_nhat_ky_tim_kiem_anh_chon",{
      p_id: currentSearchId,
      p_masp_chon: norm(masp)
    });
  }catch(e){
    console.debug("[TimKiemAnhModule] Không cập nhật được lựa chọn:",e);
  }
}

function clearPreview(){
  if(currentObjectUrl){
    try{URL.revokeObjectURL(currentObjectUrl)}catch{}
  }
  currentObjectUrl="";
  currentFile=null;
  const img=$("visualSearchPreview");
  if(img){img.removeAttribute("src");img.style.display="none";}
  const box=$("visualResults");
  if(box) box.innerHTML="";
  const info=$("visualResultInfo");
  if(info) info.textContent="";
  currentResults=[];
  resultMode="image";
  resultGeneration++;
  currentSearchId=null;
}

function selectFile(file){
  if(!file) return;
  currentFile=file;
  resultGeneration++;
  if(currentObjectUrl){
    try{URL.revokeObjectURL(currentObjectUrl)}catch{}
  }
  currentObjectUrl=URL.createObjectURL(file);
  const img=$("visualSearchPreview");
  img.src=currentObjectUrl;
  img.style.display="block";
  $("visualResults").innerHTML="";
  $("visualResultInfo").textContent="";
  setStatus(model && processor ? "Ảnh và AI đã sẵn sàng. Bấm “Tìm sản phẩm”." : "Ảnh đã sẵn sàng. AI đang được chuẩn bị nếu cần.","ok");
}

function formDisplay(v){
  const raw=String(v||"").trim();
  const names={RONG:"Rộng",VUA:"Vừa",BO:"Bó",RỘNG:"Rộng",VỪA:"Vừa",BÓ:"Bó"};
  return names[raw.toUpperCase()] || raw || "-";
}
function selectedBranch(){
  return window.TimKiemNhanhV2ImageBridge?.getBranch?.() || getBranch();
}
function getSizeStocks(sp){
  const cs2=selectedBranch()==="cs2";
  return Object.entries(sp?.ton_sizes || {}).map(([s,v])=>({
    size:String(s), qty:Number(cs2?v?.ton_cs2:v?.ton_cs1)||0
  })).sort((a,b)=>Number(a.size)-Number(b.size));
}
function detailsMarkup(sp,masp){
  if(!sp) return `<div class="vs-detail-unavailable">Không có thông tin trong danh mục (hoặc không truy cập được mã này). Không thể chọn.</div>`;
  const cs2=selectedBranch()==="cs2";
  const kho=(cs2?sp.vitrikho2:sp.vitrikho1)||"-";
  const mau=(cs2?sp.treomaucs2:sp.treomaucs1)||"-";
  const stocks=getSizeStocks(sp);
  const available=stocks.filter(x=>x.qty>0);
  const formSizes=`${formDisplay(sp.form)} · ${available.map(x=>x.size).join(" ")||"-"}`;
  const bySize=stocks.length ? stocks.map(x=>`${x.size}: ${x.qty}`).join(" · ") : "Chưa có thông tin";
  const price=Number(sp.giale||0).toLocaleString("vi-VN");
  return `<div class="vs-form-sizes">${esc(formSizes)}</div>
    <div class="vs-size-stock">Tồn theo size: ${esc(bySize)}</div>
    <div class="vs-warehouse">KHO: ${esc(kho)}</div>
    <div class="vs-sample">Mẫu: ${esc(mau)}</div>
    <div class="vs-price">${price} đ</div>
    <button type="button" class="vs-pick" data-vs-pick="${esc(masp)}">Chọn</button>
    <div class="vs-size-picker" data-vs-picker="${esc(masp)}">${available.length
      ? available.map(x=>`<button type="button" data-vs-size="${esc(x.size)}" data-vs-add="${esc(masp)}">${esc(x.size)} (${x.qty})</button>`).join("")
      : '<span class="vs-no-stock">Không có size còn tồn để chọn</span>'}</div>`;
}
function renderResults(rows, mode="image"){
  resultMode=mode;
  currentResults=rows || [];
  const box=$("visualResults");
  const info=$("visualResultInfo");
  if(!rows?.length){
    info.textContent="Không tìm thấy kết quả.";
    box.innerHTML="";
    return;
  }
  info.textContent=mode==="manual"
    ? `${rows.length} mã theo thứ tự đã nhập · bấm ảnh xem lớn · bấm MASP mở StockQuick`
    : `${rows.length} sản phẩm gần nhất · bấm ảnh để phóng to · bấm MASP mở StockQuick`;
  // Bao ton tuyet doi danh sach va thu tu do RPC tim anh V2 tra ve.
  box.innerHTML=rows.map((r,i)=>{
    const pct=(Number(r.diem_giong||0)*100).toFixed(1);
    const score=mode==="manual" ? "" : `<div class="vs-score">Giống ${pct}%</div>`;
    return `<article class="vs-result" data-vs-masp="${esc(r.masp)}">
      <div class="vs-image-wrap"><div class="vs-rank">${i+1}</div>
      <label class="vs-zalo-check" title="Tích để đưa ảnh vào giỏ tư vấn Zalo" aria-label="Chọn ảnh ${esc(r.masp)} gửi Zalo">
        <input type="checkbox" data-vs-zalo-key="${esc(zaloKey(r))}" ${zaloSelection.has(zaloKey(r))?"checked":""} aria-label="Chọn ảnh ${esc(r.masp)} vào giỏ Zalo">
      </label>
      <button type="button" class="vs-image-button" data-vs-zoom="${i}" aria-label="Xem ảnh lớn ${esc(r.masp)}">
        <img loading="lazy" decoding="async" src="${esc(r.duong_dan_anh||"")}" alt="${esc(r.masp)}">
      </button></div>
      <div class="vs-result-body">
        <button type="button" class="vs-code" data-vs-stock="${esc(r.masp)}">${esc(r.masp)}</button>
        ${score}
        <div class="vs-detail" data-vs-detail="${esc(r.masp)}"><span class="vs-detail-loading">Đang lấy thông tin…</span></div>
      </div>
    </article>`;
  }).join("");
  refreshZaloCounter();
}
async function loadOneDetail(masp){
  const branch=selectedBranch();
  const key=branch+"|"+norm(masp);
  if(detailCache.has(key))return detailCache.get(key);
  const task=(async()=>{
    const {data,error}=await supabase.rpc("timkiemnhanh_lay_san_pham_v2",{
      p_masp:norm(masp), p_diadiem:branch
    });
    if(error) throw error;
    return (Array.isArray(data)?data:[])?.[0] || null;
  })();
  detailCache.set(key,task);
  try{return await task}catch(e){detailCache.delete(key);throw e;}
}
async function enrichVisibleResults(rows,gen){
  let cursor=0, failed=0;
  const count=Math.min(5,rows.length);
  async function worker(){
    while(cursor<rows.length){
      const i=cursor++,masp=norm(rows[i].masp);
      let sp=null;
      try{sp=await loadOneDetail(masp)}catch(e){failed++;console.warn("[V2 ảnh] Không đọc được thông tin:",masp,e)}
      if(gen!==resultGeneration)return;
      const details=Array.from($("visualResults")?.querySelectorAll("[data-vs-detail]")||[])
        .filter(el=>norm(el.dataset.vsDetail)===masp);
      for(const detail of details)detail.innerHTML=detailsMarkup(sp,masp);
    }
  }
  await Promise.all(Array.from({length:count},()=>worker()));
  if(gen===resultGeneration && failed){
    setStatus(`Có ${failed} mã chưa lấy được thông tin phụ. Thứ tự danh sách không thay đổi.`,"err");
  }
}
function showImageLarge(index){
  const row=currentResults[Number(index)];
  if(!row)return;
  const overlay=$("visualImageZoom"),img=$("visualImageZoomImg");
  if(!overlay||!img)return;
  img.src=String(row.duong_dan_anh||"");img.alt=norm(row.masp);
  overlay.classList.add("show");
}
function closeImageLarge(){
  $("visualImageZoom")?.classList.remove("show");
  const img=$("visualImageZoomImg");if(img)img.removeAttribute("src");
}
function showStockPopup(btn,masp){
  if(!window.StockQuick?.showFor){setStatus("StockQuick chưa sẵn sàng, hãy thử tải lại trang.","err");return;}
  try{window.StockQuick.showFor(btn,norm(masp));}
  catch(e){console.warn("[V2 ảnh] StockQuick",e);setStatus("Không mở được StockQuick: "+(e.message||e),"err");}
}
function pickImageProduct(masp,size){
  const bridge=window.TimKiemNhanhV2ImageBridge;
  const spPromise=detailCache.get(selectedBranch()+"|"+norm(masp));
  if(!bridge||!spPromise){setStatus("Chưa có thông tin mã để chọn.","err");return;}
  Promise.resolve(spPromise).then(sp=>{
    const result=bridge.addProduct(sp,size);
    if(!result?.ok)setStatus(result?.message||"Không thể chọn mã.","err");
    else setStatus(`Đã thêm ${norm(masp)} / ${size} vào Sản phẩm đã chọn V2.`,"ok");
  }).catch(e=>setStatus("Không thể chọn mã: "+e.message,"err"));
}
function handleResultClick(e){
  const zoom=e.target.closest("[data-vs-zoom]");
  if(zoom){showImageLarge(zoom.dataset.vsZoom);return;}
  const stock=e.target.closest("[data-vs-stock]");
  if(stock){showStockPopup(stock,stock.dataset.vsStock);return;}
  const pick=e.target.closest("[data-vs-pick]");
  if(pick){
    const panel=pick.closest(".vs-detail")?.querySelector(".vs-size-picker");
    panel?.classList.toggle("show");return;
  }
  const add=e.target.closest("[data-vs-add]");
  if(add){pickImageProduct(add.dataset.vsAdd,add.dataset.vsSize);return;}
}

// ===== V2 FAST: GIO ANH TU VAN ZALO (khong thay doi tim kiem & san pham da chon) =====
function zaloKey(row){
  // Phan biet anh khac nhau cua mot MASP, nhung khong chon trung khi tim AI va nhap thu cong.
  let filename=String(row?.ten_anh||"").trim();
  if(!filename){
    try{
      const url=new URL(String(row?.duong_dan_anh||""));
      const marker="/anhsanpham/";
      const pos=url.pathname.indexOf(marker);
      filename=pos>=0?decodeURIComponent(url.pathname.slice(pos+marker.length)):url.pathname;
    }catch{filename=String(row?.duong_dan_anh||"");}
  }
  return norm(row?.masp) + "|" + filename;
}
function zaloMoney(value){
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? n.toLocaleString("vi-VN")+" đ" : "Chưa có giá";
}
function zaloStatus(message,type=""){
  const el=$("visualZaloStatus");
  if(!el)return;
  el.textContent=message;
  el.className=`vs-zalo-status ${type}`.trim();
}
function invalidateZaloPrepared(){
  zaloRevision++;
  zaloJob++;
  zaloPrepared=null;
  if(zaloPreviewUrl){URL.revokeObjectURL(zaloPreviewUrl);zaloPreviewUrl="";}
  const img=$("visualZaloGeneratedPreview");
  if(img){img.removeAttribute("src");img.hidden=true;}
  updateZaloActionButtons();
}
function refreshZaloCounter(){
  const count=zaloSelection.size;
  const btn=$("visualZaloOpen");
  if(btn)btn.textContent=`📸 Giỏ ảnh Zalo (${count})`;
  const badge=$("visualZaloCount");
  if(badge)badge.textContent=String(count);
}
function syncZaloChecks(){
  document.querySelectorAll("#visualResults [data-vs-zalo-key]").forEach(input=>{
    const active=zaloSelection.has(input.dataset.vsZaloKey);
    input.checked=active;
    input.closest(".vs-result")?.classList.toggle("vs-zalo-selected",active);
  });
}
function findCurrentZaloRow(key){
  return currentResults.find(r=>zaloKey(r)===key);
}
async function resolveZaloItemPrice(item){
  try{
    const sp=await loadOneDetail(item.masp);
    if(zaloSelection.get(item.key)!==item)return;
    const v=Number(sp?.giale);
    item.price=Number.isFinite(v)&&v>0?v:null;
    item.priceState=item.price?"ok":"missing";
  }catch(e){
    if(zaloSelection.get(item.key)!==item)return;
    item.price=null;item.priceState="error";
    console.warn("[V2 Zalo] Không tải được giá",item.masp,e);
  }
  if($("visualZaloTray")?.classList.contains("show"))renderZaloTray();
}
function toggleZaloImage(key,checked){
  if(checked){
    if(zaloSelection.has(key))return;
    if(zaloSelection.size>=ZALO_SELECTION_LIMIT){
      setStatus(`Giỏ tư vấn cho phép chọn tối đa ${ZALO_SELECTION_LIMIT} ảnh. Hãy gửi theo lô rồi bỏ bớt ảnh.`,"err");
      syncZaloChecks();return;
    }
    const row=findCurrentZaloRow(key);
    if(!row){syncZaloChecks();return;}
    const item={key,masp:norm(row.masp),ten_anh:String(row.ten_anh||""),url:String(row.duong_dan_anh||""),branch:selectedBranch(),price:null,priceState:"loading"};
    zaloSelection.set(key,item);
    void resolveZaloItemPrice(item);
  }else{
    zaloSelection.delete(key);
  }
  invalidateZaloPrepared();
  syncZaloChecks();refreshZaloCounter();
  if($("visualZaloTray")?.classList.contains("show"))renderZaloTray();
}
function onZaloCheckboxChanged(e){
  const check=e.target.closest("[data-vs-zalo-key]");
  if(check)toggleZaloImage(check.dataset.vsZaloKey,check.checked);
}
function currentZaloBatch(){
  const list=Array.from(zaloSelection.values());
  const idx=Math.max(0,Math.min(Math.ceil(list.length/ZALO_BATCH_SIZE)-1,Number($("visualZaloBatch")?.value||0)));
  return {idx,count:Math.ceil(list.length/ZALO_BATCH_SIZE),list:list.slice(idx*ZALO_BATCH_SIZE,(idx+1)*ZALO_BATCH_SIZE)};
}
function updateZaloActionButtons(){
  const ready=!!zaloPrepared;
  for(const id of ["visualZaloShare","visualZaloDownload","visualZaloOriginal"]){
    const btn=$(id);if(btn)btn.disabled=!ready;
  }
  const prepare=$("visualZaloPrepare");
  if(prepare)prepare.disabled=zaloBusy||!zaloSelection.size;
  const copy=$("visualZaloCopyList");if(copy)copy.disabled=!zaloSelection.size;
}
function renderZaloTray(){
  refreshZaloCounter();
  const list=Array.from(zaloSelection.values());
  const box=$("visualZaloItems");
  const batch=$("visualZaloBatch");
  const old=batch?.value??"0";
  const num=Math.ceil(list.length/ZALO_BATCH_SIZE);
  if(batch){
    batch.innerHTML=Array.from({length:num},(_,i)=>`<option value="${i}">Lô ${i+1}/${num} (ảnh ${i*ZALO_BATCH_SIZE+1}–${Math.min((i+1)*ZALO_BATCH_SIZE,list.length)})</option>`).join("");
    batch.value=(Number(old)>=num?"0":old);
    batch.hidden=num<=1;
  }
  if(box){box.innerHTML=list.length?list.map((item,i)=>`<div class="vs-zalo-item">
    <img loading="lazy" src="${esc(item.url)}" alt="${esc(item.masp)}">
    <div class="vs-zalo-item-text"><b>${i+1}. ${esc(item.masp)}</b><span>${esc(item.priceState==="loading"?"Đang lấy giá…":zaloMoney(item.price))}</span></div>
    <button type="button" data-vs-zalo-remove="${esc(item.key)}" aria-label="Bỏ ${esc(item.masp)} khỏi giỏ">Bỏ</button>
  </div>`).join(""):'<div class="vs-zalo-empty">Chưa tích chọn ảnh nào. Tích vào góc trên phải ảnh để thêm.</div>';}
  const count=$("visualZaloCount");if(count)count.textContent=String(list.length);
  updateZaloActionButtons();
}
function openZaloTray(){
  const tray=$("visualZaloTray");if(!tray)return;
  tray.classList.add("show");tray.setAttribute("aria-hidden","false");
  renderZaloTray();
  if(zaloPrepared)zaloStatus(`Đã tạo ${zaloPrepared.images.length} ảnh báo giá. Có thể chia sẻ hoặc tải ZIP.`,"ok");
  else zaloStatus("Chọn lô rồi bấm Tạo ảnh báo giá. Mỗi lô tối đa 10 ảnh.");
}
function closeZaloTray(){
  $("visualZaloTray")?.classList.remove("show");
  $("visualZaloTray")?.setAttribute("aria-hidden","true");
}
function isValidOriginalPath(path){
  return !!path && path.length<500 && !path.split("/").some(part=>part===".."||part==="."||!part) && !/[\\?&#]/.test(path);
}
function originalImageUrl(item){
  // Lay object goc anhsanpham tu Supabase. KHONG dung link transform/thumbnail.
  const base=new URL(IMAGE_BASE);
  let name=String(item.ten_anh||"").trim();
  if(name.startsWith("anhsanpham/"))name=name.slice("anhsanpham/".length);
  if(!name){
    const url=new URL(item.url);
    if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new Error("Ảnh không thuộc bucket anhsanpham");
    name=decodeURIComponent(url.pathname.slice(base.pathname.length));
  }
  if(!isValidOriginalPath(name))throw new Error("Đường dẫn ảnh gốc không hợp lệ");
  return IMAGE_BASE+name.split("/").map(encodeURIComponent).join("/");
}
function safeZaloFilename(v){
  return String(v||"ANH").replace(/[^A-Za-z0-9._-]/g,"_").slice(0,80)||"ANH";
}
function originalExtension(url,blob){
  const m=decodeURIComponent(new URL(url).pathname).match(/\.(jpe?g|png|webp)$/i);
  if(m)return m[1].toLowerCase().replace("jpeg","jpg");
  return blob.type==="image/png"?"png":blob.type==="image/webp"?"webp":"jpg";
}
async function downloadOriginalZaloImage(item){
  const url=originalImageUrl(item);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  let blob;
  try{
    const res=await fetch(url,{mode:"cors",cache:"no-store",signal:controller.signal});
    if(!res.ok)throw new Error(`${item.masp}: không tải được ảnh gốc (HTTP ${res.status})`);
    blob=await res.blob();
  }catch(e){
    if(e?.name==="AbortError")throw new Error(`${item.masp}: tải ảnh gốc quá 30 giây, hãy thử lại.`);
    throw e;
  }finally{clearTimeout(timer);}
  if(!blob.size||blob.size>30*1024*1024)throw new Error(`${item.masp}: ảnh gốc rỗng hoặc quá 30 MB`);
  if(blob.type && !blob.type.startsWith("image/") && blob.type!=="application/octet-stream")
    throw new Error(`${item.masp}: nội dung tải về không phải là file ảnh gốc`);
  const ext=originalExtension(url,blob);
  return {blob,ext};
}
function loadZaloImage(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob);const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Không giải mã được ảnh gốc"));};
    img.src=url;
  });
}
async function createPricePhoto(original,item){
  const img=await loadZaloImage(original);
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h||w*(h+Math.max(100,Math.round(w*.23)))>24000000)
    throw new Error(`${item.masp}: kích thước ảnh quá lớn cho bộ nhớ điện thoại; hãy tải ảnh gốc`);
  const strip=Math.max(110,Math.round(w*.23));
  const canvas=document.createElement("canvas");
  canvas.width=w;canvas.height=h+strip;
  try{
    const ctx=canvas.getContext("2d",{alpha:false});
    if(!ctx)throw new Error("Trình duyệt không tạo được ảnh");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h+strip);
    ctx.drawImage(img,0,0,w,h);
    ctx.fillStyle="#eeeeee";ctx.fillRect(0,h,w,Math.max(2,Math.round(w*.004)));
    const chooseFont=(value,size,weight)=>{
      let px=Math.max(12,Math.round(w*size));
      do{ctx.font=`${weight} ${px}px system-ui,Arial,sans-serif`;if(ctx.measureText(value).width<=w*.9)break;px-=2;}while(px>11);
    };
    ctx.textAlign="center";ctx.textBaseline="middle";
    chooseFont(item.masp,.05,"700");ctx.fillStyle="#16253b";ctx.fillText(item.masp,w/2,h+strip*.34);
    const price=zaloMoney(item.price);
    chooseFont(price,.075,"800");ctx.fillStyle="#c91f29";ctx.fillText(price,w/2,h+strip*.74);
    const output=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Không xuất được ảnh JPEG")),"image/jpeg",.96));
    return output;
  }finally{canvas.width=0;canvas.height=0;img.src="";}
}
// ZIP store: JPG/PNG da nen san. Tao ZIP truc tiep, khong can thu vien ngoai hay server.
const zipCrcTable=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?(0xedb88320^(c>>>1)):c>>>1;t[n]=c>>>0;}
  return t;
})();
function zipCrc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes)crc=zipCrcTable[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function zipHeader(n){return new DataView(new ArrayBuffer(n));}
function zipEntryText(t){return new TextEncoder().encode(t);}
async function createZaloZip(files){
  const locals=[],central=[];let offset=0;
  const now=new Date(),dt=((now.getHours()&31)<<11)|((now.getMinutes()&63)<<5)|((Math.floor(now.getSeconds()/2))&31);
  const dd=(((now.getFullYear()-1980)&127)<<9)|(((now.getMonth()+1)&15)<<5)|(now.getDate()&31);
  for(const file of files){
    const fn=zipEntryText(file.name),data=new Uint8Array(await file.arrayBuffer());
    const crc=zipCrc32(data),size=data.length;
    const local=zipHeader(30);
    local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x0800,true);
    local.setUint16(10,dt,true);local.setUint16(12,dd,true);local.setUint32(14,crc,true);
    local.setUint32(18,size,true);local.setUint32(22,size,true);local.setUint16(26,fn.length,true);
    locals.push(local.buffer,fn,data);
    const cd=zipHeader(46);
    cd.setUint32(0,0x02014b50,true);cd.setUint16(4,20,true);cd.setUint16(6,20,true);cd.setUint16(8,0x0800,true);
    cd.setUint16(12,dt,true);cd.setUint16(14,dd,true);cd.setUint32(16,crc,true);
    cd.setUint32(20,size,true);cd.setUint32(24,size,true);cd.setUint16(28,fn.length,true);
    cd.setUint32(42,offset,true);central.push(cd.buffer,fn);
    offset+=30+fn.length+size;
  }
  const cdSize=central.reduce((a,b)=>a+b.byteLength,0);
  const end=zipHeader(22);
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
  end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  return new Blob([...locals,...central,end.buffer],{type:"application/zip"});
}
function getZaloPriceCsv(items){
  return "\ufeffSTT,MASP,GIA_VND,TEN_ANH\r\n"+items.map((x,i)=>{
    const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
    return [i+1,quote(x.masp),x.price,quote(x.ten_anh||x.url)].join(",");
  }).join("\r\n")+"\r\n";
}
function showZaloPreparedPreview(){
  const img=$("visualZaloGeneratedPreview");
  if(!img||!zaloPrepared?.images?.length)return;
  if(zaloPreviewUrl)URL.revokeObjectURL(zaloPreviewUrl);
  zaloPreviewUrl=URL.createObjectURL(zaloPrepared.images[0]);
  img.src=zaloPreviewUrl;img.hidden=false;
}
async function prepareZaloBatch(){
  if(zaloBusy)return;
  const {idx,list}=currentZaloBatch();
  if(!list.length){zaloStatus("Chưa chọn ảnh nào.","err");return;}
  if(list.some(item=>item.branch!==selectedBranch())){
    zaloStatus("Cơ sở đã thay đổi. Hãy bỏ chọn ảnh cũ và chọn lại tại cơ sở hiện tại.","err");return;
  }
  invalidateZaloPrepared();
  const myJob=++zaloJob;
  zaloBusy=true;updateZaloActionButtons();
  const priced=[],originals=[];
  try{
    // Kiem tra gia mot lan ngay truoc khi xuat; KHONG sua gia trong Supabase.
    for(let i=0;i<list.length;i++){
      if(myJob!==zaloJob)throw new Error("Giỏ ảnh đã thay đổi, vui lòng tạo lại.");
      const item=list[i];zaloStatus(`Đang xác minh giá ${i+1}/${list.length}: ${item.masp}…`);
      const {data,error}=await supabase.rpc("timkiemnhanh_lay_san_pham_v2",{p_masp:item.masp,p_diadiem:item.branch});
      if(error)throw new Error(`${item.masp}: không xác minh được giá mới nhất. ${error.message}`);
      const sp=Array.isArray(data)?data[0]:null;
      const price=Number(sp?.giale);
      if(!Number.isFinite(price)||price<=0)throw new Error(`${item.masp}: chưa có giá bán hợp lệ, vui lòng bỏ ảnh này khỏi giỏ.`);
      item.price=price;item.priceState="ok";
    }
    renderZaloTray();
    for(let i=0;i<list.length;i++){
      if(myJob!==zaloJob)throw new Error("Giỏ ảnh đã thay đổi, vui lòng tạo lại.");
      const item=list[i];zaloStatus(`Đang tải ảnh GỐC và tạo dải giá ${i+1}/${list.length}: ${item.masp}…`);
      const {blob,ext}=await downloadOriginalZaloImage(item);
      const base=`${String(idx*ZALO_BATCH_SIZE+i+1).padStart(2,"0")}_${safeZaloFilename(item.masp)}`;
      originals.push(new File([blob],`${base}_GOC.${ext}`,{type:blob.type||"application/octet-stream"}));
      const pricedBlob=await createPricePhoto(blob,item);
      priced.push(new File([pricedBlob],`${base}_GIA.jpg`,{type:"image/jpeg"}));
    }
    if(myJob!==zaloJob)throw new Error("Giỏ ảnh đã thay đổi, vui lòng tạo lại.");
    zaloStatus("Đang đóng gói ảnh và bảng giá…");
    const csv=new File([getZaloPriceCsv(list)],"BANG_GIA.csv",{type:"text/csv;charset=utf-8"});
    const [pricedZip,originalZip]=await Promise.all([createZaloZip([...priced,csv]),createZaloZip([...originals,csv])]);
    if(myJob!==zaloJob)throw new Error("Giỏ ảnh đã thay đổi, vui lòng tạo lại.");
    zaloPrepared={images:priced,originals,pricedZip,originalZip,items:list.map(x=>({...x})),batch:idx+1,revision:zaloRevision};
    showZaloPreparedPreview();
    zaloStatus(`Đã tạo ${priced.length} ảnh có giá (lô ${idx+1}). Ảnh gốc không bị ghi đè.`,"ok");
  }catch(e){
    console.warn("[V2 Zalo] Tạo bộ ảnh thất bại:",e);
    if(myJob===zaloJob)zaloStatus(`Chưa tạo được bộ ảnh: ${e.message||e}. Giỏ ảnh vẫn được giữ nguyên.`,"err");
  }finally{
    // Nguoi dung bo tick/doi lo trong luc tao: phai mo lai nut Tao sau khi tac vu cu dung.
    zaloBusy=false;updateZaloActionButtons();
  }
}
function zaloDownload(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function downloadZaloBatch(original=false){
  const p=zaloPrepared;if(!p){zaloStatus("Hãy bấm Tạo ảnh báo giá trước.","err");return;}
  if(p.revision!==zaloRevision||p.items.some(x=>x.branch!==selectedBranch())){
    invalidateZaloPrepared();zaloStatus("Giỏ hoặc cơ sở đã thay đổi. Hãy tạo lại ảnh báo giá.","err");return;
  }
  const date=new Date().toISOString().slice(0,10);
  zaloDownload(original?p.originalZip:p.pricedZip,`HOANTE_ZALO_${original?"ANH_GOC":"BAO_GIA"}_${date}_LO${p.batch}.zip`);
}
function shareZaloBatch(){
  const p=zaloPrepared;if(!p){zaloStatus("Hãy bấm Tạo ảnh báo giá trước.","err");return;}
  if(p.revision!==zaloRevision||p.items.some(x=>x.branch!==selectedBranch())){
    invalidateZaloPrepared();zaloStatus("Giỏ hoặc cơ sở đã thay đổi. Hãy tạo lại ảnh báo giá.","err");return;
  }
  // Goi native share truc tiep tu su kien click, khong await network de tranh mat user activation iOS.
  if(typeof navigator.share!=="function"||(typeof navigator.canShare==="function"&&!navigator.canShare({files:p.images}))){
    zaloStatus("Trình duyệt không hỗ trợ chia sẻ nhiều ảnh. Hãy tải ZIP báo giá rồi chọn ảnh từ Zalo/Thư viện.","err");return;
  }
  navigator.share({files:p.images,title:"Ảnh sản phẩm HOANTÉ kèm giá",text:"Mời xem các mẫu sản phẩm và giá trên từng ảnh."})
    .then(()=>zaloStatus("Đã mở và hoàn tất thao tác chia sẻ trên thiết bị. Vui lòng kiểm tra cuộc trò chuyện Zalo.","ok"))
    .catch(e=>{if(e?.name!=="AbortError")zaloStatus("Không thể mở chia sẻ ảnh: "+(e?.message||e)+". Bạn có thể tải ZIP.","err");});
}
async function copyZaloPriceList(){
  const items=Array.from(zaloSelection.values());
  const content=items.map((x,i)=>`${i+1}. ${x.masp} — ${zaloMoney(x.price)}`).join("\n");
  try{await navigator.clipboard.writeText(content);zaloStatus(`Đã copy ${items.length} dòng mã/giá.`,"ok");}
  catch(e){zaloStatus("Trình duyệt không cho copy tự động; hãy dùng file BANG_GIA.csv trong ZIP.","err");}
}
function onZaloTrayClick(e){
  const remove=e.target.closest("[data-vs-zalo-remove]");
  if(remove)toggleZaloImage(remove.dataset.vsZaloRemove,false);
}

function updateVisualJump(){
  const btn=$("visualSearchJump"),modal=$("visualSearchModal");
  if(!btn||!modal)return;
  const atTop=modal.scrollTop<=90;
  btn.textContent=atTop?"↓":"↑";
  btn.title=atTop?"Xuống cuối danh sách ảnh":"Lên đầu cửa sổ ảnh";
  btn.setAttribute("aria-label",btn.title);
}
function jumpVisualEdge(){
  const modal=$("visualSearchModal");if(!modal)return;
  modal.scrollTo({top:modal.scrollTop<=90?modal.scrollHeight:0,behavior:"auto"});
  updateVisualJump();
}

async function runSearch(){
  if(!currentFile){
    setStatus("Hãy chụp ảnh hoặc chọn ảnh từ thư viện trước.","err");
    return;
  }
  const btn=$("visualSearchRun");
  const gen=++resultGeneration;
  if(btn) btn.disabled=true;
  const totalStart=performance.now();
  try{
    setStatus("Đang nhìn ảnh trên thiết bị…");
    const {vector,inferenceMs}=await fileToVector(currentFile);
    setStatus(`Đã tạo vector trong ${inferenceMs} ms. Đang tìm trong kho…`);
    const rows=await searchVector(vector,Number($("visualTopK")?.value||DEFAULT_TOP_K));
    const totalMs=Math.round(performance.now()-totalStart);
    if(gen!==resultGeneration)return;
    renderResults(rows);
    updateVisualJump();
    setStatus(`Hoàn tất ${rows.length} ảnh trong ${(totalMs/1000).toFixed(1)} giây. Đang bổ sung thông tin bên dưới ảnh…`,"ok");
    // Chỉ bổ sung thuộc tính hiển thị, không làm đổi topK, thứ tự, điểm ảnh.
    await Promise.all([enrichVisibleResults(rows,gen),tryLogSearch({vector,inferenceMs,totalMs,rows})]);
    if(gen===resultGeneration)setStatus(`Hoàn tất ${rows.length} ảnh. Thông tin bổ sung không ảnh hưởng số lượng và thứ tự ảnh.`,"ok");
  }catch(e){
    console.error("[TimKiemAnhModule]",e);
    if(gen===resultGeneration)setStatus("Lỗi tìm bằng ảnh: "+(e?.message||e),"err");
  }finally{
    if(btn) btn.disabled=false;
  }
}


// Chế độ nhập danh sách MASP: không dùng vector/AI, không tác động tìm kiếm V2 chính.
// Chỉ đọc thông tin của từng mã từ RPC V2 có sẵn; giữ nguyên thứ tự người dùng nhập.
async function runManualCodeList(){
  const input=$("visualMaspList");
  const raw=String(input?.value||"");
  const entries=raw.split(/\r?\n/).map(norm).filter(Boolean);
  if(!entries.length){setStatus("Hãy nhập mã sản phẩm, mỗi dòng một mã.","err");input?.focus();return;}
  const codes=[...new Set(entries)];
  if(codes.length>MAX_MANUAL_CODES){
    setStatus(`Tối đa ${MAX_MANUAL_CODES} mã mỗi lượt để tránh quá tải điện thoại. Bạn có ${codes.length} mã. Hãy chia thành các lượt.`,"err");
    return;
  }
  const branch=selectedBranch();
  if(!["cs1","cs2"].includes(branch)){
    setStatus("Chưa xác định cơ sở CS1/CS2. Vui lòng đăng nhập cơ sở trước.","err");return;
  }
  const gen=++resultGeneration;
  const button=$("visualMaspRun");
  if(button)button.disabled=true;
  currentSearchId=null; // Không ghi nhật ký tìm vector cho danh sách MASP.
  const rows=codes.map(masp=>({masp,duong_dan_anh:`${IMAGE_BASE}${encodeURIComponent(masp)}.JPG`,diem_giong:null}));
  renderResults(rows,"manual");
  updateVisualJump();
  setStatus(`Đã hiển thị ${codes.length} mã (loại ${entries.length-codes.length} mã trùng). Đang bổ sung thông tin sản phẩm…`,"ok");
  try{
    await enrichVisibleResults(rows,gen);
    if(gen===resultGeneration){
      const notFound=[];
      for(const masp of codes){
        const key=branch+"|"+masp;
        try { if(!(await detailCache.get(key)))notFound.push(masp); }
        catch { notFound.push(masp); }
      }
      setStatus(`Hoàn tất ${codes.length} mã theo thứ tự nhập.`+(notFound.length?` ${notFound.length} mã không có thông tin/không đọc được: ${notFound.slice(0,15).join(", ")}${notFound.length>15?"…":""}.`:""),notFound.length?"err":"ok");
    }
  }catch(e){
    console.error("[V2 ảnh] Danh sách MASP",e);
    if(gen===resultGeneration)setStatus("Lỗi đọc danh sách mã: "+(e?.message||e),"err");
  }finally{if(button)button.disabled=false;}
}

function openModal(){
  if(opening)return;
  opening=true;
  try{
    const modal=$("visualSearchModal");
    if(!modal)return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("vs-open");
    updateVisualJump();
    preloadModelOnOpen();
  }finally{opening=false}
}
function closeModal(){
  closeImageLarge();
  const modal=$("visualSearchModal");
  modal?.classList.remove("show");
  modal?.setAttribute("aria-hidden","true");
  document.body.classList.remove("vs-open");
}

function injectStyles(){
  if($("visualSearchStyle"))return;
  const style=document.createElement("style");
  style.id="visualSearchStyle";
  style.textContent=`
    .visual-search-entry{
      width:100%;margin-top:7px;border:0;border-radius:10px;padding:10px 12px;
      background:linear-gradient(135deg,#172033,#075f9f);color:#fff;font-weight:900;font-size:16px;
      min-height:44px;box-shadow:0 2px 7px #0002;
    }
    .visual-search-entry:active{transform:scale(.99)}
    .vs-modal{display:none;position:fixed;inset:0;z-index:60000;background:#f4f6f8;color:#111827;overflow:auto;-webkit-overflow-scrolling:touch}
    .vs-modal.show{display:block}.vs-open{overflow:hidden}
    .vs-shell{max-width:960px;margin:0 auto;min-height:100%;padding:0 10px calc(22px + env(safe-area-inset-bottom))}
    .vs-head{position:sticky;top:0;z-index:3;background:rgba(244,246,248,.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      display:flex;align-items:center;gap:8px;padding:calc(9px + env(safe-area-inset-top)) 0 9px;border-bottom:1px solid #dde3ea}
    .vs-title{font-size:20px;font-weight:900;flex:1}.vs-close{border:0;border-radius:10px;background:#e7ebef;padding:9px 13px;font-weight:900}
    .vs-card{background:#fff;border:1px solid #dce3e9;border-radius:16px;padding:12px;margin-top:10px;box-shadow:0 2px 10px #0000000d}
    .vs-source-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .vs-file-btn{display:flex;align-items:center;justify-content:center;min-height:54px;border-radius:12px;font-size:16px;font-weight:900;text-align:center}
    .vs-camera{background:#111827;color:#fff}.vs-library{background:#e8f2ff;color:#075f9f;border:1px solid #bad9f5}
    .vs-preview{display:none;width:100%;max-height:52vh;object-fit:contain;background:#f3f4f6;border-radius:14px;margin-top:10px}
    .vs-run-row{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px}
    .vs-run{border:0;border-radius:12px;background:#0878d1;color:#fff;font-weight:900;min-height:50px;padding:10px 14px;font-size:17px}
    .vs-manual-title{font-size:15px;font-weight:800;color:#123d63;margin-bottom:7px}
    .vs-manual-input{width:100%;box-sizing:border-box;min-height:112px;resize:vertical;border:1px solid #b8cce0;border-radius:10px;padding:10px;font-size:16px;line-height:1.45;background:#fff;color:#111827}
    .vs-manual-run{margin-top:8px;width:100%;min-height:44px;border:0;border-radius:10px;background:#137a51;color:#fff;font-size:15px;font-weight:900}
    .vs-manual-help{font-size:12px;color:#64748b;margin-top:6px}
    .vs-run:disabled,.vs-manual-run:disabled{opacity:.55}.vs-topk{border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:0 10px;font-weight:800}
    .vs-status{margin-top:9px;border-radius:10px;padding:9px 11px;background:#f0f2f4;color:#394554;font-size:14px;line-height:1.35}
    .vs-status.ok{background:#e9f9ef;color:#126238}.vs-status.err{background:#fff0f0;color:#b42318}
    .vs-result-info{font-size:13px;color:#64748b;margin:4px 0 9px}
    .vs-results{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
    .vs-result{position:relative;border:1px solid #d9e0e7;background:#fff;border-radius:12px;overflow:hidden;padding:0;text-align:left;color:#111827;min-width:0}
    .vs-image-wrap{position:relative}.vs-image-button{display:block;width:100%;padding:0;border:0;background:#fff;cursor:zoom-in}
    .vs-result img{display:block;width:100%;aspect-ratio:1/1.18;object-fit:contain;background:#fff}
    .vs-result-body{padding:7px}.vs-code{display:block;border:0;background:none;padding:0;font-size:15px;color:#075f9f;text-decoration:underline;text-align:left;font-weight:900;overflow-wrap:anywhere;cursor:pointer}.vs-score{font-size:13px;color:#64748b;margin-top:2px}
    .vs-detail{margin-top:5px;line-height:1.25}.vs-detail-loading,.vs-detail-unavailable{color:#64748b;font-size:12px}
    .vs-form-sizes,.vs-size-stock{font-size:13px;color:#334155;margin:3px 0;overflow-wrap:anywhere}
    .vs-warehouse{font-size:14px;color:#0b3f78;font-weight:900;overflow-wrap:anywhere}
    .vs-sample{font-size:14px;color:#7c3aed;overflow-wrap:anywhere}
    .vs-price{font-size:15px;color:#d92d20;font-weight:900;margin:3px 0}
    .vs-pick{width:100%;border:0;border-radius:7px;background:#0878d1;color:white;font-weight:900;padding:8px 2px}
    .vs-size-picker{display:none;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:4px}
    .vs-size-picker.show{display:grid}.vs-size-picker button{background:#eaf6ff;border:1px solid #bfcbd6;border-radius:5px;padding:5px 1px;font-weight:700;min-width:0}
    .vs-no-stock{grid-column:1/-1;color:#b42318;font-size:12px}
    .vs-open .sq-stock-popup{z-index:80000!important}
    .vs-image-zoom{display:none;position:fixed;inset:0;z-index:90000;background:rgba(0,0,0,.93);align-items:center;justify-content:center;padding:40px 8px 18px;cursor:zoom-out}
    .vs-image-zoom.show{display:flex}.vs-image-zoom img{max-width:100%;max-height:90vh;object-fit:contain}
    .vs-image-zoom-close{position:absolute;right:12px;top:calc(8px + env(safe-area-inset-top));border:0;background:white;border-radius:9px;padding:9px;font-weight:900}
    .vs-jump{position:fixed;z-index:60005;left:12px;bottom:calc(18px + env(safe-area-inset-bottom));width:52px;height:52px;border-radius:50%;border:2px solid white;background:#1464aa;color:#fff;font-size:28px;font-weight:900;box-shadow:0 4px 14px #0004;cursor:pointer}
    /* Gio anh tu van - checkbox KHONG can thiep click anh/StockQuick/Chon */
    .vs-zalo-selected{outline:2px solid #13a26e;outline-offset:-2px}
    .vs-zalo-check{position:absolute;right:5px;top:5px;z-index:4;display:grid;place-items:center;width:34px;height:34px;background:#fffef0f2;border-radius:8px;box-shadow:0 1px 7px #0005;cursor:pointer}
    .vs-zalo-check input{appearance:auto;-webkit-appearance:checkbox;width:23px;height:23px;accent-color:#0e9f6e;margin:0;cursor:pointer}
    .vs-zalo-fab{position:fixed;z-index:60006;right:10px;bottom:calc(18px + env(safe-area-inset-bottom));border:2px solid #fff;border-radius:999px;background:#087b57;color:#fff;padding:13px 16px;font-size:14px;font-weight:900;box-shadow:0 4px 15px #0004}
    .vs-zalo-tray{display:none;position:fixed;inset:0;z-index:62000;overflow:auto;background:#f5f7f9;color:#172033;-webkit-overflow-scrolling:touch}
    .vs-zalo-tray.show{display:block}.vs-zalo-shell{max-width:750px;margin:auto;padding:10px 12px 50px}
    .vs-zalo-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:12px 0;background:#f5f7f9;border-bottom:1px solid #dde3e9}
    .vs-zalo-head b{flex:1;font-size:19px}.vs-zalo-head button{background:#e3e8ed;border:0;border-radius:9px;padding:9px 12px;font-weight:800}
    .vs-zalo-hint{font-size:13px;color:#526074;line-height:1.45;margin:10px 0}
    .vs-zalo-items{max-height:42vh;overflow:auto;border:1px solid #dfe6ee;border-radius:12px;background:#fff}
    .vs-zalo-item{display:flex;gap:10px;align-items:center;border-bottom:1px solid #e4eaf0;padding:7px 9px}
    .vs-zalo-item img{width:64px;height:70px;object-fit:contain;background:#f7f7f7;border-radius:6px}
    .vs-zalo-item-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.vs-zalo-item-text b{overflow-wrap:anywhere;font-size:14px}.vs-zalo-item-text span{font-size:13px;color:#ce2029;font-weight:800}
    .vs-zalo-item button{border:1px solid #ecc9c9;color:#a51e1e;border-radius:7px;background:#fff;padding:7px}
    .vs-zalo-empty{padding:24px 12px;text-align:center;color:#697586}
    .vs-zalo-controls{display:grid;gap:9px;margin-top:12px}
    .vs-zalo-controls button{border:0;border-radius:10px;font-weight:900;font-size:15px;min-height:46px;color:white;background:#0d76bf;padding:10px}
    .vs-zalo-controls button:disabled{opacity:.45}
    .vs-zalo-controls select{width:100%;padding:12px;border:1px solid #c7d2dc;border-radius:10px;background:#fff;font-size:15px}
    .vs-zalo-secondary{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .vs-zalo-controls .vs-zalo-green{background:#0b8056}.vs-zalo-controls .vs-zalo-gray{background:#596677}.vs-zalo-controls .vs-zalo-red{background:#b74444}
    .vs-zalo-status{font-size:14px;line-height:1.5;background:#eaf3fc;color:#254566;padding:10px;border-radius:9px;margin-top:10px;overflow-wrap:anywhere}
    .vs-zalo-status.ok{background:#e5f9ed;color:#126238}.vs-zalo-status.err{background:#fff0f0;color:#a51e1e}
    .vs-zalo-preview[hidden]{display:none}.vs-zalo-preview{display:block;max-height:48vh;max-width:100%;object-fit:contain;border:1px solid #e1e4e8;border-radius:10px;margin:12px auto}
    .vs-zalo-warning{font-size:12px;color:#64748b;line-height:1.55;margin-top:12px}
    .vs-rank{position:absolute;left:5px;top:5px;z-index:1;min-width:25px;height:25px;border-radius:999px;background:rgba(17,24,39,.88);color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900}
    @media(max-width:620px){
      .vs-shell{padding-left:7px;padding-right:7px}.vs-title{font-size:18px}.vs-card{padding:9px;border-radius:14px}
      .vs-source-actions{grid-template-columns:1fr 1fr}.vs-file-btn{min-height:58px;font-size:16px}
      .vs-results{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
      .vs-result-body{padding:6px}.vs-code{font-size:16px}.vs-score{font-size:13px}
      .vs-preview{max-height:46vh}.vs-run{font-size:16px}
    }
  `;
  document.head.appendChild(style);
}

function injectUi(){
  if($("visualSearchModal")) return;

  injectStyles();

  // Nút được chèn ngay dưới quickbar hiện tại, không thay cấu trúc scanner/barcode.
  const quickbar=document.querySelector(".quickbar");
  if(quickbar){
    const btn=document.createElement("button");
    btn.type="button";
    btn.id="btnVisualSearch";
    btn.className="visual-search-entry";
    btn.textContent="✨ TÌM BẰNG HÌNH ẢNH";
    quickbar.insertAdjacentElement("afterend",btn);
  }

  const modal=document.createElement("div");
  modal.id="visualSearchModal";
  modal.className="vs-modal";
  modal.setAttribute("aria-hidden","true");
  modal.innerHTML=`
    <div class="vs-shell">
      <div class="vs-head">
        <div class="vs-title">✨ Tìm sản phẩm bằng hình ảnh</div>
        <button type="button" class="vs-close" id="visualSearchClose">Đóng</button>
      </div>

      <div class="vs-card">
        <div class="vs-source-actions">
          <label class="vs-file-btn vs-camera">📷 CHỤP ẢNH
            <input id="visualCameraInput" type="file" accept="image/*" capture="environment" hidden>
          </label>
          <label class="vs-file-btn vs-library">🖼 THƯ VIỆN
            <input id="visualLibraryInput" type="file" accept="image/*" hidden>
          </label>
        </div>

        <img id="visualSearchPreview" class="vs-preview" alt="Ảnh đang tìm">

        <div class="vs-run-row">
          <button type="button" id="visualSearchRun" class="vs-run">TÌM SẢN PHẨM</button>
          <select id="visualTopK" class="vs-topk" aria-label="Số kết quả">
            <option value="12">Top 12</option>
            <option value="24" selected>Top 24</option>
            <option value="40">Top 40</option>
          </select>
        </div>
        <div id="visualSearchStatus" class="vs-status">Chụp hoặc chọn một ảnh. AI sẽ tự chuẩn bị khi mở cửa sổ.</div>
      </div>

      <div class="vs-card">
        <div class="vs-manual-title">📋 Hiển thị ảnh theo danh sách mã sản phẩm</div>
        <textarea id="visualMaspList" class="vs-manual-input" rows="4" spellcheck="false" autocapitalize="characters" placeholder="25051-AP.TRANG&#10;25051-AP.DEN&#10;8641-SMSH"></textarea>
        <button id="visualMaspRun" class="vs-manual-run" type="button">HIỂN THỊ THEO DANH SÁCH MÃ</button>
        <div class="vs-manual-help">Mỗi dòng một MASP, tối đa 500 mã. Giữ thứ tự nhập; không dùng AI, không lọc tồn hoặc nhóm. Tồn theo size chỉ để xem và chọn.</div>
      </div>

      <div class="vs-card">
        <div id="visualResultInfo" class="vs-result-info"></div>
        <div id="visualResults" class="vs-results"></div>
      </div>
    </div>
    <button type="button" id="visualSearchJump" class="vs-jump" title="Xuống cuối danh sách ảnh">↓</button>
    <button type="button" id="visualZaloOpen" class="vs-zalo-fab">📸 Giỏ ảnh Zalo (0)</button>
  `;
  document.body.appendChild(modal);
  const zoom=document.createElement("div");
  zoom.id="visualImageZoom";
  zoom.className="vs-image-zoom";
  zoom.innerHTML='<button type="button" class="vs-image-zoom-close" aria-label="Đóng ảnh lớn">Đóng ✕</button><img id="visualImageZoomImg" alt="Ảnh lớn">';
  document.body.appendChild(zoom);
  const tray=document.createElement("section");
  tray.id="visualZaloTray";tray.className="vs-zalo-tray";tray.setAttribute("aria-hidden","true");
  tray.innerHTML=`<div class="vs-zalo-shell">
    <div class="vs-zalo-head"><b>📸 Giỏ ảnh tư vấn Zalo (<span id="visualZaloCount">0</span>)</b><button type="button" id="visualZaloClose">Đóng</button></div>
    <div class="vs-zalo-hint">Tích ảnh ở góc trên phải danh sách tìm ảnh. Giỏ giữ ảnh khi bạn tìm tiếp. Đây là giỏ tư vấn độc lập, không đưa sản phẩm vào giỏ bán hàng.</div>
    <div id="visualZaloItems" class="vs-zalo-items"></div>
    <div class="vs-zalo-controls">
      <select id="visualZaloBatch" aria-label="Chọn lô ảnh"></select>
      <button type="button" id="visualZaloPrepare" class="vs-zalo-green">TẠO ẢNH BÁO GIÁ – ẢNH GỐC + DẢI GIÁ</button>
      <button type="button" id="visualZaloShare" disabled>📤 CHIA SẺ ẢNH (CHỌN ZALO TRÊN ĐIỆN THOẠI)</button>
      <div class="vs-zalo-secondary">
        <button type="button" id="visualZaloDownload" class="vs-zalo-gray" disabled>⬇ ZIP ẢNH CÓ GIÁ</button>
        <button type="button" id="visualZaloOriginal" class="vs-zalo-gray" disabled>⬇ ZIP ẢNH GỐC</button>
      </div>
      <div class="vs-zalo-secondary">
        <button type="button" id="visualZaloCopyList" class="vs-zalo-gray">📋 Copy mã + giá</button>
        <button type="button" id="visualZaloClear" class="vs-zalo-red">Xóa giỏ</button>
      </div>
    </div>
    <div id="visualZaloStatus" class="vs-zalo-status">Chọn ảnh rồi tạo bộ báo giá, tối đa 10 ảnh mỗi lô.</div>
    <img id="visualZaloGeneratedPreview" class="vs-zalo-preview" alt="Xem trước ảnh có giá" hidden>
    <div class="vs-zalo-warning">Ảnh có giá là bản sao JPEG độ phân giải gốc, có dải trắng thêm ở dưới. Bản ảnh gốc giữ nguyên byte và được xuất riêng trong ZIP ẢNH GỐC. Zalo có thể nén ảnh khi gửi; chọn chế độ HD nếu ứng dụng hỗ trợ. Nút chia sẻ mở bảng chia sẻ của điện thoại, không tự gửi tin. Nếu Zalo không nhận nhiều ảnh, hãy dùng ZIP trên Zalo PC hoặc lưu ảnh và gửi từ Thư viện.</div>
  </div>`;
  document.body.appendChild(tray);
  zoom.addEventListener("click",closeImageLarge);
  $("visualResults").addEventListener("click",handleResultClick);
  $("visualResults").addEventListener("change",onZaloCheckboxChanged);
  $("visualZaloOpen").addEventListener("click",openZaloTray);
  $("visualZaloClose").addEventListener("click",closeZaloTray);
  $("visualZaloItems").addEventListener("click",onZaloTrayClick);
  $("visualZaloPrepare").addEventListener("click",prepareZaloBatch);
  $("visualZaloShare").addEventListener("click",shareZaloBatch);
  $("visualZaloDownload").addEventListener("click",()=>downloadZaloBatch(false));
  $("visualZaloOriginal").addEventListener("click",()=>downloadZaloBatch(true));
  $("visualZaloCopyList").addEventListener("click",copyZaloPriceList);
  $("visualZaloClear").addEventListener("click",()=>{
    if(!zaloSelection.size)return;
    if(!confirm(`Xóa ${zaloSelection.size} ảnh khỏi giỏ tư vấn Zalo?`))return;
    zaloSelection.clear();invalidateZaloPrepared();syncZaloChecks();renderZaloTray();
    zaloStatus("Đã làm trống giỏ tư vấn. Không ảnh hưởng sản phẩm đã chọn để bán.","ok");
  });
  $("visualZaloBatch").addEventListener("change",()=>{invalidateZaloPrepared();updateZaloActionButtons();zaloStatus("Đã đổi lô. Bấm Tạo ảnh báo giá để tạo bộ mới.");});
  $("visualSearchJump")?.addEventListener("click",jumpVisualEdge);
  modal.addEventListener("scroll",updateVisualJump,{passive:true});

  $("btnVisualSearch")?.addEventListener("click",openModal);
  $("visualSearchClose")?.addEventListener("click",closeModal);
  $("visualCameraInput")?.addEventListener("change",e=>{
    selectFile(e.target.files?.[0]||null);
    e.target.value="";
  });
  $("visualLibraryInput")?.addEventListener("change",e=>{
    selectFile(e.target.files?.[0]||null);
    e.target.value="";
  });
  $("visualSearchRun")?.addEventListener("click",runSearch);
  $("visualMaspRun")?.addEventListener("click",runManualCodeList);
  refreshZaloCounter();updateZaloActionButtons();
}

function init(){
  injectUi();
  console.log("[TimKiemAnhModule] ready");
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true});
else init();

export { openModal as openVisualSearch };
