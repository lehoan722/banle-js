window.SALES_COPILOT_BUILD="1.11.1";
console.log("[SalesCopilot] BUILD 1.11.1");
import { supabase } from "./supabaseClient.js";
import { setupScanner } from "./scanner.js";
import { playSuccessBeep, setupBeepUnlockOnce } from "./soundBeep.js";

const SIZE_LIST = ["38","39","40","41","42","43","44","45","46"];
const IMAGE_BASE = "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";
const ACTIVE_STATES = ["DANG_TU_VAN","CHO_THU","DANG_CHOT","DA_DAY_SANG_BAN"];
const PENDING_KEY = "sales_copilot_pending_v1";
const ACK_KEY = "sales_copilot_ack_v1";

const MAIN_GROUPS = {
  AO_HE: {
    label: "Áo hè",
    defaultGroup: "AP",
    groups: ["AP","SM","3LO","BOC"]
  },
  QUAN: {
    label: "Quần",
    defaultGroup: "QB",
    groups: ["QB","QT","QV","NGO","QNI"]
  },
  AO_RET: {
    label: "Áo rét",
    defaultGroup: "AOKHOAC",
    groups: ["AOKHOAC","TD","SO","LEN","AODA","BOD"]
  },
  GIAY_DEP: {
    label: "Giày dép",
    defaultGroup: "GIAYTHOITRANG",
    groups: ["DEP","GIAYDA","GIAYSUC","GIAYTHOITRANG"]
  }
};

// ============================================================
// V1.9.1 - CACHE / HIEU NANG
// ============================================================
const PERF_CACHE_MS = 60 * 1000;
const MASTER_CACHE_MS = 5 * 60 * 1000;
const LEARNING_CACHE_MS = 2 * 60 * 1000;
const STOCK_CACHE_MS = 45 * 1000;

const candidateSearchCache = new Map();
const masterFetchedAt = new Map();
const learningDataCache = new Map();
const stockFetchedAt = new Map();
const recentImportDateCache = new Map();
const RECENT_IMPORT_CACHE_MS = 5 * 60 * 1000;

let latestSearchSeq = 0;

function nowMs() {
  return Date.now();
}

function cacheFresh(ts, ttl) {
  return ts && (nowMs() - ts) < ttl;
}

function deepCloneSimple(v) {
  try {
    return structuredClone(v);
  } catch (_) {
    return JSON.parse(JSON.stringify(v));
  }
}

function candidateCacheKey({
  requestMode,
  sizes,
  group,
  branch,
  referencePrice
}) {
  return [
    requestMode,
    [...sizes].sort().join(","),
    norm(group),
    norm(branch),
    Number(referencePrice || 0)
  ].join("|");
}




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
  selectedMainGroup: "AO_HE",
  selectedShoeSearchSize: "",
  searchMode: "similar",
  referencePrice: 0,
  selectedProduct: null,
  selectedProductSource: "RESULT",
  selectedSize: null,
  currentSuggestion: null,
  selectedFit: null,
  suggestionCache: new Map(),
  stockCache: new Map(),
  productCache: new Map(),
  editingSessionId: null,
  pendingConfirmAction: null,
  autoWeightMode: true,
  uiMode: "basic",
  selectedForm: "",
  selectedColor: "",
  colors: [],
  cartRows: [],
  productPager: {
    list: [],
    nextIndex: 0,
    pageSize: 40,
    loading: false,
    searchSeq: 0,
    observer: null
  },
};

const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString("vi-VN");
const norm = v => String(v ?? "").trim().toUpperCase();

function isBasicMode(){ return state.uiMode === "basic"; }
function normalizeFormValue(v){
  const x=norm(v).replace(/\s+/g,"_");
  if(["RONG","RỘNG","FORM_RONG"].includes(x)) return "RONG";
  if(["VUA","VỪA","FORM_VUA"].includes(x)) return "VUA";
  if(["BO","BÓ","OM","ÔM","FORM_BO"].includes(x)) return "BO";
  return x;
}
function formLabelFromValue(v){
  return ({RONG:"Rộng",VUA:"Vừa",BO:"Bó"})[normalizeFormValue(v)] || (v || "");
}
function promoteFormPreservingOrder(list, preferredFormRaw){
  const preferred = normalizeFormValue(preferredFormRaw);
  const source = Array.isArray(list) ? list : [];
  if (!preferred || source.length < 2) return source;
  const matched=[]; const rest=[];
  source.forEach(item => {
    if (normalizeFormValue(item?.form) === preferred) matched.push(item);
    else rest.push(item);
  });
  return matched.concat(rest);
}
function applyUiMode(mode){
  state.uiMode = ["basic","advanced","full"].includes(mode) ? mode : "basic";
  document.body.dataset.uiMode = state.uiMode;
  if ($("uiLevel")) $("uiLevel").value = state.uiMode;
  if ($("cartTitle")) $("cartTitle").textContent = isBasicMode() ? "Khách đang lấy" : "Giỏ tư vấn";
  if ($("btnDaySangBan")) $("btnDaySangBan").textContent = isBasicMode() ? "✅ ĐƯA SANG BÁN HÀNG" : "✅ Đưa sang trang bán";
  renderCoach();
  renderBasicSubgroups();
}

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
  const [g1, g2, g3, g4] = await Promise.all([
    supabase.from("cauhinh_nhom_tu_van").select("*").eq("active", true).order("thu_tu"),
    supabase.from("cauhinh_thu_tu_size").select("*").eq("active", true).order("thu_tu"),
    supabase.from("cauhinh_nhom_co_the").select("*").eq("active", true).order("thu_tu"),
    supabase.from("dmmausac").select("mamau,tenmau").order("tenmau"),
  ]);
  if (g1.error) throw g1.error;
  if (g2.error) throw g2.error;
  if (g3.error) throw g3.error;
  if (g4.error) console.warn("[SalesCopilot] Không tải được danh mục màu:",g4.error);
  state.groups = g1.data || [];
  state.sizeConfig = g2.data || [];
  state.bodyGroups = g3.data || [];
  state.colors = g4.data || [];
}

function renderColorPrioritySelect(){
  const sel=$("colorPrioritySelect");
  if(!sel)return;
  const current=state.selectedColor||"";
  sel.innerHTML='<option value="">-- Không ưu tiên màu --</option>' +
    (state.colors||[]).map(r=>`<option value="${esc(r.mamau)}">${esc(r.tenmau)}</option>`).join("");
  sel.value=current;
}

function distanceToRange(v, min, max) {
  const n = Number(v);
  if (n >= Number(min) && n <= Number(max)) return 0;
  if (n < Number(min)) return Number(min) - n;
  return n - Number(max);
}

function bodyGroupForValue(value, minField, maxField) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  return (
    state.bodyGroups
      .filter(g =>
        n >= Number(g[minField]) &&
        n <= Number(g[maxField])
      )
      .sort(
        (a,b) =>
          Number(a.thu_tu || 0) -
          Number(b.thu_tu || 0)
      )[0] || null
  );
}

function groupSizeRange(group, loaiTuVan) {
  if (!group) {
    return {
      sizeTu:null,
      sizeDen:null
    };
  }

  if (loaiTuVan === "QUAN") {
    return {
      sizeTu:
        extractInternalSize(
          group.size_quan_tu ||
          group.size_tu
        ),

      sizeDen:
        extractInternalSize(
          group.size_quan_den ||
          group.size_den
        )
    };
  }

  // AO là mặc định cho AP/SM/...;
  // fallback về size_tu/size_den để không làm hỏng dữ liệu cũ.
  return {
    sizeTu:
      extractInternalSize(
        group.size_ao_tu ||
        group.size_tu
      ),

    sizeDen:
      extractInternalSize(
        group.size_ao_den ||
        group.size_den
      )
  };
}

function resultForDimension({
  value,
  group,
  loaiTuVan,
  dimension
}) {
  if (!group) {
    return null;
  }

  const n = Number(value);

  const min =
    Number(
      dimension === "CAO"
        ? group.cao_min_cm
        : group.kg_min
    );

  const max =
    Number(
      dimension === "CAO"
        ? group.cao_max_cm
        : group.kg_max
    );

  const { sizeTu, sizeDen } =
    groupSizeRange(
      group,
      loaiTuVan
    );

  const minRank =
    sizeRank(sizeTu);

  const maxRank =
    sizeRank(sizeDen);

  if (
    !Number.isFinite(n) ||
    !minRank ||
    !maxRank
  ) {
    return null;
  }

  const spanRank =
    maxRank - minRank;

  // MỨC 1-4: luôn là 2 size liền kề.
  // Chia theo mốc +5:
  // 150-154 => size nhỏ
  // 155-159 => size lớn
  // tương tự cho cân nặng.
  if (spanRank === 1) {
    const midpoint =
      min + 5;

    const primaryRank =
      n >= midpoint
        ? maxRank
        : minRank;

    const backupRank =
      primaryRank === minRank
        ? maxRank
        : minRank;

    return {
      primary:
        sizeFromRank(primaryRank),

      backup:
        sizeFromRank(backupRank),

      rangeMin:sizeTu,
      rangeMax:sizeDen,

      group:group.ma_nhom,
      groupOrder:
        Number(group.thu_tu || 0),

      value:n,
      min,
      max,
      dimension,
      loaiTuVan
    };
  }

  // MỨC 5: 3 size 44-45-46.
  //
  // Chiều cao:
  // 190-191 => 44
  // 192-194 => 45
  // 195     => 46
  //
  // Cân nặng:
  // 90-91  => 44
  // 92-94  => 45
  // 95-100 => 46
  if (spanRank >= 2) {
    let primaryRank;
    let backupRank;

    const lowerEnd =
      min + 1;

    const middleStart =
      min + 2;

    const upperStart =
      dimension === "CAO"
        ? 195
        : 95;

    if (n <= lowerEnd) {
      primaryRank = minRank;
      backupRank =
        Math.min(
          maxRank,
          minRank + 1
        );
    } else if (n < upperStart) {
      primaryRank =
        Math.min(
          maxRank - 1,
          minRank + 1
        );

      // Ở nửa dưới của vùng 45 -> dự phòng 44.
      // Ở nửa trên -> dự phòng 46.
      const middlePivot =
        dimension === "CAO"
          ? 193
          : 93;

      backupRank =
        n < middlePivot
          ? minRank
          : maxRank;
    } else {
      primaryRank = maxRank;
      backupRank =
        Math.max(
          minRank,
          maxRank - 1
        );
    }

    return {
      primary:
        sizeFromRank(primaryRank),

      backup:
        sizeFromRank(backupRank),

      rangeMin:sizeTu,
      rangeMax:sizeDen,

      group:group.ma_nhom,
      groupOrder:
        Number(group.thu_tu || 0),

      value:n,
      min,
      max,
      dimension,
      loaiTuVan
    };
  }

  return {
    primary:sizeTu,
    backup:null,
    rangeMin:sizeTu,
    rangeMax:sizeDen,
    group:group.ma_nhom,
    groupOrder:
      Number(group.thu_tu || 0),
    value:n,
    min,
    max,
    dimension,
    loaiTuVan
  };
}

function dominantSizeResult(
  byHeight,
  byWeight
) {
  if (!byHeight) return byWeight;
  if (!byWeight) return byHeight;

  const rh =
    sizeRank(
      byHeight.primary
    ) || 0;

  const rw =
    sizeRank(
      byWeight.primary
    ) || 0;

  if (rh > rw) {
    return byHeight;
  }

  if (rw > rh) {
    return byWeight;
  }

  // Cùng size thì ưu tiên kết quả có nhóm cao hơn;
  // nếu vẫn bằng nhau thì ưu tiên chiều cao.
  if (
    Number(byHeight.groupOrder || 0) >
    Number(byWeight.groupOrder || 0)
  ) {
    return byHeight;
  }

  if (
    Number(byWeight.groupOrder || 0) >
    Number(byHeight.groupOrder || 0)
  ) {
    return byWeight;
  }

  return byHeight;
}

function seedSuggestionForProfile(
  profile,
  loaiTuVan = "AO"
) {
  if (!profile) {
    return {
      primary:null,
      backup:null,
      rangeMin:null,
      rangeMax:null,
      confidence:0,
      source:"CHUA_CO"
    };
  }

  if (loaiTuVan === "GIAY_DEP") {
    const giay =
      extractInternalSize(
        profile.size_giay_thuong_di
      );

    return giay
      ? {
          primary:giay,
          backup:null,
          rangeMin:giay,
          rangeMax:giay,
          confidence:.82,
          source:"SIZE_GIAY_THUONG_DI"
        }
      : {
          primary:null,
          backup:null,
          rangeMin:null,
          rangeMax:null,
          confidence:0,
          source:"CAN_HOI_SIZE_GIAY"
        };
  }

  if (loaiTuVan === "PHU_KIEN") {
    return {
      primary:null,
      backup:null,
      rangeMin:null,
      rangeMax:null,
      confidence:1,
      source:"KHONG_QUAN_SIZE"
    };
  }

  const normalizedLoai =
    loaiTuVan === "QUAN"
      ? "QUAN"
      : "AO";

  const groupByHeight =
    bodyGroupForValue(
      profile.chieu_cao_cm,
      "cao_min_cm",
      "cao_max_cm"
    );

  const groupByWeight =
    bodyGroupForValue(
      profile.can_nang_kg,
      "kg_min",
      "kg_max"
    );

  const byHeight =
    resultForDimension({
      value:
        profile.chieu_cao_cm,

      group:
        groupByHeight,

      loaiTuVan:
        normalizedLoai,

      dimension:"CAO"
    });

  const byWeight =
    resultForDimension({
      value:
        profile.can_nang_kg,

      group:
        groupByWeight,

      loaiTuVan:
        normalizedLoai,

      dimension:"CAN"
    });

  const dominant =
    dominantSizeResult(
      byHeight,
      byWeight
    );

  if (!dominant) {
    return {
      primary:"40",
      backup:"39",
      rangeMin:"39",
      rangeMax:"40",
      confidence:.30,
      source:"BANG_CHUAN"
    };
  }

  // Quan trọng:
  // Backup đi theo CHÍNH nhóm/chiều đang quyết định size lớn hơn.
  // Không lấy size thấp cách xa của chiều còn lại.
  return {
    primary:
      dominant.primary,

    backup:
      dominant.backup,

    rangeMin:
      dominant.rangeMin,

    rangeMax:
      dominant.rangeMax,

    confidence:.70,
    source:"CAO_CAN_DOC_LAP_V18",

    group:
      dominant.group,

    sizeTheoCao:
      byHeight?.primary || null,

    sizeTheoCan:
      byWeight?.primary || null,

    nhomTheoCao:
      byHeight?.group || null,

    nhomTheoCan:
      byWeight?.group || null,

    loaiTuVan:
      normalizedLoai
  };
}

function bodyMismatchPenalty(hist, p, loai) {
  let mismatches = 0, fields = [];
  if (loai === "AO") fields = ["ao_vai_rong","ao_nguc_to","ao_bung"];
  if (loai === "QUAN") fields = ["quan_bung","quan_dui_to","quan_mong_to"];
  fields.forEach(f => { if (!!hist[f] !== !!p[f]) mismatches++; });
  return mismatches * 0.55;
}

async function preloadLearningData(masps) {
  const unique = Array.from(
    new Set(
      (masps || [])
        .map(norm)
        .filter(Boolean)
    )
  );

  const need = unique.filter(m => {
    const c = learningDataCache.get(m);
    return !c || !cacheFresh(c.ts, LEARNING_CACHE_MS);
  });

  if (!need.length) {
    return;
  }

  const CHUNK = 60;
  const chunks = [];

  for (let i=0; i<need.length; i+=CHUNK) {
    chunks.push(need.slice(i, i+CHUNK));
  }

  // Chay song song toi da 4 lo.
  for (let i=0; i<chunks.length; i+=4) {
    const batch = chunks.slice(i, i+4);

    const results = await Promise.all(
      batch.map(async chunk => {
        const { data, error } = await supabase
          .from("v_du_lieu_hoc_size_sach")
          .select(
            "masp,size,ket_qua,chieu_cao_cm,can_nang_kg," +
            "ao_vai_rong,ao_nguc_to,ao_bung," +
            "quan_bung,quan_dui_to,quan_mong_to,created_at"
          )
          .in("masp", chunk)
          .order("created_at", { ascending:false })
          .limit(3000);

        if (error) {
          console.warn(
            "[SalesCopilot] preload learning lỗi:",
            error
          );
          return { chunk, rows:[] };
        }

        return {
          chunk,
          rows:Array.isArray(data) ? data : []
        };
      })
    );

    results.forEach(({chunk,rows}) => {
      const grouped = new Map();

      rows.forEach(r => {
        const m = norm(r.masp);
        if (!grouped.has(m)) {
          grouped.set(m, []);
        }

        // Giữ tối đa 100 dòng/mã giống logic cũ.
        if (grouped.get(m).length < 100) {
          grouped.get(m).push(r);
        }
      });

      const ts = nowMs();

      chunk.forEach(m => {
        learningDataCache.set(
          m,
          {
            ts,
            rows:grouped.get(m) || []
          }
        );
      });
    });
  }
}

