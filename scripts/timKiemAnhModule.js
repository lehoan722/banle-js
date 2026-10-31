// ============================================================
// HOAN TUYET - VISUAL SEARCH V2 HYBRID RANKING
// SigLIP image -> Top candidates -> group + stock-after-check + size + description
// Khong sua timKiemNhanh_v2.js. Chon ket qua -> dua MASP ve luong processCode cu.
// ============================================================

import { getSupabaseClient } from "./authModule.js";

const BUILD="VISUAL-HYBRID-2.7.1";
const MODEL_ID="Xenova/siglip-base-patch16-224";
const DTYPE="q8";
const VECTOR_VERSION="python-fp32-v1";
const DISCOVERY_K=150;
const EXPAND_STEPS=[150,300,450];
const DEFAULT_TOP_K=24;
const SIZE_LIST=["38","39","40","41","42","43","44","45","46"];
const MAIN_GROUPS={
  AUTO:{label:"Tự động",groups:[]},
  AO_HE:{label:"Áo hè",groups:["AP","SM","3LO","BOC"]},
  QUAN:{label:"Quần",groups:["QB","QT","QV","NGO","QNI"]},
  AO_RET:{label:"Áo rét",groups:["AOKHOAC","TD","SO","LEN","AODA","BOD"]},
  GIAY_DEP:{label:"Giày dép",groups:["DEP","GIAYDA","GIAYSUC","GIAYTHOITRANG"]}
};
const COLOR_WORDS={
  "den":["đen","black"],"trang":["trắng","white"],"xam":["xám","ghi","gray","grey"],
  "xanh":["xanh"],"xanhduong":["xanh dương","blue"],"xanhla":["xanh lá","green"],
  "do":["đỏ","red"],"tim":["tím","purple"],"hong":["hồng","pink"],"be":["be","kem","cream"],
  "nau":["nâu","brown"],"vang":["vàng","yellow"]
};
const GROUP_WORDS=[
  {words:["áo khoác","khoác","jacket"],group:"AOKHOAC",main:"AO_RET"},
  {words:["sơ mi","somi","shirt"],group:"SM",main:"AO_HE"},
  {words:["polo","áo phông cổ bẻ","áo có cổ"],group:"AP",main:"AO_HE"},
  {words:["áo phông","t-shirt","tshirt"],group:"AP",main:"AO_HE"},
  {words:["ba lỗ","3 lỗ"],group:"3LO",main:"AO_HE"},
  {words:["jean","quần bò","denim"],group:"QB",main:"QUAN"},
  {words:["quần tây","quần âu"],group:"QT",main:"QUAN"},
  {words:["quần vải"],group:"QV",main:"QUAN"},
  {words:["nỉ"],group:"QNI",main:"QUAN"},
  {words:["len"],group:"LEN",main:"AO_RET"},
  {words:["da"],group:"AODA",main:"AO_RET"},
  {words:["giày da"],group:"GIAYDA",main:"GIAY_DEP"},
  {words:["sneaker","thể thao"],group:"GIAYTHOITRANG",main:"GIAY_DEP"},
  {words:["dép"],group:"DEP",main:"GIAY_DEP"}
];

const supabase=getSupabaseClient();
let hf=null,processor=null,model=null,currentFile=null,currentObjectUrl="",currentQueryVector=null;
let groupRows=[],currentCandidates=[],currentMain="AUTO",currentSub="",autoSuggestedMain="",autoSuggestedSub="";
let currentSearchId=null,currentMetaByMasp=new Map();

const $=id=>document.getElementById(id);
const norm=v=>String(v??"").trim().toUpperCase();
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const strip=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const branch=()=>String(sessionStorage.getItem("diadiem")||localStorage.getItem("diadiem")||"").trim().toLowerCase();
const employee=()=>String(localStorage.getItem("manv")||"").trim();
const bizDate=()=>{
  try{
    const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const m=Object.fromEntries(p.map(x=>[x.type,x.value])); return `${m.year}-${m.month}-${m.day}`;
  }catch{return new Date().toISOString().slice(0,10)}
};

function setStatus(t,type=""){const e=$("visualSearchStatus");if(e){e.textContent=t;e.className=`vs-status ${type}`.trim()}}
function l2(a){let s=0;for(const x of a)s+=Number(x)*Number(x);const n=Math.sqrt(s)||1;return Array.from(a,x=>Number(x)/n)}
function vecLit(v){return "["+v.map(x=>Number(x).toPrecision(9)).join(",")+"]"}
function mainForGroup(g){g=norm(g);for(const [k,c] of Object.entries(MAIN_GROUPS))if(k!=="AUTO"&&c.groups.includes(g))return k;return""}
function groupLabel(code){
  const r=groupRows.find(x=>norm(x.manhom)===norm(code));
  return String(r?.ten_hien_thi||code||"").trim();
}

