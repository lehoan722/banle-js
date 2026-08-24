// /scripts/datHangChuyenKhoKhan.js
// BƯỚC 1 - Đặt hàng chuyển kho KHẨN CẤP
// - Panel 3 trạng thái: ẩn / thu gọn / mở gần full-height
// - Lưu lịch sử, luôn sắp xếp created_at mới nhất trước
// - Trạng thái: moi / da_chuyen / het / huy
// - Ghi NV thực hiện mới nhất khi thay đổi trạng thái
// - Popup +Đặt khẩn dạng lưới size 38..46, nhập SL từng size
// - StockQuick luôn cho đặt khẩn; gợi ý (nếu có) chỉ dùng để điền sẵn lưới size

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
async function isAdminUser() {
  try {
    if (ctx?.isAdmin === true || window.isAdmin === true) return true;
    const cu = JSON.parse(localStorage.getItem("currentUser") || "null");
    if (cu?.is_admin === true) return true;
  } catch (_) {}
  if (!ctx?.supabase || typeof ctx.supabase.rpc !== "function") return false;
  try {
    const { data, error } = await ctx.supabase.rpc("is_admin");
    if (!error) return data === true;
  } catch (_) {}
  return false;
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
    #dhkhan-panel tr[data-status="moi"] td { background:#ffffff; color:#111827; }
    #dhkhan-panel tr[data-status="da_chuyen"] td { background:#e8f7ec; color:#14532d; }
    #dhkhan-panel tr[data-status="het"] td { background:#eeeeee; color:#555555; }
    #dhkhan-panel tr[data-status="huy"] td { background:#eee7ff; color:#5b3f8c; }
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
    #dhkhan-create-box .dhkhan-direction-btn { border:0;background:transparent;padding:2px 4px;color:#1745d1;font-weight:900;font-size:17px;text-decoration:underline;cursor:pointer; }
    #dhkhan-create-box .dhkhan-direction-btn:hover { color:#d00000; }
    #dhkhan-create-box .dhkhan-drag-handle { cursor:move;user-select:none;touch-action:none; }
    #dhkhan-create-box .dhkhan-actions { display:flex;gap:10px;justify-content:center;margin-top:12px; }
    #dhkhan-confirm-direction { font-family:Arial,sans-serif; }
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
// Âm báo khẩn: 2 tiếng chuông đa tần, ngân dài và stereo nhẹ.
// Chỉ dùng Web Audio nên không cần thêm file âm thanh bên ngoài.
function chimeVoice(freq, when, duration, pan = 0, peak = 0.16) {
  if (!audioCtx || audioCtx.state !== "running") return;

  const master = audioCtx.createGain();
  const panner = typeof audioCtx.createStereoPanner === "function"
    ? audioCtx.createStereoPanner()
    : null;

  if (panner) panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), when);

  // Fundamental + 2 harmonic nhỏ làm tiếng chuông đầy và bớt "khô".
  [
    { mult: 1, gain: 1.00, type: "sine" },
    { mult: 2.01, gain: 0.30, type: "sine" },
    { mult: 3.02, gain: 0.12, type: "triangle" }
  ].forEach(part => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = part.type;
    osc.frequency.setValueAtTime(freq * part.mult, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * part.gain), when + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.04);
  });

  // Một lớp ngân trễ rất nhỏ tạo cảm giác chuông điện thoại.
  const delay = audioCtx.createDelay(0.25);
  const echoGain = audioCtx.createGain();
  delay.delayTime.setValueAtTime(0.085, when);
  echoGain.gain.setValueAtTime(0.16, when);

  if (panner) {
    master.connect(panner);
    panner.connect(audioCtx.destination);
    panner.connect(delay);
  } else {
    master.connect(audioCtx.destination);
    master.connect(delay);
  }
  delay.connect(echoGain);
  echoGain.connect(audioCtx.destination);
}
function playUrgentSound() {
  try {
    unlockAudioOnce();
    if (!audioCtx || audioCtx.state !== "running") return;
    const t = audioCtx.currentTime + 0.025;
    chimeVoice(783.99, t, 0.48, -0.25, 0.19);   // G5
    chimeVoice(1046.50, t + 0.33, 0.62, 0.25, 0.21); // C6
  } catch (e) {
    console.warn("[Đặt hàng khẩn] Không phát được âm thanh:", e);
  }
}