async function getLearningRowsForProduct(masp) {
  const m = norm(masp);
  const cached = learningDataCache.get(m);

  if (
    cached &&
    cacheFresh(cached.ts, LEARNING_CACHE_MS)
  ) {
    return cached.rows || [];
  }

  await preloadLearningData([m]);

  return (
    learningDataCache.get(m)?.rows ||
    []
  );
}

async function learnSuggestionForProduct(sp, profile, seed) {
  const loai = productLoai(sp);

  if (
    !sp ||
    !profile ||
    !isSizeManagedGroup(sp.nhomhang) ||
    loai === "GIAY_DEP"
  ) {
    return seed;
  }

  const data =
    await getLearningRowsForProduct(
      sp.masp
    );

  if (!data?.length) {
    return seed;
  }

  let sumW = 0;
  let sumRank = 0;
  let used = 0;

  for (const h of data) {
    let r =
      sizeRank(
        extractInternalSize(h.size)
      );

    if (!r) continue;

    if (h.ket_qua === "HOI_BO") r += 1;
    if (h.ket_qua === "HOI_RONG") r -= 1;

    r = Math.max(
      1,
      Math.min(9,r)
    );

    const dCao =
      Math.abs(
        Number(profile.chieu_cao_cm) -
        Number(h.chieu_cao_cm)
      ) / 5;

    const dKg =
      Math.abs(
        Number(profile.can_nang_kg) -
        Number(h.can_nang_kg)
      ) / 5;

    const bodyPenalty =
      bodyMismatchPenalty(
        h,
        profile,
        loai
      );

    const dist =
      Math.sqrt(
        dCao*dCao +
        dKg*dKg
      ) +
      bodyPenalty;

    const w =
      1 / (0.6 + dist);

    sumW += w;
    sumRank += r*w;
    used++;
  }

  if (!used || !sumW) {
    return seed;
  }

  const historyRank =
    sumRank / sumW;

  const seedRank =
    sizeRank(seed.primary) ||
    historyRank;

  const historyShare =
    used >= 8 ? .85 :
    used >= 4 ? .75 :
    used >= 2 ? .65 : .55;

  const blended =
    historyRank * historyShare +
    seedRank * (1-historyShare);

  const allowedRanks =
    Array.from(
      new Set(
        [
          sizeRank(seed.primary),
          sizeRank(seed.backup)
        ].filter(Boolean)
      )
    ).sort((a,b)=>a-b);

  const minAllowedRank =
    allowedRanks[0] ||
    Math.max(
      1,
      (sizeRank(seed.primary)||1)-1
    );

  const maxAllowedRank =
    allowedRanks[
      allowedRanks.length-1
    ] ||
    (sizeRank(seed.primary)||1);

  const clampedRank =
    Math.max(
      Math.min(minAllowedRank,maxAllowedRank),
      Math.min(
        Math.max(minAllowedRank,maxAllowedRank),
        blended
      )
    );

  const primary =
    sizeFromRank(clampedRank);

  const pRank =
    sizeRank(primary);

  let backup = null;

  const otherAllowedRank =
    pRank === minAllowedRank
      ? maxAllowedRank
      : minAllowedRank;

  if (
    otherAllowedRank &&
    otherAllowedRank !== pRank
  ) {
    backup =
      sizeFromRank(
        otherAllowedRank
      );
  }

  const confidence =
    Math.min(
      .92,
      .52 + Math.min(used,10)*.04
    );

  return {
    primary,
    backup,
    rangeMin:seed.rangeMin || null,
    rangeMax:seed.rangeMax || null,
    confidence,
    source:
      used === 1
        ? "1_DIEM_NEO_SAN_PHAM"
        : "LICH_SU_SAN_PHAM",
    samples:used
  };
}

async function getStockForMasps(masps) {
  const out = new Map();

  const uniqueMasps =
    Array.from(
      new Set(
        (masps || [])
          .map(norm)
          .filter(Boolean)
      )
    );

  if (!uniqueMasps.length) {
    return out;
  }

  // Tận dụng full-stock cache nếu còn mới.
  const need = [];

  uniqueMasps.forEach(m => {
    const ts = stockFetchedAt.get(m);
    const cached =
      state.stockCache.get(m);

    if (
      cached &&
      cached.size &&
      cacheFresh(ts, STOCK_CACHE_MS)
    ) {
      out.set(m,cached);
    } else {
      need.push(m);
    }
  });

  if (!need.length) {
    return out;
  }

  const denNgay =
    new Date()
      .toISOString()
      .slice(0,10);

  function absorbRows(rows, target) {
    (rows || []).forEach(r => {
      const m = norm(r.masp);
      const s =
        extractInternalSize(r.size);

      if (!m || !s) return;

      if (!target.has(m)) {
        target.set(m,new Map());
      }

      target.get(m).set(s,{
        ton_cs1:Number(r.ton_cs1||0),
        ton_cs2:Number(r.ton_cs2||0),
        ban_cs1:Number(r.ban_cs1||0),
        ban_cs2:Number(r.ban_cs2||0)
      });
    });
  }

  // V1.9.1:
  // lo 50 ma + 4 lo song song thay vi 20 ma tuan tu.
  const CHUNK_SIZE = 50;
  const chunks = [];

  for (
    let i=0;
    i<need.length;
    i+=CHUNK_SIZE
  ) {
    chunks.push(
      need.slice(i,i+CHUNK_SIZE)
    );
  }

  const fetched = new Map();
  const missingAll = [];

  for (
    let i=0;
    i<chunks.length;
    i+=4
  ) {
    const batch =
      chunks.slice(i,i+4);

    const results =
      await Promise.all(
        batch.map(
          async chunk => {
            const res =
              await supabase.rpc(
                "xntnhanh",
                {
                  p_masps:chunk,
                  p_den_ngay:denNgay,
                  p_tonghop_size:false
                }
              );

            return {
              chunk,
              data:Array.isArray(res.data)
                ? res.data
                : [],
              error:res.error
            };
          }
        )
      );

    results.forEach(
      ({chunk,data,error}) => {
        if (error) {
          console.warn(
            "[SalesCopilot] xntnhanh chunk lỗi:",
            error
          );
        }

        absorbRows(data,fetched);

        const returned =
          new Set(
            data
              .map(r=>norm(r.masp))
              .filter(Boolean)
          );

        chunk.forEach(m => {
          if (!returned.has(m)) {
            missingAll.push(m);
          }
        });
      }
    );
  }

  // Retry tất cả mã thiếu SONG SONG, chỉ một vòng.
  if (missingAll.length) {
    const retryResults =
      await Promise.all(
        missingAll.map(
          async masp => {
            const res =
              await supabase.rpc(
                "xntnhanh",
                {
                  p_masps:[masp],
                  p_den_ngay:denNgay,
                  p_tonghop_size:false
                }
              );

            return {
              masp,
              data:Array.isArray(res.data)
                ? res.data
                : [],
              error:res.error
            };
          }
        )
      );

    retryResults.forEach(
      ({masp,data,error}) => {
        if (error) {
          console.warn(
            "[SalesCopilot] xntnhanh retry lỗi:",
            masp,
            error
          );
        }

        absorbRows(data,fetched);
      }
    );
  }

  const ts = nowMs();

  need.forEach(m => {
    const map =
      fetched.get(m) ||
      new Map();

    out.set(m,map);

    if (map.size) {
      state.stockCache.set(m,map);
      stockFetchedAt.set(m,ts);
    }
  });

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
      if (isBasicMode()) { toast("Chế độ Cơ bản phục vụ tối đa 3 khách cùng lúc. Hãy kết thúc một khách trước.",3500); return false; }
      if (!confirm("Bạn đang có 3 khách chưa kết thúc. Vẫn tạo thêm khách thứ 4?")) return false;
    }
    const { data, error } = await supabase.from("phien_tu_van_ban_hang")
      .insert(payload).select().single();
    if (error) throw error;
    state.sessions.unshift(data);
    state.currentSessionId=data.id;
  }
  // Thông tin cơ thể thay đổi => mọi gợi ý cũ của phiên phải bỏ.
  state.suggestionCache.clear();
  state.selectedProduct = null;
  state.selectedSize = null;
  state.selectedFit = null;
  state.currentSuggestion = null;

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

function suggestionWithSessionReference(p, loai) {
  const base = seedSuggestionForProfile(p, loai);
  const ref = extractInternalSize(p?.__size_tham_chieu?.[loai]);
  if (!ref) return base;
  return {
    ...base,
    primary:ref,
    backup:null,
    rangeMin:ref,
    rangeMax:ref,
    source:"SAN_PHAM_THAM_CHIEU",
    confidence:1
  };
}

function quickProfileSizes(p) {
  if (!p) return { ao:null, quan:null };
  return {
    ao: suggestionWithSessionReference(p, "AO"),
    quan: suggestionWithSessionReference(p, "QUAN")
  };
}

function quickSizeText(sug) {
  if (!sug?.primary) return "-";
  return String(sug.primary);
}