async function ensureModel(){
  if(model&&processor)return;
  setStatus("Đang nạp AI ảnh lần đầu trên thiết bị…");
  const t=performance.now();
  if(!hf){
    hf=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
    hf.env.allowLocalModels=false;hf.env.useBrowserCache=true;
  }
  processor=await hf.AutoProcessor.from_pretrained(MODEL_ID);
  model=await hf.SiglipVisionModel.from_pretrained(MODEL_ID,{dtype:DTYPE,device:"wasm"});
  setStatus(`AI ảnh sẵn sàng (${((performance.now()-t)/1000).toFixed(1)}s).`,"ok");
}
async function fileVector(file){
  await ensureModel(); const url=URL.createObjectURL(file);
  try{
    const raw=await hf.RawImage.fromURL(url); const inputs=await processor(raw); const t=performance.now();
    const out=await model(inputs); return {vector:l2(Array.from(out.pooler_output.data)),ms:Math.round(performance.now()-t)};
  }finally{URL.revokeObjectURL(url)}
}

async function loadGroups(){
  if(groupRows.length)return;
  const {data,error}=await supabase.from("cauhinh_nhom_tu_van").select("manhom,ten_hien_thi,thu_tu,active").eq("active",true).order("thu_tu");
  if(!error)groupRows=data||[];
  renderGroupSelectors();
}
function renderGroupSelectors(){
  const main=$("visualMainGroup"),sub=$("visualSubGroup"); if(!main||!sub)return;
  main.innerHTML=Object.entries(MAIN_GROUPS).map(([k,c])=>`<option value="${k}">${esc(c.label)}</option>`).join("");
  main.value=currentMain||"AUTO";
  const cfg=MAIN_GROUPS[currentMain]||MAIN_GROUPS.AUTO;
  const gs=currentMain==="AUTO"?[]:cfg.groups;
  sub.innerHTML='<option value="">Tất cả nhóm nhỏ</option>'+gs.map(g=>`<option value="${esc(g)}">${esc(groupLabel(g))}</option>`).join("");
  sub.disabled=currentMain==="AUTO";
  if(gs.includes(currentSub))sub.value=currentSub;else currentSub="";
  updateAutoHint();
}
function updateAutoHint(){
  const e=$("visualAutoGroupHint");if(!e)return;
  if(currentMain==="AUTO"){
    if(autoSuggestedMain){
      e.innerHTML=`AI gợi ý: <b>${esc(MAIN_GROUPS[autoSuggestedMain]?.label||autoSuggestedMain)}</b>${autoSuggestedSub?` → <b>${esc(groupLabel(autoSuggestedSub))}</b>`:""}. Chế độ Tự động sẽ loại nhóm khác sau khi đủ độ tin cậy.`;
    }else e.textContent="AI sẽ dự đoán nhóm từ các ảnh gần nhất và dữ liệu đã học.";
  }else{
    e.innerHTML=`Đang khóa nhóm: <b>${esc(MAIN_GROUPS[currentMain]?.label||currentMain)}</b>${currentSub?` → <b>${esc(groupLabel(currentSub))}</b>`:""}. Sản phẩm ngoài nhóm sẽ bị loại.`;
  }
}
function parseDescription(){
  const raw=String($("visualDescription")?.value||"").trim();
  const s=strip(raw); let inferredGroup="",inferredMain="",colorTerms=[];
  for(const x of GROUP_WORDS){
    if(x.words.some(w=>s.includes(strip(w)))){inferredGroup=x.group;inferredMain=x.main;break}
  }
  for(const [key,words] of Object.entries(COLOR_WORDS)){
    if(words.some(w=>s.includes(strip(w))))colorTerms.push(key);
  }
  return {raw,s,inferredGroup,inferredMain,colorTerms};
}
function textBoost(meta,desc){
  if(!desc.s)return 0;
  let score=0;
  const group=norm(meta?.nhomhang);
  if(desc.inferredGroup&&group===norm(desc.inferredGroup))score+=0.08;
  const hay=strip([meta?.mausac,meta?.form,meta?.nhomhang,groupLabel(meta?.nhomhang)].filter(Boolean).join(" "));
  for(const term of desc.colorTerms){
    const words=COLOR_WORDS[term]||[];
    if(words.some(w=>hay.includes(strip(w))))score+=0.035;
  }
  return Math.min(score,0.15);
}

