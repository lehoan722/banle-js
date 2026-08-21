import { supabase } from "./supabaseClient.js";

const SIZE_LIST = ["38","39","40","41","42","43","44","45","46"];
const IMAGE_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const ACTIVE_STATES = ["DANG_TU_VAN","CHO_THU","DANG_CHOT","DA_DAY_SANG_BAN"];
const PENDING_KEY = "sales_copilot_pending_v1";

const state = {
  manv: String(localStorage.getItem("manv") || "").trim(),
  tennv: String(localStorage.getItem("tennv") || "").trim(),
  diadiem: String(localStorage.getItem("diadiem") || "cs1").trim().toLowerCase(),
  groups: [],
  sizeConfig: [],
  bodyGroups: [],
  sessions: [],
  currentSessionId: null,
  selectedGroup: "AP",
  selectedProduct: null,
  selectedSize: null,
  currentSuggestion: null,
  selectedFit: null,
  suggestionCache: new Map(),
  stockCache: new Map(),
  productCache: new Map(),
  editingSessionId: null,
  pendingConfirmAction: null,
};

const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString("vi-VN");
const norm = v => String(v ?? "").trim().toUpperCase();

function toast(msg, ms = 2200) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(window.__scToast);
  window.__scToast = setTimeout(() => el.style.display = "none", ms);
}
function setStep(n) {
  document.querySelectorAll(".step").forEach(el => el.classList.toggle("active", Number(el.dataset.step) === Number(n)));
}
function sizeRank(s) {
  const i = SIZE_LIST.indexOf(String(s));
  return i < 0 ? null : i + 1;
}
function sizeFromRank(r) {
  if (!Number.isFinite(r)) return null;
  const idx = Math.max(0, Math.min(SIZE_LIST.length - 1, Math.round(r) - 1));
  return SIZE_LIST[idx];
}
function extractInternalSize(v) {
  const s = String(v ?? "").replace(/^size\s+/i, "").trim();
  const m = s.match(/\b(38|39|40|41|42|43|44|45|46)\b/);
  return m ? m[1] : null;
}
function currentSession() {
  return state.sessions.find(x => Number(x.id) === Number(state.currentSessionId)) || null;
}
function isSizeManagedGroup(groupCode) {
  const g = state.groups.find(x => norm(x.manhom) === norm(groupCode));
  return !!g?.co_quan_ly_size;
}
function productLoai(sp) {
  const g = state.groups.find(x => norm(x.manhom) === norm(sp?.nhomhang));
  return g?.loai_tu_van || "";
}

async function loadConfig() {
  const [g1, g2, g3] = await Promise.all([
    supabase.from("cauhinh_nhom_tu_van").select("*").eq("active", true).order("thu_tu"),
    supabase.from("cauhinh_thu_tu_size").select("*").eq("active", true).order("thu_tu"),
    supabase.from("cauhinh_nhom_co_the").select("*").eq("active", true).order("thu_tu"),
  ]);
  if (g1.error) throw g1.error;
  if (g2.error) throw g2.error;
  if (g3.error) throw g3.error;
  state.groups = g1.data || [];
  state.sizeConfig = g2.data || [];
  state.bodyGroups = g3.data || [];
}

function distanceToRange(v, min, max) {
  const n = Number(v);
  if (n >= Number(min) && n <= Number(max)) return 0;
  if (n < Number(min)) return Number(min) - n;
  return n - Number(max);
}

function seedSuggestionForProfile(profile, loaiTuVan = "AO") {
  if (!profile) {
    return {
      primary: null, backup: null,
      rangeMin: null, rangeMax: null,
      confidence: 0, source: "CHUA_CO"
    };
  }

  if (loaiTuVan === "GIAY_DEP") {
    const giay = extractInternalSize(profile.size_giay_thuong_di);
    return giay
      ? {
          primary: giay,
          backup: null,
          rangeMin: giay,
          rangeMax: giay,
          confidence: 0.82,
          source: "SIZE_GIAY_THUONG_DI"
        }
      : {
          primary: null,
          backup: null,
          rangeMin: null,
          rangeMax: null,
          confidence: 0,
          source: "CAN_HOI_SIZE_GIAY"
        };
  }

  if (loaiTuVan === "PHU_KIEN") {
    return {
      primary: null, backup: null,
      rangeMin: null, rangeMax: null,
      confidence: 1, source: "KHONG_QUAN_SIZE"
    };
  }

  const scored = state.bodyGroups.map(g => {
    const dc = distanceToRange(
      profile.chieu_cao_cm,
      g.cao_min_cm,
      g.cao_max_cm
    ) / 4;

    const dk = distanceToRange(
      profile.can_nang_kg,
      g.kg_min,
      g.kg_max
    ) / 4;

    return {
      g,
      score: dc * dc + dk * dk
    };
  }).sort((a, b) => a.score - b.score);

  const g = scored[0]?.g;

  if (!g) {
    return {
      primary: "40",
      backup: "39",
      rangeMin: "39",
      rangeMax: "40",
      confidence: .30,
      source: "BANG_CHUAN"
    };
  }

  const minRank = sizeRank(g.size_tu) || 1;
  const maxRank = sizeRank(g.size_den) || minRank;

  // Chỉ dùng vị trí của khách TRONG chính vùng cao/kg
  // để chọn size nằm trong khoảng size_tu -> size_den.
  // KHONG cộng thêm size vì bụng/đùi/vai/ngực ở V1.1.
  const kgSpan = Math.max(1, Number(g.kg_max) - Number(g.kg_min));
  const caoSpan = Math.max(1, Number(g.cao_max_cm) - Number(g.cao_min_cm));

  const kgPos = Math.max(
    0,
    Math.min(
      1,
      (Number(profile.can_nang_kg) - Number(g.kg_min)) / kgSpan
    )
  );

  const caoPos = Math.max(
    0,
    Math.min(
      1,
      (Number(profile.chieu_cao_cm) - Number(g.cao_min_cm)) / caoSpan
    )
  );

  // Cân nặng ảnh hưởng nhiều hơn chiều cao khi chọn size quần áo.
  const pos = kgPos * 0.65 + caoPos * 0.35;

  const spanRank = Math.max(0, maxRank - minRank);
  const targetRank = minRank + pos * spanRank;

  let primaryRank = Math.round(targetRank);
  primaryRank = Math.max(minRank, Math.min(maxRank, primaryRank));

  const primary = sizeFromRank(primaryRank);

  let backup = null;
  if (maxRank > minRank) {
    // Chọn size dự phòng ngay sát size chính nhưng vẫn phải ở TRONG range.
    let backupRank;

    if (primaryRank <= minRank) {
      backupRank = minRank + 1;
    } else if (primaryRank >= maxRank) {
      backupRank = maxRank - 1;
    } else {
      backupRank = pos >= 0.5 ? primaryRank + 1 : primaryRank - 1;
    }

    backupRank = Math.max(minRank, Math.min(maxRank, backupRank));
    backup = sizeFromRank(backupRank);

    if (backup === primary) {
      const alt = primaryRank < maxRank
        ? primaryRank + 1
        : primaryRank - 1;

      backup = sizeFromRank(
        Math.max(minRank, Math.min(maxRank, alt))
      );
    }
  }

  return {
    primary,
    backup,
    rangeMin: sizeFromRank(minRank),
    rangeMax: sizeFromRank(maxRank),
    confidence: scored[0]?.score === 0 ? .55 : .40,
    source: "BANG_CHUAN",
    group: g.ma_nhom
  };
}