function renderTabs() {
  const box=$("phienTabs");
  box.innerHTML="";
  state.sessions.filter(x=>ACTIVE_STATES.includes(x.trang_thai)).forEach((p,i)=>{
    const b=document.createElement("button");
    b.className="kh-tab"+(Number(p.id)===Number(state.currentSessionId)?" active":"");
    const qs=quickProfileSizes(p);
    b.innerHTML=`${p.tenkh ? esc(p.tenkh) : "Khách "+(p.thu_tu_hien_thi||i+1)}
      <small>${p.chieu_cao_cm}cm · ${Number(p.can_nang_kg)}kg · ${p.so_mon_da_chot||0} món</small>
      <span class="tab-size-summary">Áo ${esc(quickSizeText(qs.ao))} · Quần ${esc(quickSizeText(qs.quan))}</span>`;
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

function safeDomId(v) {
  return String(v || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function jumpInstantTo(top) {
  const root = document.documentElement;
  const old = root.style.scrollBehavior;

  root.style.scrollBehavior = "auto";

  window.scrollTo(
    0,
    Math.max(0, Number(top || 0))
  );

  // ép browser hoàn tất ngay trong frame hiện tại
  requestAnimationFrame(() => {
    root.style.scrollBehavior = old;
  });
}

function scrollToProductDetail() {
  const el = $("productDetail");
  if (!el) return;

  const card =
    el.closest(".card") ||
    el;

  const offset =
    window.innerWidth <= 720
      ? 275
      : 200;

  const top =
    card.getBoundingClientRect().top +
    window.pageYOffset -
    offset;

  jumpInstantTo(top);
}

async function scrollToProductCard(masp) {
  const targetMasp=norm(masp);
  let el=document.getElementById("sp-card-"+safeDomId(targetMasp));

  const pager=state.productPager;
  if(!el && pager?.list?.length){
    const idx=pager.list.findIndex(x=>norm(x?.masp)===targetMasp);
    if(idx>=0){
      await withDataLoading("Đang mở lại sản phẩm...", async()=>{
        while(!document.getElementById("sp-card-"+safeDomId(targetMasp)) && pager.nextIndex<=idx){
          await loadNextProductPage(false);
          if(pager.searchSeq!==latestSearchSeq)break;
        }
      });
      el=document.getElementById("sp-card-"+safeDomId(targetMasp));
    }
  }

  if(!el){
    toast("Không tìm thấy ảnh sản phẩm trong danh sách hiện tại.");
    return;
  }

  const offset=window.innerWidth<=720?210:120;
  const top=el.getBoundingClientRect().top+window.pageYOffset-offset;
  jumpInstantTo(top);
  el.classList.add("jump-highlight");
  setTimeout(()=>el.classList.remove("jump-highlight"),1300);
}

function effectiveSuggestionForMatchedSizes(baseSug, matchedSizes) {
  const matched = Array.from(
    new Set(
      (matchedSizes || [])
        .map(extractInternalSize)
        .filter(Boolean)
    )
  ).sort((a,b)=>(sizeRank(a)||99)-(sizeRank(b)||99));

  if (!matched.length) {
    return {
      ...baseSug,
      primary: null,
      backup: null,
      available: [],
      primaryInStock: false,
      backupInStock: false
    };
  }

  let primary = null;

  if (baseSug?.primary && matched.includes(baseSug.primary)) {
    primary = baseSug.primary;
  } else if (baseSug?.backup && matched.includes(baseSug.backup)) {
    primary = baseSug.backup;
  } else {
    const targetRank =
      sizeRank(baseSug?.primary) ||
      sizeRank(baseSug?.backup) ||
      sizeRank(matched[0]);

    primary = [...matched].sort(
      (a,b) =>
        Math.abs((sizeRank(a)||0)-targetRank) -
        Math.abs((sizeRank(b)||0)-targetRank)
    )[0];
  }

  let backup = null;

  if (
    baseSug?.backup &&
    baseSug.backup !== primary &&
    matched.includes(baseSug.backup)
  ) {
    backup = baseSug.backup;
  } else {
    backup = matched
      .filter(x => x !== primary)
      .sort(
        (a,b) =>
          Math.abs((sizeRank(a)||0)-(sizeRank(primary)||0)) -
          Math.abs((sizeRank(b)||0)-(sizeRank(primary)||0))
      )[0] || null;
  }

  return {
    ...baseSug,
    primary,
    backup,
    available: matched,
    primaryInStock: !!primary,
    backupInStock: !!backup
  };
}

function suggestedSizesForGroup(profile, groupCode) {
  const g = state.groups.find(
    x => norm(x.manhom) === norm(groupCode)
  );

  const loai =
    g?.loai_tu_van || "AO";

  const refSize = extractInternalSize(profile?.__size_tham_chieu?.[loai]);
  const seedBase = seedSuggestionForProfile(profile, loai);
  const seed = refSize
    ? {
        ...seedBase,
        primary:refSize,
        backup:null,
        rangeMin:refSize,
        rangeMax:refSize,
        source:"SAN_PHAM_THAM_CHIEU",
        confidence:1
      }
    : seedBase;

  // V1.9.2 - GIAY/DEP:
  // Nếu chưa biết size giày, vẫn cho tìm tất cả size nội bộ 38-46.
  // Nhưng KHÔNG tự gán một size "phù hợp" giả.
  if (
    loai === "GIAY_DEP" &&
    !seed.primary
  ) {
    return {
      seed: {
        ...seed,
        source:"GIAY_CHUA_CO_SIZE",
        primary:null,
        backup:null,
        rangeMin:null,
        rangeMax:null
      },
      sizes: SIZE_LIST.slice(),
      noAutoShoeSize:true
    };
  }

  return {
    seed,
    sizes: Array.from(
      new Set(
        [seed.primary, seed.backup]
          .map(extractInternalSize)
          .filter(Boolean)
      )
    ),
    noAutoShoeSize:false
  };
}

function buildStockMapFromRecommendationItem(item) {
  const map = new Map();

  (item?.matched_sizes || []).forEach(s => {
    const size = extractInternalSize(s);
    if (!size) return;

    // StockQuickSimilar đã chỉ trả matched_sizes có tồn dương tại cơ sở chọn.
    // Tổng ton của item không tách theo từng size, nên tại đây chỉ cần >0 để UI biết size còn.
    map.set(size, {
      ton_cs1: state.diadiem === "cs1" ? 1 : 0,
      ton_cs2: state.diadiem === "cs2" ? 1 : 0,
      ban_cs1: 0,
      ban_cs2: 0
    });
  });

  return map;
}

async function loadProductMastersByMasps(masps) {
  const unique =
    Array.from(
      new Set(
        (masps || [])
          .map(norm)
          .filter(Boolean)
      )
    );

  const out = new Map();
  const need = [];

  unique.forEach(m => {
    const cached =
      state.productCache.get(m);

    const ts =
      masterFetchedAt.get(m);

    if (
      cached &&
      cacheFresh(ts,MASTER_CACHE_MS)
    ) {
      out.set(m,cached);
    } else {
      need.push(m);
    }
  });

  if (!need.length) {
    return out;
  }

  const chunks = [];

  for (
    let i=0;
    i<need.length;
    i+=150
  ) {
    chunks.push(
      need.slice(i,i+150)
    );
  }

  // Danh mục nhẹ, chạy các lô song song.
  const results =
    await Promise.all(
      chunks.map(async chunk => {
        const {data,error} =
          await supabase
            .from("dmhanghoa")
            .select(
              "masp,tensp,giale,nhomhang,chungloai," +
              "mausac,form,rong_ong,co_gian,active,giam_gia_pct," +
              "treomaucs1,treomaucs2,vitrikho1,vitrikho2"
            )
            .in("masp",chunk);

        if (error) {
          console.warn(
            "[SalesCopilot] Lỗi đọc master sản phẩm:",
            error
          );
          return [];
        }

        return data || [];
      })
    );

  const ts = nowMs();

  results.flat().forEach(sp => {
    const m = norm(sp.masp);

    out.set(m,sp);
    state.productCache.set(m,sp);
    masterFetchedAt.set(m,ts);
  });

  return out;
}


async function loadRecentImportDates(masps) {
  const unique = Array.from(new Set((masps || []).map(norm).filter(Boolean)));
  const out = new Map();
  const need = [];
  const now = nowMs();

  unique.forEach(m => {
    const c = recentImportDateCache.get(m);
    if (c && cacheFresh(c.ts, RECENT_IMPORT_CACHE_MS)) out.set(m, c.date || null);
    else need.push(m);
  });

  if (need.length) {
    const chunks=[];
    for(let i=0;i<need.length;i+=100) chunks.push(need.slice(i,i+100));
    const results = await Promise.all(chunks.map(async chunk => {
      const {data,error} = await supabase.rpc("sales_copilot_nhap_som_3thang", {
        p_masps: chunk,
        p_den_ngay: new Date().toISOString().slice(0,10)
      });
      if(error){
        console.warn("[SalesCopilot] Không đọc được ngày nhập 3 tháng:",error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    }));

    const got=new Map();
    results.flat().forEach(r=>{
      const m=norm(r.masp);
      if(m) got.set(m, r.ngay_nhap_som_3thang || null);
    });
    need.forEach(m=>{
      const d=got.get(m)||null;
      recentImportDateCache.set(m,{ts:now,date:d});
      out.set(m,d);
    });
  }
  return out;
}

function sortByFormColorThenRecentFifo(list, preferredFormRaw, preferredColorRaw, importDates){
  const source=Array.isArray(list)?list:[];
  if(source.length<2)return source;
  const preferredForm=normalizeFormValue(preferredFormRaw);
  const preferredColor=norm(preferredColorRaw);
  return source
    .map((sp,index)=>({sp,index}))
    .sort((a,b)=>{
      // 1) Form là tầng ưu tiên quan trọng hơn màu.
      const aForm = preferredForm && normalizeFormValue(a.sp?.form)===preferredForm ? 0 : (preferredForm ? 1 : 0);
      const bForm = preferredForm && normalizeFormValue(b.sp?.form)===preferredForm ? 0 : (preferredForm ? 1 : 0);
      if(aForm!==bForm)return aForm-bForm;

      // 2) Màu là ưu tiên mềm: đúng màu lên trước, KHÔNG loại màu khác.
      const aColor = preferredColor && norm(a.sp?.mausac)===preferredColor ? 0 : (preferredColor ? 1 : 0);
      const bColor = preferredColor && norm(b.sp?.mausac)===preferredColor ? 0 : (preferredColor ? 1 : 0);
      if(aColor!==bColor)return aColor-bColor;

      // 3) Trong cùng tầng Form + Màu, ưu tiên ngày nhập sớm hơn trong 3 tháng.
      const ad=importDates?.get(norm(a.sp?.masp))||null;
      const bd=importDates?.get(norm(b.sp?.masp))||null;
      const aHas=ad?0:1, bHas=bd?0:1;
      if(aHas!==bHas)return aHas-bHas;
      if(ad && bd && ad!==bd)return ad<bd?-1:1;
      return a.index-b.index;
    })
    .map(x=>x.sp);
}


function profileModifiers(p) {
  const a=[],q=[];
  if(p.ao_vai_rong)a.push("vai rộng"); if(p.ao_nguc_to)a.push("ngực to"); if(p.ao_bung)a.push("bụng");
  if(p.quan_bung)q.push("bụng"); if(p.quan_dui_to)q.push("đùi to"); if(p.quan_mong_to)q.push("mông to");
  return {a:a.length?a.join(", "):"bình thường", q:q.length?q.join(", "):"bình thường"};
}

function renderProfile() {
  const p=currentSession(), box=$("profileBox");
  if(!p){box.className="empty";box.innerHTML="Tạo khách mới để bắt đầu.";return;}
  box.className="";

  if (isBasicMode()) {
    const qs=quickProfileSizes(p);
    const line=(label,sug)=>{
      if(!sug?.primary) return `${label}: <b>chưa có gợi ý</b>`;
      const backup=sug.backup ? ` · Dự phòng: <b>${esc(sug.backup)}</b>` : "";
      const rmin=sug.rangeMin || sug.primary;
      const rmax=sug.rangeMax || rmin;
      const range=rmin ? ` · Khoảng nền: <b>${esc(rmin)}–${esc(rmax)}</b>` : "";
      return `${label}: Gợi ý: <b>size ${esc(sug.primary)}</b>${backup}${range}`;
    };
    box.innerHTML=`
      <div class="profile-main">${p.chieu_cao_cm}cm · ${Number(p.can_nang_kg)}kg</div>
      <div class="profile-sub">
        <div class="profile-size-line">${line("Quần",qs.quan)}</div>
        <div class="profile-size-line">${line("Áo",qs.ao)}</div>
      </div>`;
    return;
  }

  const m=profileModifiers(p);
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
  if(isBasicMode()){
    if(!p)return "1/4 Chọn chiều cao khách. Cân nặng sẽ tự ước lượng và có thể chỉnh lại.";
    const rows=Number(p.so_mon_da_chot||0);
    if(rows>0)return "4/4 Khách đã chọn hàng. Có thể bán kèm hoặc bấm ĐƯA SANG BÁN HÀNG.";
    if(!state.selectedProduct)return "2/4 Hỏi khách cần nhóm nào và thích form Rộng / Vừa / Bó. Lấy 2–3 mẫu cho khách xem.";
    return "3/4 Khách mặc size nào thì chọn đúng size đó và bấm CHỌN BÁN.";
  }
  if(!p)return "Quan sát nhanh chiều cao/cân nặng và tạo phiên khách.";
  if(!state.selectedProduct)return "Hỏi khách đang cần nhóm hàng nào, sau đó chọn nhóm và lấy 2–3 mẫu để thử.";
  if(!state.selectedSize)return "Cho khách thử size hệ thống ưu tiên trước; luôn chuẩn bị size dự phòng nếu tồn kho có.";
  return "Sau khi khách thử, ghi Hơi bó / Vừa khít / Hơi rộng để hệ thống học chính xác dần.";
}
function renderCoach(){$("coachBox").textContent=coachText();}


let dataLoadingDepth = 0;

function showDataLoading(message = "Đang tìm sản phẩm phù hợp...") {
  dataLoadingDepth += 1;

  const overlay = $("dataLoadingOverlay");
  const text = $("dataLoadingText");

  if (text) {
    text.textContent = message;
  }

  overlay?.classList.add("show");
  overlay?.setAttribute("aria-hidden","false");
}

function hideDataLoading() {
  dataLoadingDepth = Math.max(0, dataLoadingDepth - 1);

  if (dataLoadingDepth > 0) {
    return;
  }

  const overlay = $("dataLoadingOverlay");
  overlay?.classList.remove("show");
  overlay?.setAttribute("aria-hidden","true");
}

async function withDataLoading(message, fn){
  showDataLoading(message);
  try { return await fn(); }
  finally { hideDataLoading(); }
}

function groupRowByCode(code) {
  return state.groups.find(
    g => norm(g.manhom) === norm(code)
  ) || null;
}

function validSubGroups(mainKey) {
  const cfg = MAIN_GROUPS[mainKey];
  if (!cfg) return [];

  return cfg.groups
    .map(code => groupRowByCode(code))
    .filter(Boolean);
}


function renderBasicSubgroups(){
  const box=$("basicSubGroupBar"); if(!box) return;
  const rows=validSubGroups(state.selectedMainGroup);
  box.innerHTML=rows.map(g=>`<button type="button" class="subgroup-chip ${norm(g.manhom)===norm(state.selectedGroup)?"on":""}" data-group="${esc(g.manhom)}">${esc(g.ten_hien_thi||g.manhom)}</button>`).join("");
  box.querySelectorAll(".subgroup-chip").forEach(b=>b.onclick=async()=>{
    await selectSubGroup(b.dataset.group);
    renderBasicSubgroups();
    if(currentSession()) await searchProducts();
  });
}
function renderMainGroupControls() {
  document
    .querySelectorAll(".main-group-btn")
    .forEach(btn => {
      btn.classList.toggle(
        "on",
        btn.dataset.mainGroup === state.selectedMainGroup
      );
    });

  const select = $("subGroupSelect");
  if (!select) return;

  const rows = validSubGroups(
    state.selectedMainGroup
  );

  select.innerHTML = rows
    .map(g =>
      `<option value="${esc(g.manhom)}">${esc(g.ten_hien_thi)}</option>`
    )
    .join("");

  if (
    !rows.some(
      g => norm(g.manhom) === norm(state.selectedGroup)
    )
  ) {
    if (isBasicMode()) {
      // Cơ bản: chọn nhóm lớn chỉ mở các nhóm chi tiết, không tự chọn nhóm con.
      state.selectedGroup = "";
    } else {
      const cfg = MAIN_GROUPS[state.selectedMainGroup];
      const preferred =
        rows.find(
          g => norm(g.manhom) === norm(cfg?.defaultGroup)
        ) ||
        rows[0];

      if (preferred) {
        state.selectedGroup = preferred.manhom;
      }
    }
  }

  select.value = state.selectedGroup || "";
  renderBasicSubgroups();

  const shoeRow = $("shoeSizeSearchRow");
  const shoeSelect = $("shoeSizeSearchSelect");

  const isShoes =
    state.selectedMainGroup === "GIAY_DEP";

  shoeRow?.classList.toggle(
    "show",
    isShoes
  );

  if (isShoes && shoeSelect) {
    const p = currentSession();

    const customerShoeSize =
      extractInternalSize(
        p?.size_giay_thuong_di
      );

    if (
      !state.selectedShoeSearchSize &&
      customerShoeSize
    ) {
      state.selectedShoeSearchSize =
        customerShoeSize;
    }

    shoeSelect.value =
      state.selectedShoeSearchSize || "";
  }
}

function renderGroups() {
  renderMainGroupControls();
}

async function selectMainGroup(mainKey) {
  const cfg = MAIN_GROUPS[mainKey];
  if (!cfg) return;

  state.selectedMainGroup = mainKey;

  const rows =
    validSubGroups(mainKey);

  let preferred = null;

  if (isBasicMode()) {
    // Cơ bản: không tự chọn nhóm chi tiết.
    // NV phải bấm rõ nhóm con rồi mới tải sản phẩm.
    state.selectedGroup = "";
  } else {
    preferred =
      rows.find(
        g =>
          norm(g.manhom) ===
          norm(cfg.defaultGroup)
      ) ||
      rows[0];

    if (preferred) {
      state.selectedGroup =
        preferred.manhom;
    }
  }

  state.selectedProduct = null;
  state.selectedSize = null;
  state.selectedFit = null;
  state.currentSuggestion = null;

  if (mainKey !== "GIAY_DEP") {
    state.selectedShoeSearchSize = "";
  }

  renderMainGroupControls();
  renderProductDetail();

  setStep(2);

  if (isBasicMode()) {
    $("searchSummary").textContent =
      `Đã chọn ${cfg.label}. Hãy chọn nhóm chi tiết bên dưới.`;

    $("productList").innerHTML =
      `<div class="empty">
        Chọn một <b>nhóm chi tiết</b> để tải sản phẩm.
      </div>`;
    return;
  }

  $("searchSummary").textContent =
    `Đã chọn ${cfg.label} · ${preferred?.ten_hien_thi || state.selectedGroup}. Nhấn Tìm để tải sản phẩm.`;

  $("productList").innerHTML =
    `<div class="empty">
      Đã thay đổi nhóm hàng.<br>
      Nhấn <b>Tìm</b> để tải dữ liệu mới.
    </div>`;
}

async function selectSubGroup(code) {
  if (!code) return;

  state.selectedGroup = code;

  state.selectedProduct = null;
  state.selectedSize = null;
  state.selectedFit = null;
  state.currentSuggestion = null;

  renderMainGroupControls();
  renderProductDetail();

  setStep(2);

  const row = groupRowByCode(code);

  $("searchSummary").textContent =
    `Đã chọn ${row?.ten_hien_thi || code}. Nhấn Tìm để tải sản phẩm.`;

  $("productList").innerHTML =
    `<div class="empty">
      Đã thay đổi nhóm chi tiết.<br>
      Nhấn <b>Tìm</b> để tải dữ liệu mới.
    </div>`;
}


function modeMeta(mode) {
  return ({
    similar: {
      label: "Phù hợp",
      hint: "Hàng phù hợp size khách"
    },
    discount: {
      label: "Giảm giá",
      hint: "Hàng đang giảm giá nhưng vẫn phải còn đúng size khách"
    },
    cheaper: {
      label: "Rẻ hơn",
      hint: "Cùng nhóm, còn đúng size và giá thấp hơn hoặc bằng giá so sánh"
    },
    premium: {
      label: "Đắt hơn",
      hint: "Cùng nhóm, còn đúng size và giá cao hơn hoặc bằng giá so sánh"
    }
  })[mode] || {
    label: mode,
    hint: ""
  };
}

function renderModeControls() {
  document
    .querySelectorAll(".mode-btn")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.mode === state.searchMode
      );
    });

  const meta =
    modeMeta(state.searchMode);

  if ($("modeHint")) {
    $("modeHint").textContent =
      meta.hint;
  }

  const needPrice =
    ["cheaper","premium"]
      .includes(state.searchMode);

  $("priceCompareRow")
    ?.classList.toggle(
      "show",
      needPrice
    );

  if (
    needPrice &&
    state.referencePrice > 0 &&
    !$("txtReferencePrice").value
  ) {
    $("txtReferencePrice").value =
      Math.round(
        state.referencePrice / 1000
      );
  }
}

function getReferencePriceFromInput() {
  const nghin =
    Number(
      $("txtReferencePrice")?.value ||
      0
    );

  return nghin > 0
    ? nghin * 1000
    : 0;
}

function useSelectedProductPrice() {
  const price =
    Number(
      state.selectedProduct?.giale ||
      0
    );

  if (price <= 0) {
    toast(
      "Chưa có sản phẩm đang tư vấn để lấy giá."
    );
    return false;
  }

  state.referencePrice=price;

  $("txtReferencePrice").value =
    Math.round(price/1000);

  toast(
    `Giá so sánh: ${money(price)} đ`
  );

  return true;
}

async function setSearchMode(mode) {
  state.searchMode =
    ["similar","discount","cheaper","premium"]
      .includes(mode)
        ? mode
        : "similar";

  if (
    ["cheaper","premium"]
      .includes(state.searchMode)
  ) {
    if (
      state.referencePrice <= 0 &&
      state.selectedProduct?.giale
    ) {
      state.referencePrice =
        Number(
          state.selectedProduct.giale
        ) || 0;
    }
  }

  renderModeControls();

  if (
    ["cheaper","premium"]
      .includes(state.searchMode) &&
    state.referencePrice <= 0
  ) {
    $("txtReferencePrice")?.focus();

    toast(
      "Nhập giá so sánh hoặc chọn một sản phẩm rồi bấm 'Lấy giá mã đang xem'.",
      3500
    );

    return;
  }

  if (currentSession()) {
    await searchProducts();
  }
}

function priceModeNote(sp) {
  const price =
    Number(sp?.giale || 0);

  const ref =
    Number(
      state.referencePrice ||
      0
    );

  if (
    !price ||
    !ref
  ) {
    return "";
  }

  const diff =
    price - ref;

  if (
    state.searchMode === "cheaper"
  ) {
    const cheaperBy =
      Math.max(0, ref-price);

    return `
      <span class="price-diff cheaper">
        Rẻ hơn ${money(cheaperBy)} đ
      </span>
    `;
  }

  if (
    state.searchMode === "premium"
  ) {
    const more =
      Math.max(0, price-ref);

    return `
      <span class="price-diff premium">
        Cao hơn ${money(more)} đ
      </span>
    `;
  }

  return "";
}

function mainGroupKeyForProduct(sp){
  const g=norm(sp?.nhomhang);
  for(const [key,cfg] of Object.entries(MAIN_GROUPS)){
    if(cfg.groups.some(code=>norm(code)===g)) return key;
  }
  return state.selectedMainGroup || "AO_HE";
}

function syncBasicFormButtons(){
  document.querySelectorAll(".basic-form-btn").forEach(btn=>{
    btn.classList.toggle("on", norm(btn.dataset.form||"")===norm(state.selectedForm||""));
  });
}


function setQuickSizeButtonValue(raw){
  const el=$("quickSizeSelect");
  if(!el)return;
  const size=extractInternalSize(raw)||"";
  el.value=size;
  el.textContent=size||"Size";
}

function closeQuickSizeMenu(){
  $("quickSizeMenu")?.classList.remove("show");
}

function renderQuickSizeMenu(autoOpen=false){
  const menu=$("quickSizeMenu");
  if(!menu)return;
  const sp=state.selectedProduct;
  const stock=sp?state.stockCache.get(norm(sp.masp)):null;
  const primary=extractInternalSize(state.currentSuggestion?.primary);
  const backup=extractInternalSize(state.currentSuggestion?.backup);
  menu.innerHTML=SIZE_LIST.map(size=>{
    const ton=sp?stockAtBranch(stock,size):null;
    const near=!!primary && (size===backup || Math.abs(Number(size)-Number(primary))===1);
    const cls=[size===primary?"primary":"",near&&size!==primary?"near":"",sp&&Number(ton)<=0?"no-stock":""].filter(Boolean).join(" ");
    return `<button type="button" class="quick-size-option ${cls}" data-quick-size="${size}"><span>Size ${size}</span>${sp?`<span class="quick-size-stock">Tồn ${state.diadiem.toUpperCase()}: ${Number(ton||0)}</span>`:""}</button>`;
  }).join("");
  menu.querySelectorAll("[data-quick-size]").forEach(btn=>btn.addEventListener("click",async()=>{
    const size=btn.dataset.quickSize;
    setQuickSizeButtonValue(size);
    closeQuickSizeMenu();
    if(state.selectedProduct){
      const stockMap=state.stockCache.get(norm(state.selectedProduct.masp));
      await chooseSize(size,stockAtBranch(stockMap,size));
    }else{
      await applyQuickSizePreference(size);
    }
  }));
  if(autoOpen)menu.classList.add("show");
}

function syncToolbarFromSelectedProduct(autoOpenSize=false){
  const sp=state.selectedProduct;
  const input=$("directProductCode");
  if(sp && input){
    input.value=sp.masp||"";
    setTimeout(()=>{ try{ input.focus({preventScroll:true}); input.select(); }catch(_){} },0);
  }
  if(sp && $("colorPrioritySelect")) $("colorPrioritySelect").value=String(sp.mausac||"").trim();
  syncQuickSizeSelect();
  renderQuickSizeMenu(autoOpenSize);
}

async function applyScannedProductContext(sp,size){
  const p=currentSession();
  if(!p||!sp)return;

  const loai=productLoai(sp);
  const ref=extractInternalSize(size);
  if(ref && ["AO","QUAN","GIAY_DEP"].includes(loai)){
    p.__size_tham_chieu=p.__size_tham_chieu||{};
    p.__size_tham_chieu[loai]=ref;
    if(loai==="GIAY_DEP") state.selectedShoeSearchSize=ref;
  }

  state.selectedMainGroup=mainGroupKeyForProduct(sp);
  state.selectedGroup=sp.nhomhang||state.selectedGroup;
  state.selectedForm=String(sp.form||"").trim();
  state.selectedColor=String(sp.mausac||"").trim();

  renderMainGroupControls();
  renderBasicSubgroups();
  syncBasicFormButtons();
  if($("colorPrioritySelect")) $("colorPrioritySelect").value=state.selectedColor||"";
  setQuickSizeButtonValue(ref||"");
  if($("shoeSizeSearchSelect") && loai==="GIAY_DEP") $("shoeSizeSearchSelect").value=ref||"";
  renderTabs();
  renderProfile();

  // Giữ sản phẩm vừa quét làm mã nguồn để nó được promote lên đầu kết quả.
  state.sourceProductCode=norm(sp.masp);
  if(currentSession() && state.selectedGroup) await searchProducts();
}

let productCodeLookupTimer=null;
let productCodeHandling=false;
let scannerController=null;

function hideProductCodeSuggestions(){
  const box=$("directProductSuggest");
  if(box){box.style.display="none";box.innerHTML="";}
}

async function loadProductCodeSuggestions(raw){
  const q=norm(raw);
  const box=$("directProductSuggest");
  if(!box)return;
  if(q.length<1){hideProductCodeSuggestions();return;}
  const {data,error}=await supabase.rpc("sales_copilot_goi_y_ma_v1111",{
    p_text:q,
    p_limit:12
  });
  if(error){console.warn("[SalesCopilot] Gợi ý mã RPC lỗi:",error);return;}
  const rows=Array.isArray(data)?data:[];
  if(!rows.length){hideProductCodeSuggestions();return;}
  box.innerHTML=rows.map(r=>`<button type="button" class="direct-product-suggestion" data-masp="${esc(r.masp)}"><b>${esc(r.masp)}</b><span>${esc(r.tensp||"")}</span></button>`).join("");
  box.style.display="block";
  box.querySelectorAll("[data-masp]").forEach(btn=>btn.onclick=async()=>{
    const input=$("directProductCode");
    if(input)input.value=btn.dataset.masp||"";
    hideProductCodeSuggestions();
    await consultProductByCode(btn.dataset.masp,"NHAP_MA");
  });
}

async function findExactProductByCode(raw){
  const code=norm(raw);
  if(!code)return null;
  const cached=state.productCache.get(code);
  if(cached)return cached;
  const {data,error}=await supabase.rpc("sales_copilot_lay_san_pham_theo_ma_v1111",{
    p_masp:code,
    p_den_ngay:new Date().toISOString().slice(0,10)
  });
  if(error){console.warn("[SalesCopilot] Kiểm tra mã SP RPC lỗi:",error);return null;}
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return null;
  const sp={...row};
  const stockMap=stockMapFromRpcJson(sp.ton_sizes);
  delete sp.ton_sizes;
  state.productCache.set(norm(sp.masp),sp);
  state.stockCache.set(norm(sp.masp),stockMap);
  return sp;
}

async function consultProductByCode(raw,source="NHAP_MA"){
  if(productCodeHandling)return false;
  const p=currentSession();
  if(!p){toast("Hãy tạo/chọn khách trước khi nhập mã sản phẩm.",3000);return false;}
  const code=norm(raw);
  if(!code)return false;
  productCodeHandling=true;
  try{
    return await withDataLoading("Đang mở sản phẩm để tư vấn...",async()=>{
      const sp=await findExactProductByCode(code);
      if(!sp||sp.active===false){
        toast(`Mã ${code} không tồn tại trong danh mục hàng hóa.`,3000);
        $("directProductCode")?.focus();
        return false;
      }
      if(source==="QUET_MA") playSuccessBeep();
      if(!state.stockCache.get(norm(sp.masp))){
        const stock=await getStockForMasps([sp.masp]);
        state.stockCache.set(norm(sp.masp),stock.get(norm(sp.masp))||new Map());
      }
      state.selectedProductSource=source;
      state.sourceProductCode=norm(sp.masp);
      markConsultedProduct(sp.masp); // chạy nền, không chặn tư vấn
      await selectProduct(sp,{scrollToDetail:!isBasicMode(),openQuickSize:true});
      const input=$("directProductCode");
      if(input){ input.value=sp.masp||code; setTimeout(()=>{try{input.focus({preventScroll:true});input.select();}catch(_){}},20); }
      hideProductCodeSuggestions();
      toast(`Đang tư vấn mã ${sp.masp}. Chọn size khách thử.`,1800);
      return true;
    });
  }finally{productCodeHandling=false;}
}

function closeProductScanner(){
  try{scannerController?.stopScan?.();}catch(_){}
  const pop=$("directScanPopup");
  if(pop)pop.style.display="none";
}

async function openProductScanner(){
  const pop=$("directScanPopup");
  if(!pop)return;
  pop.style.display="block";
  if(!scannerController){
    scannerController=setupScanner({
      videoEl:$("directScanVideo"),
      selectEl:$("cameraSelect"),
      statusEl:$("directScanStatus"),
      onResult:async text=>{
        closeProductScanner();
        const input=$("directProductCode");
        if(input)input.value=norm(text);
        await consultProductByCode(text,"QUET_MA");
      }
    });
  }
  await scannerController.startScan();
}

function bindDirectProductInput(){
  const input=$("directProductCode");
  if(!input)return;
  input.addEventListener("input",()=>{
    clearTimeout(productCodeLookupTimer);
    productCodeLookupTimer=setTimeout(()=>loadProductCodeSuggestions(input.value),150);
  });
  input.addEventListener("keydown",async e=>{
    if(e.key!=="Enter")return;
    e.preventDefault();
    hideProductCodeSuggestions();
    if(input.value.trim())await consultProductByCode(input.value,"NHAP_MA");
  });
  input.addEventListener("blur",()=>setTimeout(async()=>{
    const raw=input.value.trim();
    if(!raw)return;
    const sp=await findExactProductByCode(raw);
    if(sp)await consultProductByCode(sp.masp,"NHAP_MA");
  },180));
  $("btnDirectScan")?.addEventListener("click",openProductScanner);
  $("btnCloseDirectScan")?.addEventListener("click",closeProductScanner);
  $("btnCameraUltra")?.addEventListener("click",()=>{}); // scanner.js tự bind nút
  $("btnCameraNormal")?.addEventListener("click",()=>{});
  $("directFlashBtn")?.addEventListener("click",async()=>{
    const on=await scannerController?.toggleTorch?.();
    $("directFlashBtn").textContent=on?"🔦 Đèn ON":"🔦 Đèn";
  });
  $("directPickImage")?.addEventListener("change",async e=>{
    const f=e.target.files?.[0]; if(!f)return;
    await scannerController?.decodeFromFile?.(f);
    e.target.value="";
  });
}


function stockMapFromRpcJson(raw){
  const out=new Map();
  const obj=raw && typeof raw==="object" ? raw : {};
  Object.entries(obj).forEach(([size,row])=>{
    const s=extractInternalSize(size);
    if(!s)return;
    out.set(s,{
      ton_cs1:Number(row?.ton_cs1||0),
      ton_cs2:Number(row?.ton_cs2||0),
      ban_cs1:Number(row?.ban_cs1||0),
      ban_cs2:Number(row?.ban_cs2||0)
    });
  });
  return out;
}

function rpcRowToProduct(row,seed,noAutoShoeSize){
  const sp={...row};
  const stockMap=stockMapFromRpcJson(row?.ton_sizes);
  const matched=(row?.matched_sizes||[]).map(extractInternalSize).filter(Boolean);
  delete sp.ton_sizes;
  delete sp.matched_sizes;
  delete sp.total_count;
  sp.__matched_sizes=matched;
  sp.__seed=seed;
  sp.__no_auto_shoe_size=!!noAutoShoeSize;
  sp.__ngay_nhap_som_3thang=row?.ngay_nhap_som_3thang||null;
  state.productCache.set(norm(sp.masp),sp);
  state.stockCache.set(norm(sp.masp),stockMap);
  return sp;
}

async function fetchBasicRpcProductPage(request,offset){
  const {data,error}=await supabase.rpc("sales_copilot_tim_san_pham_v1111",{
    ...request,
    p_offset:Number(offset||0),
    p_limit:40
  });
  if(error)throw error;
  return Array.isArray(data)?data:[];
}

async function startBasicRpcPagination({rows,totalCount,request,seed,noAutoShoeSize,searchSeq}){
  disconnectProductPagerObserver();
  const box=$("productList");
  box.innerHTML="";
  state.productPager={
    list:[],nextIndex:0,pageSize:40,loading:false,searchSeq,observer:null,
    rpcMode:true,rpcOffset:0,rpcTotal:Number(totalCount||0),rpcRequest:request,
    rpcSeed:seed,rpcNoAutoShoeSize:!!noAutoShoeSize
  };
  if(!rows.length){
    box.innerHTML=`<div class="empty">Không có sản phẩm nào còn đúng size gợi ý tại ${state.diadiem.toUpperCase()}.</div>`;
    return;
  }
  const first=rows.map(r=>rpcRowToProduct(r,seed,noAutoShoeSize));
  const sentinel=document.createElement("div");
  sentinel.id="productLoadSentinel";
  sentinel.style.cssText="grid-column:1/-1;text-align:center;padding:12px;color:#687787;font-size:12px";
  sentinel.textContent="Cuộn xuống để tải thêm...";
  box.appendChild(sentinel);
  await preloadLearningData(first.map(x=>x.masp));
  if(searchSeq!==latestSearchSeq)return;
  await renderProducts(first,{append:true});
  state.productPager.rpcOffset=first.length;
  sentinel.textContent=state.productPager.rpcOffset<state.productPager.rpcTotal
    ? `Đã hiện ${state.productPager.rpcOffset}/${state.productPager.rpcTotal} · cuộn xuống để tải tiếp`
    : `Đã hiển thị đủ ${state.productPager.rpcTotal} sản phẩm.`;
  if(state.productPager.rpcOffset>=state.productPager.rpcTotal)return;
  if("IntersectionObserver" in window){
    const obs=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)) loadNextBasicRpcPage();
    },{root:null,rootMargin:"700px 0px",threshold:0.01});
    obs.observe(sentinel);
    state.productPager.observer=obs;
  }
}

