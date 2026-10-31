// ============================================================
// HOAN TUYET - TIM KIEM BANG ANH MODULE V1.0
// Tich hop vao timkiemnhanh_v2 ma KHONG sua loi logic tim kiem cu.
// Browser: SigLIP ONNX q8 -> vector 768 -> Supabase pgvector RPC.
// ============================================================

import { getSupabaseClient } from "./authModule.js";

const BUILD = "VISUAL-SEARCH-1.0.0";
const MODEL_ID = "Xenova/siglip-base-patch16-224";
const DTYPE = "q8";
const VECTOR_VERSION = "python-fp32-v1";
const DEFAULT_TOP_K = 24;

console.log("[TimKiemAnhModule]", BUILD);

const supabase = getSupabaseClient();

let hf = null;
let processor = null;
let model = null;
let currentFile = null;
let currentObjectUrl = "";
let currentSearchId = null;
let currentResults = [];
let opening = false;

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
  const start = performance.now();
  setStatus("Đang nạp AI tìm ảnh lần đầu trên thiết bị…");
  if(!hf){
    hf = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
    try{
      hf.env.allowLocalModels = false;
      hf.env.useBrowserCache = true;
    }catch{}
  }
  const { AutoProcessor, SiglipVisionModel } = hf;
  processor = await AutoProcessor.from_pretrained(MODEL_ID);
  model = await SiglipVisionModel.from_pretrained(MODEL_ID, {
    dtype: DTYPE,
    device: "wasm"
  });
  const sec = ((performance.now() - start) / 1000).toFixed(1);
  setStatus(`AI ảnh đã sẵn sàng (${sec}s lần nạp này).`, "ok");
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
  currentSearchId=null;
}

function selectFile(file){
  if(!file) return;
  currentFile=file;
  if(currentObjectUrl){
    try{URL.revokeObjectURL(currentObjectUrl)}catch{}
  }
  currentObjectUrl=URL.createObjectURL(file);
  const img=$("visualSearchPreview");
  img.src=currentObjectUrl;
  img.style.display="block";
  $("visualResults").innerHTML="";
  $("visualResultInfo").textContent="";
  setStatus("Ảnh đã sẵn sàng. Bấm “Tìm sản phẩm”.","ok");
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
  info.textContent=`${rows.length} sản phẩm gần nhất · chạm sản phẩm để đưa vào Tìm kiếm nhanh`;
  box.innerHTML=rows.map((r,i)=>{
    const pct=(Number(r.diem_giong||0)*100).toFixed(1);
    return `<button type="button" class="vs-result" data-masp="${esc(r.masp)}">
      <div class="vs-rank">${i+1}</div>
      <img loading="lazy" decoding="async" src="${esc(r.duong_dan_anh||"")}" alt="${esc(r.masp)}">
      <div class="vs-result-body">
        <div class="vs-code">${esc(r.masp)}</div>
        <div class="vs-score">Giống ${pct}%</div>
      </div>
    </button>`;
  }).join("");
  box.querySelectorAll(".vs-result").forEach(b=>{
    b.addEventListener("click",()=>chooseProduct(b.dataset.masp));
  });
}

async function chooseProduct(masp){
  masp=norm(masp);
  if(!masp) return;
  await tryLogPick(masp);

  closeModal();

  // Không gọi hàm nội bộ của timKiemNhanh_v2.js.
  // Đưa mã vào đúng ô hiện tại và phát Enter để toàn bộ processCode cũ chạy như người dùng nhập mã.
  const input=$("codeInput");
  if(!input){
    alert("Không tìm thấy ô mã sản phẩm của Tìm kiếm nhanh.");
    return;
  }
  input.value=masp;
  input.dispatchEvent(new Event("input",{bubbles:true}));
  input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown",{
    key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true
  }));
}

async function runSearch(){
  if(!currentFile){
    setStatus("Hãy chụp ảnh hoặc chọn ảnh từ thư viện trước.","err");
    return;
  }
  const btn=$("visualSearchRun");
  if(btn) btn.disabled=true;
  const totalStart=performance.now();
  try{
    setStatus("Đang nhìn ảnh trên thiết bị…");
    const {vector,inferenceMs}=await fileToVector(currentFile);
    setStatus(`Đã tạo vector trong ${inferenceMs} ms. Đang tìm trong kho…`);
    const rows=await searchVector(vector,Number($("visualTopK")?.value||DEFAULT_TOP_K));
    const totalMs=Math.round(performance.now()-totalStart);
    renderResults(rows);
    await tryLogSearch({vector,inferenceMs,totalMs,rows});
    setStatus(`Hoàn tất ${rows.length} kết quả trong ${(totalMs/1000).toFixed(1)} giây.`,"ok");
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
  }finally{opening=false}
}
function closeModal(){
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
    .vs-result{position:relative;border:1px solid #d9e0e7;background:#fff;border-radius:12px;overflow:hidden;padding:0;text-align:left;color:#111827}
    .vs-result img{display:block;width:100%;aspect-ratio:1/1.18;object-fit:contain;background:#fff}
    .vs-result-body{padding:7px}.vs-code{font-size:15px;color:#0000ff;font-weight:900;overflow-wrap:anywhere}.vs-score{font-size:13px;color:#64748b;margin-top:2px}
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
        <div id="visualSearchStatus" class="vs-status">Chụp hoặc chọn một ảnh. AI chỉ nạp khi bạn bắt đầu tìm.</div>
      </div>

      <div class="vs-card">
        <div id="visualResultInfo" class="vs-result-info"></div>
        <div id="visualResults" class="vs-results"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

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