function bodyMismatchPenalty(hist, p, loai) {
  let mismatches = 0, fields = [];
  if (loai === "AO") fields = ["ao_vai_rong","ao_nguc_to","ao_bung"];
  if (loai === "QUAN") fields = ["quan_bung","quan_dui_to","quan_mong_to"];
  fields.forEach(f => { if (!!hist[f] !== !!p[f]) mismatches++; });
  return mismatches * 0.55;
}

async function learnSuggestionForProduct(sp, profile, seed) {
  const loai = productLoai(sp);
  if (!sp || !profile || !isSizeManagedGroup(sp.nhomhang) || loai === "GIAY_DEP") return seed;

  const { data, error } = await supabase
    .from("v_du_lieu_hoc_size_sach")
    .select("*")
    .eq("masp", sp.masp)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data?.length) return seed;

  let sumW = 0, sumRank = 0, used = 0;
  for (const h of data) {
    let r = sizeRank(extractInternalSize(h.size));
    if (!r) continue;

    if (h.ket_qua === "HOI_BO") r += 1;
    if (h.ket_qua === "HOI_RONG") r -= 1;
    r = Math.max(1, Math.min(9, r));

    const dCao = Math.abs(Number(profile.chieu_cao_cm) - Number(h.chieu_cao_cm)) / 5;
    const dKg = Math.abs(Number(profile.can_nang_kg) - Number(h.can_nang_kg)) / 5;
    const bodyPenalty = bodyMismatchPenalty(h, profile, loai);
    const dist = Math.sqrt(dCao*dCao + dKg*dKg) + bodyPenalty;
    const w = 1 / (0.6 + dist);
    sumW += w; sumRank += r * w; used++;
  }
  if (!used || !sumW) return seed;

  const historyRank = sumRank / sumW;
  const seedRank = sizeRank(seed.primary) || historyRank;
  const historyShare = used >= 8 ? .85 : used >= 4 ? .75 : used >= 2 ? .65 : .55;
  const blended = historyRank * historyShare + seedRank * (1-historyShare);
  const primary = sizeFromRank(blended);
  const pRank = sizeRank(primary);
  const backup = sizeFromRank(Math.max(1, Math.min(9, blended >= pRank ? pRank+1 : pRank-1)));
  const confidence = Math.min(.92, .52 + Math.min(used, 10) * .04);

  return {
    primary,
    backup: backup === primary ? seed.backup : backup,
    rangeMin: seed.rangeMin || null,
    rangeMax: seed.rangeMax || null,
    confidence,
    source: used === 1 ? "1_DIEM_NEO_SAN_PHAM" : "LICH_SU_SAN_PHAM",
    samples: used
  };
}

async function getStockForMasps(masps) {
  const out = new Map();
  if (!masps.length) return out;
  const denNgay = new Date().toISOString().slice(0,10);
  for (let i=0;i<masps.length;i+=80) {
    const chunk = masps.slice(i,i+80);
    const { data, error } = await supabase.rpc("xntnhanh", {
      p_masps: chunk, p_den_ngay: denNgay, p_tonghop_size: false
    });
    if (error) { console.warn("xntnhanh:", error); continue; }
    (data || []).forEach(r => {
      const m = norm(r.masp);
      const s = extractInternalSize(r.size);
      if (!m || !s) return;
      if (!out.has(m)) out.set(m, new Map());
      out.get(m).set(s, {
        ton_cs1:Number(r.ton_cs1||0),
        ton_cs2:Number(r.ton_cs2||0),
        ban_cs1:Number(r.ban_cs1||0),
        ban_cs2:Number(r.ban_cs2||0),
      });
    });
  }
  return out;
}

function stockAtBranch(stockBySize, size) {
  const row = stockBySize?.get(String(size));
  if (!row) return 0;
  return state.diadiem === "cs2" ? Number(row.ton_cs2||0) : Number(row.ton_cs1||0);
}
function availableSizes(stockBySize) {
  return SIZE_LIST.filter(s => stockAtBranch(stockBySize, s) > 0);
}
function nearestAvailable(target, av) {
  const tr = sizeRank(target);
  if (!tr || !av.length) return target;
  return [...av].sort((a,b)=>Math.abs(sizeRank(a)-tr)-Math.abs(sizeRank(b)-tr))[0];
}
function applyAvailability(sug, stockBySize) {
  const av = availableSizes(stockBySize);

  return {
    ...sug,
    available: av,
    primaryInStock: sug?.primary
      ? stockAtBranch(stockBySize, sug.primary) > 0
      : false,
    backupInStock: sug?.backup
      ? stockAtBranch(stockBySize, sug.backup) > 0
      : false
  };
}

