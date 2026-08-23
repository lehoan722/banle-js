// /scripts/datHangChuyenKhoKhan.js
// BƯỚC 1 - Đặt hàng chuyển kho KHẨN CẤP
// - Panel 3 trạng thái: ẩn / thu gọn / mở gần full-height
// - Lưu lịch sử, luôn sắp xếp created_at mới nhất trước
// - Trạng thái: moi / da_chuyen / het / huy
// - Ghi NV thực hiện mới nhất khi thay đổi trạng thái
// - Popup +Đặt khẩn dạng lưới size 38..46, nhập SL từng size
// - StockQuick vẫn dùng luật gợi ý size hiện có để tạo đơn khẩn

import { calcSuggestionsFromPayload } from "./services/luatChuyenKho.js";

let ctx = null;
let realtimeChannel = null;
let suppressRealtimeUntil = 0;
let audioCtx = null;
let audioUnlocked = false;
let repositionTimer = null;
let panelMode = "expanded"; // expanded | collapsed | hidden

const TABLE = "dat_hang_chuyen_kho_khan";
const HISTORY_LIMIT = 200;
const ACTIVE_STATUS = "moi";
const VALID_STATUSES = ["moi", "da_chuyen", "het", "huy"];
const SIZE_OPTIONS = ["38", "39", "40", "41", "42", "43", "44", "45", "46"];

function norm(v) { return String(v ?? "").trim(); }
function normMasp(v) { return norm(v).toUpperCase(); }
function normSize(v) {
  const s = norm(v).replace(/^size\s+/i, "");
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}
function getCurrentCoso() {
  return norm(ctx?.diadiem || window.__BANLE_PAGE_DIADIEM || localStorage.getItem("diadiem") || window.diadiem || "").toLowerCase();
}
function getManv() {
  return norm(ctx?.manvDangNhap || localStorage.getItem("manv") || document.getElementById("manv")?.value || "").toUpperCase();
}
function otherCoso(coso) { return coso === "cs1" ? "cs2" : "cs1"; }
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function fmtTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function statusText(v) {
  const s = norm(v).toLowerCase();
  if (s === "moi") return "Mới";
  if (s === "da_chuyen") return "Đã chuyển";
  if (s === "het") return "Hết";
  if (s === "huy") return "Hủy";
  if (s === "dang_chuyen") return "Mới"; // tương thích dữ liệu cũ trước migration
  return s || "-";
}
function statusOptions(currentRaw) {
  let current = norm(currentRaw).toLowerCase();
  if (current === "dang_chuyen") current = "moi";
  return VALID_STATUSES.map(v => `<option value="${v}" ${v === current ? "selected" : ""}>${statusText(v)}</option>`).join("");
}
function buildKey(x) { return [normMasp(x.masp), normSize(x.size), norm(x.huong_chuyen).toLowerCase()].join("|"); }