function openStockQuick(masp) {
  const code = normMasp(masp); if(!code) return;
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
  if(panelMode==="hidden") panelMode="expanded";
  await refreshPanel({forceOpen:true});
  return true;
}

function buildSuggestedQtyMap(items) {
  const map = new Map();
  (items || []).forEach(x => {
    const size = normSize(x.size);
    if (!SIZE_OPTIONS.includes(size)) return;
    const qty = Math.max(1, Number(x.soluong || 1));
    map.set(size, Number(map.get(size) || 0) + qty);
  });
  return map;
}

async function openFromStockQuick(popup,payload) {
  const masp=normMasp(popup?.dataset?.masp||payload?.masp);
  if(!masp) return alert("Thiếu mã sản phẩm để tạo đặt hàng khẩn.");

  let suggestions=[];
  try {
    suggestions = payload ? (calcSuggestionsFromPayload(masp,payload)||[]) : [];
  } catch(e) {
    console.warn("[Đặt hàng khẩn] Không tính được gợi ý; vẫn cho đặt thủ công:", e);
    suggestions=[];
  }

  // Khẩn cấp KHÔNG phụ thuộc luật gợi ý.
  // Nếu có gợi ý thì dùng để điền sẵn SL và, khi toàn bộ gợi ý cùng một hướng,
  // dùng luôn hướng đó làm hướng mặc định. Nếu gợi ý lẫn 2 hướng thì dùng hướng
  // mặc định "cơ sở khác -> cơ sở đang đặt" để người dùng tự quyết định.
  const suggestedDirs = [...new Set(
    (suggestions || [])
      .map(x => norm(x.huong_chuyen).toLowerCase())
      .filter(x => ["1v2", "2v1"].includes(x))
  )];
  const initialDirection = suggestedDirs.length === 1 ? suggestedDirs[0] : null;

  if (panelMode === "hidden") {
    panelMode = "expanded";
    await refreshPanel({ forceOpen:true });
  }
  showManualCreate({
    masp,
    suggestedItems:suggestions,
    source:"stockquick",
    initialDirection
  });
}

function renderRows(rows,canMoveSection,isAdmin) {
  return rows.map(r=>{
    let st=norm(r.trang_thai).toLowerCase(); if(st==="dang_chuyen") st="moi";
    const canExecute = canMoveSection;
    const canSelectForFutureCcn=canExecute && st==="moi";
    const statusDisabled = canExecute ? "" : "disabled title=\"Chỉ cơ sở thực hiện chuyển hàng mới được đổi trạng thái\"";
    return `<tr data-id="${Number(r.id)}" data-status="${esc(st)}">
      <td style="text-align:center;"><input type="checkbox" class="dhkhan-delete-check" data-id="${Number(r.id)}" ${isAdmin?"":"disabled"} title="${isAdmin?"Chọn để admin xóa đặt hàng":"Chỉ admin được xóa"}"></td>
      <td style="text-align:center;"><input type="checkbox" class="dhkhan-move" data-id="${Number(r.id)}" ${canSelectForFutureCcn?"":"disabled"} title="Chọn dòng để tạo hóa đơn CCN"></td>
      <td><span class="dhkhan-masp-link" data-masp="${esc(r.masp)}">${esc(r.masp)}</span></td>
      <td style="text-align:center;">${Number(r.soluong||1)}</td>
      <td style="text-align:center;">${esc(r.size)}</td>
      <td style="font-weight:700;">${esc(r.huong_chuyen)}</td>
      <td>${esc(r.manv_dat||"")}</td>
      <td>${esc(r.manv_thuc_hien||"")}</td>
      <td>${esc(fmtTime(r.created_at))}</td>
      <td><input class="dhkhan-note" data-id="${Number(r.id)}" value="${esc(r.ghichu_dat||"")}"></td>
      <td><select class="dhkhan-status-select" data-id="${Number(r.id)}" ${statusDisabled}>${statusOptions(st)}</select></td>
    </tr>`;
  }).join("");
}