async function vectorCandidates(vector,limit=DISCOVERY_K){
  const {data,error}=await supabase.rpc("tim_san_pham_tuong_tu_vector",{
    p_vector:vecLit(vector),p_so_luong:limit,p_phien_ban_vector:VECTOR_VERSION
  });
  if(error)throw error;
  const seen=new Set(),out=[];
  for(const r of data||[]){
    const m=norm(r.masp);if(!m||seen.has(m))continue;seen.add(m);out.push({...r,masp:m});
  }
  return out;
}
async function vectorCandidatesInGroups(vector,groups,limit=600){
  // Giữ lại để tương thích/debug, nhưng V2.7.1 KHÔNG dùng trong ranking chính.
  const cleaned=(groups||[]).map(norm).filter(Boolean);
  const {data,error}=await supabase.rpc("tim_san_pham_tuong_tu_vector_loc_nhom",{
    p_vector:vecLit(vector),p_nhomhang:cleaned.length?cleaned:null,p_so_luong:limit,p_phien_ban_vector:VECTOR_VERSION
  });
  if(error)throw error;
  return data||[];
}

// V2.7.1: giữ "mặt cắt similarity toàn kho" như V2.6.
// Chỉ mở rộng dần 150 -> 300 -> 450 nếu sau khi lọc nhóm + tồn vẫn thiếu kết quả.
// Không tìm 600 mã trong toàn bộ nhóm vì sẽ làm loãng độ giống ảnh.
async function adaptiveGlobalCandidates(vector, groupFilter, desc, targetCount){
  let last = null;
  for(const limit of EXPAND_STEPS){
    const cands = await vectorCandidates(vector, limit);
    const metaMap = await fetchMetadata(cands.map(x=>x.masp));

    // Lọc nhóm trước khi gọi tồn để giảm tải.
    const groupCands = cands.filter(r=>{
      const meta = metaMap.get(norm(r.masp));
      if(!meta) return false;
      const g = norm(meta.nhomhang), main = mainForGroup(g);
      if(groupFilter.main && main !== groupFilter.main) return false;
      if(groupFilter.group && g !== norm(groupFilter.group)) return false;
      return true;
    });

    const masps = groupCands.map(x=>norm(x.masp));
    const [baseMap,checkMap] = await Promise.all([
      fetchBaseStock(masps),
      fetchCheckBulk(masps)
    ]);
    const ranked = rankCandidates(cands,metaMap,baseMap,checkMap,groupFilter,desc);

    last = {limit,cands,metaMap,ranked};
    if(ranked.good.length >= targetCount) return last;
  }
  return last;
}
async function fetchMetadata(masps){
  const uniq=[...new Set((masps||[]).map(norm).filter(Boolean))];
  const out=[];
  for(let i=0;i<uniq.length;i+=150){
    const chunk=uniq.slice(i,i+150);
    const {data,error}=await supabase.from("dmhanghoa")
      .select("masp,nhomhang,form,mausac,giale,vitrikho1,vitrikho2,treomaucs1,treomaucs2")
      .in("masp",chunk);
    if(error)throw error;
    out.push(...(data||[]));
  }
  return new Map(out.map(x=>[norm(x.masp),x]));
}
function sizeKey(v){const raw=String(v??"").replace(/^size\s+/i,"").trim();const m=raw.match(/\d{1,2}/);return m?m[0]:raw}

async function fetchBaseStock(masps){
  const map=new Map(); if(!masps.length)return map;
  const {data,error}=await supabase.rpc("xntnhanh",{p_masps:masps,p_den_ngay:bizDate(),p_tonghop_size:false});
  if(error)throw error;
  for(const r of data||[]){
    const m=norm(r.masp),s=sizeKey(r.size); if(!m||!s)continue;
    if(!map.has(m))map.set(m,{});
    map.get(m)[s]={ton_cs1:Number(r.ton_cs1||0),ton_cs2:Number(r.ton_cs2||0)};
  }
  return map;
}
async function fetchCheckBulk(masps){
  if(!masps.length)return new Map();
  try{
    const {data,error}=await supabase.rpc("rpc_stockquick_kiemton_bulk",{p_masps:masps});
    if(error)throw error;
    const map=new Map();
    // Hỗ trợ cả dạng mỗi row/masp và dạng object.
    if(Array.isArray(data)){
      for(const r of data){
        const m=norm(r.masp||r.ma_sp||r.code);if(!m)continue;
        map.set(m,r);
      }
    }else if(data&&typeof data==="object"){
      for(const [k,v] of Object.entries(data))map.set(norm(k),v);
    }
    return map;
  }catch(e){
    console.warn("[VisualHybrid] bulk kiem ton unavailable, fallback limited:",e);
    // Fallback chỉ áp dụng tối đa 60 ứng viên đầu để tránh 150 RPC.
    const map=new Map(), list=masps.slice(0,60); let cursor=0;
    async function worker(){
      while(cursor<list.length){
        const m=list[cursor++];
        try{
          const {data}=await supabase.rpc("rpc_stockquick_kiemton",{p_masp:m});
          if(data)map.set(m,data);
        }catch{}
      }
    }
    await Promise.all(Array.from({length:8},worker));
    return map;
  }
}
function lechFromCheck(check,cs,size){
  if(!check)return 0;
  const s=String(size);
  // Dạng JSON StockQuick: {cs1:{lech:{...}},cs2:{lech:{...}}}
  const a=Number(check?.[cs]?.lech?.[s]);
  if(Number.isFinite(a))return a;
  // Một số bulk RPC có thể trả lech_cs1/lech_cs2 JSON.
  const b=Number(check?.[`lech_${cs}`]?.[s]);
  if(Number.isFinite(b))return b;
  const c=Number(check?.[`lech_${cs}_${s}`]);
  if(Number.isFinite(c))return c;
  return 0;
}
function stockSummary(masp,baseMap,checkMap){
  const base=baseMap.get(masp)||{},check=checkMap.get(masp)||null,cs=branch()==="cs2"?"cs2":"cs1";
  const sizes=new Set([...Object.keys(base),...SIZE_LIST,"0"]);
  const after={};let total=0,positive=0,negative=false;
  for(const s of sizes){
    const b=Number(base?.[s]?.[`ton_${cs}`]||0);
    const v=b+lechFromCheck(check,cs,s);
    after[s]=v; total+=Math.max(0,v); if(v>0)positive+=v;if(v<0)negative=true;
  }
  return {after,totalPositive:positive,totalRaw:Object.values(after).reduce((a,b)=>a+Number(b||0),0),negative};
}