function ensureStyles() {
  if (document.getElementById("dhkhan-style")) return;
  const style = document.createElement("style");
  style.id = "dhkhan-style";
  style.textContent = `
    #dhkhan-panel { font-family:Arial,sans-serif; }
    #dhkhan-panel th,#dhkhan-panel td { border:1px solid #efb0a9;padding:3px 5px;white-space:nowrap;font-size:13px; }
    #dhkhan-panel .dhkhan-masp-link { color:#9b1c1c;font-weight:800;text-decoration:underline;cursor:pointer; }
    #dhkhan-panel .dhkhan-note { min-width:120px;max-width:230px;width:100%;box-sizing:border-box;padding:3px 5px; }
    #dhkhan-panel .dhkhan-status-select { min-width:100px;padding:3px 4px;font-size:13px; }
    #dhkhan-panel tr[data-status="moi"] td { background:#fff4f2; }
    #dhkhan-panel tr[data-status="da_chuyen"] td { background:#eaf8ee; }
    #dhkhan-panel tr[data-status="het"] td { background:#fff8db;color:#6b5a00; }
    #dhkhan-panel tr[data-status="huy"] td { background:#f1f1f1;color:#777; }
    #dhkhan-panel.dhkhan-flash { animation:dhkhanFlash .45s ease-in-out 0s 4 alternate; }
    @keyframes dhkhanFlash { from{box-shadow:0 0 0 2px #d00000,0 3px 14px rgba(0,0,0,.3)} to{box-shadow:0 0 0 6px rgba(208,0,0,.15),0 3px 14px rgba(0,0,0,.3)} }

    #dhkhan-create-box { font-family:Arial,sans-serif; }
    #dhkhan-create-box input { font-size:16px;padding:6px;box-sizing:border-box; }
    #dhkhan-create-box .dhkhan-grid { display:grid;grid-template-columns:90px repeat(9,minmax(42px,1fr));gap:3px;align-items:center; }
    #dhkhan-create-box .dhkhan-grid-label { font-weight:700; }
    #dhkhan-create-box .dhkhan-size-head { text-align:center;font-weight:800;padding:4px 0; }
    #dhkhan-create-box .dhkhan-qty { width:100%;min-width:0;text-align:center; }
    #dhkhan-create-box .dhkhan-wide { grid-column:2 / 11; }
    #dhkhan-create-box .dhkhan-direction { font-weight:900;color:#1745d1;font-size:17px; }
    #dhkhan-create-box .dhkhan-actions { display:flex;gap:10px;justify-content:center;margin-top:12px; }
    #dhkhan-create-box .dhkhan-actions button { min-width:110px;padding:8px 14px;font-size:15px;font-weight:800; }

    @media(max-width:800px){
      #dhkhan-panel { left:0!important;right:0!important;width:100vw!important;max-width:100vw!important;font-size:12px!important; }
      #dhkhan-panel th,#dhkhan-panel td { font-size:12px;padding:3px 4px; }
      #dhkhan-panel .dhkhan-note { min-width:100px; }
      #dhkhan-create-box { width:98vw!important;max-width:98vw!important;min-width:0!important;padding:9px!important; }
      #dhkhan-create-box .dhkhan-grid { grid-template-columns:72px repeat(9,minmax(31px,1fr));gap:2px; }
      #dhkhan-create-box input { font-size:15px;padding:5px 2px; }
      #dhkhan-create-box .dhkhan-size-head { font-size:13px; }
    }
  `;
  document.head.appendChild(style);
}

function unlockAudioOnce() {
  if (audioUnlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    audioCtx.resume?.();
    audioUnlocked = true;
  } catch (_) {}
}
function setupAudioUnlock() {
  const fn = () => unlockAudioOnce();
  document.addEventListener("pointerdown", fn, { once:true, capture:true });
  document.addEventListener("keydown", fn, { once:true, capture:true });
}
// Bước 3 mới nâng âm báo. Bước 1 giữ âm hiện tại để giảm phạm vi thay đổi.
function ding(freq, when, duration=.13) {
  if (!audioCtx || audioCtx.state !== "running") return;
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.type="sine"; osc.frequency.setValueAtTime(freq,when);
  gain.gain.setValueAtTime(.0001,when); gain.gain.exponentialRampToValueAtTime(.20,when+.012); gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(when); osc.stop(when+duration+.02);
}
function playUrgentSound() {
  try { unlockAudioOnce(); if(!audioCtx || audioCtx.state!=="running") return; const t=audioCtx.currentTime+.02; ding(880,t,.14); ding(1175,t+.19,.16); }
  catch(e){ console.warn("[Đặt hàng khẩn] Không phát được âm thanh:",e); }
}

function openStockQuick(masp) {
  const code = normMasp(masp); if(!code) return;
  panelMode = "collapsed"; applyPanelMode();
  try {
    if (window.StockQuick?.showFor) return window.StockQuick.showFor(document.body, code);
    if (typeof window.stockQuickPopup === "function") return window.stockQuickPopup(code);
  } catch(e){ console.warn("[Đặt hàng khẩn] Không mở được StockQuick:",e); }
}

async function fetchOrders() {
  if (!ctx?.supabase) return [];
  const { data, error } = await ctx.supabase.from(TABLE).select("*").order("created_at",{ascending:false}).limit(HISTORY_LIMIT);
  if(error){ console.error("[Đặt hàng khẩn] Lỗi tải dữ liệu:",error); return []; }
  return (data||[]).sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime());
}