async function loadNextBasicRpcPage(){
  const pager=state.productPager;
  if(!pager?.rpcMode || pager.loading || pager.searchSeq!==latestSearchSeq)return;
  if(pager.rpcOffset>=pager.rpcTotal){disconnectProductPagerObserver();return;}
  pager.loading=true;
  try{
    await withDataLoading("Đang tải thêm 40 sản phẩm...",async()=>{
      const rows=await fetchBasicRpcProductPage(pager.rpcRequest,pager.rpcOffset);
      if(pager.searchSeq!==latestSearchSeq)return;
      const products=rows.map(r=>rpcRowToProduct(r,pager.rpcSeed,pager.rpcNoAutoShoeSize));
      await preloadLearningData(products.map(x=>x.masp));
      if(pager.searchSeq!==latestSearchSeq)return;
      await renderProducts(products,{append:true});
      pager.rpcOffset+=products.length;
      const s=$("productLoadSentinel");
      if(s)s.textContent=pager.rpcOffset<pager.rpcTotal
        ? `Đã hiện ${pager.rpcOffset}/${pager.rpcTotal} · cuộn xuống để tải tiếp`
        : `Đã hiển thị đủ ${pager.rpcTotal} sản phẩm.`;
      if(!products.length || pager.rpcOffset>=pager.rpcTotal)disconnectProductPagerObserver();
    });
  }finally{pager.loading=false;}
}

async function searchProductsBasicRpc({sizes,seed,noAutoShoeSize,kw,searchSeq}){
  const request={
    p_diadiem:state.diadiem,
    p_nhomhang:state.selectedGroup,
    p_sizes:sizes,
    p_form:state.selectedForm||null,
    p_mausac:state.selectedColor||null,
    p_mode:state.searchMode||"similar",
    p_reference_price:Number(state.referencePrice||0),
    p_keyword:kw||null,
    p_source_masp:state.sourceProductCode||null,
    p_den_ngay:new Date().toISOString().slice(0,10)
  };
  const rows=await fetchBasicRpcProductPage(request,0);
  if(searchSeq!==latestSearchSeq)return;
  const total=Number(rows?.[0]?.total_count||0);
  const modeLabel=modeMeta(state.searchMode).label;
  const pricePart=["cheaper","premium"].includes(state.searchMode)
    ? ` · giá so sánh ${money(state.referencePrice)} đ`:"";
  $("searchSummary").textContent=noAutoShoeSize
    ? `${total} sản phẩm · ${modeLabel} · ${state.diadiem.toUpperCase()} · chưa biết size giày, tải 40 sản phẩm/lượt${pricePart}`
    : `${total} sản phẩm · ${modeLabel} · ${state.diadiem.toUpperCase()} · size phù hợp ${sizes.join(", ")} · tải 40 sản phẩm/lượt${pricePart}`;
  await startBasicRpcPagination({rows,totalCount:total,request,seed,noAutoShoeSize,searchSeq});
}

async function searchProducts() {
  const seq = ++latestSearchSeq;
  const meta = modeMeta(state.searchMode);

  showDataLoading(
    `Đang tải ${meta.label} · ${state.selectedGroup}...`
  );

  const t0 =
    performance.now();

  try {
    const result =
      await searchProductsCore(seq);

    const ms =
      Math.round(
        performance.now() - t0
      );

    console.log(
      `[SalesCopilot V1.9.1] search ${state.selectedGroup} = ${ms}ms`
    );

    return result;
  } finally {
    // Chỉ search mới nhất mới được đóng overlay.
    if (seq === latestSearchSeq) {
      dataLoadingDepth = 1;
      hideDataLoading();
    }
  }
}

