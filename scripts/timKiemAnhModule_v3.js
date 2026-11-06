// HOAN TUYET — TIM ANH V3.2.2 (CỬA SỔ ĐỘC LẬP)
// Chọn Top 12/24/40/100. Tìm bằng ảnh & hiện kết quả ngay tại đây.
// Dùng RPC V3.2A để lọc tồn sau kiểm; không ghi kết quả vào trạng thái tìm kiếm chính.
import { getSupabaseClient } from "./authModule.js";

const BUILD="VISUAL-V3.2.2-ISOLATED";
const MODEL_ID="Xenova/siglip-base-patch16-224";
const DTYPE="q8",VECTOR_VERSION="python-fp32-v1",CANDIDATE_TOP=800;
const supabase=getSupabaseClient();
let hf=null,processor=null,model=null,loadPromise=null;
let currentFile=null,currentObjectUrl="",currentVector=null,currentCandidates=null;
let searchToken=0,working=false,results=[];
const $=id=>document.getElementById(id);
const norm=x=>String(x??"").trim().toUpperCase();
function branch(){return String(sessionStorage.getItem("diadiem")||localStorage.getItem("diadiem")||"").trim().toLowerCase()}
function employee(){return String(localStorage.getItem("manv")||"").trim()}
function status(message,type=""){
  const el=$("visualSearchStatus");if(!el)return;
  el.className=`vs-status ${type}`.trim();el.textContent=message;
}
function normalize(v){let z=0;for(const x of v)z+=Number(x)*Number(x);const n=Math.sqrt(z)||1;return Array.from(v,x=>Number(x)/n)}
function pgLiteral(v){return `[${v.map(x=>Number(x).toPrecision(9)).join(",")}]`}
async function ensureModel(){
  if(model&&processor)return;
  if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    status("Đang tải AI SigLIP lần đầu trên thiết bị…");
    if(!hf){hf=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");hf.env.allowLocalModels=false;hf.env.useBrowserCache=true;}
    processor=await hf.AutoProcessor.from_pretrained(MODEL_ID);
    model=await hf.SiglipVisionModel.from_pretrained(MODEL_ID,{dtype:DTYPE,device:"wasm"});
  })();
  try{await loadPromise}finally{loadPromise=null}
}
async function toVector(file){
  await ensureModel();
  const temp=URL.createObjectURL(file);
  try{
    const raw=await hf.RawImage.fromURL(temp);
    const inputs=await processor(raw),t=performance.now();
    const output=await model(inputs);
    return {vector:normalize(Array.from(output.pooler_output.data)),inferenceMs:Math.round(performance.now()-t)};
  }finally{URL.revokeObjectURL(temp)}
}
async function vectorCandidates(vector){
  const {data,error}=await supabase.rpc("tim_san_pham_tuong_tu_vector_v3",{
    p_vector:pgLiteral(vector),p_so_luong:CANDIDATE_TOP,p_phien_ban_vector:VECTOR_VERSION
  });
  if(error)throw error;
  const seen=new Set(),out=[];
  for(const item of data||[]){
    const masp=norm(item.masp);
    if(!masp||seen.has(masp))continue;
    seen.add(masp);
    out.push({masp,score:Number(item.diem_giong||0),rank:out.length+1});
  }
  return out;
}
async function logImage({vector,inferenceMs,totalMs,candidates}){
  try{
    await supabase.rpc("ghi_nhat_ky_tim_kiem_anh",{
      p_query_vector:pgLiteral(vector),p_diadiem:branch()||null,p_manv:employee()||null,
      p_inference_ms:inferenceMs||null,p_total_ms:totalMs||null,
      p_top_results:candidates.slice(0,40).map((c,i)=>({rank:i+1,masp:c.masp,diem_giong:c.score}))
    });
  }catch(err){console.debug("[V3 image] log not available",err)}
}
// Thực hiện lọc tồn theo từng đợt ứng viên đã sắp bởi độ giống ảnh.
// RPC V3.2A trả tối đa 200 bản ghi/lượt và có xếp hạng nhập/bán riêng;
// ở cửa sổ ẢNH, sắp trở lại theo rank giống ảnh sau mỗi đợt.
async function stockFilteredCandidates(candidates,wanted,token){
  if(!["cs1","cs2"].includes(branch()))throw new Error("Chưa xác định cơ sở CS1/CS2.");
  const collected=[],seen=new Set();
  const batchSize=120;
  for(let i=0;i<candidates.length&&collected.length<wanted;i+=batchSize){
    if(token!==searchToken)return [];
    const batch=candidates.slice(i,i+batchSize);
    status(`Đang kiểm tra tồn sau kiểm: ${Math.min(i+batchSize,candidates.length)}/${candidates.length} mã…`);
    const {data,error}=await supabase.rpc("timkiemnhanh_ai_candidates_v3",{
      p_diadiem:branch(),p_candidates:batch,p_size:"",p_nhomhang:null,p_form:null,
      p_mausac:null,p_mode:"similar",p_reference_price:0,p_offset:0,p_limit:200
    });
    if(error)throw error;
    if(token!==searchToken)return [];
    for(const row of data||[]){
      const key=norm(row.masp);
      if(!key||seen.has(key))continue;
      seen.add(key);collected.push({...row,__size0_fallback:!!row.is_size0_fallback});
    }
  }
  collected.sort((a,b)=>Number(a.ai_rank||1e9)-Number(b.ai_rank||1e9)||Number(b.ai_score||0)-Number(a.ai_score||0));
  return collected.slice(0,wanted);
}
function render(rows){
  results=rows||[];
  const info=$("visualResultInfo"),list=$("visualResults");
  if(!list)return;
  if(!rows.length){list.innerHTML="";if(info)info.textContent="Không tìm thấy sản phẩm tương tự còn tồn tại cơ sở này.";return}
  if(info)info.textContent=`${rows.length} sản phẩm tương tự, xếp theo độ giống ảnh · chọn size ngay tại đây`;
  const api=window.TimKiemNhanhV3;
  if(!api?.renderVisualCards)throw new Error("Mã Tìm kiếm nhanh V3 chưa cập nhật. Hãy tải lại trang.");
  api.renderVisualCards(list,rows);
}
function selectFile(file){
  if(!file)return;
  searchToken++;
  currentFile=file;currentVector=null;currentCandidates=null;results=[];
  if(currentObjectUrl){try{URL.revokeObjectURL(currentObjectUrl)}catch{}}
  currentObjectUrl=URL.createObjectURL(file);
  const preview=$("visualSearchPreview");
  if(preview){preview.src=currentObjectUrl;preview.style.display="block"}
  $("visualResults").innerHTML="";$("visualResultInfo").textContent="";
  status("Ảnh đã sẵn sàng. Chọn số lượng và bấm TÌM SẢN PHẨM.","ok");
}
async function runSearch(){
  if(working)return;
  if(!currentFile){status("Hãy chụp hoặc chọn ảnh trước.","err");return}
  const token=++searchToken,btn=$("visualSearchRun"),count=Number($("visualTopK")?.value||24),start=performance.now();
  working=true;if(btn)btn.disabled=true;
  try{
    if(!currentVector){
      status("Đang đọc đặc điểm ảnh mẫu…");
      const out=await toVector(currentFile);
      if(token!==searchToken)return;
      currentVector=out.vector;
      status("Đang tìm những ảnh giống ảnh mẫu…");
      currentCandidates=await vectorCandidates(out.vector);
      if(token!==searchToken)return;
      void logImage({vector:out.vector,inferenceMs:out.inferenceMs,totalMs:Math.round(performance.now()-start),candidates:currentCandidates});
    }
    $("visualResults").innerHTML="";
    $("visualResultInfo").textContent="";
    const rows=await stockFilteredCandidates(currentCandidates||[],count,token);
    if(token!==searchToken)return;
    render(rows);
    status(`Hoàn tất: ${rows.length}/${count} ảnh tương tự có hàng tại ${branch().toUpperCase()} · ${(performance.now()-start)/1000|0} giây.`,"ok");
  }catch(e){console.error("[V3 image]",e);status("Lỗi tìm bằng ảnh: "+(e?.message||String(e)),"err")}
  finally{working=false;if(btn)btn.disabled=false}
}
function openModal(){const modal=$("visualSearchModal");if(!modal)return;modal.classList.add("show");modal.setAttribute("aria-hidden","false");document.body.classList.add("vs-open")}
function closeModal(){const modal=$("visualSearchModal");modal?.classList.remove("show");modal?.setAttribute("aria-hidden","true");document.body.classList.remove("vs-open")}
function injectStyles(){
  if($("visualSearchStyle"))return;
  const st=document.createElement("style");st.id="visualSearchStyle";
  st.textContent=`
.visual-search-entry{width:100%;margin-top:7px;border:0;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#172033,#075f9f);color:white;font-size:16px;font-weight:900;min-height:44px}
.vs-modal{display:none;position:fixed;inset:0;z-index:60000;background:#f4f6f8;color:#111827;overflow:auto;-webkit-overflow-scrolling:touch}
.vs-modal.show{display:block}.vs-open{overflow:hidden}.vs-shell{max-width:960px;margin:0 auto;padding:0 6px calc(24px + env(safe-area-inset-bottom))}
.vs-head{position:sticky;top:0;z-index:3;background:rgba(244,246,248,.96);display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 5px 10px;border-bottom:1px solid #dde3ea}
.vs-title{font-size:19px;font-weight:900;flex:1}.vs-close{border:0;border-radius:10px;background:#e7ebef;padding:9px 13px;font-weight:900}
.vs-card{background:white;border:1px solid #dce3e9;border-radius:13px;padding:9px 7px;margin-top:8px}
.vs-source-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.vs-file-btn{display:flex;align-items:center;justify-content:center;min-height:51px;border-radius:10px;font-size:15px;font-weight:900;text-align:center}
.vs-camera{background:#111827;color:#fff}.vs-library{background:#e8f2ff;color:#075f9f;border:1px solid #bad9f5}.vs-preview{display:none;width:100%;max-height:40vh;object-fit:contain;background:#f3f4f6;border-radius:10px;margin-top:8px}
.vs-run-row{display:grid;grid-template-columns:1fr 120px;gap:7px;margin-top:8px}.vs-run{border:0;border-radius:10px;background:#0878d1;color:white;font-weight:900;min-height:48px;padding:8px;font-size:16px}.vs-run:disabled{opacity:.5}.vs-topk{border:1px solid #cbd5e1;border-radius:10px;background:white;padding:0 6px;font-weight:800;min-width:0}
.vs-status{margin-top:8px;border-radius:8px;padding:8px 9px;background:#f0f2f4;color:#394554;font-size:13px}.vs-status.ok{background:#e9f9ef;color:#126238}.vs-status.err{background:#fff0f0;color:#b42318}
.vs-result-info{font-size:13px;color:#64748b;padding:3px 2px 8px}.vs-results{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}
.vs-match-card{position:relative;min-width:0}.vs-match-rank{position:absolute;left:4px;top:5px;z-index:2;min-width:25px;height:25px;padding:0 5px;border-radius:20px;background:#14213dde;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;pointer-events:none}
.vs-match-score{font-size:12px;color:#64748b;background:#fff;padding:3px 5px}.vs-results .product{height:auto}.vs-results .product-image-wrap{height:210px}
.vs-results .stock-link,.vs-results .price,.vs-results .product-info-line{overflow-wrap:anywhere}
@media(max-width:650px){.vs-results{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}.vs-results .product-image-wrap{height:225px}.vs-title{font-size:17px}.vs-results .stock-link,.vs-results .price,.vs-results .product-info-line{font-size:15px}.vs-results .product-kho,.vs-results .product-mau{font-size:17px!important}}
`;
  document.head.appendChild(st);
}
function injectUi(){
  if($("visualSearchModal"))return;
  injectStyles();
  const quickbar=document.querySelector(".quickbar");
  if(quickbar){const btn=document.createElement("button");btn.type="button";btn.id="btnVisualSearch";btn.className="visual-search-entry";btn.textContent="✨ TÌM BẰNG HÌNH ẢNH";quickbar.insertAdjacentElement("afterend",btn)}
  const modal=document.createElement("div");modal.id="visualSearchModal";modal.className="vs-modal";modal.setAttribute("aria-hidden","true");
  modal.innerHTML=`<div class="vs-shell">
    <div class="vs-head"><div class="vs-title">✨ Tìm sản phẩm bằng hình ảnh · V3.2</div><button type="button" class="vs-close" id="visualSearchClose">Đóng</button></div>
    <div class="vs-card"><div class="vs-source-actions">
      <label class="vs-file-btn vs-camera">📷 CHỤP ẢNH<input id="visualCameraInput" type="file" accept="image/*" capture="environment" hidden></label>
      <label class="vs-file-btn vs-library">🖼 THƯ VIỆN<input id="visualLibraryInput" type="file" accept="image/*" hidden></label>
    </div><img id="visualSearchPreview" class="vs-preview" alt="Ảnh mẫu">
    <div class="vs-run-row"><button type="button" id="visualSearchRun" class="vs-run">TÌM SẢN PHẨM</button>
      <select id="visualTopK" class="vs-topk" aria-label="Số ảnh tương tự"><option value="12">12 ảnh</option><option value="24" selected>24 ảnh</option><option value="40">40 ảnh</option><option value="100">100 ảnh</option></select>
    </div><div id="visualSearchStatus" class="vs-status">Chọn ảnh mẫu, chọn số lượng, rồi tìm. Kết quả chỉ hiển thị trong cửa sổ này.</div></div>
    <div class="vs-card"><div id="visualResultInfo" class="vs-result-info"></div><div id="visualResults" class="vs-results"></div></div>
  </div>`;
  document.body.appendChild(modal);
  $("btnVisualSearch")?.addEventListener("click",openModal);
  $("visualSearchClose")?.addEventListener("click",closeModal);
  $("visualCameraInput")?.addEventListener("change",e=>{selectFile(e.target.files?.[0]);e.target.value=""});
  $("visualLibraryInput")?.addEventListener("change",e=>{selectFile(e.target.files?.[0]);e.target.value=""});
  $("visualSearchRun")?.addEventListener("click",runSearch);
  $("visualTopK")?.addEventListener("change",()=>{if(currentCandidates&&!working)void runSearch()});
}
function init(){injectUi();console.log("[TimKiemAnhModule V3]",BUILD)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
export {openModal as openVisualSearch};