function positionPanel() {
  const box=document.getElementById("dhkhan-panel"); if(!box||panelMode==="hidden") return;
  const mobile=window.matchMedia("(max-width:800px)").matches;
  const vh=window.visualViewport?.height||window.innerHeight;

  // Panel khẩn luôn neo sát đáy màn hình.
  // Không đặt top cố định để khi thay đổi chiều cao, mép dưới vẫn giữ nguyên vị trí.
  box.style.left=mobile?"0":"6px";
  box.style.right="auto";
  box.style.width=mobile?"100vw":"760px";
  box.style.maxWidth=mobile?"100vw":"96vw";
  box.style.zIndex="9800";
  box.style.top="auto";
  box.style.bottom=mobile?"0":"6px";

  if(panelMode==="collapsed"){
    box.style.height="36px";
    box.style.maxHeight="36px";
    box.style.overflow="hidden";
    return;
  }

  box.style.height=mobile?`${Math.max(320,vh-78)}px`:`${Math.max(420,vh-92)}px`;
  box.style.maxHeight=box.style.height;
  box.style.overflow="auto";
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
  const tr = selectEl?.closest("tr");
  const section = tr?.closest("tbody")?.dataset?.section || "";
  if (section !== "canmove") {
    alert("⛔ Chỉ cơ sở có trách nhiệm chuyển hàng mới được thay đổi trạng thái dòng này.");
    await refreshPanel();
    return;
  }
  const manv=getManv(); const now=new Date().toISOString();
  suppressRealtimeUntil=Date.now()+700;
  const {error}=await ctx.supabase.from(TABLE).update({trang_thai:nextStatus,manv_thuc_hien:manv||null,updated_at:now}).eq("id",Number(id)).eq("tu_coso",getCurrentCoso());
  if(error){ alert("❌ Không cập nhật được trạng thái: "+error.message); await refreshPanel(); return; }
  if(tr){ tr.dataset.status=nextStatus; const cells=tr.children; if(cells?.[7]) cells[7].textContent=manv; const move=tr.querySelector(".dhkhan-move"); if(move) move.disabled=!(nextStatus==="moi" && tr.closest("tbody")?.dataset?.section==="canmove"); }
}

async function deleteSelectedOrders(box) {
  if (!(await isAdminUser())) return alert("⛔ Chỉ admin được xóa đặt hàng khẩn cấp.");
  const ids=[...box.querySelectorAll(".dhkhan-delete-check:checked")].map(x=>Number(x.dataset.id)).filter(Boolean);
  if(!ids.length) return alert("Bạn chưa chọn dòng nào để xóa.");
  if(!confirm(`Bạn chắc chắn muốn xóa vĩnh viễn ${ids.length} dòng đặt hàng khẩn cấp?`)) return;
  suppressRealtimeUntil=Date.now()+900;
  const {error}=await ctx.supabase.from(TABLE).delete().in("id",ids);
  if(error){ console.error("[Đặt hàng khẩn] Xóa lỗi:",error); return alert("❌ Không xóa được đặt hàng: "+(error.message||"Lỗi")); }
  await refreshPanel({forceOpen:true});
}