function weightedGroupSuggestion(cands,metaMap){
  const mainScore={},subScore={};
  for(const r of cands.slice(0,60)){
    const meta=metaMap.get(norm(r.masp));if(!meta)continue;
    const g=norm(meta.nhomhang),main=mainForGroup(g);if(!main)continue;
    const sim=Math.max(0,Number(r.diem_giong||0));
    const w=Math.pow(sim,4); // top near-neighbors weigh much more
    mainScore[main]=(mainScore[main]||0)+w;
    subScore[g]=(subScore[g]||0)+w;
  }
  const best=(o)=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]||["",0];
  const [m,ms]=best(mainScore),[g,gs]=best(subScore);
  const mt=Object.values(mainScore).reduce((a,b)=>a+b,0)||1,gt=Object.values(subScore).reduce((a,b)=>a+b,0)||1;
  return {main:m,mainConfidence:ms/mt,group:g,groupConfidence:gs/gt};
}
async function learnedGroupSuggestion(vector){
  try{
    const {data,error}=await supabase.rpc("goi_y_nhom_tim_kiem_anh",{p_vector:vecLit(vector),p_limit:30});
    if(error||!data?.length)return null;
    return data[0];
  }catch{return null}
}

function effectiveGroup(auto,desc){
  if(currentMain!=="AUTO")return {main:currentMain,group:currentSub,source:"manual"};
  // Mô tả rõ nhóm thì ưu tiên mô tả.
  if(desc.inferredMain)return {main:desc.inferredMain,group:desc.inferredGroup,source:"description"};
  return {main:autoSuggestedMain,group:autoSuggestedSub,source:"auto"};
}

function rankCandidates(cands,metaMap,baseMap,checkMap,groupFilter,desc){
  const selectedSize=String($("visualSize")?.value||"");
  const good=[],suspect=[];
  for(const r of cands){
    const m=norm(r.masp),meta=metaMap.get(m);if(!meta)continue;
    const g=norm(meta.nhomhang),main=mainForGroup(g);
    if(groupFilter.main&&main!==groupFilter.main)continue;
    if(groupFilter.group&&g!==norm(groupFilter.group))continue;
    const stock=stockSummary(m,baseMap,checkMap);
    const sizeQty=selectedSize?Number(stock.after[selectedSize]||0):null;
    const sellable=selectedSize?sizeQty>0:stock.totalPositive>0;
    const sim=Number(r.diem_giong||0);
    // similarity remains dominant; description structured boost is small.
    let finalScore=sim + textBoost(meta,desc);
    if(sellable)finalScore+=0.025;
    const row={...r,...meta,__stock:stock,__sizeQty:sizeQty,__final:finalScore,__main:main};
    if(sellable)good.push(row);
    else if(stock.negative||stock.totalRaw<=0)suspect.push(row);
  }
  good.sort((a,b)=>b.__final-a.__final);
  suspect.sort((a,b)=>Number(b.diem_giong)-Number(a.diem_giong));
  return {good,suspect};
}

async function logLearning({vector,groupFilter,desc,candidates,chosen=null}){
  try{
    if(!currentSearchId){
      const {data,error}=await supabase.rpc("ghi_hoc_tim_kiem_anh_v2",{
        p_query_vector:vecLit(vector),
        p_diadiem:branch()||null,
        p_manv:employee()||null,
        p_main_group:groupFilter.main||null,
        p_nhomhang:groupFilter.group||null,
        p_nguon_nhom:groupFilter.source||null,
        p_mo_ta:desc.raw||null,
        p_top_results:(candidates||[]).slice(0,40).map((r,i)=>({rank:i+1,masp:r.masp,sim:Number(r.diem_giong||0)}))
      });
      if(!error)currentSearchId=Array.isArray(data)?data[0]:data;
    }
    if(chosen&&currentSearchId){
      await supabase.rpc("cap_nhat_hoc_tim_kiem_anh_v2_chon",{p_id:currentSearchId,p_masp_chon:norm(chosen)});
    }
  }catch(e){console.debug("[VisualHybrid] learning log skip",e)}
}