async function checkDuplicates(items) {
  if(!ctx?.supabase || !items.length) return {newItems:items,existed:[]};
  const masps=[...new Set(items.map(x=>normMasp(x.masp)).filter(Boolean))];
  if(!masps.length) return {newItems:[],existed:[]};
  const {data,error}=await ctx.supabase.from(TABLE).select("id,masp,size,huong_chuyen,trang_thai").eq("trang_thai",ACTIVE_STATUS).in("masp",masps);
  if(error){ console.warn("[Đặt hàng khẩn] Không kiểm tra được trùng:",error); return {newItems:items,existed:[]}; }
  const opened=new Set((data||[]).map(buildKey));
  return {newItems:items.filter(x=>!opened.has(buildKey(x))),existed:items.filter(x=>opened.has(buildKey(x)))};
}

async function insertUrgentOrders(items,note="",source="stockquick") {
  if(!ctx?.supabase || !items?.length) return false;
  const unique=new Map();
  items.forEach(x=>{
    const huong=norm(x.huong_chuyen).toLowerCase();
    const fallbackTu=huong==="1v2"?"cs1":huong==="2v1"?"cs2":"";
    const fallbackDen=huong==="1v2"?"cs2":huong==="2v1"?"cs1":"";
    const row={masp:normMasp(x.masp),size:normSize(x.size),soluong:Math.max(1,Number(x.soluong||1)),huong_chuyen:huong,tu_coso:norm(x.tu_coso||fallbackTu).toLowerCase(),den_coso:norm(x.den_coso||fallbackDen).toLowerCase()};
    if(row.masp&&row.size&&["1v2","2v1"].includes(row.huong_chuyen)) unique.set(buildKey(row),row);
  });
  const checked=await checkDuplicates([...unique.values()]);
  if(checked.existed.length){
    alert("⚠️ Một số dòng đã có trạng thái MỚI trong ĐẶT HÀNG KHẨN nên không tạo trùng:\n\n"+checked.existed.map(x=>`${x.huong_chuyen} | ${x.masp} | size ${x.size}`).join("\n"));
  }
  if(!checked.newItems.length) return false;
  const now=new Date().toISOString();
  const rows=checked.newItems.map(x=>({...x,manv_dat:getManv(),manv_thuc_hien:null,ghichu_dat:norm(note),trang_thai:"moi",nguon:source,updated_at:now}));
  suppressRealtimeUntil=Date.now()+900;
  const {error}=await ctx.supabase.from(TABLE).insert(rows);
  if(error){ console.error("[Đặt hàng khẩn] Insert lỗi:",error); alert("❌ Không lưu được đặt hàng khẩn cấp: "+(error.message||"Lỗi không xác định")); return false; }
  panelMode="collapsed";
  await refreshPanel();
  return true;
}

function showStockQuickConfirm(items) {
  if(!items?.length){ alert("Không có size nào cần gợi ý chuyển kho cho mã này."); return; }
  document.getElementById("dhkhan-confirm")?.remove();
  const box=document.createElement("div"); box.id="dhkhan-confirm";
  box.style.cssText=`position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:10080;background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.3);padding:12px;min-width:360px;max-width:94vw;font-size:14px;`;
  box.innerHTML=`<div style="font-weight:900;color:#b00000;font-size:16px;margin-bottom:8px;">🚨 TẠO ĐẶT HÀNG KHẨN CẤP</div>
    <div style="max-height:42vh;overflow:auto;">${items.map((x,i)=>`<label style="display:block;padding:5px 3px;border-bottom:1px solid #eee;cursor:pointer;"><input type="checkbox" class="dhkhan-pick" checked data-i="${i}"> ${esc(x.huong_chuyen)} | <b>${esc(x.masp)}</b> | size ${esc(x.size)} | SL ${Number(x.soluong||1)}</label>`).join("")}</div>
    <input id="dhkhan-confirm-note" placeholder="Ghi chú (vd: khách đang chờ)" style="width:100%;box-sizing:border-box;margin:9px 0 7px;padding:7px;font-size:14px;">
    <div style="display:flex;gap:8px;justify-content:flex-end;"><button id="dhkhan-confirm-cancel">Hủy</button><button id="dhkhan-confirm-ok" style="background:#d00000;color:#fff;border:0;border-radius:6px;padding:7px 12px;font-weight:800;">ĐẶT KHẨN</button></div>`;
  document.body.appendChild(box);
  box.querySelector("#dhkhan-confirm-cancel").onclick=()=>box.remove();
  box.querySelector("#dhkhan-confirm-ok").onclick=async()=>{
    const picked=[...box.querySelectorAll(".dhkhan-pick:checked")].map(el=>items[Number(el.dataset.i)]).filter(Boolean);
    if(!picked.length) return alert("Bạn chưa chọn size nào.");
    const ok=await insertUrgentOrders(picked,box.querySelector("#dhkhan-confirm-note")?.value||"","stockquick"); if(ok) box.remove();
  };
}
async function openFromStockQuick(popup,payload) {
  const masp=normMasp(popup?.dataset?.masp||payload?.masp);
  if(!masp||!payload) return alert("Thiếu dữ liệu StockQuick để tạo đặt hàng khẩn.");
  let suggestions=[]; try{ suggestions=calcSuggestionsFromPayload(masp,payload)||[]; }catch(e){ console.error(e); return alert("Không tính được size cần chuyển kho cho mã này."); }
  if(!suggestions.length) return alert("Không có size nào cần gợi ý chuyển kho cho mã này.");
  showStockQuickConfirm(suggestions);
}