function distanceOutsideSuggestedRange(size, sug) {
  const r = sizeRank(size);
  if (!r) return 0;

  const minR =
    sizeRank(sug?.rangeMin) ||
    sizeRank(sug?.primary) ||
    r;

  const maxR =
    sizeRank(sug?.rangeMax) ||
    sizeRank(sug?.backup) ||
    sizeRank(sug?.primary) ||
    r;

  const lo = Math.min(minR, maxR);
  const hi = Math.max(minR, maxR);

  if (r < lo) return lo - r;
  if (r > hi) return r - hi;

  return 0;
}

async function createOrUpdateSession(payload) {
  if (state.editingSessionId) {
    const { data, error } = await supabase.from("phien_tu_van_ban_hang")
      .update({ ...payload, updated_at:new Date().toISOString(), last_active_at:new Date().toISOString() })
      .eq("id", state.editingSessionId).select().single();
    if (error) throw error;
    const idx = state.sessions.findIndex(x=>Number(x.id)===Number(data.id));
    if (idx>=0) state.sessions[idx]=data;
    state.currentSessionId=data.id;
  } else {
    if (state.sessions.filter(x=>ACTIVE_STATES.includes(x.trang_thai)).length >= 3) {
      if (!confirm("Bạn đang có 3 khách chưa kết thúc. Vẫn tạo thêm khách thứ 4?")) return false;
    }
    const { data, error } = await supabase.from("phien_tu_van_ban_hang")
      .insert(payload).select().single();
    if (error) throw error;
    state.sessions.unshift(data);
    state.currentSessionId=data.id;
  }
  await renderAll();
  return true;
}

async function loadSessions() {
  if (!state.manv) return;
  const { data, error } = await supabase.from("v_phien_tu_van_dang_mo")
    .select("*").eq("manv", state.manv).order("last_active_at",{ascending:false});
  if (error) throw error;
  state.sessions = data || [];
  if (!state.currentSessionId && state.sessions.length) state.currentSessionId=state.sessions[0].id;
}

function renderTabs() {
  const box=$("phienTabs");
  box.innerHTML="";
  state.sessions.filter(x=>ACTIVE_STATES.includes(x.trang_thai)).forEach((p,i)=>{
    const b=document.createElement("button");
    b.className="kh-tab"+(Number(p.id)===Number(state.currentSessionId)?" active":"");
    b.innerHTML=`${p.tenkh ? esc(p.tenkh) : "Khách "+(p.thu_tu_hien_thi||i+1)}
      <small>${p.chieu_cao_cm}cm · ${Number(p.can_nang_kg)}kg · ${p.so_mon_da_chot||0} món</small>`;
    b.onclick=async()=>{
      state.currentSessionId=p.id;
      state.selectedProduct=null;
      state.selectedSize=null;
      state.selectedFit=null;
      state.currentSuggestion=null;
      await touchSession();
      await renderAll();
      await searchProducts();
    };
    box.appendChild(b);
  });
}

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function profileModifiers(p) {
  const a=[],q=[];
  if(p.ao_vai_rong)a.push("vai rộng"); if(p.ao_nguc_to)a.push("ngực to"); if(p.ao_bung)a.push("bụng");
  if(p.quan_bung)q.push("bụng"); if(p.quan_dui_to)q.push("đùi to"); if(p.quan_mong_to)q.push("mông to");
  return {a:a.length?a.join(", "):"bình thường", q:q.length?q.join(", "):"bình thường"};
}

function renderProfile() {
  const p=currentSession(), box=$("profileBox");
  if(!p){box.className="empty";box.innerHTML="Tạo khách mới để bắt đầu.";return;}
  const m=profileModifiers(p);
  box.className="";
  box.innerHTML=`
    <div class="profile-main">${p.chieu_cao_cm}cm · ${Number(p.can_nang_kg)}kg${p.tuoi?" · "+p.tuoi+" tuổi":""}</div>
    <div class="profile-sub">
      Quần: <b>${esc(m.q)}</b><br>
      Áo: <b>${esc(m.a)}</b><br>
      Giày thường đi: <b>${esc(p.size_giay_thuong_di||"chưa biết")}</b><br>
      ${p.makh?`Khách: <b>${esc(p.tenkh||p.makh)}</b>`:"Khách lẻ/chưa nhập CRM"}
    </div>`;
}

function coachText() {
  const p=currentSession();
  if(!p)return "Quan sát nhanh chiều cao/cân nặng và tạo phiên khách.";
  if(!state.selectedProduct)return "Hỏi khách đang cần nhóm hàng nào, sau đó chọn nhóm và lấy 2–3 mẫu để thử.";
  if(!state.selectedSize)return "Cho khách thử size hệ thống ưu tiên trước; luôn chuẩn bị size dự phòng nếu tồn kho có.";
  return "Sau khi khách thử, bắt buộc ghi Hơi bó / Vừa khít / Hơi rộng. Dữ liệu này giúp hệ thống tư vấn chính xác dần.";
}
function renderCoach(){$("coachBox").textContent=coachText();}

function renderGroups() {
  const box=$("groupBar");box.innerHTML="";
  state.groups.forEach(g=>{
    const b=document.createElement("button");
    b.className="groupbtn"+(norm(g.manhom)===norm(state.selectedGroup)?" on":"");
    b.textContent=g.ten_hien_thi;
    b.onclick=()=>{state.selectedGroup=g.manhom;setStep(2);renderGroups();searchProducts();};
    box.appendChild(b);
  });
}