async function confirmGroupFeedback(kind="correct"){
  if(!currentQueryVector){setStatus("Hãy tìm một ảnh trước khi dạy AI.","err");return}
  let main="",group="",source="manual_confirm";
  if(kind==="correct"){
    main=autoSuggestedMain;group=autoSuggestedSub;source="auto_confirm";
    if(!main){setStatus("AI chưa đủ tự tin để xác định nhóm. Hãy chọn nhóm thủ công.","err");return}
  }else{
    if(currentMain==="AUTO"){setStatus("Hãy chọn nhóm đúng ở ô Nhóm, rồi bấm ‘Dạy AI nhóm đang chọn’.","err");return}
    main=currentMain;group=currentSub;source="manual_correct";
  }
  try{
    const {error}=await supabase.rpc("xac_nhan_nhom_tim_kiem_anh",{
      p_query_vector:vecLit(currentQueryVector),p_main_group:main||null,p_nhomhang:group||null,
      p_masp_chon:null,p_manv:employee()||null,p_nguon_xac_nhan:source
    });
    if(error)throw error;
    setStatus(kind==="correct"?"✅ Đã ghi nhận AI nhận đúng nhóm.":"✅ Đã dạy AI nhóm mới. Đang tìm lại theo nhóm vừa sửa…","ok");
    if(kind!=="correct"&&currentFile)setTimeout(()=>runSearch(),120);
  }catch(e){setStatus("Không lưu được phản hồi nhóm: "+(e?.message||e),"err")}
}
function openImageLightbox(src,caption=""){
  const lb=$("visualLightbox"),img=$("visualLightboxImg"),cap=$("visualLightboxCaption");
  if(!lb||!img)return;img.src=src;cap.textContent=caption;lb.classList.add("show");
}
function closeImageLightbox(){const lb=$("visualLightbox");if(lb)lb.classList.remove("show")}
function resultCard(r,i,suspect=false){
  const pct=(Number(r.diem_giong||0)*100).toFixed(1);
  const size=String($("visualSize")?.value||"");
  const raw=size?Number(r.__sizeQty||0):Number(r.__stock?.totalRaw||0);
  const positive=size?Math.max(0,Number(r.__sizeQty||0)):Number(r.__stock?.totalPositive||0);
  const stockText=size?`Size ${size}: ${suspect?raw:positive}`:`Tồn sau kiểm: ${suspect?raw:positive}`;
  return `<div class="vs-result ${suspect?"suspect":""}">
    <div class="vs-rank">${i+1}</div>
    <button type="button" class="vs-image-btn" data-src="${esc(r.duong_dan_anh||"")}" data-caption="${esc(r.masp)}"><img loading="lazy" decoding="async" src="${esc(r.duong_dan_anh||"")}" alt="${esc(r.masp)}"></button>
    <div class="vs-body"><button type="button" class="vs-code-link" data-masp="${esc(r.masp)}">${esc(r.masp)}</button>
    <div class="vs-score">Giống ${pct}% · ${esc(groupLabel(r.nhomhang)||r.nhomhang||"")}</div>
    <div class="vs-stock ${suspect?"bad":""}">${esc(stockText)}</div></div>
  </div>`;
}
function bindResultActions(container){
  container.querySelectorAll(".vs-image-btn").forEach(b=>b.onclick=()=>openImageLightbox(b.dataset.src,b.dataset.caption));
  container.querySelectorAll(".vs-code-link").forEach(b=>b.onclick=()=>chooseProduct(b.dataset.masp));
}
function renderRows(rows,suspects=[]){
  const limit=Number($("visualTopK")?.value||DEFAULT_TOP_K),show=rows.slice(0,limit);
  const box=$("visualResults"),info=$("visualResultInfo");
  info.textContent=`${show.length} sản phẩm còn bán được · đã lọc theo tồn sau kiểm${currentMain!=="AUTO"?" + nhóm chọn":autoSuggestedMain?" + nhóm tự động":""}.`;
  box.innerHTML=show.map((r,i)=>resultCard(r,i,false)).join("");
  bindResultActions(box);

  const sb=$("visualSuspectBox"),sl=$("visualSuspectList");
  if(suspects.length){
    sb.style.display="block";
    sl.innerHTML=suspects.slice(0,Math.max(12,limit)).map((r,i)=>resultCard(r,i,true)).join("");
    bindResultActions(sl);
  }else sb.style.display="none";
}
async function runSearch(){
  if(!currentFile){setStatus("Hãy chụp hoặc chọn ảnh trước.","err");return}
  if(!["cs1","cs2"].includes(branch())){setStatus("Chưa xác định cơ sở CS1/CS2.","err");return}
  const btn=$("visualSearchRun");btn.disabled=true;const t0=performance.now();currentSearchId=null;
  try{
    await loadGroups();
    setStatus("Đang đọc ảnh…");
    const {vector,ms}=await fileVector(currentFile);currentQueryVector=vector;

    // Bước 1: lấy 150 gần nhất toàn kho để nhận biết nhóm.
    setStatus(`Vector ${ms} ms · đang nhận biết nhóm từ ${DISCOVERY_K} ảnh gần nhất…`);
    const discovery=await vectorCandidates(vector,DISCOVERY_K);
    const discoveryMeta=await fetchMetadata(discovery.map(x=>x.masp));
    const desc=parseDescription();
    const visualSug=weightedGroupSuggestion(discovery,discoveryMeta);
    const learned=await learnedGroupSuggestion(vector);

    let autoMain="",autoSub="";
    if(learned&&Number(learned.do_tin_cay||0)>=0.55){
      autoMain=String(learned.main_group||"");autoSub=String(learned.nhomhang||"");
    }else{
      autoMain=visualSug.mainConfidence>=0.50?visualSug.main:"";
      autoSub=visualSug.groupConfidence>=0.42?visualSug.group:"";
    }
    if(desc.inferredMain){autoMain=desc.inferredMain;autoSub=desc.inferredGroup}
    autoSuggestedMain=autoMain;autoSuggestedSub=autoSub;updateAutoHint();

    const gf=effectiveGroup({main:autoMain,group:autoSub},desc);
    const target=Math.max(Number($("visualTopK")?.value||DEFAULT_TOP_K),12);

    // V2.7.1: KHÔNG query 600 mã riêng trong nhóm.
    // Giữ ranking similarity toàn kho; mở rộng dần nếu lọc xong chưa đủ hàng bán được.
    setStatus(`Nhóm ${gf.main?MAIN_GROUPS[gf.main]?.label:"chưa khóa"}${gf.group?` → ${groupLabel(gf.group)}`:""} · đang lọc theo độ giống + tồn…`);
    const result=await adaptiveGlobalCandidates(vector,gf,desc,target);
    if(!result) throw new Error("Không lấy được ứng viên.");

    currentCandidates=result.cands;
    currentMetaByMasp=result.metaMap;
    renderRows(result.ranked.good,result.ranked.suspect);
    await logLearning({vector,groupFilter:gf,desc,candidates:result.ranked.good});

    const topSim=result.ranked.good?.[0]?.diem_giong;
    const simText=Number.isFinite(Number(topSim))?` · Top ${(Number(topSim)*100).toFixed(1)}%`:"";
    setStatus(
      `Hoàn tất: dùng Top ${result.limit} toàn kho → ${result.ranked.good.length} mã còn bán được, ${result.ranked.suspect.length} mã tồn nghi ngờ${simText} · ${((performance.now()-t0)/1000).toFixed(1)} giây.`,
      "ok"
    );
  }catch(e){
    console.error(e);setStatus("Lỗi Hybrid Search: "+(e?.message||e),"err");
  }finally{btn.disabled=false}
}
async function chooseProduct(masp){
  const meta=currentMetaByMasp.get(norm(masp));
  if(currentQueryVector){
    const desc=parseDescription(),gf=effectiveGroup({main:autoSuggestedMain,group:autoSuggestedSub},desc);
    await logLearning({vector:currentQueryVector,groupFilter:gf,desc,candidates:currentCandidates,chosen:masp});
    // Nếu user đang AUTO, sản phẩm họ chọn chính là nhãn huấn luyện nhóm tốt.
    if(currentMain==="AUTO"&&meta){
      try{
        await supabase.rpc("ghi_nhan_nhom_dung_tim_kiem_anh",{
          p_query_vector:vecLit(currentQueryVector),
          p_main_group:mainForGroup(meta.nhomhang)||null,
          p_nhomhang:norm(meta.nhomhang)||null,
          p_masp_chon:norm(masp),
          p_manv:employee()||null
        });
      }catch{}
    }
  }
  closeModal();
  const input=$("codeInput");if(!input)return;
  input.value=norm(masp);input.dispatchEvent(new Event("input",{bubbles:true}));input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true,cancelable:true}));
}

