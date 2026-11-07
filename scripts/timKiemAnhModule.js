// ============================================================
// HOAN TUYET - TIM KIEM BANG ANH MODULE V1.0
// Tich hop vao timkiemnhanh_v2 ma KHONG sua loi logic tim kiem cu.
// Browser: SigLIP ONNX q8 -> vector 768 -> Supabase pgvector RPC.
// ============================================================

import { getSupabaseClient } from "./authModule.js";

const BUILD = "VISUAL-SEARCH-V2-ORIGINAL-INFO-PRELOAD-1.2";
const MODEL_ID = "Xenova/siglip-base-patch16-224";
const DTYPE = "q8";
const VECTOR_VERSION = "python-fp32-v1";
const DEFAULT_TOP_K = 24;

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
let opening = false;
let resultGeneration = 0;
const detailCache = new Map();

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
  if(!sp) return `<div class="vs-detail-unavailable">Chưa lấy được thông tin sản phẩm; ảnh vẫn giữ nguyên kết quả.</div>`;
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
function renderResults(rows){
  currentResults=rows || [];
  const box=$("visualResults");
  const info=$("visualResultInfo");
  if(!rows?.length){
    info.textContent="Không tìm thấy kết quả.";
    box.innerHTML="";
    return;
  }
  info.textContent=`${rows.length} sản phẩm gần nhất · bấm ảnh để phóng to · bấm MASP mở StockQuick`;
  // Bao ton tuyet doi danh sach va thu tu do RPC tim anh V2 tra ve.
  box.innerHTML=rows.map((r,i)=>{
    const pct=(Number(r.diem_giong||0)*100).toFixed(1);
    return `<article class="vs-result" data-vs-masp="${esc(r.masp)}">
      <div class="vs-image-wrap"><div class="vs-rank">${i+1}</div>
      <button type="button" class="vs-image-button" data-vs-zoom="${i}" aria-label="Xem ảnh lớn ${esc(r.masp)}">
        <img loading="lazy" decoding="async" src="${esc(r.duong_dan_anh||"")}" alt="${esc(r.masp)}">
      </button></div>
      <div class="vs-result-body">
        <button type="button" class="vs-code" data-vs-stock="${esc(r.masp)}">${esc(r.masp)}</button>
        <div class="vs-score">Giống ${pct}%</div>
        <div class="vs-detail" data-vs-detail="${esc(r.masp)}"><span class="vs-detail-loading">Đang lấy thông tin…</span></div>
      </div>
    </article>`;
  }).join("");
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
  const count=Math.min(4,rows.length);
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
    setStatus(`Đã tìm ${rows.length} ảnh. Có ${failed} mã chưa đọc được thông tin phụ; thứ tự ảnh không thay đổi.`,"ok");
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
    setStatus("Lỗi tìm bằng ảnh: "+(e?.message||e),"err");
  }finally{
    if(btn) btn.disabled=false;
  }
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
    .vs-run:disabled{opacity:.55}.vs-topk{border:1px solid #cbd5e1;border-radius:12px;background:#fff;padding:0 10px;font-weight:800}
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
        <div id="visualResultInfo" class="vs-result-info"></div>
        <div id="visualResults" class="vs-results"></div>
      </div>
    </div>
    <button type="button" id="visualSearchJump" class="vs-jump" title="Xuống cuối danh sách ảnh">↓</button>
  `;
  document.body.appendChild(modal);
  const zoom=document.createElement("div");
  zoom.id="visualImageZoom";
  zoom.className="vs-image-zoom";
  zoom.innerHTML='<button type="button" class="vs-image-zoom-close" aria-label="Đóng ảnh lớn">Đóng ✕</button><img id="visualImageZoomImg" alt="Ảnh lớn">';
  document.body.appendChild(zoom);
  zoom.addEventListener("click",closeImageLarge);
  $("visualResults").addEventListener("click",handleResultClick);
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
}

function init(){
  injectUi();
  console.log("[TimKiemAnhModule] ready");
}

if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true});
else init();

export { openModal as openVisualSearch };