async function searchProducts() {
  const p=currentSession();
  if(!p){toast("Hãy tạo/chọn khách trước.");return;}
  setStep(4);
  const kw=String($("txtSearch").value||"").trim();
  let q=supabase.from("dmhanghoa")
    .select("masp,tensp,giale,nhomhang,chungloai,mausac,form,rong_ong,co_gian,active,giam_gia_pct")
    .eq("active",true)
    .eq("nhomhang",state.selectedGroup)
    .order("masp",{ascending:false})
    .limit(50);
  if(kw) q=q.or(`masp.ilike.%${kw}%,tensp.ilike.%${kw}%`);
  const {data,error}=await q;
  if(error){toast("Lỗi tìm sản phẩm: "+error.message,4000);return;}
  const list=data||[];
  list.forEach(sp=>state.productCache.set(norm(sp.masp),sp));
  const stock=await getStockForMasps(list.map(x=>x.masp));
  stock.forEach((v,k)=>state.stockCache.set(k,v));

  const only=$("chkConHang").checked;
  const filtered=list.filter(sp=>{
    if(!only)return true;
    const sm=stock.get(norm(sp.masp));
    if(!isSizeManagedGroup(sp.nhomhang)) return true;
    return availableSizes(sm).length>0;
  });
  $("searchSummary").textContent=`${filtered.length} sản phẩm · ${state.diadiem.toUpperCase()} · size nội bộ 38–46`;
  await renderProducts(filtered);
}

async function renderProducts(list) {
  const box=$("productList");box.innerHTML="";
  if(!list.length){box.innerHTML=`<div class="empty">Không tìm thấy sản phẩm phù hợp.</div>`;return;}
  const p=currentSession();
  const loaiGroup=state.groups.find(g=>norm(g.manhom)===norm(state.selectedGroup))?.loai_tu_van || "AO";
  const seed=seedSuggestionForProfile(p,loaiGroup);

  for(const sp of list){
    const stockBySize=state.stockCache.get(norm(sp.masp));
    let sug=await learnSuggestionForProduct(sp,p,seed);
    sug=applyAvailability(sug,stockBySize);

    const cacheKey = `${p.id}|${norm(sp.masp)}`;
    state.suggestionCache.set(cacheKey, { ...sug });

    const av=availableSizes(stockBySize);
    const div=document.createElement("div");
    div.className="product";
    const img=`${IMAGE_BASE}${encodeURIComponent(norm(sp.masp))}.JPG`;
    div.innerHTML=`
      <img src="${img}" onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'">
      <div class="product-body">
        <div class="masp">${esc(sp.masp)}</div>
        <div class="tensp">${esc(sp.tensp||"")}</div>
        <div class="price">${money(sp.giale)} đ</div>
        <div class="stock">${isSizeManagedGroup(sp.nhomhang)
          ? (
              av.length
                ? `
                  Gợi ý: <b>${esc(sug.primary || "-")}${sug.backup ? " / " + esc(sug.backup) : ""}</b><br>
                  Còn size:
                  ${av.map(s => `
                    <span class="sizebadge ${
                      s===sug.primary || s===sug.backup ? "best" : ""
                    }">${s}</span>
                  `).join("")}
                `
                : "Hết size tại cơ sở"
            )
          :"Không quản size"}
        </div>
        <div class="product-actions">
          <button class="btn-blue btn-tv">Tư vấn</button>
          <button class="btn-gray btn-ton">Xem tồn</button>
        </div>
      </div>`;
    div.querySelector(".btn-tv").onclick=()=>selectProduct(sp);
    div.querySelector(".btn-ton").onclick=(e)=>{e.stopPropagation();window.StockQuick?.showFor(e.currentTarget,sp.masp);};
    box.appendChild(div);
  }
}

async function selectProduct(sp) {
  state.selectedProduct=sp;
  state.selectedSize=null;
  state.selectedFit=null;
  setStep(3);

  const p=currentSession();
  const loai=productLoai(sp);
  const cacheKey = `${p?.id}|${norm(sp.masp)}`;

  let sug = state.suggestionCache.get(cacheKey);

  if (!sug) {
    sug=seedSuggestionForProfile(p,loai);
    sug=await learnSuggestionForProduct(sp,p,sug);

    const stockTemp =
      state.stockCache.get(norm(sp.masp)) ||
      (await getStockForMasps([sp.masp])).get(norm(sp.masp));

    sug=applyAvailability(sug,stockTemp);
    state.suggestionCache.set(cacheKey, { ...sug });
  }

  const stock =
    state.stockCache.get(norm(sp.masp)) ||
    (await getStockForMasps([sp.masp])).get(norm(sp.masp));

  if(stock) state.stockCache.set(norm(sp.masp),stock);

  // KHONG thay đổi primary/backup theo tồn kho.
  sug=applyAvailability(sug,stock);

  state.currentSuggestion=sug;
  renderProductDetail();
  renderCoach();
}

function sourceText(s){
  return ({
    BANG_CHUAN:"Bảng chuẩn ban đầu",
    "1_DIEM_NEO_SAN_PHAM":"1 dữ liệu thật của mã này",
    LICH_SU_SAN_PHAM:"Lịch sử thử thật của mã này",
    SIZE_GIAY_THUONG_DI:"Size giày khách thường đi",
    CAN_HOI_SIZE_GIAY:"Cần hỏi size giày",
    KHONG_QUAN_SIZE:"Không quản size"
  })[s]||s||"";
}