async function searchProductsCore(searchSeq) {
  const p=currentSession();

  if(!p){
    toast("Hãy tạo/chọn khách trước.");
    return;
  }

  setStep(4);

  const kw=String($("txtSearch").value||"")
    .trim()
    .toUpperCase();

  let {
    seed,
    sizes,
    noAutoShoeSize
  } =
    suggestedSizesForGroup(
      p,
      state.selectedGroup
    );

  const currentGroupRow =
    groupRowByCode(
      state.selectedGroup
    );

  const isShoeSearch =
    currentGroupRow?.loai_tu_van === "GIAY_DEP";

  if (isShoeSearch) {
    const shoeSize =
      extractInternalSize(
        state.selectedShoeSearchSize ||
        $("shoeSizeSearchSelect")?.value ||
        p?.size_giay_thuong_di
      );

    if (!shoeSize) {
      if (isBasicMode()) {
        // Cơ bản không có nút Tìm: nếu chưa biết size giày, tải toàn bộ 38–46.
        sizes = SIZE_LIST.slice();
        seed = {
          primary:null,
          backup:null,
          rangeMin:null,
          rangeMax:null,
          confidence:0,
          source:"GIAY_CHUA_CO_SIZE"
        };
        noAutoShoeSize = true;
      } else {
        alert(
          "Vui lòng chọn SIZE GIÀY/DÉP cần tìm trước khi bấm Tìm."
        );

        $("shoeSizeSearchSelect")?.focus();

        $("searchSummary").textContent =
          "Chưa chọn size giày/dép cần tìm.";

        $("productList").innerHTML =
          `<div class="empty">
            Vui lòng chọn <b>Size cần tìm</b> rồi bấm <b>Tìm</b>.
          </div>`;

        return;
      }
    } else {
      state.selectedShoeSearchSize =
        shoeSize;

      sizes = [shoeSize];

      seed = {
        primary: shoeSize,
        backup: null,
        rangeMin: shoeSize,
        rangeMax: shoeSize,
        confidence: 1,
        source: "SIZE_GIAY_TIM_THU_CONG"
      };

      noAutoShoeSize = false;
    }
  }


  if (
    state.searchMode === "discount" &&
    currentGroupRow?.loai_tu_van !== "GIAY_DEP"
  ) {
    const expanded = new Set();
    sizes.forEach(s => {
      const r = sizeRank(s);
      if (!r) return;
      [r-1,r,r+1].forEach(rr => {
        if (rr >= 1 && rr <= 9) {
          const ss = sizeFromRank(rr);
          if (ss) expanded.add(ss);
        }
      });
    });
    sizes = Array.from(expanded).sort((a,b)=>(sizeRank(a)||99)-(sizeRank(b)||99));
  }

  if (!sizes.length) {
    $("searchSummary").textContent =
      "Nhóm này chưa có size gợi ý tự động.";

    $("productList").innerHTML =
      `<div class="empty">
        Chưa xác định được size để tìm hàng.
      </div>`;

    return;
  }

  if (
    ["cheaper","premium"]
      .includes(state.searchMode)
  ) {
    const fromInput =
      getReferencePriceFromInput();

    if (fromInput > 0) {
      state.referencePrice =
        fromInput;
    }

    if (
      state.referencePrice <= 0
    ) {
      $("searchSummary").textContent =
        "Hãy nhập giá so sánh trước.";

      $("productList").innerHTML =
        `<div class="empty">
          Chế độ ${esc(modeMeta(state.searchMode).label)}
          cần có giá so sánh.
        </div>`;

      $("txtReferencePrice")?.focus();
      return;
    }
  }

  // V1.11.1: Basic không tải candidate/master/FIFO về trình duyệt nữa.
  // Database lọc + tính tồn + xếp hạng, client chỉ nhận từng gói 40 sản phẩm.
  if (isBasicMode()) {
    await searchProductsBasicRpc({sizes,seed,noAutoShoeSize,kw,searchSeq});
    return;
  }

  if (
    !window.StockQuickSimilar ||
    typeof window.StockQuickSimilar
      .getRecommendationListByFilters !== "function"
  ) {
    toast(
      "Chưa tải được stockQuickSimilar.js. Hãy kiểm tra file trên server.",
      5000
    );
    return;
  }

  $("searchSummary").textContent =
    noAutoShoeSize
      ? `Đang tải ${modeMeta(state.searchMode).label} · ${state.selectedGroup} · ` +
        `chưa biết size giày, tìm toàn bộ 38–46 · ${state.diadiem.toUpperCase()}...`
      : `Đang tải ${modeMeta(state.searchMode).label} · ${state.selectedGroup} · ` +
        `size ${sizes.join(", ")} · ${state.diadiem.toUpperCase()}...`;

  $("productList").innerHTML =
    `<div class="empty">Đang tải dữ liệu...</div>`;

  // BƯỚC 1:
  // Dùng đúng engine giống xemanhxnt14 để LỌC ra các mã
  // có tồn ít nhất một size phù hợp với khách.
  // Giảm giá: lấy candidate theo "similar" rồi lọc giam_gia_pct sau,
  // để hỗ trợ cả các mức giảm mới như 60% mà không phụ thuộc danh sách hard-code cũ.
  const requestMode =
    state.searchMode === "discount"
      ? "similar"
      : state.searchMode;

  const cKey =
    candidateCacheKey({
      requestMode,
      sizes,
      group:state.selectedGroup,
      branch:state.diadiem,
      referencePrice:state.referencePrice
    });

  let result;
  const cachedCandidate =
    candidateSearchCache.get(cKey);

  if (
    cachedCandidate &&
    cacheFresh(
      cachedCandidate.ts,
      PERF_CACHE_MS
    )
  ) {
    result =
      deepCloneSimple(
        cachedCandidate.result
      );
  } else {
    result =
      await window.StockQuickSimilar
        .getRecommendationListByFilters({
          masp:"",
          sizes,
          nhomhangs:[state.selectedGroup],
          preferredForm: state.selectedForm || "",
          branch:state.diadiem,
          referencePrice:
            Number(
              state.referencePrice || 0
            ),
          denNgay:
            new Date()
              .toISOString()
              .slice(0,10),
          mode:requestMode
        });

    if (result?.ok !== false) {
      candidateSearchCache.set(
        cKey,
        {
          ts:nowMs(),
          result:deepCloneSimple(result)
        }
      );
    }
  }

  // Nếu user đã bấm sang nhóm/khách khác, bỏ kết quả cũ.
  if (searchSeq !== latestSearchSeq) {
    return;
  }

  if (result?.ok === false) {
    $("productList").innerHTML =
      `<div class="empty">${esc(result.message || "Không tải được dữ liệu.")}</div>`;
    return;
  }

  let rawList = Array.isArray(result?.list)
    ? result.list
    : [];

  rawList = rawList.filter(item => {
    const matched = (item.matched_sizes || [])
      .map(extractInternalSize)
      .filter(Boolean);

    return matched.some(s => sizes.includes(s));
  });

  const masters =
    await loadProductMastersByMasps(
      rawList.map(x => x.masp)
    );

  let list = rawList
    .map(item => {
      const sp = masters.get(norm(item.masp));

      if (!sp) return null;

      return {
        ...sp,

        // matched size chỉ dùng xác định size nào phù hợp trong size nền.
        __matched_sizes: (
          item.matched_sizes || []
        )
          .map(extractInternalSize)
          .filter(Boolean),

        __seed: seed,
        __no_auto_shoe_size: !!noAutoShoeSize
      };
    })
    .filter(Boolean);


  // Lọc theo chế độ tư vấn.
  if (
    state.searchMode === "discount"
  ) {
    list = list
      .filter(
        sp =>
          Number(
            sp.giam_gia_pct ||
            0
          ) > 0
      )
      .sort(
        (a,b) =>
          Number(
            b.giam_gia_pct ||
            0
          ) -
          Number(
            a.giam_gia_pct ||
            0
          )
      );
  }

  if (
    state.searchMode === "cheaper"
  ) {
    const ref =
      Number(
        state.referencePrice ||
        0
      );

    list = list
      .filter(
        sp =>
          Number(sp.giale || 0) > 0 &&
          Number(sp.giale || 0) <= ref
      )
      .sort(
        (a,b) =>
          (ref - Number(a.giale || 0)) -
          (ref - Number(b.giale || 0))
      );
  }

  if (
    state.searchMode === "premium"
  ) {
    const ref =
      Number(
        state.referencePrice ||
        0
      );

    list = list
      .filter(
        sp =>
          Number(sp.giale || 0) >= ref
      )
      .sort(
        (a,b) =>
          (Number(a.giale || 0) - ref) -
          (Number(b.giale || 0) - ref)
      );
  }

  if (kw) {
    list = list.filter(sp =>
      norm(sp.masp).includes(kw) ||
      norm(sp.tensp).includes(kw)
    );
  }

  // V1.10.7: Form -> màu ưu tiên mềm -> FIFO 3 tháng (nmcs1 + nmcs2 gộp chung).
  // Màu không lọc cứng; sản phẩm màu khác vẫn được giữ phía sau trong cùng tầng Form.
  const recentImportDates = await loadRecentImportDates(list.map(x=>x.masp));
  if (searchSeq !== latestSearchSeq) return;
  list = sortByFormColorThenRecentFifo(list, state.selectedForm, state.selectedColor, recentImportDates);

  // Nếu luồng bắt đầu từ mã khách đang cầm, giữ chính mã đó ở đầu danh sách tương đồng.
  const sourceCode=norm(state.sourceProductCode||"");
  if(sourceCode){
    const idx=list.findIndex(sp=>norm(sp.masp)===sourceCode);
    if(idx>0){
      const [sourceSp]=list.splice(idx,1);
      list.unshift(sourceSp);
    }
  }

  // V1.10.3: không tải toàn bộ learning + full-stock của cả danh sách nữa.
  // Chỉ giữ danh sách đã sắp xếp, sau đó tải/rendere từng gói 40 mã khi người dùng cuộn.
  const modeLabel = modeMeta(state.searchMode).label;
  const pricePart = ["cheaper","premium"].includes(state.searchMode)
    ? ` · giá so sánh ${money(state.referencePrice)} đ`
    : "";

  $("searchSummary").textContent =
    noAutoShoeSize
      ? `${list.length} sản phẩm · ${modeLabel} · ${state.diadiem.toUpperCase()} · ` +
        `chưa biết size giày, hiển thị dần 40 sản phẩm/lượt${pricePart}`
      : `${list.length} sản phẩm · ${modeLabel} · ${state.diadiem.toUpperCase()} · ` +
        `size phù hợp ${sizes.join(", ")} · hiển thị dần 40 sản phẩm/lượt${pricePart}`;

  if (searchSeq !== latestSearchSeq) return;
  await startProductPagination(list, searchSeq);
}



function disconnectProductPagerObserver(){
  try{ state.productPager?.observer?.disconnect?.(); }catch(_){}
  if(state.productPager) state.productPager.observer=null;
}

async function ensureChunkStock(list){
  const chunk=Array.isArray(list)?list:[];
  if(!chunk.length)return;
  const fullStock=await getStockForMasps(chunk.map(x=>x.masp));
  chunk.forEach(sp=>{
    state.productCache.set(norm(sp.masp),sp);
    let stockMap=fullStock.get(norm(sp.masp));
    if(!stockMap || !stockMap.size){
      stockMap=new Map();
      (sp.__matched_sizes||[])
        .map(extractInternalSize)
        .filter(Boolean)
        .forEach(size=>{
          stockMap.set(size,{
            ton_cs1:state.diadiem==="cs1"?1:0,
            ton_cs2:state.diadiem==="cs2"?1:0,
            ban_cs1:0,ban_cs2:0,__fallback:true
          });
        });
    }
    state.stockCache.set(norm(sp.masp),stockMap);
  });
}

async function startProductPagination(list, searchSeq){
  disconnectProductPagerObserver();
  const box=$("productList");
  box.innerHTML="";
  state.productPager={
    list:Array.isArray(list)?list:[],
    nextIndex:0,
    pageSize:40,
    loading:false,
    searchSeq,
    observer:null
  };
  if(!state.productPager.list.length){
    box.innerHTML=`<div class="empty">Không có sản phẩm nào còn đúng size gợi ý tại ${state.diadiem.toUpperCase()}.</div>`;
    return;
  }
  const sentinel=document.createElement("div");
  sentinel.id="productLoadSentinel";
  sentinel.style.cssText="grid-column:1/-1;text-align:center;padding:12px;color:#687787;font-size:12px";
  sentinel.textContent="Cuộn xuống để tải thêm...";
  box.appendChild(sentinel);
  await loadNextProductPage(true);
  if("IntersectionObserver" in window){
    const obs=new IntersectionObserver(entries=>{
      if(entries.some(x=>x.isIntersecting)) loadNextProductPage(false);
    },{root:null,rootMargin:"700px 0px",threshold:0.01});
    obs.observe(sentinel);
    state.productPager.observer=obs;
  }
}

async function loadNextProductPage(initial=false){
  const pager=state.productPager;
  if(!pager || pager.loading || pager.searchSeq!==latestSearchSeq)return;
  if(pager.nextIndex>=pager.list.length){
    const s=$("productLoadSentinel");
    if(s){s.textContent=`Đã hiển thị đủ ${pager.list.length} sản phẩm.`;}
    disconnectProductPagerObserver();
    return;
  }
  pager.loading=true;
  const from=pager.nextIndex;
  const to=Math.min(pager.list.length,from+pager.pageSize);
  const chunk=pager.list.slice(from,to);
  const run=async()=>{
    await preloadLearningData(chunk.map(x=>x.masp));
    if(pager.searchSeq!==latestSearchSeq)return;
    await ensureChunkStock(chunk);
    if(pager.searchSeq!==latestSearchSeq)return;
    await renderProducts(chunk,{append:true});
    pager.nextIndex=to;
    const s=$("productLoadSentinel");
    if(s){
      s.textContent=pager.nextIndex<pager.list.length
        ? `Đã hiện ${pager.nextIndex}/${pager.list.length} · cuộn xuống để tải tiếp`
        : `Đã hiển thị đủ ${pager.list.length} sản phẩm.`;
    }
    if(pager.nextIndex>=pager.list.length) disconnectProductPagerObserver();
  };
  try{
    if(initial) await run();
    else await withDataLoading(`Đang tải thêm ${chunk.length} sản phẩm...`,run);
  }finally{
    pager.loading=false;
  }
}

function openProductImageLightbox(src) {
  const box=$("productImageLightbox"), img=$("productImageLightboxImg");
  if (!box || !img || !src) return;
  img.src=src;
  box.classList.add("show");
  box.setAttribute("aria-hidden","false");
}
function closeProductImageLightbox() {
  const box=$("productImageLightbox"), img=$("productImageLightboxImg");
  box?.classList.remove("show");
  box?.setAttribute("aria-hidden","true");
  if (img) img.src="";
}