function selectFile(file){
  if(!file)return;currentFile=file;
  if(currentObjectUrl)try{URL.revokeObjectURL(currentObjectUrl)}catch{}
  currentObjectUrl=URL.createObjectURL(file);
  const img=$("visualSearchPreview");img.src=currentObjectUrl;img.style.display="block";
  $("visualResults").innerHTML="";$("visualResultInfo").textContent="";$("visualSuspectBox").style.display="none";
  setStatus("Ảnh sẵn sàng. Có thể chọn nhóm/mô tả/size rồi tìm.","ok");
}
function openModal(){$("visualSearchModal")?.classList.add("show");document.body.classList.add("vs-open");loadGroups().catch(()=>{})}
function closeModal(){$("visualSearchModal")?.classList.remove("show");document.body.classList.remove("vs-open")}

function inject(){
  if($("visualSearchModal"))return;
  const st=document.createElement("style");st.id="visualHybridStyle";st.textContent=`
  .visual-search-entry{width:100%;margin-top:7px;border:0;border-radius:10px;padding:10px 12px;background:linear-gradient(135deg,#172033,#075f9f);color:#fff;font-weight:900;font-size:16px;min-height:44px}
  .vs-modal{display:none;position:fixed;inset:0;z-index:60000;background:#f4f6f8;overflow:auto}.vs-modal.show{display:block}.vs-open{overflow:hidden}
  .vs-shell{max-width:980px;margin:auto;padding:0 8px calc(18px + env(safe-area-inset-bottom))}.vs-head{position:sticky;top:0;z-index:4;background:#f4f6f8ee;backdrop-filter:blur(10px);display:flex;align-items:center;padding:calc(8px + env(safe-area-inset-top)) 0 8px;border-bottom:1px solid #dbe2e8}.vs-title{font-size:20px;font-weight:900;flex:1}.vs-close{border:0;border-radius:9px;padding:9px 12px;font-weight:900}
  .vs-card{background:#fff;border:1px solid #dce3e9;border-radius:15px;padding:10px;margin-top:9px}.vs-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.vs-file{display:flex;min-height:54px;align-items:center;justify-content:center;border-radius:11px;font-weight:900}.vs-camera{background:#111827;color:#fff}.vs-library{background:#e8f2ff;color:#075f9f}
  .vs-preview{display:none;width:100%;max-height:40vh;object-fit:contain;border-radius:12px;margin-top:8px;background:#f3f4f6}.vs-filters{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.vs-filters select,.vs-desc{width:100%;height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;padding:0 9px;font-size:15px}.vs-desc{margin-top:7px}
  .vs-auto{font-size:12px;color:#536273;background:#f6f8fa;border-radius:8px;padding:7px;margin-top:7px;line-height:1.35}.vs-runrow{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.vs-run{border:0;border-radius:11px;background:#0878d1;color:#fff;min-height:48px;font-size:16px;font-weight:900;padding:8px 14px}.vs-top{border:1px solid #cbd5e1;border-radius:11px;background:#fff;font-weight:800}
  .vs-status{margin-top:8px;padding:8px 10px;border-radius:9px;background:#f0f2f4;color:#394554;font-size:13px}.vs-status.ok{background:#e9f9ef;color:#126238}.vs-status.err{background:#fff0f0;color:#b42318}
  .vs-info{font-size:13px;color:#64748b;margin-bottom:7px}.vs-results{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.vs-result{position:relative;border:1px solid #d9e0e7;background:#fff;border-radius:11px;overflow:hidden;text-align:left}.vs-result.suspect{border-color:#ef9a9a;background:#fffafa}.vs-image-btn{display:block;width:100%;border:0;padding:0;background:#fff;cursor:zoom-in}.vs-result img{display:block;width:100%;aspect-ratio:1/1.16;object-fit:contain}.vs-code-link{border:0;background:none;padding:0;color:#0000ff;font-size:15px;font-weight:900;text-align:left;cursor:pointer;text-decoration:underline;text-underline-offset:2px}.vs-body{padding:6px}.vs-score{font-size:12px;color:#64748b}.vs-stock{font-size:13px;color:#08783c;font-weight:800;margin-top:2px}.vs-stock.bad{color:#d11a2a}.vs-group-feedback{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:7px}.vs-group-feedback button{border:1px solid #cbd5e1;border-radius:9px;padding:7px 9px;background:#fff;font-weight:800}.vs-group-feedback .good{background:#e9f9ef;color:#126238;border-color:#b7e5c7}.vs-group-feedback .teach{background:#fff7e8;color:#8a5200;border-color:#f0d39b}.vs-lightbox{display:none;position:fixed;inset:0;z-index:65000;background:#000e;align-items:center;justify-content:center;padding:12px}.vs-lightbox.show{display:flex}.vs-lightbox img{max-width:96vw;max-height:88vh;object-fit:contain}.vs-lightbox-close{position:absolute;right:14px;top:calc(12px + env(safe-area-inset-top));border:0;border-radius:999px;width:44px;height:44px;background:#fff;color:#111;font-size:24px;font-weight:900}.vs-lightbox-caption{position:absolute;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));text-align:center;color:#fff;font-size:18px;font-weight:900}.vs-rank{position:absolute;top:4px;left:4px;background:#111827dd;color:#fff;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}
  .vs-suspect{display:none;margin-top:10px;border-top:1px dashed #ef9a9a;padding-top:8px}.vs-suspect summary{color:#b42318;font-weight:900;cursor:pointer}.vs-suspect-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:7px}
  @media(max-width:620px){.vs-results,.vs-suspect-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.vs-shell{padding-left:5px;padding-right:5px}.vs-card{padding:8px}.vs-title{font-size:18px}.vs-filters{grid-template-columns:1fr 1fr}.vs-code{font-size:16px}.vs-preview{max-height:36vh}}
  `;document.head.appendChild(st);

  const q=document.querySelector(".quickbar");if(q&&!$("btnVisualSearch")){const b=document.createElement("button");b.id="btnVisualSearch";b.type="button";b.className="visual-search-entry";b.textContent="✨ TÌM BẰNG HÌNH ẢNH";q.insertAdjacentElement("afterend",b)}
  const m=document.createElement("div");m.id="visualSearchModal";m.className="vs-modal";m.innerHTML=`
  <div class="vs-shell">
    <div class="vs-head"><div class="vs-title">✨ Tìm bằng ảnh · Hybrid</div><button id="visualClose" class="vs-close">Đóng</button></div>
    <div class="vs-card">
      <div class="vs-actions">
        <label class="vs-file vs-camera">📷 CHỤP ẢNH<input id="visualCameraInput" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="vs-file vs-library">🖼 THƯ VIỆN<input id="visualLibraryInput" type="file" accept="image/*" hidden></label>
      </div>
      <img id="visualSearchPreview" class="vs-preview">
      <div class="vs-filters">
        <select id="visualMainGroup"></select>
        <select id="visualSubGroup"></select>
        <select id="visualSize"><option value="">Mọi size</option>${SIZE_LIST.map(s=>`<option value="${s}">Size ${s}</option>`).join("")}</select>
        <select id="visualStockMode"><option value="sellable">Chỉ còn bán được</option></select>
      </div>
      <input id="visualDescription" class="vs-desc" type="text" placeholder="Mô tả thêm: polo kẻ ngang, quần bò rách, áo khoác xám…">
      <div id="visualAutoGroupHint" class="vs-auto">AI sẽ dự đoán nhóm từ ảnh và dữ liệu đã học.</div>
      <div class="vs-group-feedback"><span style="font-size:12px;color:#64748b">Phản hồi nhóm:</span><button id="visualConfirmGroup" class="good" type="button">✓ Đúng nhóm</button><button id="visualTeachGroup" class="teach" type="button">🧠 Dạy AI nhóm đang chọn</button></div>
      <div class="vs-runrow"><button id="visualSearchRun" class="vs-run">TÌM SẢN PHẨM</button><select id="visualTopK" class="vs-top"><option>12</option><option selected>24</option><option>40</option></select></div>
      <div id="visualSearchStatus" class="vs-status">Chụp/chọn ảnh. Nhóm mặc định là Tự động.</div>
    </div>
    <div class="vs-card">
      <div id="visualResultInfo" class="vs-info"></div><div id="visualResults" class="vs-results"></div>
      <details id="visualSuspectBox" class="vs-suspect"><summary>⚠️ Rất giống nhưng tồn nghi ngờ / hết / âm</summary><div id="visualSuspectList" class="vs-suspect-list"></div></details>
    </div>
  </div>`;
  document.body.appendChild(m);
  const lb=document.createElement("div");lb.id="visualLightbox";lb.className="vs-lightbox";lb.innerHTML=`<button id="visualLightboxClose" class="vs-lightbox-close" type="button">×</button><img id="visualLightboxImg" alt="Ảnh sản phẩm"><div id="visualLightboxCaption" class="vs-lightbox-caption"></div>`;document.body.appendChild(lb);

  $("btnVisualSearch")?.addEventListener("click",openModal);$("visualClose").onclick=closeModal;
  $("visualConfirmGroup").onclick=()=>confirmGroupFeedback("correct");
  $("visualTeachGroup").onclick=()=>confirmGroupFeedback("teach");
  $("visualLightboxClose").onclick=closeImageLightbox;lb.addEventListener("click",e=>{if(e.target===lb)closeImageLightbox()});
  $("visualCameraInput").onchange=e=>{selectFile(e.target.files?.[0]);e.target.value=""};
  $("visualLibraryInput").onchange=e=>{selectFile(e.target.files?.[0]);e.target.value=""};
  $("visualSearchRun").onclick=runSearch;
  $("visualMainGroup").onchange=e=>{currentMain=e.target.value;currentSub="";renderGroupSelectors()};
  $("visualSubGroup").onchange=e=>{currentSub=e.target.value;updateAutoHint()};
}
function boot(){inject();if(window.VISUAL_SEARCH_STANDALONE)setTimeout(openModal,30)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
export {openModal as openVisualSearch};