async function createUrgentCcnFromChecked(box) {
  const coso = getCurrentCoso();
  if (!coso) return alert("Không xác định được cơ sở hiện tại.");

  const ids = [...box.querySelectorAll('tbody[data-section="canmove"] .dhkhan-move:checked')]
    .map(x => Number(x.dataset.id))
    .filter(Boolean);

  if (!ids.length) {
    alert("Bạn chưa tick dòng nào để tạo hóa đơn CCN.");
    return;
  }

  const { data: rows, error } = await ctx.supabase
    .from(TABLE)
    .select("id,masp,size,soluong,huong_chuyen,tu_coso,den_coso,trang_thai,ghichu_dat")
    .in("id", ids)
    .eq("tu_coso", coso);

  if (error) {
    console.error("[Đặt hàng khẩn] Không đọc được dòng tạo CCN:", error);
    alert("❌ Không đọc được dữ liệu để tạo hóa đơn CCN.");
    return;
  }

  const selected = (rows || []).filter(r => norm(r.trang_thai).toLowerCase() === "moi");
  if (!selected.length) {
    alert("Các dòng đã chọn không còn ở trạng thái Mới.");
    await refreshPanel({ forceOpen:true });
    return;
  }

  const dirs = [...new Set(selected.map(r => norm(r.huong_chuyen).toLowerCase()))];
  if (dirs.length !== 1) {
    alert("Chỉ được tạo một hướng chuyển mỗi lần.");
    return;
  }

  const dir = dirs[0];
  const validFrom = dir === "1v2" ? "cs1" : "cs2";
  if (validFrom !== coso) {
    alert("⛔ Chỉ cơ sở thực hiện chuyển hàng mới được tạo hóa đơn CCN.");
    return;
  }

  const grouped = new Map();
  selected.forEach(r => {
    const code = normMasp(r.masp);
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push({
      size: normSize(r.size),
      // Trang CCN hiện tại đọc số lượng từ field `sl` (không phải `soluong`).
      sl: Number(r.soluong || 1)
    });
  });

  const selectedIds = selected.map(r => Number(r.id)).filter(Boolean);
  const payload = {
    dir,
    note: "ĐẶT HÀNG KHẨN: " + selectedIds.join(","),
    source: "dat_hang_chuyen_kho_khan",
    order_ids: selectedIds,
    items: [...grouped.entries()].map(([masp, items]) => ({ masp, items }))
  };

  localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
  localStorage.setItem("dhkhan_pending_ids", JSON.stringify(selectedIds));
  // Quan trọng: không dùng dhck_pending_ids để tránh module chuyển kho tự động xử lý nhầm ID.
  localStorage.removeItem("dhck_pending_ids");

  // Theo nghiệp vụ đặt hàng KHẨN: ngay khi người dùng đã tick Chuyển và
  // bấm Tạo hóa đơn CCN, các dòng đó được ghi nhận là ĐÃ CHUYỂN ngay.
  // Vẫn giữ dhkhan_pending_ids + payload để luồng sau khi lưu hóa đơn có thể
  // đối chiếu lại an toàn, nhưng trạng thái trên panel cập nhật realtime tức thì.
  const now = new Date().toISOString();
  const manv = getManv();
  suppressRealtimeUntil = Date.now() + 900;
  const { error: markErr } = await ctx.supabase
    .from(TABLE)
    .update({
      trang_thai: "da_chuyen",
      manv_thuc_hien: manv || null,
      updated_at: now
    })
    .in("id", selectedIds)
    .eq("tu_coso", coso)
    .eq("trang_thai", "moi");

  if (markErr) {
    console.error("[Đặt hàng khẩn] Không cập nhật Đã chuyển khi tạo CCN:", markErr);
    alert("❌ Không cập nhật được trạng thái Đã chuyển. Chưa mở hóa đơn CCN để tránh lệch dữ liệu.");
    return;
  }

  await refreshPanel({ forceOpen: true });

  const url = dir === "2v1" ? "/ccn2v1cs2.html" : "/ccn1v2cs1.html";
  window.open(location.origin + url, "_blank");
}