async function renderProducts(list, options = {}) {
  const box = $("productList");
  const append = !!options.append;
  if (!append) box.innerHTML = "";

  if (!list.length) {
    if (!append) {
      box.innerHTML = `<div class="empty">Không có sản phẩm nào còn đúng size gợi ý tại ${state.diadiem.toUpperCase()}.</div>`;
    }
    return;
  }

  const p = currentSession();

  // Tính suggestion song song (learning data đã preload => gần như chỉ CPU).
  const prepared =
    await Promise.all(
      list.map(async sp => {
        const stockBySize =
          state.stockCache.get(
            norm(sp.masp)
          ) ||
          new Map();

        const allAvailable =
          availableSizes(
            stockBySize
          );

        if (!allAvailable.length) {
          return null;
        }

        const matchedSizes =
          Array.from(
            new Set(
              (sp.__matched_sizes || [])
                .map(extractInternalSize)
                .filter(Boolean)
            )
          ).sort(
            (a,b) =>
              (sizeRank(a)||99) -
              (sizeRank(b)||99)
          );

        if (!matchedSizes.length) {
          return null;
        }

        let sug = {
          ...(
            sp.__seed ||
            seedSuggestionForProfile(
              p,
              productLoai(sp)
            )
          )
        };

        sug =
          await learnSuggestionForProduct(
            sp,
            p,
            sug
          );

        if (sp.__no_auto_shoe_size) {
          // Không biết size giày: giữ primary null.
          // matchedSizes chỉ dùng để chứng minh sản phẩm còn hàng.
          sug = {
            ...sug,
            primary:null,
            backup:null,
            available:allAvailable,
            primaryInStock:false,
            backupInStock:false,
            source:"GIAY_CHUA_CO_SIZE"
          };
        } else {
          sug =
            effectiveSuggestionForMatchedSizes(
              sug,
              matchedSizes
            );
        }

        return {
          sp,
          stockBySize,
          allAvailable,
          matchedSizes,
          sug
        };
      })
    );

  const frag =
    document.createDocumentFragment();

  prepared
    .filter(Boolean)
    .forEach(item => {
      const {
        sp,
        allAvailable,
        sug
      } = item;

      const cacheKey =
        `${p.id}|${norm(sp.masp)}`;

      state.suggestionCache.set(
        cacheKey,
        { ...sug }
      );

      const div =
        document.createElement("div");

      div.className = "product";
      div.id =
        "sp-card-" +
        safeDomId(norm(sp.masp));

      div.dataset.masp =
        norm(sp.masp);

      const img =
        `${IMAGE_BASE}${encodeURIComponent(norm(sp.masp))}.JPG`;

      const suggestionText =
        sp.__no_auto_shoe_size
          ? "Chọn size thử"
          : (sug.primary || "-");

      if (isBasicMode()) {
        const formLabel = formLabelFromValue(sp.form);
        const visibleSizes = allAvailable.length ? allAvailable.join(" ") : "-";
        div.innerHTML = `
          <img class="product-main-image" loading="lazy" decoding="async" src="${img}" onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'" alt="${esc(sp.masp)}">
          <div class="product-body basic-card-body">
            <div class="basic-card-line1">
              <button type="button" class="basic-stock-link" data-stock-masp="${esc(sp.masp)}" title="Bấm để xem tồn nhanh">${esc(sp.masp)}</button>
            </div>
            <div class="basic-card-line-priceform">
              <span class="basic-inline-price">${money(sp.giale)} đ</span>
              ${formLabel ? `<span class="basic-card-form">Form: ${esc(formLabel)}</span>` : ""}
            </div>
            <div class="basic-card-line2">
              <span class="basic-card-sizes">Còn size: <b>${esc(visibleSizes)}</b></span>
            </div>
            <button type="button" class="basic-consult-btn">Tư vấn</button>
          </div>`;
        div.querySelector(".product-main-image")?.addEventListener("click", e => {
          e.stopPropagation();
          const imgEl = e.currentTarget;
          openProductImageLightbox(imgEl.currentSrc || imgEl.src);
        });
        div.querySelector(".basic-stock-link")?.addEventListener("click", e => {
          e.stopPropagation();
          window.StockQuick?.showFor(e.currentTarget, sp.masp);
        });
        div.querySelector(".basic-consult-btn")?.addEventListener("click", async e => {
          e.stopPropagation();
          state.selectedProductSource="RESULT";
          markConsultedProduct(sp.masp);
          await selectProduct(sp,{scrollToDetail:false,openQuickSize:true});
        });
        frag.appendChild(div);
        return;
      }

      div.innerHTML = `
        <img
          class="product-main-image"
          loading="lazy"
          decoding="async"
          src="${img}"
          onerror="this.onerror=null;this.src='${IMAGE_BASE}NO-IMAGE.JPG'"
        >

        <div class="product-body">
          <div class="masp">${esc(sp.masp)}</div>
          <div class="tensp">${esc(sp.tensp||"")}</div>

          <div class="price">
            ${money(sp.giale)} đ
          </div>

          ${
            Number(sp.giam_gia_pct || 0) > 0
              ? `<span class="discount-badge">
                  GIẢM ${Number(sp.giam_gia_pct)}%
                </span>`
              : ""
          }

          ${priceModeNote(sp)}

          <div class="stock">
            Gợi ý phù hợp:
            <b>${esc(suggestionText)}</b>
            <br>

            Còn size:
            ${
              allAvailable.map(s=>`
                <span
                  class="sizebadge ${
                    s===sug.primary
                      ? "best"
                      : ""
                  }"
                >${s}</span>
              `).join("")
            }
          </div>

          <div class="product-actions">
            <button class="btn-blue btn-tv">
              Tư vấn
            </button>

            <button class="btn-gray btn-ton">
              Xem tồn
            </button>
          </div>
        </div>
      `;

      const productImg = div.querySelector(".product-main-image");
      if (productImg) {
        productImg.onclick = e => {
          e.stopPropagation();
          openProductImageLightbox(productImg.currentSrc || productImg.src);
        };
      }

      div.querySelector(".btn-tv").onclick =
        async () => {
          state.selectedProductSource="RESULT";
          markConsultedProduct(sp.masp);
          await selectProduct(
            sp,
            {scrollToDetail:true}
          );
        };

      div.querySelector(".btn-ton").onclick =
        e => {
          e.stopPropagation();

          window.StockQuick?.showFor(
            e.currentTarget,
            sp.masp
          );
        };

      frag.appendChild(div);
    });

  const sentinel=$("productLoadSentinel");
  if(append && sentinel && sentinel.parentNode===box) box.insertBefore(frag,sentinel);
  else box.appendChild(frag);
}

function jumpToTrialControls() {
  requestAnimationFrame(() => {
    const target =
      document.querySelector(
        "#productDetail .fit-buttons, " +
        "#productDetail .trial-status, " +
        "#productDetail [data-fit-result]"
      );

    if (!target) return;

    const headerOffset =
      Math.min(
        150,
        document.querySelector(".topbar")?.offsetHeight || 90
      );

    const y =
      window.scrollY +
      target.getBoundingClientRect().top -
      headerOffset -
      12;

    window.scrollTo({
      top:Math.max(0,y),
      behavior:"auto"
    });
  });
}

async function markConsultedProduct(masp){
  const p=currentSession();
  const m=norm(masp);
  if(!p||!m)return;
  try{
    const {data,error}=await supabase.rpc("sales_copilot_ghi_tu_van_san_pham",{
      p_phien_id:Number(p.id),
      p_masp:m
    });
    if(error){console.warn("[SalesCopilot] Không ghi được mốc tư vấn SP:",error);return;}
    if(data){
      p.tu_van_sp_dau_luc=data.tu_van_sp_dau_luc||p.tu_van_sp_dau_luc||null;
      p.so_sp_da_tu_van=Number(data.so_sp_da_tu_van||p.so_sp_da_tu_van||0);
    }
  }catch(e){console.warn("[SalesCopilot] Tracking tư vấn lỗi:",e);}
}

async function markFirstCartMilestone(phienId){
  const now=new Date().toISOString();
  try{
    const {error}=await supabase.from("phien_tu_van_ban_hang")
      .update({vao_gio_dau_luc:now})
      .eq("id",phienId)
      .is("vao_gio_dau_luc",null);
    if(error)console.warn("[SalesCopilot] Không ghi được mốc vào giỏ đầu:",error);
  }catch(e){console.warn("[SalesCopilot] Tracking giỏ lỗi:",e);}
}

async function selectProduct(
  sp,
  options = {}
) {
  state.selectedProduct=sp;
  state.selectedSize=null;
  state.selectedFit=null;
  const selectedPrice = Number(sp?.giale || 0);
  if (selectedPrice > 0) {
    state.referencePrice = selectedPrice;
    if ($("txtReferencePrice")) {
      $("txtReferencePrice").value = Math.round(selectedPrice / 1000);
    }
  }

  // Lưu giá mã đang xem làm giá so sánh gợi ý,
  // nhưng không tự ép thay nếu NV đã nhập giá so sánh thủ công.
  if (
    Number(sp?.giale || 0) > 0 &&
    !Number(
      $("txtReferencePrice")?.value ||
      0
    )
  ) {
    state.referencePrice =
      Number(sp.giale);

    if ($("txtReferencePrice")) {
      $("txtReferencePrice").value =
        Math.round(
          Number(sp.giale) / 1000
        );
    }
  }

  setStep(3);

  const p=currentSession();
  const cacheKey=
    `${p?.id}|${norm(sp.masp)}`;

  const stockBySize =
    state.stockCache.get(norm(sp.masp)) ||
    new Map();

  let sug =
    state.suggestionCache.get(cacheKey);

  if (!sug) {
    let base =
      sp.__seed ||
      seedSuggestionForProfile(
        p,
        productLoai(sp)
      );

    base =
      await learnSuggestionForProduct(
        sp,
        p,
        base
      );

    const matchedSizes =
      (sp.__matched_sizes || [])
        .map(extractInternalSize)
        .filter(Boolean);

    if (sp.__no_auto_shoe_size) {
      sug = {
        ...base,
        primary:null,
        backup:null,
        source:"GIAY_CHUA_CO_SIZE"
      };
    } else {
      sug =
        effectiveSuggestionForMatchedSizes(
          base,
          matchedSizes
        );
    }

    state.suggestionCache.set(
      cacheKey,
      { ...sug }
    );
  }

  // Quan trọng:
  // tồn hiển thị trong detail luôn là FULL STOCK 38–46,
  // KHÔNG thay bằng matched size.
  state.currentSuggestion={
    ...sug,
    available: availableSizes(stockBySize),
    primaryInStock: sug?.primary
      ? stockAtBranch(stockBySize,sug.primary) > 0
      : false,
    backupInStock: sug?.backup
      ? stockAtBranch(stockBySize,sug.backup) > 0
      : false
  };


  if (
    !state.selectedSize &&
    state.currentSuggestion?.primary &&
    stockAtBranch(stockBySize, state.currentSuggestion.primary) > 0
  ) {
    state.selectedSize = state.currentSuggestion.primary;
  }

  if (options.basicQuick) return;

  if(isBasicMode()) {
    syncToolbarFromSelectedProduct(options.openQuickSize !== false);
    renderCoach();
    return;
  }

  renderProductDetail();
  renderCoach();

  if (!isBasicMode()) {
    jumpToTrialControls();
  }

  if (options.scrollToDetail) {
    requestAnimationFrame(() => {
      setTimeout(
        scrollToProductDetail,
        isBasicMode() ? 80 : 40
      );
    });
  }
}

function sourceText(s){
  return ({
    BANG_CHUAN:"Bảng chuẩn ban đầu",
    CAO_CAN_DOC_LAP:"Tính độc lập theo chiều cao và cân nặng",
    CAO_CAN_DOC_LAP_V18:"Bảng riêng ÁO/QUẦN · cao/cân độc lập",
    "1_DIEM_NEO_SAN_PHAM":"1 dữ liệu thật của mã này",
    LICH_SU_SAN_PHAM:"Lịch sử thử thật của mã này",
    SIZE_GIAY_THUONG_DI:"Size giày khách thường đi",
    CAN_HOI_SIZE_GIAY:"Cần hỏi size giày",
    GIAY_CHUA_CO_SIZE:"Chưa biết size giày",
    SAN_PHAM_THAM_CHIEU:"Size tham chiếu từ sản phẩm khách đã thử",
    SIZE_GIAY_TIM_THU_CONG:"Size giày được chọn để tìm",
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

  if (isBasicMode()) {
    box.innerHTML=`
      <div
        class="masp"
        id="detailMaspLink"
        style="cursor:pointer;text-decoration:underline"
        title="Bấm để quay lại ảnh sản phẩm trong danh sách"
      >${esc(sp.masp)}</div>
      <div class="basic-detail-top">
        <div class="basic-detail-sub">${esc(sp.tensp||"")}<br>${esc(sp.nhomhang||"")}${sp.form?` · Form ${esc(formLabelFromValue(sp.form)||sp.form)}`:""}</div>
        <div class="detail-price">${money(sp.giale)} đ</div>
      </div>
      ${Number(sp.giam_gia_pct || 0) > 0 ? `<span class="discount-badge">GIẢM ${Number(sp.giam_gia_pct)}%</span>` : ""}
      ${priceModeNote(sp)}
      ${managed ? `
        <div class="basic-detail-suggest">
          Gợi ý: <b>size ${esc(sug?.primary||"?")}</b>
          ${sug?.backupInStock && sug?.backup ? ` · Dự phòng: <b>${esc(sug.backup)}</b>` : ""}
          ${sug?.rangeMin ? ` · Khoảng nền: <b>${esc(sug.rangeMin)}–${esc(sug.rangeMax || sug.rangeMin)}</b>` : ""}
        </div>
        <div class="basic-detail-stockline">Còn size: <b>${esc(av.join(" ") || "-")}</b></div>
        <div class="size-buttons">
          ${SIZE_LIST.map(s=>{
            const ton=stockAtBranch(stock,s);
            const cls=[
              s===""+sug?.primary?"primary":"",
              s===""+sug?.backup?"secondary":"",
              s===""+state.selectedSize?"selected":"",
              ton<=0?"no-stock":""
            ].filter(Boolean).join(" ");
            return `<button
              class="size-btn ${cls}"
              data-size="${s}"
              data-ton="${ton}"
              title="Tồn ${state.diadiem.toUpperCase()}: ${ton}"
            >${s}<br><small>${ton}</small></button>`;
          }).join("")}
        </div>
        <div class="basic-detail-note">Chạm vào một size để thêm ngay vào <b>Khách đang lấy</b>.</div>
      ` : `
        <div class="basic-detail-note">Nhóm này không quản size. Có thể chốt trực tiếp sản phẩm.</div>
        <button class="btn btn-green" id="btnChotNoSize" style="width:100%;margin-top:8px">Chốt sản phẩm</button>
      `}
    `;
    box.querySelectorAll(".size-btn").forEach(
      b => b.onclick=()=>chooseSize(
        b.dataset.size,
        Number(b.dataset.ton || 0)
      )
    );
    $("detailMaspLink")?.addEventListener(
      "click",
      () => scrollToProductCard(sp.masp)
    );
    if($("btnChotNoSize")) $("btnChotNoSize").onclick=()=>addToCart(null,null);
    return;
  }

  box.innerHTML=`
    <div
      class="masp"
      id="detailMaspLink"
      style="cursor:pointer;text-decoration:underline"
      title="Bấm để quay lại ảnh sản phẩm trong danh sách"
    >${esc(sp.masp)}</div>
    <div class="tensp">${esc(sp.tensp||"")}</div>
    <div style="margin:6px 0">
      <b>${money(sp.giale)} đ</b> · ${esc(sp.nhomhang||"")}
      ${
        Number(sp.giam_gia_pct || 0) > 0
          ? `<span class="discount-badge">
              GIẢM ${Number(sp.giam_gia_pct)}%
            </span>`
          : ""
      }
      ${priceModeNote(sp)}
    </div>
    ${managed ? `
      <div class="size-hero">
        <div><div style="font-size:11px;color:#667">NÊN THỬ</div><div class="size-main">${esc(sug?.primary||"?")}</div></div>
        <div class="size-backup">Dự phòng: <b>${esc((sug?.backup && sug?.backupInStock) ? sug.backup : "-")}</b><br>
          ${
            sp.__no_auto_shoe_size
              ? `<span style="display:block;color:#075f9f;font-weight:800;margin-bottom:3px">
                  Chưa có size giày của khách · chọn trực tiếp một size còn hàng để thử
                </span>`
              : ""
          }
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
          return `<button
            class="size-btn ${cls}"
            data-size="${s}"
            data-ton="${ton}"
            title="Tồn ${state.diadiem.toUpperCase()}: ${ton}"
          >${s}<br><small>${ton}</small></button>`;
        }).join("")}
      </div>
      <div id="fitPanel"></div>
    ` : `
      <div class="coach">Nhóm này không quản size. Có thể chốt trực tiếp sản phẩm.</div>
      <button class="btn btn-green" id="btnChotNoSize" style="width:100%;margin-top:8px">Chốt sản phẩm</button>
    `}
    <button class="btn btn-gray" id="btnTonDetail" style="width:100%;margin-top:8px">Xem StockQuickPopup</button>
  `;
  box.querySelectorAll(".size-btn").forEach(
    b => b.onclick=()=>chooseSize(
      b.dataset.size,
      Number(b.dataset.ton || 0)
    )
  );

  $("btnTonDetail").onclick=(e)=>
    window.StockQuick?.showFor(
      e.currentTarget,
      sp.masp
    );

  $("detailMaspLink")?.addEventListener(
    "click",
    () => scrollToProductCard(sp.masp)
  );
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