function renderProductDetail() {
  const box=$("productDetail"), sp=state.selectedProduct, p=currentSession(), sug=state.currentSuggestion;
  if(!sp||!p){box.className="empty";box.innerHTML="Chọn một sản phẩm.";return;}
  box.className="";
  const stock=state.stockCache.get(norm(sp.masp));
  const av=availableSizes(stock);
  const managed=isSizeManagedGroup(sp.nhomhang);
  box.innerHTML=`
    <div class="masp">${esc(sp.masp)}</div>
    <div class="tensp">${esc(sp.tensp||"")}</div>
    <div style="margin:6px 0"><b>${money(sp.giale)} đ</b> · ${esc(sp.nhomhang||"")}</div>
    ${managed ? `
      <div class="size-hero">
        <div><div style="font-size:11px;color:#667">NÊN THỬ</div><div class="size-main">${esc(sug?.primary||"?")}</div></div>
        <div class="size-backup">Dự phòng: <b>${esc(sug?.backup||"-")}</b><br>
          <span class="confidence">
            ${sourceText(sug?.source)} · tin cậy ${Math.round((sug?.confidence||0)*100)}%
            ${sug?.rangeMin ? `<br>Khoảng cơ thể nền: <b>${esc(sug.rangeMin)}–${esc(sug.rangeMax || sug.rangeMin)}</b>` : ""}
            ${!sug?.primaryInStock && sug?.primary ? `<br><span style="color:#b42318">Size ${esc(sug.primary)} hiện hết tại ${state.diadiem.toUpperCase()}</span>` : ""}
          </span>
        </div>
      </div>
      <div class="size-buttons">
        ${SIZE_LIST.map(s=>{
          const ton=stockAtBranch(stock,s);
          const cls=[
            s===""+sug?.primary?"primary":"",
            s===""+sug?.backup?"secondary":"",
            s===""+state.selectedSize?"selected":"",
            ton<=0?"no-stock":""
          ].filter(Boolean).join(" ");
          return `<button class="size-btn ${cls}" data-size="${s}" title="Tồn ${state.diadiem.toUpperCase()}: ${ton}">${s}<br><small>${ton}</small></button>`;
        }).join("")}
      </div>
      <div id="fitPanel"></div>
    ` : `
      <div class="coach">Nhóm này không quản size. Có thể chốt trực tiếp sản phẩm.</div>
      <button class="btn btn-green" id="btnChotNoSize" style="width:100%;margin-top:8px">Chốt sản phẩm</button>
    `}
    <button class="btn btn-gray" id="btnTonDetail" style="width:100%;margin-top:8px">Xem StockQuickPopup</button>
  `;
  box.querySelectorAll(".size-btn").forEach(b=>b.onclick=()=>chooseSize(b.dataset.size));
  $("btnTonDetail").onclick=(e)=>window.StockQuick?.showFor(e.currentTarget,sp.masp);
  if($("btnChotNoSize")) $("btnChotNoSize").onclick=()=>addToCart(null,null);
}

function fitLabel(fit) {
  return ({
    HOI_BO: "Hơi bó",
    VUA_KHIT: "Vừa khít",
    HOI_RONG: "Hơi rộng"
  })[fit] || "";
}

function renderFitPanel() {
  const fp=$("fitPanel");
  if (!fp || !state.selectedSize) return;

  const size=state.selectedSize;
  const sug=state.currentSuggestion;
  const outside=distanceOutsideSuggestedRange(size,sug);

  let warningHtml="";

  if (outside === 1) {
    warningHtml=`
      <div style="
        background:#fff7d6;
        border:1px solid #e9b949;
        color:#7a4b00;
        border-radius:9px;
        padding:8px;
        margin-bottom:8px
      ">
        ⚠️ Size ${size} nằm ngoài khoảng cơ thể nền
        ${esc(sug?.rangeMin || sug?.primary || "-")}–${esc(sug?.rangeMax || sug?.backup || sug?.primary || "-")}
        1 bậc. Nên kiểm tra lại trước khi ghi nhận.
      </div>
    `;
  }

  if (outside >= 2) {
    warningHtml=`
      <div class="dangerbox">
        ⚠️ Size ${size} lệch ${outside} bậc ngoài khoảng cơ thể nền
        ${esc(sug?.rangeMin || sug?.primary || "-")}–${esc(sug?.rangeMax || sug?.backup || sug?.primary || "-")}.
        Hãy kiểm tra lại số đo hoặc xác nhận đây là trường hợp đặc biệt.
      </div>
    `;
  }

  fp.innerHTML=`
    ${warningHtml}

    <div class="fit-box">
      <div style="
        padding:8px 10px;
        margin-bottom:8px;
        border-radius:9px;
        background:#eef6ff;
        border:1px solid #9ec9ec;
        font-weight:800
      ">
        Đang thử: <span style="color:#0878d1">SIZE ${size}</span>
        ${state.selectedFit
          ? ` · Kết quả: <span style="color:#15945d">${fitLabel(state.selectedFit)}</span>`
          : " · Chưa chọn kết quả"
        }
      </div>

      <div style="font-weight:800;margin-bottom:6px">
        Khách mặc size ${size} thế nào?
      </div>

      <div class="fit-actions">
        <button
          class="fit-tight ${state.selectedFit==="HOI_BO" ? "fit-selected" : ""}"
          data-fit="HOI_BO"
        >Hơi bó</button>

        <button
          class="fit-good ${state.selectedFit==="VUA_KHIT" ? "fit-selected" : ""}"
          data-fit="VUA_KHIT"
        >Vừa khít</button>

        <button
          class="fit-loose ${state.selectedFit==="HOI_RONG" ? "fit-selected" : ""}"
          data-fit="HOI_RONG"
        >Hơi rộng</button>
      </div>

      ${state.selectedFit
        ? `<button
             class="btn btn-green"
             id="btnChotFit"
             style="width:100%;margin-top:8px"
           >✅ Chốt bán size ${size} · ${fitLabel(state.selectedFit)}</button>`
        : ""
      }
    </div>
  `;

  fp.querySelectorAll("[data-fit]")
    .forEach(b => b.onclick=()=>saveFit(b.dataset.fit));

  if ($("btnChotFit")) {
    $("btnChotFit").onclick=()=>addToCart(
      size,
      state.selectedFit
    );
  }
}

function chooseSize(size) {
  state.selectedSize=size;
  state.selectedFit=null;
  setStep(5);

  // Render lại cả detail để nút size đang chọn đổi trạng thái rõ ràng.
  renderProductDetail();
  renderFitPanel();
  renderCoach();
}