function bindPanelEvents(box) {
  box.querySelector("#dhkhan-toggle")?.addEventListener("click",e=>{ e.stopPropagation(); panelMode=panelMode==="collapsed"?"expanded":"collapsed"; applyPanelMode(); });
  box.querySelector("#dhkhan-close")?.addEventListener("click",e=>{ e.stopPropagation(); panelMode="hidden"; applyPanelMode(); });
  box.querySelector("#dhkhan-create")?.addEventListener("click",()=>{ showManualCreate(); });
  box.querySelector("#dhkhan-delete")?.addEventListener("click",()=>deleteSelectedOrders(box));
  box.querySelector("#dhkhan-create-ccn")?.addEventListener("click",()=>createUrgentCcnFromChecked(box));

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

  const isAdmin = await isAdminUser();
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
        ${isAdmin ? `<button id="dhkhan-delete" style="font-weight:800;color:#9b0000;">Xóa đặt hàng</button>` : ""}
        <button id="dhkhan-create-ccn" style="font-weight:800;color:#0b57d0;">Tạo hóa đơn CCN</button>
        <button id="dhkhan-toggle" style="border:0;background:transparent;font-size:18px;font-weight:900;">${panelMode==="collapsed"?"▲":"▼"}</button>
        <button id="dhkhan-close" title="Đóng hẳn" style="border:0;background:transparent;font-size:20px;font-weight:900;color:#9b0000;">×</button>
      </div>
    </div>
    <div id="dhkhan-body" style="display:${panelMode==="collapsed"?"none":"block"};">
      <div style="font-size:12px;color:#7a3630;margin:4px 0 5px;">Hiển thị ${rows.length} dòng mới nhất (tối đa ${HISTORY_LIMIT}), sắp xếp theo thời gian tạo mới nhất.</div>
      <table style="width:100%;border-collapse:collapse;background:#fff;">
        <thead><tr style="background:#f7b3a9;"><th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>NV thực hiện</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th></tr></thead>
        <tbody data-section="canmove">${renderRows(canMove,true,isAdmin)}</tbody>
      </table>
      <div style="font-weight:800;margin:8px 0 4px;color:#555;">Theo dõi / yêu cầu từ cơ sở này</div>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;">
        <thead><tr style="background:#ddd;"><th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>NV thực hiện</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th></tr></thead>
        <tbody data-section="onlyview">${renderRows(onlyView,false,isAdmin)}</tbody>
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

function dirToCosoPair(dir) {
  const d = norm(dir).toLowerCase();
  if (d === "1v2") return { dir:"1v2", from:"cs1", to:"cs2" };
  if (d === "2v1") return { dir:"2v1", from:"cs2", to:"cs1" };
  return null;
}

function defaultIncomingDirection() {
  const coso = getCurrentCoso();
  if (coso === "cs1") return "2v1";
  if (coso === "cs2") return "1v2";
  return "";
}

function directionLabel(dir) {
  const p = dirToCosoPair(dir);
  return p ? `${p.from.toUpperCase()} → ${p.to.toUpperCase()}` : "-";
}

function oppositeDirection(dir) {
  return norm(dir).toLowerCase() === "1v2" ? "2v1" : "1v2";
}

function makeUrgentCreateDraggable(box, handle) {
  if (!box || !handle || window.matchMedia("(max-width:800px)").matches) return;
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button,input,select,textarea,a")) return;
    const r = box.getBoundingClientRect();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = r.left;
    startTop = r.top;
    box.style.left = `${startLeft}px`;
    box.style.top = `${startTop}px`;
    box.style.transform = "none";
    e.preventDefault();
    e.stopPropagation();
  });

  const move = (e) => {
    if (!dragging) return;
    const maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - Math.min(box.offsetHeight, window.innerHeight));
    const nextLeft = Math.min(maxLeft, Math.max(0, startLeft + e.clientX - startX));
    const nextTop = Math.min(maxTop, Math.max(0, startTop + e.clientY - startY));
    box.style.left = `${nextLeft}px`;
    box.style.top = `${nextTop}px`;
    e.preventDefault();
  };
  const up = () => { dragging = false; };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  box.dataset.dragCleanup = "1";
}