async function chooseSize(
  size,
  tonHienTai = null
) {
  const stockMap =
    state.stockCache.get(
      norm(state.selectedProduct?.masp)
    );

  const ton =
    tonHienTai == null
      ? stockAtBranch(stockMap,size)
      : Number(tonHienTai || 0);

  if (ton <= 0) {
    const masp =
      state.selectedProduct?.masp || "";

    const ok = confirm(
      `⚠️ Hệ thống đang ghi nhận SIZE ${size} đã hết tại ${state.diadiem.toUpperCase()}.\n\n` +
      `Bạn có chắc thực tế vẫn còn size ${size} không?\n\n` +
      `Nếu chọn OK, hệ thống sẽ mở trang KIỂM TỒN của mã ${masp} để bạn kiểm tra ngay.`
    );

    if (!ok) {
      return;
    }

    const url =
      state.diadiem === "cs2"
        ? `/kiem_tonkho_cs2.html?masp=${encodeURIComponent(masp)}&from=stockquick`
        : `/kiem_tonkho_cs1.html?masp=${encodeURIComponent(masp)}&from=stockquick`;

    window.open(
      url,
      "_blank"
    );

    // Vẫn cho ghi nhận là NV đang thử size này,
    // nhưng dữ liệu sẽ bị kiểm tra nghi ngờ ở bước saveFit.
  }

  state.selectedSize=size;
  state.selectedFit=null;

  setStep(5);

  if (isBasicMode()) {
    setQuickSizeButtonValue(size);
    renderCoach();
    const sp=state.selectedProduct;
    const added=await addToCart(size,null);
    // V1.11.1: chọn size thành công phải đóng popup ngay,
    // không để che các dropdown/ô thao tác khác.
    closeQuickSizeMenu();
    if(added!==false && sp) await applyScannedProductContext(sp,size);
    closeQuickSizeMenu();
    syncToolbarFromSelectedProduct(false);
    return;
  }

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

  const stockMap =
    state.stockCache.get(norm(sp.masp));

  const tonTaiCoSo =
    stockAtBranch(stockMap,size);

  const stockSuspicious =
    tonTaiCoSo <= 0;

  const suspicious =
    outside>=2 ||
    stockSuspicious;

  const level =
    stockSuspicious
      ? Math.max(2, outside>=3 ? 3 : 2)
      : outside>=3
        ? 3
        : outside>=2
          ? 2
          : outside===1
            ? 1
            : 0;

  if(suspicious){
    const reasonText = stockSuspicious
      ? `Hệ thống đang ghi nhận size ${size} hết tồn tại ${state.diadiem.toUpperCase()}.`
      : `Size ${size} lệch ${outside} bậc ngoài khoảng cơ thể nền ${sug?.rangeMin || sug?.primary}-${sug?.rangeMax || sug?.backup || sug?.primary}.`;

    const ok=confirm(
      `⚠️ ${reasonText}\n\n` +
      `Nếu vẫn ghi nhận kết quả thử, dữ liệu này sẽ bị đánh dấu nghi ngờ và KHÔNG dùng để học tự động.\n\n` +
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
    ly_do_nghi_ngo:stockSuspicious
      ? `Size thu ${size} dang duoc ghi nhan het ton tai ${state.diadiem}`
      : outside>0
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


async function basicQuickAdd(sp,size){
  if(!currentSession()){ toast("Hãy tạo khách trước."); return; }
  await selectProduct(sp,{basicQuick:true});
  if(size){
    const stock=state.stockCache.get(norm(sp.masp));
    if(stockAtBranch(stock,size)<=0){ toast(`Size ${size} hiện hết tại ${state.diadiem.toUpperCase()}.`,3000); return; }
    state.selectedSize=size;
  }
  await addToCart(size||null,null);
  state.selectedProduct=null; state.selectedSize=null; state.selectedFit=null; state.currentSuggestion=null;
  renderCoach();
}

function cartProductMeta(masp){
  const sp=state.productCache.get(norm(masp))||{};
  const treo=state.diadiem==="cs2" ? sp.treomaucs2 : sp.treomaucs1;
  const kho=state.diadiem==="cs2" ? sp.vitrikho2 : sp.vitrikho1;
  return {sp,treo:String(treo||"").trim(),kho:String(kho||"").trim()};
}

function renderCartRowsFast(rows){
  const p=currentSession(), box=$("cartBox");
  const safeRows=Array.isArray(rows)?rows:[];
  if(p) p.so_mon_da_chot=safeRows.length;
  if(!safeRows.length){
    box.className="empty";
    box.innerHTML=isBasicMode()?"Chưa chọn sản phẩm.":"Chưa chốt sản phẩm.";
    renderTabs();
    return;
  }
  box.className="";
  box.innerHTML=safeRows.map(r=>{
    const meta=cartProductMeta(r.masp);
    const locationText=[
      meta.treo?`Mẫu: ${esc(meta.treo)}`:"Mẫu: -",
      meta.kho?`Kho: ${esc(meta.kho)}`:"Kho: -"
    ].join(" / ");
    return `
    <div class="cart-item ${r.nghi_ngo_size?"cart-suspicious":""}" data-id="${r.id}" data-masp="${esc(r.masp)}">
      <div class="cart-top">
        <button type="button" class="cart-masp-link" data-cart-stock="${esc(r.masp)}">${esc(r.masp)}</button>
        <span>${r.size?`Size ${esc(r.size)}`:""}</span>
      </div>
      <div class="cart-price-qty">${money(r.giale_hien_thi)} đ · SL ${Number(r.soluong||1)}</div>
      <div class="cart-location">${locationText}</div>
      ${r.nghi_ngo_size?`<div class="cart-warning">⚠️ Size bất thường - kiểm tra lại trước khi bán</div>`:""}
      <div class="cart-buttons"><button class="btn-remove">Bỏ khỏi giỏ</button></div>
    </div>`;
  }).join("");

  box.querySelectorAll("[data-cart-stock]").forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    window.StockQuick?.showFor(e.currentTarget, btn.dataset.cartStock);
  });

  box.querySelectorAll(".btn-remove").forEach(b=>b.onclick=async()=>{
    await withDataLoading("Đang bỏ sản phẩm khỏi giỏ...",async()=>{
      const id=b.closest(".cart-item").dataset.id;
      const {error}=await supabase.from("gio_tu_van").update({trang_thai:"BO",updated_at:new Date().toISOString()}).eq("id",id);
      if(error){toast("Không bỏ được sản phẩm: "+error.message,4000);return;}
      state.cartRows=state.cartRows.filter(x=>String(x.id)!==String(id));
      renderCartRowsFast(state.cartRows);
    });
  });
  renderTabs();
}

async function addToCart(size,fit) {
  const p=currentSession(), sp=state.selectedProduct, sug=state.currentSuggestion;
  if(!p||!sp)return;
  const normalizedSize=size?String(size):null;

  // Kiểm tra trùng ngay từ cache giỏ đã tải, không cần thêm một round-trip DB.
  const duplicate=(state.cartRows||[]).some(r=>
    norm(r.masp)===norm(sp.masp) && String(r.size||"")===String(normalizedSize||"")
  );
  if(duplicate){toast(`Mã ${sp.masp}${normalizedSize?` size ${normalizedSize}`:""} đã có trong giỏ.`,2500);return;}

  const doInsert=async()=>{
    const diff=normalizedSize?distanceOutsideSuggestedRange(normalizedSize,sug):0;
    const stockMap=state.stockCache.get(norm(sp.masp));
    const stockSuspicious=normalizedSize?stockAtBranch(stockMap,normalizedSize)<=0:false;
    const row={
      phien_id:p.id,masp:sp.masp,size:normalizedSize,soluong:1,
      giale_hien_thi:Number(sp.giale||0),khuyenmai_hien_thi:0,trang_thai:"DA_CHOT",
      ket_qua_mac:fit||null,size_he_thong_goi_y:sug?.primary||null,size_du_phong:sug?.backup||null,
      nguon_goi_y_size:sug?.source||null,do_tin_cay_size:sug?.confidence||null,
      nghi_ngo_size:stockSuspicious||diff>=2,
      muc_nghi_ngo_size:stockSuspicious?Math.max(2,diff>=3?3:2):diff>=3?3:diff>=2?2:diff===1?1:0,
      ly_do_nghi_ngo_size:stockSuspicious
        ? `Size chot ${normalizedSize} dang duoc ghi nhan het ton tai ${state.diadiem}`
        : diff>0?`Size chot ${normalizedSize} nam ngoai khoang co the ${sug?.rangeMin||"-"}-${sug?.rangeMax||"-"} ${diff} bac`:null
    };
    const {data:inserted,error}=await supabase.from("gio_tu_van").insert(row).select("*").single();
    if(error){toast("Không thêm được giỏ tư vấn: "+error.message,4000);return false;}

    // Cơ bản: cập nhật UI ngay sau đúng 1 lần insert chính.
    state.cartRows=[inserted,...(state.cartRows||[])];
    p.trang_thai="DANG_CHOT";
    setStep(7);
    renderCartRowsFast(state.cartRows);
    toast("Đã thêm vào khách đang lấy.",1600);

    // Các cập nhật phụ chạy nền, không chặn thao tác tiếp theo.
    supabase.from("phien_tu_van_ban_hang")
      .update({trang_thai:"DANG_CHOT",last_active_at:new Date().toISOString()}).eq("id",p.id)
      .then(({error:e})=>{if(e)console.warn("[SalesCopilot] update session cart:",e);});
    markFirstCartMilestone(p.id);

    if(state.selectedProductSource==="NHAP_MA" || state.selectedProductSource==="QUET_MA") {
      // Không đổi chiều cao/cân nặng. Size vừa chọn chỉ trở thành size tham chiếu
      // cho đúng loại hàng của khách, đồng thời lấy nhóm/form/màu của sản phẩm làm ngữ cảnh.
      await applyScannedProductContext(sp,normalizedSize);
      state.selectedProductSource="RESULT";
    }
    return true;
  };

  if(isBasicMode()){
    return await withDataLoading("Đang thêm sản phẩm vào giỏ...", doInsert);
  }

  return await withDataLoading("Đang thêm sản phẩm vào giỏ...",async()=>{
    const ok=await doInsert();
    if(ok && normalizedSize){
      await supabase.from("ket_qua_thu_do").update({da_chot_tu_van:true})
        .eq("phien_id",p.id).eq("masp",sp.masp).eq("size",normalizedSize);
    }
  });
}

async function renderCart() {
  const p=currentSession(), box=$("cartBox");
  if(!p){state.cartRows=[];box.className="empty";box.innerHTML="Chưa có khách.";return;}
  const {data,error}=await supabase.from("gio_tu_van").select("*")
    .eq("phien_id",p.id).eq("trang_thai","DA_CHOT").eq("da_day_sang_ban",false).order("created_at",{ascending:false});
  if(error){box.innerHTML="Lỗi tải giỏ.";return;}
  state.cartRows=data||[];
  await loadProductMastersByMasps(state.cartRows.map(x=>x.masp));
  renderCartRowsFast(state.cartRows);
}



function makeAlternatingSteps(min, max) {
  const out = [];
  let v = min;
  let addThree = true;

  while (v <= max) {
    out.push(v);
    v += addThree ? 3 : 2;
    addThree = !addThree;
  }

  if (out[out.length - 1] !== max) {
    out.push(max);
  }

  return Array.from(new Set(out));
}

const WEIGHT_STEPS = makeAlternatingSteps(50,110);
const HEIGHT_STEPS = makeAlternatingSteps(150,190);

function nearestFromList(value, list) {
  const n = Number(value || 0);
  if (!list?.length) return null;

  return list.reduce(
    (best,x) =>
      Math.abs(x-n) < Math.abs(best-n)
        ? x
        : best,
    list[0]
  );
}

function fillWheel(selectId, values, suffix, currentValue) {
  const sel = $(selectId);
  if (!sel) return;

  sel.innerHTML = "";

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = `${v}${suffix}`;
    sel.appendChild(opt);
  });

  const selected = nearestFromList(currentValue, values);
  if (selected != null) {
    sel.value = String(selected);

    requestAnimationFrame(() => {
      const opt =
        Array.from(sel.options)
          .find(o => Number(o.value) === selected);

      opt?.scrollIntoView({
        block:"center",
        behavior:"auto"
      });
    });
  }
}

function buildWeightWheel() {
  fillWheel(
    "fKg",
    WEIGHT_STEPS,
    " kg",
    Number($("fKg")?.dataset.current || $("fKg")?.value || 70)
  );
}

function setWeightWheelValue(value) {
  const kg = nearestFromList(value, WEIGHT_STEPS);
  const sel = $("fKg");
  if (!sel || kg == null) return;

  sel.value = String(kg);
  sel.dataset.current = String(kg);

  requestAnimationFrame(() => {
    Array.from(sel.options)
      .find(o => Number(o.value) === kg)
      ?.scrollIntoView({
        block:"center",
        behavior:"auto"
      });
  });
}

function getWeightWheelValue() {
  return Number($("fKg")?.value || 0);
}

function buildHeightWheel() {
  fillWheel(
    "fCao",
    HEIGHT_STEPS,
    " cm",
    Number($("fCao")?.dataset.current || $("fCao")?.value || 170)
  );
}

function setHeightWheelValue(value, autoWeight=true) {
  const h = nearestFromList(value, HEIGHT_STEPS);
  const sel = $("fCao");
  if (!sel || h == null) return;

  sel.value = String(h);
  sel.dataset.current = String(h);

  requestAnimationFrame(() => {
    Array.from(sel.options)
      .find(o => Number(o.value) === h)
      ?.scrollIntoView({
        block:"center",
        behavior:"auto"
      });
  });

  if (autoWeight) {
    setWeightWheelValue(
      autoWeightFromHeight(h)
    );
    state.autoWeightMode = true;
  }

  updateGroupPreview();
}

function getHeightWheelValue() {
  return Number($("fCao")?.value || 0);
}

function autoWeightFromHeight(height) {
  const h = Number(height || 0);
  if (!h) return null;
  return Math.max(30, Math.min(200, Math.round(h - 100)));
}

function markQuickHeightSelected() {
  const h = Number($("fCao")?.value || 0);
  document.querySelectorAll(".quick-height-btn").forEach(btn => {
    btn.classList.toggle("on", Number(btn.dataset.height) === h);
  });
}

function setHeightQuick(height, autoWeight=true) {
  setHeightWheelValue(height, autoWeight);
  markQuickHeightSelected();
}

function stepHeight(delta) {
  const old = Number($("fCao").value || 170);
  const next = Math.max(130, Math.min(220, old + Number(delta || 0)));
  setHeightQuick(next, state.autoWeightMode);
}

function stepWeight(delta) {
  const old = Number($("fKg").value || autoWeightFromHeight($("fCao").value) || 70);
  const next = Math.max(30, Math.min(200, old + Number(delta || 0)));
  setWeightWheelValue(next);
  state.autoWeightMode = false;
  updateGroupPreview();
}

function resetAutoWeight() {
  const h = Number($("fCao").value || 0);
  if (!h) {
    toast("Hãy chọn chiều cao trước.");
    return;
  }
  setWeightWheelValue(autoWeightFromHeight(h));
  state.autoWeightMode = true;
  updateGroupPreview();
}

function openCustomerModal(edit=false) {
  buildWeightWheel();
  buildHeightWheel();
  state.editingSessionId=edit?currentSession()?.id:null;
  const p=edit?currentSession():null;
  $("modalKhachTitle").textContent=edit?"Sửa thông tin khách":"Khách mới";
  $("btnLuuKhach").textContent=edit?"Lưu thay đổi":(isBasicMode()?"Bắt đầu":"Bắt đầu tư vấn");
  $("fCao").value=p?.chieu_cao_cm||"";
  setWeightWheelValue(p?.can_nang_kg||"");
  $("fTuoi").value=p?.tuoi||"";
  $("fGiay").value=p?.size_giay_thuong_di||"";
  $("fMakh").value=p?.makh||"";
  $("fTenkh").value=p?.tenkh||"";
  document.querySelectorAll(".body-chip").forEach(ch=>ch.classList.toggle("on",!!p?.[ch.dataset.field]));
  state.autoWeightMode = isBasicMode() ? true : !edit;
  markQuickHeightSelected();
  updateGroupPreview();
  $("modalKhach").classList.add("show");
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
  const p =
    formProfileDraft();

  markQuickHeightSelected();

  if (
    !p.chieu_cao_cm ||
    !p.can_nang_kg
  ) {
    $("groupPreview").textContent =
      "Chọn chiều cao để tự điền cân nặng; có thể điều chỉnh ±3.";
    return;
  }

  const ao =
    seedSuggestionForProfile(
      p,
      "AO"
    );

  const quan =
    seedSuggestionForProfile(
      p,
      "QUAN"
    );

  $("groupPreview").innerHTML=`
    <div style="margin-bottom:5px">
      <b>ÁO:</b>
      cao → <b>${esc(ao.sizeTheoCao || "-")}</b>,
      cân → <b>${esc(ao.sizeTheoCan || "-")}</b>
      · chính
      <b style="font-size:18px;color:#d92d20">
        ${esc(ao.primary || "-")}
      </b>
      ${ao.backup ? ` · dự phòng <b>${esc(ao.backup)}</b>` : ""}
    </div>

    <div>
      <b>QUẦN:</b>
      cao → <b>${esc(quan.sizeTheoCao || "-")}</b>,
      cân → <b>${esc(quan.sizeTheoCan || "-")}</b>
      · chính
      <b style="font-size:18px;color:#075f9f">
        ${esc(quan.primary || "-")}
      </b>
      ${quan.backup ? ` · dự phòng <b>${esc(quan.backup)}</b>` : ""}
    </div>

    <div style="font-size:11px;color:#687787;margin-top:5px">
      Mỗi loại tính chiều cao và cân nặng độc lập; lấy size lớn hơn.
      Áo và quần dùng bảng chuẩn riêng.
    </div>
  `;
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
    await withDataLoading("Đang lưu thông tin khách...", async()=>{
      const ok = await createOrUpdateSession(payload);

      if (ok) {
        $("modalKhach").classList.remove("show");

        // Đổi cao/cân/thể trạng xong tải lại ngay.
        if (currentSession()) {
          await searchProducts();
        }
      }
    });
  }catch(e){
    alert("Không lưu được phiên tư vấn: "+e.message);
  }
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