function renderRows(rows,canMoveSection) {
  return rows.map(r=>{
    let st=norm(r.trang_thai).toLowerCase(); if(st==="dang_chuyen") st="moi";
    const canSelectForFutureCcn=canMoveSection && st==="moi";
    return `<tr data-id="${Number(r.id)}" data-status="${esc(st)}">
      <td style="text-align:center;"><input type="checkbox" class="dhkhan-move" data-id="${Number(r.id)}" ${canSelectForFutureCcn?"":"disabled"} title="Bước 2 sẽ dùng để tạo hóa đơn CCN"></td>
      <td><span class="dhkhan-masp-link" data-masp="${esc(r.masp)}">${esc(r.masp)}</span></td>
      <td style="text-align:center;">${Number(r.soluong||1)}</td>
      <td style="text-align:center;">${esc(r.size)}</td>
      <td style="font-weight:700;">${esc(r.huong_chuyen)}</td>
      <td>${esc(r.manv_dat||"")}</td>
      <td>${esc(r.manv_thuc_hien||"")}</td>
      <td>${esc(fmtTime(r.created_at))}</td>
      <td><input class="dhkhan-note" data-id="${Number(r.id)}" value="${esc(r.ghichu_dat||"")}"></td>
      <td><select class="dhkhan-status-select" data-id="${Number(r.id)}">${statusOptions(st)}</select></td>
    </tr>`;
  }).join("");
}

function positionPanel() {
  const box=document.getElementById("dhkhan-panel"); if(!box||panelMode==="hidden") return;
  const mobile=window.matchMedia("(max-width:800px)").matches;
  const vh=window.visualViewport?.height||window.innerHeight;
  box.style.left=mobile?"0":"6px"; box.style.right="auto"; box.style.width=mobile?"100vw":"760px"; box.style.maxWidth=mobile?"100vw":"96vw"; box.style.zIndex="10050";
  if(panelMode==="collapsed"){
    const bay=document.getElementById("baymau-popup"); const bayTop=bay?.getBoundingClientRect()?.top;
    const top=Number.isFinite(bayTop)?Math.max(6,bayTop-40):Math.max(6,vh-250);
    box.style.top=`${Math.round(top)}px`; box.style.height="36px"; box.style.maxHeight="36px"; box.style.overflow="hidden"; return;
  }
  box.style.top=mobile?"4px":"6px";
  box.style.height=mobile?`${Math.max(320,vh-78)}px`:`${Math.max(420,vh-92)}px`;
  box.style.maxHeight=box.style.height; box.style.overflow="auto";
}
function schedulePosition(){ clearTimeout(repositionTimer); repositionTimer=setTimeout(positionPanel,40); }
function applyPanelMode(){
  const box=document.getElementById("dhkhan-panel"); if(!box) return;
  const body=box.querySelector("#dhkhan-body"); const toggle=box.querySelector("#dhkhan-toggle");
  if(panelMode==="hidden"){ box.remove(); return; }
  if(body) body.style.display=panelMode==="collapsed"?"none":"block";
  if(toggle) toggle.textContent=panelMode==="collapsed"?"▲":"▼";
  positionPanel();
}