function confirmUrgentDirection({ masp, direction, totalQty }) {
  return new Promise((resolve) => {
    document.getElementById("dhkhan-confirm-direction")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "dhkhan-confirm-direction";
    overlay.style.cssText = "position:fixed;inset:0;z-index:10120;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:14px;";
    overlay.innerHTML = `
      <div style="width:min(430px,94vw);background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.35);padding:16px;text-align:center;">
        <div style="font-weight:900;font-size:19px;color:#9b0000;margin-bottom:12px;">XÁC NHẬN ĐẶT HÀNG KHẨN</div>
        <div style="font-size:16px;line-height:1.55;">
          Hướng đang đặt:<br>
          <b style="font-size:22px;color:#1745d1;text-decoration:underline;">${esc(directionLabel(direction))}</b><br>
          Mã: <b>${esc(masp)}</b> &nbsp;•&nbsp; Tổng SL: <b>${Number(totalQty||0)}</b>
        </div>
        <div style="display:flex;justify-content:center;gap:12px;margin-top:16px;">
          <button id="dhkhan-confirm-cancel" style="min-width:110px;padding:9px 14px;font-weight:800;">Hủy</button>
          <button id="dhkhan-confirm-ok" style="min-width:110px;padding:9px 14px;font-weight:900;background:#d00000;color:#fff;border:0;border-radius:6px;">Đồng ý</button>
        </div>
      </div>`;
    // Không cho click trong popup xác nhận lan tới global close của StockQuick.
    overlay.addEventListener("click", e => e.stopPropagation());
    overlay.addEventListener("mousedown", e => e.stopPropagation());
    document.body.appendChild(overlay);
    const done = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector("#dhkhan-confirm-cancel").onclick = (e) => { e.preventDefault(); e.stopPropagation(); done(false); };
    overlay.querySelector("#dhkhan-confirm-ok").onclick = (e) => { e.preventDefault(); e.stopPropagation(); done(true); };
  });
}