async function saveFit(fit) {
  const p=currentSession();
  const sp=state.selectedProduct;
  const size=state.selectedSize;
  const sug=state.currentSuggestion;

  if(!p||!sp||!size) return;

  const outside=distanceOutsideSuggestedRange(size,sug);
  const suspicious=outside>=2;
  const level=outside>=3 ? 3 : outside>=2 ? 2 : outside===1 ? 1 : 0;

  if(suspicious){
    const ok=confirm(
      `⚠️ Size ${size} lệch ${outside} bậc ngoài khoảng cơ thể nền ` +
      `${sug?.rangeMin || sug?.primary}-${sug?.rangeMax || sug?.backup || sug?.primary}.\n\n` +
      `Nếu vẫn ghi nhận, dữ liệu này sẽ bị đánh dấu nghi ngờ và KHÔNG dùng để học tự động.\n\n` +
      `Bạn chắc chắn khách đã thử size ${size}?`
    );

    if(!ok) return;
  }

  const row={
    manv:state.manv,
    diadiem:state.diadiem,
    ket_qua:fit,

    nhomhang:sp.nhomhang||null,
    form:sp.form||null,
    co_gian:sp.co_gian||null,
    rong_ong:sp.rong_ong==null
      ? null
      : Number(sp.rong_ong),

    size_he_thong_goi_y:sug?.primary||null,
    size_du_phong:sug?.backup||null,
    nguon_goi_y_size:sug?.source||null,
    do_tin_cay_size:sug?.confidence||null,

    nghi_ngo_du_lieu:suspicious,
    muc_nghi_ngo:level,
    ly_do_nghi_ngo:outside>0
      ? `Size thu ${size} nam ngoai khoang co the ${sug?.rangeMin || "-"}-${sug?.rangeMax || "-"} ${outside} bac`
      : null
  };

  // V1.1: cùng 1 khách + mã + size chỉ giữ KẾT QUẢ MỚI NHẤT.
  // Nếu NV đổi Hơi bó -> Vừa khít, hệ thống UPDATE thay vì thêm dòng rác.
  const { data: oldRows, error: oldErr } =
    await supabase
      .from("ket_qua_thu_do")
      .select("id")
      .eq("phien_id",p.id)
      .eq("masp",sp.masp)
      .eq("size",size)
      .order("id",{ascending:false})
      .limit(1);

  if(oldErr){
    toast("Không kiểm tra được kết quả thử cũ: "+oldErr.message,4000);
    return;
  }

  let error;

  if(oldRows?.length){
    ({error} = await supabase
      .from("ket_qua_thu_do")
      .update(row)
      .eq("id",oldRows[0].id));
  } else {
    ({error} = await supabase
      .from("ket_qua_thu_do")
      .insert({
        ...row,
        phien_id:p.id,
        masp:sp.masp,
        size,
        da_chot_tu_van:false
      }));
  }

  if(error){
    toast("Không lưu được kết quả thử: "+error.message,4000);
    return;
  }

  state.selectedFit=fit;
  setStep(6);
  toast(`Đã ghi: size ${size} · ${fitLabel(fit)}`);

  // Render lại để nút đã chọn nổi bật + hiện kết quả ngay trên cùng dòng.
  renderProductDetail();
  renderFitPanel();
  renderPairingHint();
}

async function addToCart(size,fit) {
  const p=currentSession(), sp=state.selectedProduct, sug=state.currentSuggestion;
  if(!p||!sp)return;
  const diff=size ? distanceOutsideSuggestedRange(size,sug) : 0;
  const row={
    phien_id:p.id,masp:sp.masp,size:size||null,soluong:1,
    giale_hien_thi:Number(sp.giale||0),khuyenmai_hien_thi:0,trang_thai:"DA_CHOT",
    ket_qua_mac:fit||null,size_he_thong_goi_y:sug?.primary||null,size_du_phong:sug?.backup||null,
    nguon_goi_y_size:sug?.source||null,do_tin_cay_size:sug?.confidence||null,
    nghi_ngo_size:diff>=2,
    muc_nghi_ngo_size:diff>=3?3:diff>=2?2:diff===1?1:0,
    ly_do_nghi_ngo_size:diff>0
      ? `Size chot ${size} nam ngoai khoang co the ${sug?.rangeMin || "-"}-${sug?.rangeMax || "-"} ${diff} bac`
      : null
  };
  const {error}=await supabase.from("gio_tu_van").insert(row);
  if(error){toast("Không thêm được giỏ tư vấn: "+error.message,4000);return;}
  if(size){
    await supabase.from("ket_qua_thu_do").update({da_chot_tu_van:true})
      .eq("phien_id",p.id).eq("masp",sp.masp).eq("size",size);
  }
  await supabase.from("phien_tu_van_ban_hang").update({trang_thai:"DANG_CHOT",last_active_at:new Date().toISOString()}).eq("id",p.id);
  p.trang_thai="DANG_CHOT";
  setStep(7);
  await renderCart();
  toast("Đã thêm vào giỏ tư vấn.");
}

async function renderCart() {
  const p=currentSession(), box=$("cartBox");
  if(!p){box.className="empty";box.innerHTML="Chưa có khách.";return;}
  const {data,error}=await supabase.from("gio_tu_van").select("*")
    .eq("phien_id",p.id).eq("trang_thai","DA_CHOT").eq("da_day_sang_ban",false).order("created_at");
  if(error){box.innerHTML="Lỗi tải giỏ.";return;}
  const rows=data||[];
  p.so_mon_da_chot=rows.length;
  if(!rows.length){box.className="empty";box.innerHTML="Chưa chốt sản phẩm.";renderTabs();return;}
  box.className="";
  box.innerHTML=rows.map(r=>`
    <div class="cart-item" data-id="${r.id}">
      <div class="cart-top"><b>${esc(r.masp)}</b><span>${r.size?`Size ${r.size}`:""}</span></div>
      <div class="cart-meta">${money(r.giale_hien_thi)} đ · SL ${Number(r.soluong||1)} ${r.ket_qua_mac?`· ${r.ket_qua_mac.replaceAll("_"," ")}`:""}</div>
      ${r.nghi_ngo_size?`<div style="color:#b42318;font-size:11px">⚠️ Size bất thường - dữ liệu không dùng để học</div>`:""}
      <div class="cart-buttons"><button class="btn-gray btn-remove">Bỏ khỏi giỏ</button></div>
    </div>`).join("");
  box.querySelectorAll(".btn-remove").forEach(b=>b.onclick=async()=>{
    const id=b.closest(".cart-item").dataset.id;
    await supabase.from("gio_tu_van").update({trang_thai:"BO",updated_at:new Date().toISOString()}).eq("id",id);
    renderCart();
  });
  renderTabs();
}