async function updateStatus(id,nextStatus,selectEl) {
  if(!VALID_STATUSES.includes(nextStatus)) return;
  const manv=getManv(); const now=new Date().toISOString();
  suppressRealtimeUntil=Date.now()+700;
  const {error}=await ctx.supabase.from(TABLE).update({trang_thai:nextStatus,manv_thuc_hien:manv||null,updated_at:now}).eq("id",Number(id));
  if(error){ alert("❌ Không cập nhật được trạng thái: "+error.message); await refreshPanel(); return; }
  const tr=selectEl?.closest("tr"); if(tr){ tr.dataset.status=nextStatus; const cells=tr.children; if(cells?.[6]) cells[6].textContent=manv; const move=tr.querySelector(".dhkhan-move"); if(move) move.disabled=!(nextStatus==="moi" && tr.closest("tbody")?.dataset?.section==="canmove"); }
}

function bindPanelEvents(box) {
  box.querySelector("#dhkhan-toggle")?.addEventListener("click",e=>{ e.stopPropagation(); panelMode=panelMode==="collapsed"?"expanded":"collapsed"; applyPanelMode(); });
  box.querySelector("#dhkhan-close")?.addEventListener("click",e=>{ e.stopPropagation(); panelMode="hidden"; applyPanelMode(); });
  box.querySelector("#dhkhan-create")?.addEventListener("click",()=>{ panelMode="collapsed"; applyPanelMode(); showManualCreate(); });

  box.querySelectorAll(".dhkhan-status-select").forEach(sel=>{
    sel.addEventListener("change",async()=>{ await updateStatus(Number(sel.dataset.id),norm(sel.value).toLowerCase(),sel); });
  });
  box.querySelectorAll(".dhkhan-note").forEach(input=>{
    input.addEventListener("change",async()=>{ suppressRealtimeUntil=Date.now()+600; const {error}=await ctx.supabase.from(TABLE).update({ghichu_dat:input.value||"",updated_at:new Date().toISOString()}).eq("id",Number(input.dataset.id)); input.style.background=error?"#ffd6d6":"#e8f7e8"; setTimeout(()=>input.style.background="",650); });
  });
  box.querySelectorAll(".dhkhan-masp-link").forEach(el=>el.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();openStockQuick(el.dataset.masp);}));
}

async function renderPanel(rows,{forceOpen=false,flash=false}={}) {
  ensureStyles(); const coso=getCurrentCoso(); if(!coso) return;
  if(!rows.length){ document.getElementById("dhkhan-panel")?.remove(); return; }
  if(forceOpen && panelMode==="hidden") panelMode="expanded";
  if(panelMode==="hidden" && !forceOpen) return;

  const canMove=rows.filter(r=>norm(r.tu_coso).toLowerCase()===coso);
  const onlyView=rows.filter(r=>norm(r.tu_coso).toLowerCase()!==coso);
  const canMoveNew=canMove.filter(r=>["moi","dang_chuyen"].includes(norm(r.trang_thai).toLowerCase())).length;
  const onlyViewNew=onlyView.filter(r=>["moi","dang_chuyen"].includes(norm(r.trang_thai).toLowerCase())).length;

  document.getElementById("dhkhan-panel")?.remove();
  const box=document.createElement("div"); box.id="dhkhan-panel";
  box.style.cssText=`position:fixed;background:#ffe5df;border:2px solid #d00000;border-radius:7px;box-shadow:0 3px 14px rgba(0,0,0,.3);overflow:auto;padding:6px;box-sizing:border-box;`;
  box.innerHTML=`
    <div id="dhkhan-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;z-index:5;background:#ffe5df;min-height:26px;font-weight:900;color:#9b0000;">
      <span>🚨 ĐẶT HÀNG KHẨN CẤP | Cần chuyển: ${canMoveNew} | Theo dõi: ${onlyViewNew}</span>
      <div style="display:flex;gap:5px;align-items:center;">
        <button id="dhkhan-create" style="font-weight:800;color:#9b0000;">+ Đặt khẩn</button>
        <button id="dhkhan-toggle" style="border:0;background:transparent;font-size:18px;font-weight:900;">${panelMode==="collapsed"?"▲":"▼"}</button>
        <button id="dhkhan-close" title="Đóng hẳn" style="border:0;background:transparent;font-size:20px;font-weight:900;color:#9b0000;">×</button>
      </div>
    </div>
    <div id="dhkhan-body" style="display:${panelMode==="collapsed"?"none":"block"};">
      <div style="font-size:12px;color:#7a3630;margin:4px 0 5px;">Hiển thị ${rows.length} dòng mới nhất (tối đa ${HISTORY_LIMIT}), sắp xếp theo thời gian tạo mới nhất.</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;">
        <thead><tr style="background:#f7b3a9;"><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>NV thực hiện</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th></tr></thead>
        <tbody data-section="canmove">${renderRows(canMove,true)}</tbody>
      </table>
      <div style="font-weight:800;margin:8px 0 4px;color:#555;">Theo dõi / yêu cầu từ cơ sở này</div>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;">
        <thead><tr style="background:#ddd;"><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>NV thực hiện</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th></tr></thead>
        <tbody data-section="onlyview">${renderRows(onlyView,false)}</tbody>
      </table>
    </div>`;
  document.body.appendChild(box); positionPanel(); bindPanelEvents(box);
  if(flash){ box.classList.add("dhkhan-flash"); setTimeout(()=>box.classList.remove("dhkhan-flash"),2200); }
}
async function refreshPanel(options={}) { const rows=await fetchOrders(); await renderPanel(rows,options); }