function showManualCreate(options={}) {
  document.getElementById("dhkhan-create-box")?.remove();
  document.getElementById("dhkhan-confirm-direction")?.remove();
  if (panelMode === "hidden") { panelMode = "expanded"; refreshPanel({forceOpen:true}); }

  const presetMasp = normMasp(options.masp || "");
  const suggestedQty = buildSuggestedQtyMap(options.suggestedItems || []);
  const source = options.source || "manual";
  const coso = getCurrentCoso();
  if (!coso) return alert("Không xác định được cơ sở hiện tại.");

  // +Đặt khẩn trực tiếp: mặc định cơ sở khác -> cơ sở hiện tại.
  // Mở từ StockQuick: nếu gợi ý có đúng 1 hướng thì ưu tiên hướng gợi ý.
  let currentDirection = norm(options.initialDirection).toLowerCase();
  if (!["1v2","2v1"].includes(currentDirection)) currentDirection = defaultIncomingDirection();
  if (!["1v2","2v1"].includes(currentDirection)) return alert("Không xác định được hướng chuyển.");

  const box = document.createElement("div");
  box.id = "dhkhan-create-box";
  box.style.cssText = `position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:10090;background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.32);padding:12px;width:760px;max-width:98vw;overflow:auto;`;
  box.innerHTML = `
    <div id="dhkhan-create-drag" class="dhkhan-drag-handle" style="font-weight:900;color:#111;font-size:18px;margin:-4px -4px 10px;padding:5px 4px;">🚨 ĐẶT HÀNG KHẨN CẤP</div>
    <div class="dhkhan-grid">
      <div class="dhkhan-grid-label">Mã SP</div>
      <input id="dhkhan-masp" class="dhkhan-wide" type="text" inputmode="text" enterkeyhint="next" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;" value="${esc(presetMasp)}">

      <div class="dhkhan-grid-label">Size</div>
      ${SIZE_OPTIONS.map(s=>`<div class="dhkhan-size-head">${s}</div>`).join("")}

      <div class="dhkhan-grid-label">Số lượng</div>
      ${SIZE_OPTIONS.map(s=>`<input class="dhkhan-qty" data-size="${s}" type="text" inputmode="text" enterkeyhint="next" autocomplete="off" value="${suggestedQty.get(s)||""}">`).join("")}

      <div class="dhkhan-grid-label">Hướng</div>
      <div class="dhkhan-wide dhkhan-direction">
        <button id="dhkhan-direction-toggle" type="button" class="dhkhan-direction-btn" title="Bấm để đảo hướng chuyển">⇄ <span id="dhkhan-direction-label">${esc(directionLabel(currentDirection))}</span></button>
      </div>

      <div class="dhkhan-grid-label">Ghi chú</div>
      <input id="dhkhan-note" class="dhkhan-wide" type="text" inputmode="text" enterkeyhint="done" autocomplete="off" placeholder="VD: khách đang đợi">
    </div>
    <div class="dhkhan-actions"><button id="dhkhan-cancel">Hủy</button><button id="dhkhan-save" style="background:#d00000;color:#fff;border:0;border-radius:6px;">ĐẶT KHẨN</button></div>`;

  // Quan trọng: mọi click/mousedown trong popup khẩn không được lan tới document,
  // nếu không global click handler của StockQuick sẽ đóng StockQuick phía sau.
  box.addEventListener("click", e => e.stopPropagation());
  box.addEventListener("mousedown", e => e.stopPropagation());
  document.body.appendChild(box);
  bindManualCreateKeyboard(box);
  makeUrgentCreateDraggable(box, box.querySelector("#dhkhan-create-drag"));

  const maspEl = box.querySelector("#dhkhan-masp");
  const directionLabelEl = box.querySelector("#dhkhan-direction-label");
  const refreshDirectionLabel = () => { if (directionLabelEl) directionLabelEl.textContent = directionLabel(currentDirection); };

  box.querySelector("#dhkhan-direction-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    currentDirection = oppositeDirection(currentDirection);
    refreshDirectionLabel();
  });

  setTimeout(() => {
    const firstQty = [...box.querySelectorAll(".dhkhan-qty")].find(x => !x.value);
    (presetMasp ? (firstQty || box.querySelector(".dhkhan-qty")) : maspEl)?.focus();
  }, 20);

  box.querySelector("#dhkhan-cancel").onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Chỉ đóng popup đặt khẩn; StockQuick phía sau giữ nguyên.
    box.remove();
  };

  box.querySelector("#dhkhan-save").onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const masp = normMasp(maspEl?.value);
    const note = box.querySelector("#dhkhan-note")?.value || "";
    const qtyEntries = [...box.querySelectorAll(".dhkhan-qty")]
      .map(input => ({size:input.dataset.size,soluong:Number(String(input.value||"").trim()||0)}))
      .filter(x => Number.isFinite(x.soluong) && x.soluong > 0);

    if (!masp) return alert("Bạn cần nhập Mã SP.");
    if (!qtyEntries.length) return alert("Bạn cần nhập số lượng cho ít nhất một size.");

    const {data,error} = await ctx.supabase.from("dmhanghoa").select("masp").eq("masp",masp).maybeSingle();
    if (error || !data) return alert("❌ Mã sản phẩm không tồn tại trong danh mục.");

    const pair = dirToCosoPair(currentDirection);
    if (!pair) return alert("Không xác định được hướng chuyển.");

    // Xác nhận lần cuối để tránh đặt nhầm hướng khi người dùng vừa đảo chiều.
    const totalQty = qtyEntries.reduce((sum,x)=>sum+Number(x.soluong||0),0);
    const confirmed = await confirmUrgentDirection({ masp, direction:currentDirection, totalQty });
    if (!confirmed) {
      // Giữ nguyên form và toàn bộ dữ liệu để người dùng đổi hướng / sửa SL.
      return;
    }

    const items = qtyEntries.map(x => ({
      masp,
      size:x.size,
      soluong:x.soluong,
      huong_chuyen:pair.dir,
      tu_coso:pair.from,
      den_coso:pair.to
    }));

    const ok = await insertUrgentOrders(items,note,source);
    if (ok) {
      // Chỉ đóng popup đặt khẩn; không đóng StockQuick phía sau.
      box.remove();
    }
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
  window.DatHangChuyenKhoKhan={openFromStockQuick,openManual:()=>{if(panelMode==="hidden") panelMode="expanded"; refreshPanel({forceOpen:true}); showManualCreate();},refresh:()=>{panelMode="expanded";return refreshPanel({forceOpen:true});}};
  bindStockQuickExisting(); refreshPanel(); setupRealtime();
  window.addEventListener("resize",schedulePosition); window.visualViewport?.addEventListener("resize",schedulePosition);
  setInterval(()=>{if(document.getElementById("dhkhan-panel")) schedulePosition();},2000);
}