function openCustomerModal(edit=false) {
  state.editingSessionId=edit?currentSession()?.id:null;
  const p=edit?currentSession():null;
  $("modalKhachTitle").textContent=edit?"Sửa thông tin khách":"Khách mới";
  $("btnLuuKhach").textContent=edit?"Lưu thay đổi":"Bắt đầu tư vấn";
  $("fCao").value=p?.chieu_cao_cm||"";
  $("fKg").value=p?.can_nang_kg||"";
  $("fTuoi").value=p?.tuoi||"";
  $("fGiay").value=p?.size_giay_thuong_di||"";
  $("fMakh").value=p?.makh||"";
  $("fTenkh").value=p?.tenkh||"";
  document.querySelectorAll(".body-chip").forEach(ch=>ch.classList.toggle("on",!!p?.[ch.dataset.field]));
  updateGroupPreview();
  $("modalKhach").classList.add("show");
  setTimeout(()=>$("fCao").focus(),50);
}

function formProfileDraft() {
  const x={};
  document.querySelectorAll(".body-chip").forEach(ch=>x[ch.dataset.field]=ch.classList.contains("on"));
  return {
    chieu_cao_cm:Number($("fCao").value||0),
    can_nang_kg:Number($("fKg").value||0),
    tuoi:$("fTuoi").value?Number($("fTuoi").value):null,
    size_giay_thuong_di:$("fGiay").value||null,
    makh:String($("fMakh").value||"").trim()||null,
    tenkh:String($("fTenkh").value||"").trim()||null,
    ...x
  };
}

function updateGroupPreview() {
  const p=formProfileDraft();
  if(!p.chieu_cao_cm||!p.can_nang_kg){$("groupPreview").textContent="Nhập chiều cao và cân nặng để xem size nền.";return;}
  const s=seedSuggestionForProfile(p,"AO");
  $("groupPreview").innerHTML=`Size nền ban đầu: <b>${s.primary}</b> · dự phòng <b>${s.backup}</b>. Đây chỉ là mốc khởi tạo; dữ liệu thử thật của từng mã sẽ được ưu tiên.`;
}

async function saveCustomerModal() {
  const p=formProfileDraft();
  if(p.chieu_cao_cm<130||p.chieu_cao_cm>220){alert("Chiều cao không hợp lệ.");return;}
  if(p.can_nang_kg<30||p.can_nang_kg>200){alert("Cân nặng không hợp lệ.");return;}
  const seed=seedSuggestionForProfile(p,"AO");
  const payload={
    manv:state.manv,tennv:state.tennv||null,diadiem:state.diadiem,
    makh:p.makh,tenkh:p.tenkh,chieu_cao_cm:p.chieu_cao_cm,can_nang_kg:p.can_nang_kg,tuoi:p.tuoi,
    quan_bung:p.quan_bung,quan_dui_to:p.quan_dui_to,quan_mong_to:p.quan_mong_to,
    ao_vai_rong:p.ao_vai_rong,ao_nguc_to:p.ao_nguc_to,ao_bung:p.ao_bung,
    size_giay_thuong_di:p.size_giay_thuong_di,ma_nhom_co_the:seed.group||null,
    ten_phien:p.tenkh||null,thu_tu_hien_thi:state.editingSessionId?currentSession()?.thu_tu_hien_thi:state.sessions.length+1,
    trang_thai:state.editingSessionId?currentSession()?.trang_thai||"DANG_TU_VAN":"DANG_TU_VAN"
  };
  try{
    const ok=await createOrUpdateSession(payload); if(ok)$("modalKhach").classList.remove("show");
  }catch(e){alert("Không lưu được phiên tư vấn: "+e.message);}
}

async function touchSession(){
  const p=currentSession();if(!p)return;
  await supabase.from("phien_tu_van_ban_hang").update({last_active_at:new Date().toISOString()}).eq("id",p.id);
}

function confirmMeasurements(action) {
  const p=currentSession();if(!p)return;
  const m=profileModifiers(p);
  $("xacNhanBody").innerHTML=`
    <div class="coach">
      <b>${p.chieu_cao_cm} cm · ${Number(p.can_nang_kg)} kg${p.tuoi?" · "+p.tuoi+" tuổi":""}</b><br><br>
      Quần: ${esc(m.q)}<br>
      Áo: ${esc(m.a)}<br>
      Size giày thường đi: ${esc(p.size_giay_thuong_di||"chưa biết")}<br><br>
      <b>Bạn có chắc số đo/ước lượng trên là đúng tương đối với khách?</b>
    </div>`;
  state.pendingConfirmAction=action;
  $("modalXacNhan").classList.add("show");
}

async function finalizeMeasurements() {
  const p=currentSession(); if(!p)return;
  const now=new Date().toISOString();
  await supabase.from("phien_tu_van_ban_hang").update({da_xac_nhan_so_do:true,xac_nhan_luc:now,updated_at:now}).eq("id",p.id);
  p.da_xac_nhan_so_do=true;p.xac_nhan_luc=now;
  const action=state.pendingConfirmAction;
  $("modalXacNhan").classList.remove("show");
  state.pendingConfirmAction=null;
  if(action==="PUSH") await pushToSale();
}