function sanitizeQtyInput(input) {
  const cleaned=String(input.value||"").replace(/[^0-9]/g,"").replace(/^0+(?=\d)/,"");
  input.value=cleaned;
}
function bindManualCreateKeyboard(box) {
  const focusables=[box.querySelector("#dhkhan-masp"),...box.querySelectorAll(".dhkhan-qty"),box.querySelector("#dhkhan-note")].filter(Boolean);
  focusables.forEach((el,index)=>{
    el.addEventListener("focus",()=>{ try{el.select?.();}catch(_){} });
    el.addEventListener("keydown",e=>{
      if(e.key!=="Enter") return;
      e.preventDefault(); e.stopPropagation();
      const next=focusables[index+1];
      if(next){ next.focus(); next.select?.(); }
      else box.querySelector("#dhkhan-save")?.focus();
    });
  });
  box.querySelectorAll(".dhkhan-qty").forEach(input=>input.addEventListener("input",()=>sanitizeQtyInput(input)));
}

function showManualCreate() {
  document.getElementById("dhkhan-create-box")?.remove();
  const coso=getCurrentCoso(); const from=otherCoso(coso); if(!coso||!from) return alert("Không xác định được cơ sở hiện tại.");
  const box=document.createElement("div"); box.id="dhkhan-create-box";
  box.style.cssText=`position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:10090;background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.32);padding:12px;width:760px;max-width:98vw;overflow:auto;`;
  box.innerHTML=`
    <div style="font-weight:900;color:#111;font-size:18px;margin-bottom:10px;">🚨 ĐẶT HÀNG KHẨN CẤP</div>
    <div class="dhkhan-grid">
      <div class="dhkhan-grid-label">Mã SP</div>
      <input id="dhkhan-masp" class="dhkhan-wide" type="text" inputmode="text" enterkeyhint="next" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;">

      <div class="dhkhan-grid-label">Size</div>
      ${SIZE_OPTIONS.map(s=>`<div class="dhkhan-size-head">${s}</div>`).join("")}

      <div class="dhkhan-grid-label">Số lượng</div>
      ${SIZE_OPTIONS.map(s=>`<input class="dhkhan-qty" data-size="${s}" type="text" inputmode="text" enterkeyhint="next" autocomplete="off" value="">`).join("")}

      <div class="dhkhan-grid-label">Hướng</div>
      <div class="dhkhan-wide dhkhan-direction">${from.toUpperCase()} → ${coso.toUpperCase()}</div>

      <div class="dhkhan-grid-label">Ghi chú</div>
      <input id="dhkhan-note" class="dhkhan-wide" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" placeholder="VD: khách đang đợi">
    </div>
    <div class="dhkhan-actions"><button id="dhkhan-cancel">Hủy</button><button id="dhkhan-save" style="background:#d00000;color:#fff;border:0;border-radius:6px;">ĐẶT KHẨN</button></div>`;
  document.body.appendChild(box); bindManualCreateKeyboard(box);
  const maspEl=box.querySelector("#dhkhan-masp"); setTimeout(()=>maspEl?.focus(),20);
  box.querySelector("#dhkhan-cancel").onclick=()=>box.remove();
  box.querySelector("#dhkhan-save").onclick=async()=>{
    const masp=normMasp(maspEl?.value); const note=box.querySelector("#dhkhan-note")?.value||"";
    const qtyEntries=[...box.querySelectorAll(".dhkhan-qty")].map(input=>({size:input.dataset.size,soluong:Number(String(input.value||"").trim()||0)})).filter(x=>Number.isFinite(x.soluong)&&x.soluong>0);
    if(!masp) return alert("Bạn cần nhập Mã SP.");
    if(!qtyEntries.length) return alert("Bạn cần nhập số lượng cho ít nhất một size.");
    const {data,error}=await ctx.supabase.from("dmhanghoa").select("masp").eq("masp",masp).maybeSingle();
    if(error||!data) return alert("❌ Mã sản phẩm không tồn tại trong danh mục.");
    const huong=from==="cs1"?"1v2":"2v1";
    const items=qtyEntries.map(x=>({masp,size:x.size,soluong:x.soluong,huong_chuyen:huong,tu_coso:from,den_coso:coso}));
    const ok=await insertUrgentOrders(items,note,"manual"); if(ok) box.remove();
  };
}