function waitForSaleAck(payloadId, timeoutMs=12000){
  return new Promise(resolve=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      try{
        const raw=localStorage.getItem(ACK_KEY);
        const ack=raw?JSON.parse(raw):null;
        if(ack?.id===payloadId){clearInterval(timer);resolve(ack);return;}
      }catch(_){}
      if(Date.now()-started>=timeoutMs){clearInterval(timer);resolve(null);}
    },180);
  });
}

async function validateCartRowsForSale(rows){
  const masps=[...new Set((rows||[]).map(x=>norm(x.masp)).filter(Boolean))];
  if(!masps.length)return {ok:false,message:"Giỏ tư vấn đang trống."};
  const {data,error}=await supabase.from("dmhanghoa").select("masp,nhomhang").in("masp",masps);
  if(error)return {ok:false,message:"Không kiểm tra được mã hàng trước khi đẩy: "+error.message};
  const map=new Map((data||[]).map(x=>[norm(x.masp),x]));
  const bad=[];
  for(const r of rows){
    const sp=map.get(norm(r.masp));
    const managed=sp ? isSizeManagedGroup(sp.nhomhang) : true;
    if(managed && !extractInternalSize(r.size)) bad.push(`${r.masp} (chưa có size hợp lệ)`);
  }
  return bad.length ? {ok:false,message:"Không thể đưa sang bán vì có dòng thiếu size:\n"+bad.join("\n")} : {ok:true};
}

async function pushToSale() {
  const p=currentSession();if(!p)return;
  return await withDataLoading("Đang kiểm tra và đưa dữ liệu sang trang bán...", async()=>{
    const {data,error}=await supabase.from("gio_tu_van").select("*")
      .eq("phien_id",p.id).eq("trang_thai","DA_CHOT").eq("da_day_sang_ban",false).order("created_at",{ascending:true});
    if(error||!data?.length){toast("Giỏ tư vấn đang trống.");return;}

    const valid=await validateCartRowsForSale(data);
    if(!valid.ok){alert(valid.message);return;}

    const payload={
      id:`${Date.now()}_${p.id}`,created_at:new Date().toISOString(),
      phien_id:p.id,diadiem:state.diadiem,makh:p.makh||null,tenkh:p.tenkh||null,
      items:data.map(x=>({gio_id:x.id,masp:x.masp,size:x.size||null,soluong:Number(x.soluong||1)}))
    };

    // Xóa payload/ACK cũ trước khi gửi để tránh tab bán đọc nhầm dữ liệu lần trước.
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(ACK_KEY);
    localStorage.setItem(PENDING_KEY,JSON.stringify(payload));

    const url=state.diadiem==="cs2"?"/bannvcs2.html":"/bannvcs1.html";
    window.open(url,"BAN_NV_HOAN_TUYET");

    // Chỉ đánh dấu đã đẩy sau khi trang bán xác nhận đã nhận đủ payload.
    const ack=await waitForSaleAck(payload.id,12000);
    if(!ack){
      toast("Trang bán chưa xác nhận đã nhận dữ liệu. Giỏ vẫn được giữ nguyên để thử lại an toàn.",6000);
      return;
    }

    const ids=data.map(x=>x.id);
    const now=new Date().toISOString();
    const {error:markErr}=await supabase.from("gio_tu_van").update({da_day_sang_ban:true,day_sang_ban_luc:now,updated_at:now}).in("id",ids);
    if(markErr){toast("Trang bán đã nhận nhưng chưa đánh dấu được giỏ: "+markErr.message,6000);return;}
    await supabase.from("phien_tu_van_ban_hang").update({trang_thai:"DA_DAY_SANG_BAN",last_active_at:now,dua_sang_ban_luc:now,ket_thuc_luc:now}).eq("id",p.id);
    p.trang_thai="DA_DAY_SANG_BAN";
    setStep(8);
    toast(`Đã chuyển đủ ${data.length} sản phẩm sang trang bán.`);
    await renderCart();renderTabs();
  });
}

async function endNoBuy(){
  const p=currentSession();if(!p)return;
  const now=new Date().toISOString();
  await supabase.from("phien_tu_van_ban_hang").update({trang_thai:"KET_THUC_KHONG_MUA",last_active_at:now,ket_thuc_luc:now}).eq("id",p.id);
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
  // V1.11.0: thanh size nhanh luôn bám theo khách/nhóm hiện tại.

  renderTabs();renderProfile();
  syncQuickSizeSelect(); // V1.11.0
  renderGroups();renderCoach();await renderCart();
  if(isBasicMode()){ syncToolbarFromSelectedProduct(false); }
  else if(state.selectedProduct)renderProductDetail();else{$("productDetail").className="empty";$("productDetail").innerHTML="Chọn một sản phẩm.";}
}

function currentAdviceLoai(){
  const g=state.groups.find(x=>norm(x.manhom)===norm(state.selectedGroup||""));
  return g?.loai_tu_van || (state.selectedMainGroup==="QUAN"?"QUAN":state.selectedMainGroup==="GIAY_DEP"?"GIAY_DEP":"AO");
}

function syncQuickSizeSelect(){
  const el=$("quickSizeSelect");
  const p=currentSession();
  if(!el)return;
  if(!p){setQuickSizeButtonValue("");return;}
  if(state.selectedProduct && state.selectedSize){setQuickSizeButtonValue(state.selectedSize);return;}
  const loai=currentAdviceLoai();
  const ref=extractInternalSize(p?.__size_tham_chieu?.[loai]);
  if(ref){setQuickSizeButtonValue(ref);return;}
  if(loai==="GIAY_DEP"){
    setQuickSizeButtonValue(state.selectedShoeSearchSize||extractInternalSize(p?.size_giay_thuong_di)||"");
    return;
  }
  const sug=suggestionWithSessionReference(p,loai);
  setQuickSizeButtonValue(extractInternalSize(sug?.primary)||"");
}

async function applyQuickSizePreference(raw){
  const p=currentSession();
  if(!p){toast("Hãy tạo/chọn khách trước khi chọn size.",2200);syncQuickSizeSelect();return;}
  const size=extractInternalSize(raw);
  const loai=currentAdviceLoai();
  p.__size_tham_chieu=p.__size_tham_chieu||{};
  if(size) p.__size_tham_chieu[loai]=size;
  else delete p.__size_tham_chieu[loai];
  if(loai==="GIAY_DEP") state.selectedShoeSearchSize=size||"";
  renderProfile();
  renderTabs();
  if(state.selectedGroup) await searchProducts();
}

function bindEvents(){
  setupBeepUnlockOnce(document);
  $("quickSizeSelect")?.addEventListener("click",e=>{
    e.preventDefault();
    const menu=$("quickSizeMenu");
    if(!menu)return;
    if(menu.classList.contains("show")) closeQuickSizeMenu();
    else renderQuickSizeMenu(true);
  });
  document.addEventListener("click",e=>{
    if(!e.target.closest?.(".quick-size-wrap")) closeQuickSizeMenu();
  });
  $("uiLevel")?.addEventListener("change", async e=>{
    applyUiMode(e.target.value);
    if(currentSession()) await searchProducts();
  });
  $("btnHoc8Buoc")?.addEventListener("click",()=>$("modalHoc8Buoc")?.classList.add("show"));
  $("btnDongHoc8Buoc")?.addEventListener("click",()=>$("modalHoc8Buoc")?.classList.remove("show"));
  document.querySelectorAll(".basic-form-btn").forEach(b=>b.onclick=async()=>{
    state.selectedForm=b.dataset.form||"";
    document.querySelectorAll(".basic-form-btn").forEach(x=>x.classList.toggle("on",x===b));
    if(currentSession()) await searchProducts();
  });
  $("colorPrioritySelect")?.addEventListener("change",async e=>{
    state.selectedColor=String(e.target.value||"").trim();
    if(currentSession() && state.selectedGroup) await searchProducts();
  });
  $("productImageLightbox")?.addEventListener("click", closeProductImageLightbox);
  $("productImageLightboxImg")?.addEventListener("click", e => {
    e.stopPropagation();
    closeProductImageLightbox();
  });

  $("shoeSizeSearchSelect")
    ?.addEventListener(
      "change",
      async e => {
        state.selectedShoeSearchSize =
          extractInternalSize(
            e.target.value
          ) || "";

        if (isBasicMode() && currentSession() && state.selectedGroup) {
          await searchProducts();
          return;
        }

        $("searchSummary").textContent =
          state.selectedShoeSearchSize
            ? `Đã chọn size ${state.selectedShoeSearchSize}. Nhấn Tìm để tải sản phẩm.`
            : "Chưa chọn size giày/dép cần tìm.";

        $("productList").innerHTML =
          `<div class="empty">
            ${
              state.selectedShoeSearchSize
                ? `Đã chọn size <b>${state.selectedShoeSearchSize}</b>.<br>Nhấn <b>Tìm</b> để tải dữ liệu.`
                : `Vui lòng chọn <b>Size cần tìm</b> rồi bấm <b>Tìm</b>.`
            }
          </div>`;
      }
    );

  document
    .querySelectorAll(".main-group-btn")
    .forEach(btn => {
      btn.onclick = async () => {
        await selectMainGroup(btn.dataset.mainGroup);
        renderBasicSubgroups();
      };
    });

  $("subGroupSelect")
    ?.addEventListener(
      "change",
      async e => {
        await selectSubGroup(e.target.value);
        if(isBasicMode() && currentSession()) await searchProducts();
      }
    );

  document.querySelectorAll(".quick-height-btn").forEach(btn => {
    btn.onclick = () => setHeightQuick(Number(btn.dataset.height), true);
  });

  // V1.9.5: chiều cao dùng wheel
  // V1.9.5: chiều cao dùng wheel
  // V1.9.4 wheel can nang
  // V1.9.4 wheel can nang
  $("btnCanTuDong").onclick = resetAutoWeight;

  $("fCao").addEventListener("change", () => {
    $("fCao").dataset.current = $("fCao").value;

    if (isBasicMode() || state.autoWeightMode) {
      setWeightWheelValue(
        autoWeightFromHeight(
          Number($("fCao").value || 0)
        )
      );
      if (isBasicMode()) state.autoWeightMode = true;
    }

    markQuickHeightSelected();
    updateGroupPreview();
  });

  $("fKg").addEventListener("change", () => { state.autoWeightMode=false; $("fKg").dataset.current=$("fKg").value; updateGroupPreview(); });

  document
    .querySelectorAll(".mode-btn")
    .forEach(btn => {
      btn.onclick =
        () => setSearchMode(
          btn.dataset.mode
        );
    });

  $("btnApDungGia").onclick =
    async () => {
      const ref =
        getReferencePriceFromInput();

      if (ref <= 0) {
        toast(
          "Giá so sánh phải lớn hơn 0."
        );
        return;
      }

      state.referencePrice=ref;

      if (
        ["cheaper","premium"]
          .includes(state.searchMode) &&
        currentSession()
      ) {
        await searchProducts();
      }
    };

  $("btnLayGiaDangXem").onclick =
    async () => {
      const ok =
        useSelectedProductPrice();

      if (
        ok &&
        ["cheaper","premium"]
          .includes(state.searchMode) &&
        currentSession()
      ) {
        await searchProducts();
      }
    };

  $("txtReferencePrice")
    ?.addEventListener(
      "keydown",
      async e => {
        if (e.key !== "Enter") return;

        e.preventDefault();

        const ref =
          getReferencePriceFromInput();

        if (ref <= 0) return;

        state.referencePrice=ref;

        if (
          ["cheaper","premium"]
            .includes(state.searchMode) &&
          currentSession()
        ) {
          await searchProducts();
        }
      }
    );

  $("btnKhachMoi").onclick=()=>openCustomerModal(false);
  $("btnSuaKhach").onclick=()=>{if(currentSession())openCustomerModal(true);};
  $("btnHuyKhach").onclick=()=>$("modalKhach").classList.remove("show");
  $("btnLuuKhach").onclick=saveCustomerModal;
  $("btnSearch").onclick=searchProducts;
  $("txtSearch").addEventListener("keydown",e=>{if(e.key==="Enter")searchProducts();});
  $("chkConHang").onchange=searchProducts;
  $("btnDaySangBan").onclick=()=> isBasicMode() ? pushToSale() : confirmMeasurements("PUSH");
  $("btnTimTiepSP")?.addEventListener("click", async()=>{
    const masp=state.selectedProduct?.masp;
    if(!masp){toast("Chưa có sản phẩm đang tư vấn.");return;}
    await scrollToProductCard(masp);
  });
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
  // V1.7.1: fCao/fKg co listener rieng.
  $("fMakh").addEventListener("blur",async()=>{
    const ma=String($("fMakh").value||"").replace(/\D/g,"").slice(0,10);
    $("fMakh").value=ma;
    if(ma.length!==10)return;
    const {data}=await supabase.from("dmkhachhang").select("makh,tenkh").eq("makh",ma).maybeSingle();
    if(data?.tenkh&&!$("fTenkh").value)$("fTenkh").value=data.tenkh;
  });
  document.querySelectorAll(".body-chip").forEach(ch=>ch.onclick=()=>{ch.classList.toggle("on");updateGroupPreview();});
}


function debugV18Engine() {
  const cases = [
    // AO
    {loai:"AO",cao:150,kg:50,want:"38"},
    {loai:"AO",cao:155,kg:50,want:"39"},
    {loai:"AO",cao:160,kg:60,want:"39"},
    {loai:"AO",cao:165,kg:60,want:"40"},
    {loai:"AO",cao:170,kg:70,want:"41"},
    {loai:"AO",cao:175,kg:70,want:"42"},
    {loai:"AO",cao:180,kg:80,want:"43"},
    {loai:"AO",cao:185,kg:80,want:"44"},
    {loai:"AO",cao:190,kg:90,want:"44"},
    {loai:"AO",cao:192,kg:90,want:"45"},
    {loai:"AO",cao:195,kg:90,want:"46"},

    // QUAN - khác AO ở mức 2
    {loai:"QUAN",cao:160,kg:60,want:"40"},
    {loai:"QUAN",cao:165,kg:60,want:"41"},
    {loai:"QUAN",cao:150,kg:65,want:"41"},

    // lệch cao/cân: lấy size lớn hơn
    {loai:"AO",cao:150,kg:90,want:"44"},
    {loai:"QUAN",cao:180,kg:60,want:"43"}
  ];

  cases.forEach(c => {
    const t =
      seedSuggestionForProfile(
        {
          chieu_cao_cm:c.cao,
          can_nang_kg:c.kg,
          size_giay_thuong_di:null
        },
        c.loai
      );

    console.log(
      `[SalesCopilot V1.8] ${c.loai} ${c.cao}/${c.kg} =>`,
      t
    );

    if (
      String(t?.primary) !==
      String(c.want)
    ) {
      console.error(
        "[SalesCopilot V1.8] ENGINE SAI",
        c,
        t
      );
    }
  });
}

async function init(){
  applyUiMode("basic");
  $("nvInfo").textContent=`${state.tennv||state.manv||"Chưa đăng nhập"} · ${state.diadiem.toUpperCase()}`;
  $("fGiay").innerHTML='<option value="">-- Không biết --</option>'+SIZE_LIST.map(s=>`<option value="${s}">${s}</option>`).join("");
  showDataLoading("Đang tải dữ liệu Trợ lý bán hàng...");
  try{
    await loadConfig();
    renderColorPrioritySelect();
    debugV18Engine();
    await loadSessions();
    bindEvents();
    bindDirectProductInput();

    // Xác định nhóm lớn chứa selectedGroup hiện tại.
    for (const [key,cfg] of Object.entries(MAIN_GROUPS)) {
      if (
        cfg.groups.some(
          code => norm(code) === norm(state.selectedGroup)
        )
      ) {
        state.selectedMainGroup = key;
        break;
      }
    }

    renderModeControls();
    renderGroups();
    renderBasicSubgroups();
    await renderAll();
    if(!state.sessions.length) openCustomerModal(false);
    else searchProducts();
  }catch(e){
    console.error(e);
    alert("Không khởi tạo được Trợ lý bán hàng: "+(e.message||e));
  }finally{
    dataLoadingDepth = 1;
    hideDataLoading();
  }
}

// Bổ sung phối hàng sau khi lưu kết quả thử
const originalSaveFit = saveFit;
saveFit = async function(fit){
  await originalSaveFit(fit);
  setTimeout(renderPairingHint,0);
};

init();