async function pushToSale() {
  const p=currentSession();if(!p)return;
  const {data,error}=await supabase.from("gio_tu_van").select("*")
    .eq("phien_id",p.id).eq("trang_thai","DA_CHOT").eq("da_day_sang_ban",false).order("created_at");
  if(error||!data?.length){toast("Giỏ tư vấn đang trống.");return;}
  const payload={
    id:`${Date.now()}_${p.id}`,created_at:new Date().toISOString(),
    phien_id:p.id,diadiem:state.diadiem,makh:p.makh||null,tenkh:p.tenkh||null,
    items:data.map(x=>({gio_id:x.id,masp:x.masp,size:x.size||null,soluong:Number(x.soluong||1)}))
  };
  localStorage.setItem(PENDING_KEY,JSON.stringify(payload));
  const ids=data.map(x=>x.id);
  await supabase.from("gio_tu_van").update({da_day_sang_ban:true,day_sang_ban_luc:new Date().toISOString(),updated_at:new Date().toISOString()}).in("id",ids);
  await supabase.from("phien_tu_van_ban_hang").update({trang_thai:"DA_DAY_SANG_BAN",last_active_at:new Date().toISOString()}).eq("id",p.id);
  p.trang_thai="DA_DAY_SANG_BAN";
  setStep(8);
  const url=state.diadiem==="cs2"?"/bannvcs2.html":"/bannvcs1.html";
  window.open(url,"BAN_NV_HOAN_TUYET");
  toast("Đã chuyển dữ liệu sang trang bán.");
  await renderCart();renderTabs();
}

async function endNoBuy(){
  const p=currentSession();if(!p)return;
  await supabase.from("phien_tu_van_ban_hang").update({trang_thai:"KET_THUC_KHONG_MUA",last_active_at:new Date().toISOString()}).eq("id",p.id);
  state.sessions=state.sessions.filter(x=>Number(x.id)!==Number(p.id));
  state.currentSessionId=state.sessions[0]?.id||null;
  state.selectedProduct=null;state.selectedSize=null;
  await renderAll();
}

function pairGroups(code){
  const c=norm(code);
  if(["QB","QV"].includes(c)) return ["AP","SM","TL","GIAYTHOITRANG","GIAYDA"];
  if(["AP","SM"].includes(c)) return ["QB","QV","TL","GIAYTHOITRANG"];
  if(["GIAYDA","GIAYSUC","GIAYTHOITRANG","DEP"].includes(c)) return ["QV","QB","AP","SM"];
  return ["AP","QV"];
}

function renderPairingHint(){
  const sp=state.selectedProduct;if(!sp)return;
  const groups=pairGroups(sp.nhomhang);
  const fp=$("fitPanel");
  if(!fp)return;
  const div=document.createElement("div");
  div.style.marginTop="8px";
  div.innerHTML=`<div style="font-size:12px;font-weight:800;margin-bottom:4px">Bán kèm nhanh:</div>
  <div class="chips">${groups.map(g=>`<button class="chip pair-chip" data-group="${g}">${g}</button>`).join("")}</div>`;
  fp.appendChild(div);
  div.querySelectorAll(".pair-chip").forEach(b=>b.onclick=()=>{state.selectedGroup=b.dataset.group;renderGroups();setStep(6);searchProducts();});
}

const oldChooseSize=chooseSize;
// sau mỗi lần render fit panel, bổ sung gợi ý phối
const _origSaveFit = saveFit;

async function renderAll(){
  renderTabs();renderProfile();renderGroups();renderCoach();await renderCart();
  if(state.selectedProduct)renderProductDetail();else{$("productDetail").className="empty";$("productDetail").innerHTML="Chọn một sản phẩm.";}
}

function bindEvents(){
  $("btnKhachMoi").onclick=()=>openCustomerModal(false);
  $("btnSuaKhach").onclick=()=>{if(currentSession())openCustomerModal(true);};
  $("btnHuyKhach").onclick=()=>$("modalKhach").classList.remove("show");
  $("btnLuuKhach").onclick=saveCustomerModal;
  $("btnSearch").onclick=searchProducts;
  $("txtSearch").addEventListener("keydown",e=>{if(e.key==="Enter")searchProducts();});
  $("chkConHang").onchange=searchProducts;
  $("btnDaySangBan").onclick=()=>confirmMeasurements("PUSH");
  $("btnKetThucKhongMua").onclick=async()=>{
    if(!currentSession()) return;

    const ok=confirm(
      "Kết thúc phiên tư vấn này với trạng thái KHÔNG MUA?\n\n" +
      "Các kết quả thử đã ghi vẫn được giữ lại."
    );

    if(ok) await endNoBuy();
  };
  $("btnXNDongY").onclick=finalizeMeasurements;
  $("btnXNSua").onclick=()=>{$("modalXacNhan").classList.remove("show");openCustomerModal(true);};
  $("btnMoTrangBan").onclick=()=>window.open(state.diadiem==="cs2"?"/bannvcs2.html":"/bannvcs1.html","BAN_NV_HOAN_TUYET");
  ["fCao","fKg"].forEach(id=>$(id).addEventListener("input",updateGroupPreview));
  $("fMakh").addEventListener("blur",async()=>{
    const ma=String($("fMakh").value||"").replace(/\D/g,"").slice(0,10);
    $("fMakh").value=ma;
    if(ma.length!==10)return;
    const {data}=await supabase.from("dmkhachhang").select("makh,tenkh").eq("makh",ma).maybeSingle();
    if(data?.tenkh&&!$("fTenkh").value)$("fTenkh").value=data.tenkh;
  });
  document.querySelectorAll(".body-chip").forEach(ch=>ch.onclick=()=>{ch.classList.toggle("on");updateGroupPreview();});
}

async function init(){
  $("nvInfo").textContent=`${state.tennv||state.manv||"Chưa đăng nhập"} · ${state.diadiem.toUpperCase()}`;
  $("fGiay").innerHTML='<option value="">-- Không biết --</option>'+SIZE_LIST.map(s=>`<option value="${s}">${s}</option>`).join("");
  if(!state.manv){
    alert("Chưa có mã nhân viên trong localStorage. Hãy đăng nhập trang bán nhân viên trước rồi mở Trợ lý bán hàng.");
  }
  try{
    await loadConfig();
    await loadSessions();
    bindEvents();
    renderGroups();
    await renderAll();
    if(!state.sessions.length) openCustomerModal(false);
    else searchProducts();
  }catch(e){
    console.error(e);
    alert("Không khởi tạo được Trợ lý bán hàng: "+(e.message||e));
  }
}

// Bổ sung phối hàng sau khi lưu kết quả thử
const originalSaveFit = saveFit;
saveFit = async function(fit){
  await originalSaveFit(fit);
  setTimeout(renderPairingHint,0);
};

init();