function setupRealtime() {
  if(!ctx?.supabase||realtimeChannel) return;
  realtimeChannel=ctx.supabase.channel("dat_hang_chuyen_kho_khan_realtime")
    .on("postgres_changes",{event:"*",schema:"public",table:TABLE},async payload=>{
      if(Date.now()<suppressRealtimeUntil) return;
      const eventType=payload?.eventType||payload?.event||""; const row=payload?.new||{}; const current=getCurrentCoso();
      const incoming=eventType==="INSERT" && norm(row.tu_coso).toLowerCase()===current;
      if(incoming){ panelMode="expanded"; playUrgentSound(); await refreshPanel({forceOpen:true,flash:true}); }
      else if(panelMode!=="hidden") await refreshPanel();
    }).subscribe(status=>{ if(status==="CHANNEL_ERROR") console.warn("[Đặt hàng khẩn] Realtime channel lỗi"); });
}

function bindStockQuickExisting() {
  const tryBind=(popup,payload)=>{
    if(!popup||popup.dataset.dhkhanBound==="1") return;
    const th=popup.querySelector(".sq-dhck-open")||popup.querySelector("thead th:first-child"); if(!th) return;
    popup.dataset.dhkhanBound="1"; th.textContent="Size / Đặt khẩn"; th.title="Bấm để tạo đặt hàng chuyển kho khẩn cấp"; th.style.cursor="pointer"; th.style.color="#d00000"; th.style.fontWeight="800";
    th.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openFromStockQuick(popup,payload);},true);
  };
  window.addEventListener("stockquick:rendered",e=>tryBind(e.detail?.popup,e.detail?.payload));
  setTimeout(()=>tryBind(window.__LAST_STOCKQUICK_POPUP__,window.__LAST_STOCKQUICK_PAYLOAD__),350);
}

export function initDatHangChuyenKhoKhan(options={}) {
  ctx=options; ensureStyles(); setupAudioUnlock();
  window.DatHangChuyenKhoKhan={openFromStockQuick,openManual:()=>{panelMode="collapsed";applyPanelMode();showManualCreate();},refresh:()=>{panelMode="expanded";return refreshPanel({forceOpen:true});}};
  bindStockQuickExisting(); refreshPanel(); setupRealtime();
  window.addEventListener("resize",schedulePosition); window.visualViewport?.addEventListener("resize",schedulePosition);
  setInterval(()=>{if(document.getElementById("dhkhan-panel")) schedulePosition();},2000);
}
