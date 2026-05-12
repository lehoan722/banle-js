import "./stockQuickPopup.js";

// =========================
// SOUND FALLBACK NỘI BỘ
// =========================
let __audioCtx = null;
let __audioUnlocked = false;

function getAudioCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!__audioCtx) __audioCtx = new Ctx();
    return __audioCtx;
  } catch (e) {
    return null;
  }
}

async function unlockAudioOnce() {
  const ctx = getAudioCtx();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (!__audioUnlocked) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      __audioUnlocked = true;
    }

    return true;
  } catch (e) {
    return false;
  }
}

function setupBeepUnlockOnce(target = document) {
  const handler = async () => {
    await unlockAudioOnce();
  };

  ["pointerdown", "touchstart", "keydown", "click"].forEach(evt => {
    target.addEventListener(evt, handler, { passive: true, capture: true });
  });
}

function playTone(freq = 1000, duration = 0.15, volume = 0.25, type = "sine") {
  const ctx = getAudioCtx();
  if (!ctx) return false;

  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.setValueAtTime(volume, start + Math.max(0.02, duration - 0.04));
  gain.gain.linearRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + duration);

  return true;
}

let __alertBusy = false;

function playSuccessBeep() {
  unlockAudioOnce().then(() => {
    playTone(2400, 0.12, 0.3, "sine");
  });
}

function playWaitSizeBeep() {
  unlockAudioOnce().then(() => {
    playTone(1200, 0.18, 0.4, "sine");
  });
}

function playAlertBeep() {
  if (__alertBusy) return false;
  __alertBusy = true;

  unlockAudioOnce().then(() => {
    playTone(800, 0.22, 0.28, "square");
  }).finally(() => {
    setTimeout(() => {
      __alertBusy = false;
    }, 260);
  });

  return true;
}

function patchAlertWithBeep() {
  if (window.__alertBeepPatched) return;
  window.__alertBeepPatched = true;

  const oldAlert = window.alert;
  window.alert = function (...args) {
    try { playAlertBeep(); } catch (e) { }
    return oldAlert.apply(window, args);
  };
}

// scripts/nhapkiemkho.js
(function () {
  "use strict";

  setupBeepUnlockOnce(document);
  patchAlertWithBeep();

  const CFG = {
    ...getBranchInfoFromPath(),
    ...(window.KIEM_NHAP_CONFIG || {})
  };

  function getBranchInfoFromPath() {
    const path = String(window.location.pathname || "").toLowerCase();
    const fileName = path.split("/").pop() || "";

    // Ưu tiên đọc hậu tố cs1 / cs2 trong tên file
    const isCs1 = /cs1(?=\.html?$|[_-]?)/.test(fileName);
    const isCs2 = /cs2(?=\.html?$|[_-]?)/.test(fileName);

    let toBranch = "cs1";

    if (isCs2) toBranch = "cs2";
    else if (isCs1) toBranch = "cs1";

    const fromBranch = toBranch === "cs1" ? "cs2" : "cs1";
    const suffix = toBranch;
    const pageId = `kiemnhap_${suffix}`;
    const soPhieuPrefix = toBranch === "cs1"
      ? "kiemnhap2v1cs1_"
      : "kiemnhap1v2cs2_";

    return {
      toBranch,
      fromBranch,
      pageId,
      soPhieuPrefix,
      title: `KIỂM NHẬP KHO ${toBranch.toUpperCase()}`
    };
  }

  // =========================
  // STATE
  // =========================
  window.kiemNhapState = {
    nhap: {},
    xuat: {},
    ketQua: {},
    nhapOrder: [],
    xuatOrder: [],
    dsHoaDonNguon: [],
    dsHoaDonNguonInfo: [],
    taoHdCcnByMasp: {},
    selectedMasp: "",
    dmMaspCache: new Map(),

    // NEW: cache vị trí kho / bày mẫu theo mã
    vitriCache: new Map(),
    vitriDangTai: new Set()
  };

  let dangChonSizeTrongPopup = false;

  // =========================
  // AUDIO CẢNH BÁO
  // =========================
  // =========================
  // AUDIO (NEW - SOUND BEEP)
  // =========================
  function phatAmThanhLoi() {
    try { playAlertBeep(); } catch (e) { }
  }

  function phatAmThanhSize() {
    try { playWaitSizeBeep(); } catch (e) { }
  }

  function phatAmThanhThanhCong() {
    try { playSuccessBeep(); } catch (e) { }
  }

  function phatAmThanhThanhCong3Lan() {
    try { playSuccessBeep(); } catch (e) { }

    setTimeout(() => {
      try { playSuccessBeep(); } catch (e) { }
    }, 180);

    setTimeout(() => {
      try { playSuccessBeep(); } catch (e) { }
    }, 360);
  }

  // ========================= 
  // HELPERS
  // =========================
  function byId(id) {
    return document.getElementById(id);
  }

  // ✅ helper an toàn
  function safeEl(id) {
    return document.getElementById(id) || null;
  }

  function safeSetStyle(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    fn(el);
  }

  function focusInputAtEnd(el) {
    if (!el) return;
    el.focus();

    try {
      const len = String(el.value || "").length;
      el.setSelectionRange(len, len);
    } catch (err) { }
  }

  function normalizeMasp(v) {
    let s = String(v || "").trim().toUpperCase();

    // Nếu mã có hậu tố sau dấu "_" như REDLEO-DEN_43
    // thì chỉ lấy phần trước dấu "_"
    const idx = s.indexOf("_");
    if (idx > -1) {
      s = s.slice(0, idx).trim();
    }

    return s;
  }

  function normalizeSize(v) {
    return String(v || "").trim();
  }
  const VALID_SIZES = new Set(["0", "38", "39", "40", "41", "42", "43", "44", "45"]);

  function isValidSize(size) {
    return VALID_SIZES.has(normalizeSize(size));
  }

  function makeKey(masp, size) {
    return `${normalizeMasp(masp)}@@${normalizeSize(size)}`;
  }

  function splitKey(key) {
    const [masp = "", size = ""] = String(key || "").split("@@");
    return {
      masp: normalizeMasp(masp),
      size: normalizeSize(size)
    };
  }

  function parseSizeSlText(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];

    const parts = raw
      .split(/\s+/)
      .map(x => x.trim())
      .filter(Boolean);

    const out = [];

    for (const part of parts) {
      const m = part.match(/^(.+?)\/(-?\d+(?:[.,]\d+)?)$/);
      if (!m) continue;

      const size = normalizeSize(m[1]);
      const sl = normalizeNumber(m[2]);

      if (!size) continue;
      if (!isValidSize(size)) continue;
      if (sl <= 0) continue;

      out.push({ size, sl });
    }

    return out;
  }

  function hasRealSizeItems(items) {
    return (items || []).some(x => {
      const size = normalizeSize(x.size);
      return size && size !== "0";
    });
  }

  function getAvailableSizesForMasp(masp) {
    masp = normalizeMasp(masp);
    if (!masp) return [];

    const state = getState();
    const sizeMap = new Map();

    Object.keys(state.xuat || {}).forEach((key) => {
      const row = state.xuat[key];
      if (!row) return;
      if (normalizeMasp(row.masp) !== masp) return;

      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);
      if (!size) return;

      sizeMap.set(size, {
        size,
        slXuat: sl,
        slNhap: 0
      });
    });

    Object.keys(state.nhap || {}).forEach((key) => {
      const row = state.nhap[key];
      if (!row) return;
      if (normalizeMasp(row.masp) !== masp) return;

      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);
      if (!size) return;

      if (!sizeMap.has(size)) {
        sizeMap.set(size, {
          size,
          slXuat: 0,
          slNhap: sl
        });
      } else {
        sizeMap.get(size).slNhap = sl;
      }
    });

    const arr = Array.from(sizeMap.values());
    arr.sort((a, b) => {
      const na = Number(a.size);
      const nb = Number(b.size);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size), "vi");
    });

    return arr;
  }

  function hideSizePopup() {
    const popup = byId("popup_size");
    if (!popup) return;
    popup.style.display = "none";
    popup.innerHTML = "";
  }

  async function themNhanhTheoSize(size, giuPopup = true) {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    const masp = normalizeMasp(maspEl?.value);
    const sizeVal = normalizeSize(size);
    const sl = normalizeNumber(slEl?.value || 1) || 1;

    if (!masp) return;
    if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

    if (!isValidSize(sizeVal)) {
      phatAmThanhLoi();
      alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
      return;
    }

    const key = makeKey(masp, sizeVal);
    const state = getState();

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = { masp, size: sizeVal, sl };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
    }

    delete state.ketQua[key];
    autoKiemTraSauNhap();

    if (!baoThanhCongNeuMaspDaOK(masp)) {
      phatAmThanhThanhCong();
    }

    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";

    if (giuPopup && sizeEl) {
      setTimeout(() => {
        sizeEl.focus();
        showSizePopup(masp, "");
      }, 0);
    }
  }

  async function themNhanhKhongCanSize() {
    const maspEl = byId("masp");
    const slEl = byId("soluong");

    const masp = normalizeMasp(maspEl?.value);
    const sl = normalizeNumber(slEl?.value || 1) || 1;

    if (!masp) return;
    if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) return;

    const key = makeKey(masp, "0");
    const state = getState();

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size: "0",
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
    }

    delete state.ketQua[key];
    autoKiemTraSauNhap();

    if (!baoThanhCongNeuMaspDaOK(masp)) {
      phatAmThanhThanhCong();
    }

    if (slEl) slEl.value = "1";

    if (maspEl) {
      maspEl.value = masp;
      maspEl.focus();

      setTimeout(() => {
        try {
          maspEl.select();
        } catch (err) { }
      }, 0);
    }

    hideSizePopup();
  }

  function showSizePopup(masp, keyword = "") {
    const popup = byId("popup_size");
    const sizeEl = byId("size");

    if (!popup || !sizeEl) return;

    const list = getAvailableSizesForMasp(masp);
    const kw = normalizeSize(keyword).toLowerCase();

    const filtered = list.filter(item =>
      !kw || String(item.size).toLowerCase().includes(kw)
    );

    if (!filtered.length) {
      hideSizePopup();
      return;
    }

    popup.innerHTML = "";

    filtered.forEach(item => {
      const row = document.createElement("div");
      row.style.padding = "6px 8px";
      row.style.borderBottom = "1px solid #eee";
      row.style.cursor = "pointer";
      row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <b>${escapeHtml(item.size)}</b>
        <span>X:${item.slXuat} | N:${item.slNhap}</span>
      </div>
    `;

      row.addEventListener("mouseenter", () => {
        row.style.background = "#f2f2f2";
      });

      row.addEventListener("mouseleave", () => {
        row.style.background = "#fff";
      });

      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // tránh blur làm popup tắt trước
      });

      row.addEventListener("click", () => {
        dangChonSizeTrongPopup = true;
        themNhanhTheoSize(item.size, true);

        setTimeout(() => {
          dangChonSizeTrongPopup = false;
        }, 0);
      });

      popup.appendChild(row);
    });

    popup.style.display = "block";
  }

  function splitKey(key) {
    const [masp = "", size = ""] = String(key || "").split("@@");
    return {
      masp: normalizeMasp(masp),
      size: normalizeSize(size)
    };
  }

  function normalizeNumber(v) {
    const raw = String(v ?? "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDateTimeVN(input) {
    if (!input) return "";

    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "";

    const vn = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

    const dd = String(vn.getDate()).padStart(2, "0");
    const mm = String(vn.getMonth() + 1).padStart(2, "0");
    const yyyy = vn.getFullYear();
    const hh = String(vn.getHours()).padStart(2, "0");
    const mi = String(vn.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy} ${hh}h${mi}`;
  }

  function formatDateTimeForKiemNhapKho(input) {
    if (!input) return "";

    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "";

    const vn = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

    const dd = String(vn.getDate()).padStart(2, "0");
    const mm = String(vn.getMonth() + 1).padStart(2, "0");
    const yyyy = vn.getFullYear();
    const hh = String(vn.getHours()).padStart(2, "0");
    const mi = String(vn.getMinutes()).padStart(2, "0");

    return `${dd}/${mm}/${yyyy} ${hh}h${mi}`;
  }

  function formatSohdNguonDayDuTheoMasp(xuatGroup) {
    const state = getState();
    const sohdSet = new Set();

    (xuatGroup?.items || []).forEach(item => {
      const rowKey = item.key;
      const rowXuat = state.xuat?.[rowKey];

      const ds = Array.isArray(rowXuat?.sohd_list) ? rowXuat.sohd_list : [];
      ds.forEach(sohd => {
        const s = String(sohd || "").trim();
        if (s) sohdSet.add(s);
      });
    });

    const dsInfo = Array.isArray(state.dsHoaDonNguonInfo) ? state.dsHoaDonNguonInfo : [];

    const lines = Array.from(sohdSet).map((sohd) => {
      const info = dsInfo.find(x => String(x?.sohd || "").trim() === sohd);

      const createdAtText = String(info?.created_at_text || "").trim();
      const ngayGio = createdAtText || formatDateTimeVN(info?.created_at || info?.ngay || "");
      const manv = String(info?.manv || "").trim();

      return [sohd, ngayGio, manv].filter(Boolean).join(" ");
    });

    return lines.join("\n");
  }

  function getState() {
    return window.kiemNhapState;
  }

  function getPlaceholderVitriInfo() {
    return {
      kho: "-",
      baymau: "-",
      text: "- / -"
    };
  }

  function chonThongTinVitriTheoCoSo(row) {
    const toBranch = String(CFG.toBranch || "").trim().toLowerCase();

    let kho = "";
    let baymau = "";

    if (toBranch === "cs1") {
      kho = String(row?.vitrikho1 || "").trim();
      baymau = String(row?.treomaucs1 || "").trim();
    } else {
      kho = String(row?.vitrikho2 || "").trim();
      baymau = String(row?.treomaucs2 || "").trim();
    }

    if (!kho) kho = "-";
    if (!baymau) baymau = "-";

    return {
      kho,
      baymau,
      text: `${kho} / ${baymau}`
    };
  }

  async function napThongTinViTriTheoMasp(masp) {
    const state = getState();
    const m = normalizeMasp(masp);

    if (!m) return getPlaceholderVitriInfo();

    if (state.vitriCache instanceof Map && state.vitriCache.has(m)) {
      return state.vitriCache.get(m);
    }

    if (state.vitriDangTai instanceof Set && state.vitriDangTai.has(m)) {
      return getPlaceholderVitriInfo();
    }

    if (!window.supabase) {
      return getPlaceholderVitriInfo();
    }

    state.vitriDangTai.add(m);

    try {
      const { data, error } = await window.supabase
        .from("dmhanghoa")
        .select("vitrikho1, vitrikho2, treomaucs1, treomaucs2")
        .eq("masp", m)
        .maybeSingle();

      if (error) {
        console.error("[KNK] Lỗi lấy vị trí theo mã:", m, error);
        const fallback = getPlaceholderVitriInfo();
        state.vitriCache.set(m, fallback);
        return fallback;
      }

      const info = chonThongTinVitriTheoCoSo(data || {});
      state.vitriCache.set(m, info);
      return info;
    } catch (err) {
      console.error("[KNK] Exception lấy vị trí theo mã:", m, err);
      const fallback = getPlaceholderVitriInfo();
      state.vitriCache.set(m, fallback);
      return fallback;
    } finally {
      state.vitriDangTai.delete(m);

      // tải xong thì render lại để dòng vị trí hiện ra
      setTimeout(() => {
        try {
          renderBangKetQua();
        } catch (e) {
          console.error("[KNK] renderBangKetQua sau khi nạp vị trí bị lỗi:", e);
        }
      }, 0);
    }
  }

  function layThongTinViTriTheoMaspTuCache(masp) {
    const state = getState();
    const m = normalizeMasp(masp);

    if (!m) return getPlaceholderVitriInfo();

    if (state.vitriCache instanceof Map && state.vitriCache.has(m)) {
      return state.vitriCache.get(m);
    }

    // chưa có cache thì chạy nền để lấy
    napThongTinViTriTheoMasp(m).catch(err => {
      console.error("[KNK] napThongTinViTriTheoMasp lỗi:", err);
    });

    return getPlaceholderVitriInfo();
  }

  async function kiemTraMaspTrongDanhMuc(masp) {
    const m = normalizeMasp(masp);
    if (!m) return false;

    const state = getState();

    if (state.dmMaspCache instanceof Map && state.dmMaspCache.has(m)) {
      return state.dmMaspCache.get(m) === true;
    }

    if (!window.supabase) {
      console.warn("[KNK] Không có Supabase để kiểm tra mã sản phẩm.");
      return false;
    }

    const { data, error } = await window.supabase
      .from("dmhanghoa")
      .select("masp")
      .eq("masp", m)
      .limit(1);

    if (error) {
      console.error("[KNK] kiemTraMaspTrongDanhMuc error:", error);
      throw error;
    }

    const ok = Array.isArray(data) && data.length > 0;

    if (state.dmMaspCache instanceof Map) {
      state.dmMaspCache.set(m, ok);
    }

    return ok;
  }

  async function baoLoiNeuMaspKhongCoTrongDanhMuc(masp) {
    const m = normalizeMasp(masp);
    if (!m) return true;

    try {
      const ok = await kiemTraMaspTrongDanhMuc(m);
      if (ok) return true;

      phatAmThanhLoi();
      alert(`Mã sản phẩm (${m}) không có trong danh mục hàng hóa, không được nhập.`);
      focusVaBoiDenOmaSanPham();
      return false;
    } catch (err) {
      phatAmThanhLoi();
      console.error("[KNK] Lỗi kiểm tra mã sản phẩm:", err);
      alert("Lỗi khi kiểm tra mã sản phẩm trong danh mục hàng hóa.");
      focusVaBoiDenOmaSanPham();
      return false;
    }
  }


  function phanTichTrangThaiKiemNhapKho(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return {
        daKiem: false,
        nhanvienkiem: "",
        noiDung: ""
      };
    }

    const upper = raw.toUpperCase();

    // Chỉ coi là đã kiểm khi nội dung bắt đầu bằng DK
    if (!upper.startsWith("DK")) {
      return {
        daKiem: false,
        nhanvienkiem: "",
        noiDung: raw
      };
    }

    // VD:
    // "DK kiemnhap1v2cs2_00012 2026-04-10 HOAN"
    // -> lấy phần cuối làm tên/mã nhân viên kiểm để hiển thị nếu có
    const parts = raw.split(/\s+/).filter(Boolean);
    const nhanvienkiem = parts.length >= 4 ? parts.slice(3).join(" ") : "";

    return {
      daKiem: true,
      nhanvienkiem,
      noiDung: raw
    };
  }

  function layInfoDaKiemTuHoaDon(hd) {
    const parsed = phanTichTrangThaiKiemNhapKho(hd?.kiem_nhapkho);

    return {
      daKiem: parsed.daKiem,
      nhanvienkiem: parsed.nhanvienkiem,
      noiDung: parsed.noiDung
    };
  }

  async function taoSoPhieuMoi() {
    const prefix = String(CFG.soPhieuPrefix || "kiemnhap2v1cs1_").trim();

    // Chờ Supabase sẵn sàng một lúc ngắn trước khi kết luận là chưa có
    for (let i = 0; i < 30; i++) {
      if (window.supabase) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!window.supabase) {
      console.warn("[KNK] Supabase chưa sẵn sàng khi tạo số phiếu mới.");
      return "";
    }

    const { data, error } = await window.supabase
      .from("kiem_nhap_kho")
      .select("so_hd_kiemnhap")
      .ilike("so_hd_kiemnhap", `${prefix}%`);

    if (error) {
      console.error("[KNK] taoSoPhieuMoi error:", error);
      return "";
    }

    let maxSo = 0;

    (data || []).forEach((row) => {
      const so = String(row.so_hd_kiemnhap || "").trim();
      if (!so.startsWith(prefix)) return;

      const tail = so.slice(prefix.length);
      const n = Number(tail);

      if (Number.isFinite(n) && n > maxSo) {
        maxSo = n;
      }
    });

    const next = String(maxSo + 1).padStart(5, "0");
    return `${prefix}${next}`;
  }

  function updateTitle() {
    document.title = CFG.title || document.title;
  }

  function setDefaultBranchInfo() {
    const diadiem = byId("diadiem");
    if (diadiem && !diadiem.value) diadiem.value = CFG.toBranch || "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    const ngay = byId("ngay");
    if (ngay && !ngay.value) {
      const d = new Date();
      ngay.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const gio = byId("gio");
    if (gio) {
      const tick = () => {
        const d = new Date();
        gio.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      tick();
      setInterval(tick, 1000 * 15);
    }
  }

  async function khoiTaoSoPhieuBanDau() {
    const sohdEl = byId("sohd");
    if (!sohdEl) return;

    // Nếu đang mở phiếu cũ thì không tự đè số phiếu
    const hdState = byId("hd_state");
    const isPhieuCu = String(hdState?.value || "").trim() === "xem";

    if (isPhieuCu) return;

    const soPhieuMoi = await taoSoPhieuMoi();
    if (soPhieuMoi) {
      sohdEl.value = soPhieuMoi;
    }
  }

  function laySoPhieuLienTruoc(sohdHienTai) {
    const raw = String(sohdHienTai || "").trim();
    if (!raw) return "";

    const m = raw.match(/^(.*?)(\d+)$/);
    if (!m) return raw;

    const prefix = m[1];
    const soText = m[2];
    const so = Number(soText);

    if (!Number.isFinite(so) || so <= 1) {
      return raw;
    }

    const soMoi = String(so - 1).padStart(soText.length, "0");
    return `${prefix}${soMoi}`;
  }

  function laySoPhieuLienSau(sohdHienTai) {
    const raw = String(sohdHienTai || "").trim();
    if (!raw) return "";

    const m = raw.match(/^(.*?)(\d+)$/);
    if (!m) return raw;

    const prefix = m[1];
    const soText = m[2];
    const so = Number(soText);

    if (!Number.isFinite(so)) return raw;

    const soMoi = String(so + 1).padStart(soText.length, "0");
    return `${prefix}${soMoi}`;
  }

  function ensureMaspAtTop(orderArr, masp) {
    const m = normalizeMasp(masp);
    if (!m) return Array.isArray(orderArr) ? orderArr : [];

    const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
    arr.unshift(m);
    return arr;
  }

  function ensureMaspAtEnd(orderArr, masp) {
    const m = normalizeMasp(masp);
    if (!m) return Array.isArray(orderArr) ? orderArr : [];

    const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
    arr.push(m);
    return arr;
  }

  function buildOrderedMasps(nhapGroupMap, xuatGroupMap, state) {
    const nhapOrder = Array.isArray(state.nhapOrder) ? state.nhapOrder.map(normalizeMasp).filter(Boolean) : [];
    const xuatOrder = Array.isArray(state.xuatOrder) ? state.xuatOrder.map(normalizeMasp).filter(Boolean) : [];

    const allSet = new Set([
      ...Object.keys(nhapGroupMap || {}),
      ...Object.keys(xuatGroupMap || {})
    ]);

    const result = [];
    const pushed = new Set();

    const pushOne = (masp) => {
      const m = normalizeMasp(masp);
      if (!m) return;
      if (!allSet.has(m)) return;
      if (pushed.has(m)) return;
      pushed.add(m);
      result.push(m);
    };

    nhapOrder.forEach(pushOne);
    xuatOrder.forEach(pushOne);

    Array.from(allSet).forEach(pushOne);

    return result;
  }


  function getSortWeightByTrangThai(trangthai) {
    const tt = String(trangthai || "").trim().toUpperCase();
    if (tt === "THIEU") return 1;

    if (tt === "LECH") return 2;

    if (tt === "THUA") return 3;
    if (tt === "OK") return 4;
    return 5;
  }

  function sapXepLaiThuTuMaspTheoKetQua() {
    const state = getState();
    const nhapGroupMap = groupByMasp(state.nhap || {});
    const xuatGroupMap = groupByMasp(state.xuat || {});
    const ketQuaMap = state.ketQua || {};

    const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

    // lấy mã sản phẩm đang nằm trong ô nhập
    const maspDangNhap = normalizeMasp(byId("masp")?.value || "");

    // tách mã đang nhập ra khỏi danh sách sort chung
    const dsConLai = allMasps.filter(m => normalizeMasp(m) !== maspDangNhap);

    dsConLai.sort((a, b) => {
      const kqA = buildKetQuaTheoMasp(nhapGroupMap[a], xuatGroupMap[a], ketQuaMap);
      const kqB = buildKetQuaTheoMasp(nhapGroupMap[b], xuatGroupMap[b], ketQuaMap);

      const wA = getSortWeightByTrangThai(kqA?.trangthai);
      const wB = getSortWeightByTrangThai(kqB?.trangthai);

      if (wA !== wB) return wA - wB;

      return String(a || "").localeCompare(String(b || ""), "vi");
    });

    // nếu mã đang nhập có tồn tại trong bảng thì ép nó lên đầu
    if (maspDangNhap && allMasps.includes(maspDangNhap)) {
      state.nhapOrder = [maspDangNhap, ...dsConLai];
    } else {
      state.nhapOrder = dsConLai;
    }
  }

  function tinhThongKeTheoMap(mapObj) {
    const maspSet = new Set();
    let tongSl = 0;

    Object.values(mapObj || {}).forEach((row) => {
      const masp = normalizeMasp(row?.masp);
      const sl = normalizeNumber(row?.sl || 0);

      if (!masp || sl <= 0) return;

      maspSet.add(masp);
      tongSl += sl;
    });

    return {
      soMa: maspSet.size,
      tongSl
    };
  }

  function capNhatThongKeDauTrang() {
    const el = byId("thongke_dautrang");
    if (!el) return;

    const state = getState();
    const tkNhap = tinhThongKeTheoMap(state.nhap || {});
    const tkXuat = tinhThongKeTheoMap(state.xuat || {});

    el.textContent = `Nhập: ${tkNhap.soMa}/${tkNhap.tongSl} , Xuất: ${tkXuat.soMa}/${tkXuat.tongSl}`;
  }

  function autoKiemTraSauNhap() {
    try {
      // Bước 1: render trước để dòng mới được đẩy xuống bảng
      renderBangKetQua();

      // Bước 2: sau đó mới kiểm tra lại
      kiemTraPhieu();
    } catch (err) {
      console.error("[KNK] autoKiemTraSauNhap error:", err);
      renderBangKetQua();
    }
  }

  function layTrangThaiTongTheoMasp(masp) {
    const m = normalizeMasp(masp);
    if (!m) return "";

    const state = getState();
    const nhapGroupMap = groupByMasp(state.nhap || {});
    const xuatGroupMap = groupByMasp(state.xuat || {});
    const ketQuaMap = state.ketQua || {};

    const kqTong = buildKetQuaTheoMasp(
      nhapGroupMap[m],
      xuatGroupMap[m],
      ketQuaMap
    );

    return String(kqTong?.trangthai || "").trim().toUpperCase();
  }

  function baoThanhCongNeuMaspDaOK(masp) {
    const trangThai = layTrangThaiTongTheoMasp(masp);
    if (trangThai === "OK") {
      phatAmThanhThanhCong3Lan();
      return true;
    }
    return false;
  }

  // =========================
  // RENDER
  // =========================
  function groupByMasp(mapObj) {
    const out = {};

    for (const key of Object.keys(mapObj || {})) {
      const row = mapObj[key];
      if (!row || !row.masp) continue;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!out[masp]) {
        out[masp] = {
          masp,
          items: []
        };
      }

      out[masp].items.push({
        key,
        size,
        sl
      });
    }

    // sắp xếp size tăng dần cho dễ nhìn
    Object.values(out).forEach(group => {
      group.items.sort((a, b) => {
        const na = Number(a.size);
        const nb = Number(b.size);

        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size), "vi");
      });
    });

    return out;
  }

  function formatSizeSl(items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items.map(x => `${x.size}/${x.sl}`).join("\n");
  }

  function tongSoLuong(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, x) => sum + normalizeNumber(x.sl), 0);
  }

  function formatSohdNguonTheoMasp(xuatGroup) {
    const sohdSet = new Set();

    (xuatGroup?.items || []).forEach(item => {
      const rowKey = item.key;
      const state = getState();
      const rowXuat = state.xuat?.[rowKey];

      const ds = Array.isArray(rowXuat?.sohd_list) ? rowXuat.sohd_list : [];
      ds.forEach(sohd => {
        const s = String(sohd || "").trim();
        if (s) sohdSet.add(s);
      });
    });

    return Array.from(sohdSet).join("\n");
  }

  function formatSohdNguonLuuTheoMasp(xuatGroup) {
    const state = getState();
    const sohdSet = new Set();

    (xuatGroup?.items || []).forEach(item => {
      const rowKey = item.key;
      const rowXuat = state.xuat?.[rowKey];

      const ds = Array.isArray(rowXuat?.sohd_list) ? rowXuat.sohd_list : [];
      ds.forEach(sohd => {
        const s = String(sohd || "").trim();
        if (s) sohdSet.add(s);
      });
    });

    const dsInfo = Array.isArray(state.dsHoaDonNguonInfo) ? state.dsHoaDonNguonInfo : [];

    const lines = Array.from(sohdSet).map((sohd) => {
      const info = dsInfo.find(x => String(x?.sohd || "").trim() === sohd);

      const ngayGio = formatDateTimeVN(info?.created_at || info?.ngay || "");
      const manv = String(info?.manv || "").trim();

      return [sohd, ngayGio, manv].filter(Boolean).join(" ");
    });

    return lines.join("\n");
  }

  function tachThongTinSohdXuatCn(text) {
    const raw = String(text || "").replace(/\r/g, "").trim();
    if (!raw) return [];

    return raw
      .split("\n")
      .map(line => String(line || "").trim())
      .filter(Boolean)
      .map(line => {
        const m = line.match(/^(\S+)(?:\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}h\d{2}))?(?:\s+(\S+))?$/);

        if (!m) {
          return {
            sohd: line,
            created_at_text: "",
            manv: ""
          };
        }

        return {
          sohd: String(m[1] || "").trim(),
          created_at_text: String(m[2] || "").trim(),
          manv: String(m[3] || "").trim()
        };
      });
  }

  function ganSohdXuatCnChoStateXuat(masp, sohdXuatCnText, state) {
    const dsInfo = tachThongTinSohdXuatCn(sohdXuatCnText);
    if (!dsInfo.length) return;

    const dsSohd = dsInfo
      .map(x => String(x.sohd || "").trim())
      .filter(Boolean);

    if (!dsSohd.length) return;

    Object.keys(state.xuat || {}).forEach((key) => {
      const row = state.xuat[key];
      if (!row) return;
      if (normalizeMasp(row.masp) !== normalizeMasp(masp)) return;

      row.sohd_list = [...dsSohd];
    });

    if (!Array.isArray(state.dsHoaDonNguonInfo)) {
      state.dsHoaDonNguonInfo = [];
    }

    dsInfo.forEach((item) => {
      const sohd = String(item.sohd || "").trim();
      if (!sohd) return;

      const daCo = state.dsHoaDonNguonInfo.some(
        x => String(x?.sohd || "").trim() === sohd
      );

      if (!daCo) {
        state.dsHoaDonNguonInfo.push({
          sohd,
          ngay: null,
          created_at: null,
          created_at_text: String(item.created_at_text || "").trim(),
          diadiem: "",
          manv: String(item.manv || "").trim(),
          tennv: ""
        });
      }
    });

    const dsNguonMoi = dsInfo
      .map(x => String(x.sohd || "").trim())
      .filter(Boolean);

    state.dsHoaDonNguon = Array.from(
      new Set([...(state.dsHoaDonNguon || []), ...dsNguonMoi])
    );
  }

  function buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap) {
    const masp = normalizeMasp(nhapGroup?.masp || xuatGroup?.masp || "");

    const allSizeKeys = new Set([
      ...((nhapGroup?.items || []).map(x => x.key)),
      ...((xuatGroup?.items || []).map(x => x.key))
    ]);

    const thieuParts = [];
    const thuaParts = [];
    let tongThieu = 0;
    let tongThua = 0;
    let hasOk = false;
    let hasAnyKetQua = false;

    for (const key of allSizeKeys) {
      const kq = ketQuaMap[key];
      if (!kq) continue;

      hasAnyKetQua = true;

      const { size } = splitKey(key);
      const diff = normalizeNumber(kq.chitiet || 0);

      if (kq.trangthai === "THIEU") {
        tongThieu += diff;
        thieuParts.push(`${size}/${diff}`);
      } else if (kq.trangthai === "THUA") {
        tongThua += diff;
        thuaParts.push(`${size}/${diff}`);
      } else if (kq.trangthai === "OK") {
        hasOk = true;
      }
    }

    // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
    // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
    if (!hasAnyKetQua && masp) {
      const keyTong = makeKey(masp, "0");
      const kqTong = ketQuaMap[keyTong];

      if (kqTong) {
        const diff = normalizeNumber(kqTong.chitiet || 0);
        const tongNhap = tongSoLuong(nhapGroup?.items || []);
        const xuatItems = Array.isArray(xuatGroup?.items) ? xuatGroup.items : [];

        if (kqTong.trangthai === "THIEU") {
          // Nếu bên nhập trống hoàn toàn thì hiện chi tiết đúng theo toàn bộ size/sl của bên xuất
          if (tongNhap <= 0 && xuatItems.length > 0) {
            return {
              trangthai: "THIEU",
              chitiet: xuatItems.map(x => `${x.size}/${x.sl}`).join(" ")
            };
          }

          return {
            trangthai: "THIEU",
            chitiet: diff > 0 ? `0/${diff}` : ""
          };
        }

        if (kqTong.trangthai === "THUA") {
          return {
            trangthai: "THUA",
            chitiet: diff > 0 ? `0/${diff}` : ""
          };
        }

        if (kqTong.trangthai === "OK") {
          return { trangthai: "OK", chitiet: "" };
        }
      }
    }

    if (tongThieu > 0 && tongThua === 0) {
      return {
        trangthai: "THIEU",
        chitiet: thieuParts.join(" ")
      };
    }

    if (tongThua > 0 && tongThieu === 0) {
      return {
        trangthai: "THUA",
        chitiet: thuaParts.join(" ")
      };
    }

    if (tongThieu === 0 && tongThua === 0 && hasOk) {
      return { trangthai: "OK", chitiet: "" };
    }

    if (tongThieu > 0 && tongThua > 0) {
      return {
        trangthai: "LECH",
        chitiet: `Thiếu: ${thieuParts.join(" ")} | Thừa: ${thuaParts.join(" ")}`
      };
    }

    return { trangthai: "", chitiet: "" };
  }

  function renderBangKetQua() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};
    const taoHdCcnByMasp = state.taoHdCcnByMasp || {};

    const nhapGroupMap = groupByMasp(nhapMap);
    const xuatGroupMap = groupByMasp(xuatMap);

    const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

    tbody.innerHTML = "";

    for (const masp of allMasps) {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);
      const sohdNguonText = formatSohdNguonDayDuTheoMasp(xuatGroup);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);
      const taoHdCcnText = String(taoHdCcnByMasp[masp] || "").trim();

      const vitriInfo = layThongTinViTriTheoMaspTuCache(masp);
      const vitriText = String(vitriInfo?.text || "- / -").trim() || "- / -";

      const tr = document.createElement("tr");
      const selectedMasp = normalizeMasp(state.selectedMasp || "");
      const trangThaiTong = String(kqTong.trangthai || "").trim().toUpperCase();

      tr.dataset.masp = masp;
      tr.dataset.trangthai = trangThaiTong;

      if (selectedMasp && selectedMasp === masp) {
        tr.classList.add("row-selected");
      }

      // Tô màu theo kết quả kiểm
      if (trangThaiTong === "THUA" || trangThaiTong === "THIEU" || trangThaiTong === "LECH") {
        tr.style.background = "#e8f5e9"; // xanh nhạt
      } else if (trangThaiTong === "OK") {
        tr.style.background = "#ffffff"; // trắng
      } else {
        tr.style.background = "#ffffff"; // mặc định vẫn trắng
      }

      tr.innerHTML = `
  <td class="cell-masp-click" data-masp="${escapeHtml(masp)}"
    style="cursor:pointer; color:#0b57d0; font-weight:400; text-decoration:none; padding-top:4px; padding-bottom:4px;">
    <div style="line-height:1.05; margin:0; padding:0; font-weight:400; text-decoration:none;">
      ${escapeHtml(masp)}
    </div>
    <div style="line-height:1.05; margin:0; padding:0; color:#d32f2f; font-weight:400; text-decoration:none;">
      ${escapeHtml(vitriText)}
    </div>
  </td>

  <td contenteditable="true"
      class="cell-nhap-sizesl"
      data-masp="${escapeHtml(masp)}"
      style="white-space: pre-line; text-align:left;">${escapeHtml(nhapText)}</td>

  <td contenteditable="true"
      class="cell-nhap-tongsl"
      data-masp="${escapeHtml(masp)}">${tongSoLuong(nhapGroup?.items || []) || ""}</td>

  <td class="cell-masp-click" data-masp="${escapeHtml(masp)}"
    style="cursor:pointer; color:#0b57d0; font-weight:400; text-decoration:none; padding-top:4px; padding-bottom:4px;">
    <div style="line-height:1.05; margin:0; padding:0; font-weight:400; text-decoration:none;">
      ${escapeHtml(masp)}
    </div>
  </td>

  <td style="white-space: pre-line; text-align:left;">${escapeHtml(xuatText)}</td>
  <td>${tongSoLuong(xuatGroup?.items || []) || ""}</td>

  <td>${escapeHtml(kqTong.trangthai || "")}</td>
  <td style="white-space: pre-line; text-align:left;">${escapeHtml(kqTong.chitiet || "")}</td>
  <td style="white-space: pre-line; text-align:left;">${escapeHtml(sohdNguonText || "")}</td>
  <td style="white-space: pre-line; text-align:left; color:#7b1fa2; font-weight:600;">
    ${escapeHtml(taoHdCcnText || "")}
  </td>
`;

      tbody.appendChild(tr);
    }

    tbody.querySelectorAll(".cell-masp-click").forEach((el) => {
      const masp = String(el.dataset.masp || "").trim().toUpperCase();
      if (!masp) return;

      if (window.StockQuick && typeof window.StockQuick.attach === "function") {
        window.StockQuick.attach(el, masp);
      }
    });

    tbody.querySelectorAll(".cell-nhap-sizesl, .cell-nhap-tongsl").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      el.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
    });

    capNhatThongKeDauTrang();
  }

  function docLaiNhapTuBangHTML() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const nhapMoi = {};
    const nhapOrderMoi = [];

    rows.forEach((tr) => {
      const tdMasp = tr.children[0];
      const tdSizeSl = tr.querySelector(".cell-nhap-sizesl");
      const tdTongSl = tr.querySelector(".cell-nhap-tongsl");

      const masp = normalizeMasp(tdMasp?.dataset?.masp || "");
      if (!masp) return;

      if (!nhapOrderMoi.includes(masp)) {
        nhapOrderMoi.push(masp);
      }

      const sizeSlText = String(tdSizeSl?.innerText || "").trim();
      const tongSlText = String(tdTongSl?.innerText || "").trim();

      const items = parseSizeSlText(sizeSlText);
      const tongSl = normalizeNumber(tongSlText);

      // Có size thật => ưu tiên kiểm chi tiết
      if (hasRealSizeItems(items)) {
        items.forEach((item) => {
          const key = makeKey(masp, item.size);
          nhapMoi[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
        return;
      }

      // Không có size thật nhưng có tổng => kiểm tổng bằng size 0
      if (tongSl > 0) {
        const key = makeKey(masp, "0");
        nhapMoi[key] = {
          masp,
          size: "0",
          sl: tongSl
        };
      }
    });

    state.nhap = nhapMoi;
    state.nhapOrder = nhapOrderMoi;
  }

  // Expose để HTML cũ không lỗi nếu còn gọi
  window.renderBangKetQua = renderBangKetQua;
  window.capNhatTongTien = function () { return; };

  // =========================
  // NHẬP BÊN TRÁI
  // =========================
  async function themDongNhapBenTrai() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (!maspEl || !slEl) return;

    const masp = normalizeMasp(maspEl.value);
    const size = normalizeSize(sizeEl?.value);
    const sl = normalizeNumber(slEl.value || 1);

    if (!masp) {
      phatAmThanhLoi();
      alert("Vui lòng nhập mã sản phẩm.");
      maspEl.focus();
      return;
    }

    if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) {
      return;
    }

    if (!size) {
      if (sizeEl) {
        sizeEl.focus();
        sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      }
      return;
    }

    if (!isValidSize(size)) {
      phatAmThanhLoi();
      alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
      if (sizeEl) sizeEl.focus();
      return;
    }

    if (sl <= 0) {
      alert("Số lượng phải lớn hơn 0.");
      slEl.focus();
      return;
    }

    const key = makeKey(masp, size);
    const state = getState();

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size,
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
    }

    delete state.ketQua[key];
    autoKiemTraSauNhap();
    if (!baoThanhCongNeuMaspDaOK(masp)) {
      phatAmThanhThanhCong();
    }

    if (sizeEl) sizeEl.value = "";

    slEl.value = "1";

    if (sizeEl) {
      sizeEl.focus();
      sizeEl.dispatchEvent(new Event("focus", { bubbles: true }));
      sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    } else {
      maspEl.focus();
    }
  }

  async function chuyenSizeSaiThanhMaSanPhamMoi(rawValue) {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    const maspMoi = normalizeMasp(rawValue);
    if (!maspMoi || !maspEl) return false;

    // Đưa dữ liệu size sai sang ô mã sản phẩm
    maspEl.value = maspMoi;

    // Xóa ô size cũ để chuẩn bị nhập size cho mã mới
    if (sizeEl) sizeEl.value = "";

    if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(maspMoi))) {
      return true;
    }
    const chkNhapNhanh = byId("chkNhapNhanh");
    const isNhapNhanh = !!chkNhapNhanh?.checked;

    if (isNhapNhanh) {
      await themNhanhKhongCanSize();
      return true;
    }

    if (slEl && !normalizeNumber(slEl.value)) {
      slEl.value = "1";
    }

    if (sizeEl) {
      sizeEl.focus();
      sizeEl.value = "";
      showSizePopup(maspMoi, "");
      phatAmThanhSize();
    }

    return true;
  }

  function bindInputEvents() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (maspEl) {
      maspEl.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const masp = normalizeMasp(maspEl.value);
          if (!masp) {
            phatAmThanhLoi();
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl.focus();
            return;
          }

          maspEl.value = masp;

          if (!(await baoLoiNeuMaspKhongCoTrongDanhMuc(masp))) {
            return;
          }

          const chkNhapNhanh = byId("chkNhapNhanh");
          const isNhapNhanh = !!chkNhapNhanh?.checked;

          if (isNhapNhanh) {
            await themNhanhKhongCanSize();
            return;
          }

          if (slEl && !normalizeNumber(slEl.value)) {
            slEl.value = "1";
          }

          if (sizeEl) {
            sizeEl.focus();
            sizeEl.value = "";
            showSizePopup(masp, "");
            phatAmThanhSize();
          }
        }
      });

      maspEl.addEventListener("blur", () => {
        maspEl.value = normalizeMasp(maspEl.value);
      });
    }

    if (sizeEl) {
      sizeEl.addEventListener("focus", () => {
        const masp = normalizeMasp(maspEl?.value);
        if (!masp) return;
        showSizePopup(masp, sizeEl.value);
      });

      sizeEl.addEventListener("input", () => {
        const masp = normalizeMasp(maspEl?.value);
        if (!masp) return;
        showSizePopup(masp, sizeEl.value);
      });

      sizeEl.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const masp = normalizeMasp(maspEl?.value);
          if (!masp) {
            phatAmThanhLoi();
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl?.focus();
            return;
          }

          const typedSize = normalizeSize(sizeEl.value);

          if (!typedSize) {
            showSizePopup(masp, "");
            return;
          }

          // Nếu size không hợp lệ thì hiểu là người dùng đang nhập mã sản phẩm mới
          if (!isValidSize(typedSize)) {
            await chuyenSizeSaiThanhMaSanPhamMoi(typedSize);
            return;
          }

          await themNhanhTheoSize(typedSize);
        }

        if (e.key === "Escape") {
          hideSizePopup();
          maspEl?.focus();
        }
      });
    }

    if (slEl) {
      slEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const masp = normalizeMasp(maspEl?.value);
          if (!masp) {
            phatAmThanhLoi();
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl?.focus();
            return;
          }

          if (sizeEl) {
            sizeEl.focus();
            showSizePopup(masp, sizeEl.value);
          }
        }
      });
    }

    document.addEventListener("click", (e) => {
      const popup = byId("popup_size");
      if (!popup) return;

      if (dangChonSizeTrongPopup) return;
      if (e.target === sizeEl || e.target === maspEl || popup.contains(e.target)) return;

      hideSizePopup();
    });

    const sohdEl = byId("sohd");
    if (sohdEl) {
      sohdEl.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const sohdNhap = String(sohdEl.value || "").trim();
          if (!sohdNhap) return;

          sohdEl.value = sohdNhap;
          await moLaiPhieuKiemNhapCu(sohdNhap);
        }
      });
    }

  }

  // =========================
  // RESET PHIẾU
  // =========================
  async function resetPhieu() {
    const oldState = getState();

    window.kiemNhapState = {
      nhap: {},
      xuat: {},
      ketQua: {},
      nhapOrder: [],
      xuatOrder: [],
      dsHoaDonNguon: [],
      dsHoaDonNguonInfo: [],
      taoHdCcnByMasp: {},
      selectedMasp: "",
      dmMaspCache: oldState?.dmMaspCache instanceof Map ? oldState.dmMaspCache : new Map(),

      // NEW: phải tạo lại khi reset phiếu
      vitriCache: new Map(),
      vitriDangTai: new Set()
    };

    dangChonSizeTrongPopup = false;

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");
    const sohdEl = byId("sohd");
    const ghichuEl = byId("ghichu_top");

    if (maspEl) maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";
    if (sohdEl) {
      const soPhieuMoi = await taoSoPhieuMoi();
      sohdEl.value = soPhieuMoi || "";
    }
    if (ghichuEl) ghichuEl.value = "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    renderBangKetQua();
    capNhatThongKeDauTrang();
    hideSizePopup();
    if (maspEl) maspEl.focus();
  }

  // =========================
  // KIỂM TRA
  // Bản đầu: so tổng SL theo mã
  // =========================
  function kiemTraPhieu() {
    // luôn đọc lại dữ liệu người dùng vừa sửa trực tiếp trên bảng
    docLaiNhapTuBangHTML();

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQua = {};

    // Gom xuat theo mã để dùng cho chế độ kiểm tổng
    const xuatTheoMasp = {};
    Object.keys(xuatMap).forEach((key) => {
      const row = xuatMap[key];
      if (!row) return;
      const masp = normalizeMasp(row.masp);
      const sl = normalizeNumber(row.sl);
      xuatTheoMasp[masp] = (xuatTheoMasp[masp] || 0) + sl;
    });

    // Gom nhap theo mã để biết mã nào đang ở chế độ tổng
    const nhapTheoMasp = {};
    Object.keys(nhapMap).forEach((key) => {
      const row = nhapMap[key];
      if (!row) return;
      const masp = normalizeMasp(row.masp);
      if (!nhapTheoMasp[masp]) nhapTheoMasp[masp] = [];
      nhapTheoMasp[masp].push(row);
    });

    const allMasps = new Set([
      ...Object.keys(nhapTheoMasp),
      ...Object.keys(xuatTheoMasp),
      ...Object.values(xuatMap).map(r => normalizeMasp(r.masp))
    ]);

    for (const masp of allMasps) {
      const nhapRows = nhapTheoMasp[masp] || [];
      const hasRealSize = nhapRows.some(r => normalizeSize(r.size) !== "0" && normalizeSize(r.size) !== "");

      // CHẾ ĐỘ 1: kiểm chi tiết theo size
      if (hasRealSize) {
        const xuatKeys = Object.keys(xuatMap).filter(k => normalizeMasp(xuatMap[k]?.masp) === masp);
        const nhapKeys = Object.keys(nhapMap).filter(k => normalizeMasp(nhapMap[k]?.masp) === masp);

        const allKeys = new Set([...xuatKeys, ...nhapKeys]);

        for (const key of allKeys) {
          const nhap = nhapMap[key];
          const xuat = xuatMap[key];

          const slNhap = normalizeNumber(nhap?.sl || 0);
          const slXuat = normalizeNumber(xuat?.sl || 0);

          if (slNhap === slXuat) {
            ketQua[key] = { trangthai: "OK", chitiet: "" };
          } else if (slNhap < slXuat) {
            ketQua[key] = { trangthai: "THIEU", chitiet: String(slXuat - slNhap) };
          } else {
            ketQua[key] = { trangthai: "THUA", chitiet: String(slNhap - slXuat) };
          }
        }

        continue;
      }

      // CHẾ ĐỘ 2: kiểm tổng
      const tongNhap = nhapRows.reduce((sum, r) => sum + normalizeNumber(r.sl), 0);
      const tongXuat = xuatTheoMasp[masp] || 0;

      const keyTong = makeKey(masp, "0");

      if (tongNhap === tongXuat) {
        ketQua[keyTong] = { trangthai: "OK", chitiet: "" };
      } else if (tongNhap < tongXuat) {
        ketQua[keyTong] = { trangthai: "THIEU", chitiet: String(tongXuat - tongNhap) };
      } else {
        ketQua[keyTong] = { trangthai: "THUA", chitiet: String(tongNhap - tongXuat) };
      }
    }

    state.ketQua = ketQua;
    sapXepLaiThuTuMaspTheoKetQua();
    renderBangKetQua();
  }

  // =========================
  // NẠP HÓA ĐƠN NGUỒN
  // Bản đầu: chưa query thật, chỉ placeholder
  // =========================

  async function moPopupChonHoaDonNguon(dsHd) {
    return new Promise((resolve) => {
      const popup = byId("popupChonHoaDonNguon");
      const box = byId("dsHoaDonNguonPopup");
      const btnDong = byId("btnDongPopupHoaDonNguon");
      const btnOk = byId("btnXacNhanHoaDonNguon");

      if (!popup || !box || !btnDong || !btnOk) {
        resolve(null);
        return;
      }

      box.innerHTML = "";

      dsHd.forEach((hd) => {
        const sohd = String(hd.sohd || "").trim();
        const diadiem = String(hd.diadiem || "").trim();
        const ngayGio = formatDateTimeVN(hd.created_at || hd.ngay);

        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "6px 4px";
        row.style.borderBottom = "1px solid #eee";
        row.style.cursor = "pointer";

        const infoDaKiem = layInfoDaKiemTuHoaDon(hd);
        const daKiem = !!infoDaKiem.daKiem;
        const tenNguoiKiem = String(infoDaKiem?.nhanvienkiem || "").trim();

        const checked = daKiem ? "" : "checked";

        row.innerHTML = `
  <input type="checkbox" class="chk-hd-nguon" value="${escapeHtml(sohd)}" ${checked}>
  <span>
    ${escapeHtml(sohd)} | ${escapeHtml(ngayGio)} | ${escapeHtml(diadiem)}
    ${daKiem ? `<b style="color:red; margin-left:8px;">[ĐÃ KIỂM]</b>` : `<b style="color:green; margin-left:8px;">[CHƯA KIỂM]</b>`}
    ${daKiem && tenNguoiKiem ? ` | <b style="color:#333;">${escapeHtml(tenNguoiKiem)}</b>` : ""}
  </span>
`;

        if (daKiem) {
          row.style.background = "#fff3cd";
        }

        box.appendChild(row);
      });

      popup.style.display = "block";

      const closePopup = (result) => {
        popup.style.display = "none";
        btnDong.onclick = null;
        btnOk.onclick = null;
        resolve(result);
      };

      btnDong.onclick = () => closePopup(null);

      btnOk.onclick = () => {
        const checked = Array.from(
          box.querySelectorAll(".chk-hd-nguon:checked")
        ).map(x => x.value);

        if (!checked.length) {
          alert("Vui lòng chọn ít nhất 1 hóa đơn.");
          return;
        }

        closePopup(checked);
      };
    });
  }

  function layDanhSachMaspDangNhap() {
    const state = getState();
    const ds = Object.values(state.nhap || {})
      .map(r => normalizeMasp(r.masp))
      .filter(Boolean);

    return [...new Set(ds)];
  }

  function laySetHoaDonNguonCuaPhieuDangXem() {
    const state = getState();

    // Ưu tiên lấy từ state khi đã mở phiếu cũ
    const dsState = Array.isArray(state?.dsHoaDonNguon)
      ? state.dsHoaDonNguon
      : [];

    // Fallback thêm từ ô ghi chú trên form
    const ghichuText = String(byId("ghichu_top")?.value || "").trim();
    const dsText = ghichuText
      ? ghichuText
        .split(";")
        .map(x => String(x || "").trim())
        .filter(Boolean)
      : [];

    const ds = [...dsState, ...dsText]
      .map(x => String(x || "").trim())
      .filter(Boolean);

    return new Set(ds);
  }

  function focusVaBoiDenOmaSanPham() {
    const maspEl = byId("masp");
    if (!maspEl) return;

    maspEl.focus();
    setTimeout(() => {
      try {
        maspEl.select();
      } catch (err) { }
    }, 0);
  }

  function batDauNgay(dateObj) {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function truNgay(dateObj, soNgay) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() - soNgay);
    return d;
  }

  function toIsoLocal(dateObj) {
    const d = new Date(dateObj);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }


  function layKhoangNgayHoaDonNguonMacDinh() {
    const now = new Date();

    // hôm nay (end)
    const end = new Date(now);

    // hôm kia (start = today - 2 ngày)
    const start = new Date(now);
    start.setDate(start.getDate() - 5);
    start.setHours(0, 0, 0, 0);

    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  async function layHoaDonNguonUngVienTheoMasp(dsMaspNhap) {
    if (!window.supabase || !Array.isArray(dsMaspNhap) || !dsMaspNhap.length) {
      return { dsHd: [], ctRows: [] };
    }

    const prefixNguon = CFG.fromBranch === "cs2" ? "xcncs2_" : "xcncs1_";
    const { start, end } = layKhoangNgayHoaDonNguonMacDinh(1);

    // Lấy cả hóa đơn CHƯA KIỂM và ĐÃ KIỂM
    const { data: dsHd, error: errHd } = await window.supabase
      .from("hoadon_banle")
      .select("sohd, ngay, created_at, diadiem, tennv, manv, kiem_nhapkho")
      .ilike("sohd", `${prefixNguon}%`)
      .gte("created_at", toIsoLocal(start))
      .lte("created_at", toIsoLocal(end))
      .order("created_at", { ascending: false })
      .limit(300);

    if (errHd) {
      console.error("[KNK] layHoaDonNguonUngVienTheoMasp - dsHd error:", errHd);
      throw new Error("Lỗi khi lấy danh sách hóa đơn nguồn.");
    }

    if (!dsHd || !dsHd.length) {
      return { dsHd: [], ctRows: [] };
    }

    const dsSoHd = dsHd
      .map(x => String(x.sohd || "").trim())
      .filter(Boolean);

    if (!dsSoHd.length) {
      return { dsHd: [], ctRows: [] };
    }

    const { data: ctRows, error: errCt } = await window.supabase
      .from("ct_hoadon_banle")
      .select("sohd, masp, size, soluong")
      .in("sohd", dsSoHd)
      .order("id", { ascending: true });

    if (errCt) {
      console.error("[KNK] layHoaDonNguonUngVienTheoMasp - ctRows error:", errCt);
      throw new Error("Lỗi khi lấy chi tiết hóa đơn nguồn.");
    }

    return {
      dsHd: dsHd || [],
      ctRows: ctRows || []
    };
  }

  function tinhDeXuatHoaDonTheoMasp(dsHd, ctRows, dsMaspNhap) {
    const setNhap = new Set((dsMaspNhap || []).map(normalizeMasp).filter(Boolean));
    const nhomCtTheoSoHd = {};

    (ctRows || []).forEach((row) => {
      const sohd = String(row.sohd || "").trim();
      if (!sohd) return;
      if (!nhomCtTheoSoHd[sohd]) nhomCtTheoSoHd[sohd] = [];
      nhomCtTheoSoHd[sohd].push(row);
    });

    const ketQua = [];
    const hdState = String(byId("hd_state")?.value || "").trim().toLowerCase();
    const dangMoPhieuCuHoacSua = (hdState === "xem" || hdState === "sua");
    const setHoaDonNguonCuaPhieuDangXem = laySetHoaDonNguonCuaPhieuDangXem();

    (dsHd || []).forEach((hd) => {
      const sohd = String(hd.sohd || "").trim();
      if (!sohd) return;

      const infoDaKiem = layInfoDaKiemTuHoaDon(hd);
      const daKiem = !!infoDaKiem.daKiem;

      const rows = nhomCtTheoSoHd[sohd] || [];
      if (!rows.length) return;

      const maspTrongHoaDon = [...new Set(
        rows.map(r => normalizeMasp(r.masp)).filter(Boolean)
      )];

      const dsMaspTrung = maspTrongHoaDon.filter(masp => setNhap.has(masp));
      const soMaTrung = dsMaspTrung.length;
      if (soMaTrung <= 0) return;

      const tongMaNhap = setNhap.size || 1;
      const tongMaHoaDon = maspTrongHoaDon.length || 1;

      const tyLeTheoNhap = soMaTrung / tongMaNhap;
      const tyLeTheoHoaDon = soMaTrung / tongMaHoaDon;

      const createdAt = hd.created_at || hd.ngay || null;
      let diemThoiGian = 0;
      if (createdAt) {
        const t = new Date(createdAt).getTime();
        if (Number.isFinite(t)) {
          const ageHours = Math.max(0, (Date.now() - t) / 3600000);
          diemThoiGian = Math.max(0, 10 - Math.min(10, ageHours / 3));
        }
      }

      const score =
        soMaTrung * 10 +
        tyLeTheoNhap * 40 +
        tyLeTheoHoaDon * 40 +
        diemThoiGian;

      const dieuKienTrungCao =
        soMaTrung >= 2 ||
        tyLeTheoNhap >= 0.3 ||
        tyLeTheoHoaDon >= 0.5;

      const namTrongPhieuDangXem = setHoaDonNguonCuaPhieuDangXem.has(sohd);

      const autoChecked =
        dieuKienTrungCao &&
        (
          // Hóa đơn chưa kiểm: vẫn auto tick như logic cũ
          !daKiem ||

          // Hóa đơn đã kiểm: chỉ auto tick nếu
          // đang mở phiếu cũ/sửa/xem
          // và chính hóa đơn đó đã thuộc phiếu đang xem
          (daKiem && dangMoPhieuCuHoacSua && namTrongPhieuDangXem)
        );

      ketQua.push({
        sohd,
        ngay: hd.ngay || null,
        created_at: hd.created_at || null,
        diadiem: String(hd.diadiem || "").trim(),
        manv: String(hd.manv || "").trim(),
        tennv: String(hd.tennv || "").trim(),
        soMaTrung,
        tongMaNhap,
        tongMaHoaDon,
        tyLeTheoNhap,
        tyLeTheoHoaDon,
        score,
        dsMaspTrung,
        daKiem,
        infoDaKiem,
        namTrongPhieuDangXem,
        autoChecked
      });
    });

    ketQua.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    return ketQua;
  }

  async function moPopupChonHoaDonNguonTheoMasp(dsDeXuat) {
    return new Promise((resolve) => {
      const popup = byId("popupChonHoaDonNguon");
      const box = byId("dsHoaDonNguonPopup");
      const btnDong = byId("btnDongPopupHoaDonNguon");
      const btnOk = byId("btnXacNhanHoaDonNguon");

      if (!popup || !box || !btnDong || !btnOk) {
        resolve(null);
        return;
      }

      box.innerHTML = "";

      if (!dsDeXuat || !dsDeXuat.length) {
        box.innerHTML = `<div style="padding:10px; color:#b00020; font-weight:bold;">
          Không tìm thấy hóa đơn CCN phù hợp theo các mã sản phẩm đã nhập.
        </div>`;
      } else {
        dsDeXuat.forEach((hd) => {
          const row = document.createElement("label");
          row.style.display = "block";
          row.style.padding = "8px";
          row.style.borderBottom = "1px solid #eee";
          row.style.cursor = "pointer";

          const ngayGio = formatDateTimeVN(hd.created_at || hd.ngay);
          const dsMau = (hd.dsMaspTrung || []).slice(0, 6).join(", ");
          const checked = hd.autoChecked ? "checked" : "";
          const daKiem = !!hd.daKiem;
          const tenNguoiKiem = String(hd.infoDaKiem?.nhanvienkiem || "").trim();

          row.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <input type="checkbox" class="chk-hd-nguon-theo-masp" value="${escapeHtml(hd.sohd)}" ${checked}>
              <div style="flex:1;">
                <div style="font-weight:bold; color:#003366;">
                  ${escapeHtml(hd.sohd)}
                  ${daKiem
              ? `<b style="color:red; margin-left:8px;">[ĐÃ KIỂM]</b>`
              : `<b style="color:green; margin-left:8px;">[CHƯA KIỂM]</b>`}
                  ${daKiem && tenNguoiKiem
              ? ` | <b style="color:#333;">${escapeHtml(tenNguoiKiem)}</b>`
              : ""}
                </div>
                <div style="font-size:13px; color:#333; margin-top:2px;">
                  ${escapeHtml(ngayGio)} | ${escapeHtml(hd.diadiem || "")}
                </div>
                <div style="font-size:13px; margin-top:3px;">
                  Trùng: <b style="color:#c62828;">${hd.soMaTrung}</b> mã
                  | Theo nhập: <b>${Math.round((hd.tyLeTheoNhap || 0) * 100)}%</b>
                  | Theo HĐ: <b>${Math.round((hd.tyLeTheoHoaDon || 0) * 100)}%</b>
                  | Điểm: <b>${Number(hd.score || 0).toFixed(1)}</b>
                </div>
                <div style="font-size:12px; color:#555; margin-top:3px;">
                  Mã trùng: ${escapeHtml(dsMau || "(không có)")}
                </div>
              </div>
            </div>
          `;

          if (daKiem) {
            row.style.background = "#fff3cd";
          } else if (hd.autoChecked) {
            row.style.background = "#eef8ee";
          }

          box.appendChild(row);
        });
      }

      popup.style.display = "block";

      const closePopup = (result) => {
        popup.style.display = "none";
        btnDong.onclick = null;
        btnOk.onclick = null;
        resolve(result);
      };

      btnDong.onclick = () => closePopup(null);

      btnOk.onclick = () => {
        const checked = Array.from(
          box.querySelectorAll(".chk-hd-nguon-theo-masp:checked")
        ).map(x => String(x.value || "").trim()).filter(Boolean);

        if (!checked.length) {
          alert("Vui lòng chọn ít nhất 1 hóa đơn.");
          return;
        }

        closePopup(checked);
      };
    });
  }

  async function napHoaDonNguonTheoMasp() {
    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      // đảm bảo state.nhap đang là dữ liệu mới nhất trên bảng
      if (typeof docLaiNhapTuBangHTML === "function") {
        docLaiNhapTuBangHTML();
      }

      const dsMaspNhap = layDanhSachMaspDangNhap();

      if (!dsMaspNhap.length) {
        alert("Bạn cần nhập dữ liệu kiểm bên trái trước rồi mới nạp CCN theo mã sản phẩm.");
        return;
      }

      const { dsHd, ctRows } = await layHoaDonNguonUngVienTheoMasp(dsMaspNhap);

      if (!dsHd.length || !ctRows.length) {
        phatAmThanhLoi();
        alert("Không tìm thấy hóa đơn CCN phù hợp trong hôm qua và hôm nay.");
        return;
      }

      const dsDeXuat = tinhDeXuatHoaDonTheoMasp(dsHd, ctRows, dsMaspNhap);

      if (!dsDeXuat.length) {
        phatAmThanhLoi();
        alert("Không tìm thấy hóa đơn CCN nào trong khung ngày đã chọn có mã sản phẩm trùng với phần nhập.");
        return;
      }

      const dsSoHdChon = await moPopupChonHoaDonNguonTheoMasp(dsDeXuat);
      if (!dsSoHdChon || !dsSoHdChon.length) return;

      // lấy toàn bộ hóa đơn đã chọn, không chỉ lấy mã trùng
      const dsHoaDonNguonInfo = dsHd
        .filter(hd => dsSoHdChon.includes(String(hd.sohd || "").trim()))
        .map(hd => ({
          sohd: String(hd.sohd || "").trim(),
          ngay: hd.ngay || null,
          created_at: hd.created_at || null,
          diadiem: hd.diadiem || "",
          manv: String(hd.manv || "").trim(),
          tennv: String(hd.tennv || "").trim()
        }));

      const ctRowsChon = (ctRows || []).filter(row =>
        dsSoHdChon.includes(String(row.sohd || "").trim())
      );

      if (!ctRowsChon.length) {
        alert("Các hóa đơn đã chọn không có chi tiết.");
        return;
      }

      const xuatMap = {};
      const xuatOrder = [];

      for (const row of ctRowsChon) {
        const masp = normalizeMasp(row.masp);
        const size = normalizeSize(row.size);
        const sl = normalizeNumber(row.soluong);
        const sohdNguon = String(row.sohd || "").trim();

        if (!masp || !size || sl <= 0) continue;

        if (!xuatOrder.includes(masp)) {
          xuatOrder.push(masp);
        }

        const key = makeKey(masp, size);

        if (!xuatMap[key]) {
          xuatMap[key] = {
            masp,
            size,
            sl,
            sohd_list: sohdNguon ? [sohdNguon] : []
          };
        } else {
          xuatMap[key].sl = normalizeNumber(xuatMap[key].sl) + sl;

          if (sohdNguon) {
            const oldList = Array.isArray(xuatMap[key].sohd_list) ? xuatMap[key].sohd_list : [];
            if (!oldList.includes(sohdNguon)) {
              oldList.push(sohdNguon);
            }
            xuatMap[key].sohd_list = oldList;
          }
        }
      }

      const hdStateEl = document.getElementById("hd_state");
      if (hdStateEl) {
        hdStateEl.value = "da_nap";
        hdStateEl.setAttribute("data-state", "da_nap");
      }

      const state = getState();
      state.dsHoaDonNguon = dsSoHdChon;
      state.dsHoaDonNguonInfo = dsHoaDonNguonInfo;

      const ghichuEl = byId("ghichu_top");
      if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

      window.NhapKiemKho.setXuatData(xuatMap, xuatOrder);

      alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn theo mã sản phẩm.`);
    } catch (err) {
      console.error("[nhapkiemkho] napHoaDonNguonTheoMasp exception:", err);
      alert(err?.message || "Có lỗi khi nạp CCN theo mã sản phẩm.");
    }
  }

  async function napHoaDonNguonPlaceholder() {
    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      const prefixNguon = CFG.fromBranch === "cs2" ? "xcncs2_" : "xcncs1_";
      const { start, end } = layKhoangNgayHoaDonNguonMacDinh(3);

      const { data: dsHd, error: errHd } = await window.supabase
        .from("hoadon_banle")
        .select("sohd, ngay, created_at, diadiem, tennv, manv, kiem_nhapkho")
        .ilike("sohd", `${prefixNguon}%`)
        .gte("created_at", toIsoLocal(start))
        .lte("created_at", toIsoLocal(end))
        .order("created_at", { ascending: false })
        .limit(300);

      if (errHd) {
        console.error("[nhapkiemkho] load ds hoa don nguon error:", errHd);
        alert("Lỗi khi lấy danh sách hóa đơn nguồn.");
        return;
      }

      if (!dsHd || dsHd.length === 0) {
        alert("Không tìm thấy hóa đơn chuyển chi nhánh trong khung ngày đã chọn.");
        return;
      }

      const dsSoHdChon = await moPopupChonHoaDonNguon(dsHd);
      if (!dsSoHdChon || dsSoHdChon.length === 0) return;

      const dsHoaDonNguonInfo = dsHd
        .filter(hd => dsSoHdChon.includes(String(hd.sohd || "").trim()))
        .map(hd => ({
          sohd: String(hd.sohd || "").trim(),
          ngay: hd.ngay || null,
          created_at: hd.created_at || null,
          diadiem: hd.diadiem || "",
          manv: String(hd.manv || "").trim(),
          tennv: String(hd.tennv || "").trim()
        }));

      const { data: ctRows, error: errCt } = await window.supabase
        .from("ct_hoadon_banle")
        .select("sohd, masp, size, soluong")
        .in("sohd", dsSoHdChon)
        .order("id", { ascending: true });

      if (errCt) {
        console.error("[nhapkiemkho] load ct_hoadon_banle error:", errCt);
        alert("Lỗi khi lấy chi tiết hóa đơn nguồn.");
        return;
      }

      if (!ctRows || ctRows.length === 0) {
        alert("Hóa đơn nguồn không có chi tiết.");
        return;
      }

      const xuatMap = {};
      const xuatOrder = [];

      for (const row of ctRows) {
        const masp = normalizeMasp(row.masp);
        const size = normalizeSize(row.size);
        const sl = normalizeNumber(row.soluong);
        const sohdNguon = String(row.sohd || "").trim();

        if (!masp || !size || sl <= 0) continue;

        if (!xuatOrder.includes(masp)) {
          xuatOrder.push(masp);
        }

        const key = makeKey(masp, size);

        if (!xuatMap[key]) {
          xuatMap[key] = {
            masp,
            size,
            sl,
            sohd_list: sohdNguon ? [sohdNguon] : []
          };
        } else {
          xuatMap[key].sl = normalizeNumber(xuatMap[key].sl) + sl;

          if (sohdNguon) {
            const oldList = Array.isArray(xuatMap[key].sohd_list) ? xuatMap[key].sohd_list : [];
            if (!oldList.includes(sohdNguon)) {
              oldList.push(sohdNguon);
            }
            xuatMap[key].sohd_list = oldList;
          }
        }
      }

      const state = getState();
      state.dsHoaDonNguon = dsSoHdChon;
      state.dsHoaDonNguonInfo = dsHoaDonNguonInfo;

      const ghichuEl = byId("ghichu_top");
      if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

      window.NhapKiemKho.setXuatData(xuatMap, xuatOrder);

      alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn.`);
    } catch (err) {
      console.error("[nhapkiemkho] napHoaDonNguonPlaceholder exception:", err);
      alert("Có lỗi khi nạp hóa đơn nguồn.");
    }
  }

  function taoGhiChuPhieuChuyenTuKiemNhap() {
    const state = getState();
    const soHdKiemNhap = String(byId("sohd")?.value || "").trim();
    const dsNguon = (state.dsHoaDonNguon || []).join(" ; ");

    let note = `Phiếu được tạo từ nhập kiểm kho`;
    if (soHdKiemNhap) note += ` - ${soHdKiemNhap}`;
    if (dsNguon) note += ` | HĐ nguồn: ${dsNguon}`;

    return note;
  }

  function getTransferDirectionByTrangThai(trangThai) {
    const tt = String(trangThai || "").trim().toUpperCase();
    const toBranch = String(CFG.toBranch || "").trim().toLowerCase();

    // NGHIỆP VỤ ĐÚNG:
    // CS1:
    //   THUA  -> 2v1
    //   THIEU -> 1v2
    //
    // CS2:
    //   THUA  -> 1v2
    //   THIEU -> 2v1

    if (toBranch === "cs2") {
      if (tt === "THUA") return "1v2";
      if (tt === "THIEU") return "2v1";
      return "";
    }

    // mặc định CS1
    if (tt === "THUA") return "2v1";
    if (tt === "THIEU") return "1v2";
    return "";
  }

  function getTransferPageUrlByDir(dir) {
    const d = String(dir || "").trim().toLowerCase();
    if (d === "1v2") return "https://app.hoantuyet.vn/ccn1v2cs1.html";
    if (d === "2v1") return "https://app.hoantuyet.vn/ccn2v1cs2.html";
    return "";
  }

  function getItemsForTransferByDir(dir) {
    const d = String(dir || "").trim().toLowerCase();

    if (d === "1v2") {
      // chiều 1 -> 2
      // CS1: dùng cho THIEU
      // CS2: dùng cho THUA
      return layDanhSachHangTheoTrangThai(CFG.toBranch === "cs2" ? "THUA" : "THIEU");
    }

    if (d === "2v1") {
      // chiều 2 -> 1
      // CS1: dùng cho THUA
      // CS2: dùng cho THIEU
      return layDanhSachHangTheoTrangThai(CFG.toBranch === "cs2" ? "THIEU" : "THUA");
    }

    return [];
  }

  function moTrangChuyenChiNhanhTheoTrangThai(trangThai) {
    docLaiNhapTuBangHTML();
    kiemTraPhieu();

    const dir = getTransferDirectionByTrangThai(trangThai);
    const url = getTransferPageUrlByDir(dir);
    const items = getItemsForTransferByDir(dir);
    const state = getState();

    if (!dir || !url) {
      phatAmThanhLoi();
      alert("Không xác định được chiều chuyển chi nhánh.");
      return;
    }

    if (!items || items.length === 0) {
      phatAmThanhLoi();
      if (String(trangThai).toUpperCase() === "THUA") {
        alert(`Không có mã sản phẩm thừa để tạo phiếu CCN ${dir.toUpperCase()}.`);
      } else {
        alert(`Không có mã sản phẩm thiếu để tạo phiếu CCN ${dir.toUpperCase()}.`);
      }
      return;
    }

    const payload = {
      dir,
      source: "kiem_nhap_kho",
      created_at: new Date().toISOString(),
      so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
      ds_hoa_don_nguon: state.dsHoaDonNguon || [],
      note: taoGhiChuPhieuChuyenTuKiemNhap(),
      items
    };

    try {
      localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
    } catch (err) {
      console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
      alert(`Không lưu được dữ liệu tạm để chuyển sang trang CCN ${dir.toUpperCase()}.`);
      return;
    }

    const newTab = window.open(url);
    if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
      window.location.href = url;
    }
  }

  function getTrangThaiCanLayTheoDir(dir) {
    const d = String(dir || "").trim().toLowerCase();
    const toBranch = String(CFG.toBranch || "").trim().toLowerCase();

    // CS1:
    //   CCN2V1 = THUA
    //   CCN1V2 = THIEU
    //
    // CS2:
    //   CCN1V2 = THUA
    //   CCN2V1 = THIEU

    if (toBranch === "cs2") {
      if (d === "1v2") return "THUA";
      if (d === "2v1") return "THIEU";
      return "";
    }

    // mặc định CS1
    if (d === "2v1") return "THUA";
    if (d === "1v2") return "THIEU";
    return "";
  }

  function moTrangChuyenChiNhanhTheoDir(dir) {
    docLaiNhapTuBangHTML();
    kiemTraPhieu();

    const d = String(dir || "").trim().toLowerCase();
    const url = getTransferPageUrlByDir(d);
    const items = getItemsForTransferByDir(d);
    const state = getState();
    const trangThaiCanLay = getTrangThaiCanLayTheoDir(d);

    if (!d || !url) {
      phatAmThanhLoi();
      alert("Không xác định được chiều chuyển chi nhánh.");
      return;
    }

    if (!items || items.length === 0) {
      phatAmThanhLoi();
      if (trangThaiCanLay === "THUA") {
        alert(`Không có mã sản phẩm thừa để tạo phiếu CCN ${d.toUpperCase()}.`);
      } else if (trangThaiCanLay === "THIEU") {
        alert(`Không có mã sản phẩm thiếu để tạo phiếu CCN ${d.toUpperCase()}.`);
      } else {
        alert(`Không có dữ liệu để tạo phiếu CCN ${d.toUpperCase()}.`);
      }
      return;
    }

    const payload = {
      dir: d,
      source: "kiem_nhap_kho",
      created_at: new Date().toISOString(),
      so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
      ds_hoa_don_nguon: state.dsHoaDonNguon || [],
      note: taoGhiChuPhieuChuyenTuKiemNhap(),
      items
    };

    try {
      localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
    } catch (err) {
      console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
      alert(`Không lưu được dữ liệu tạm để chuyển sang trang CCN ${d.toUpperCase()}.`);
      return;
    }

    const newTab = window.open(url);
    if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
      window.location.href = url;
    }
  }

  // =========================
  // TAO PHIEU CCN2V1 TU HANG THUA
  // =========================
  function groupByMaspForTransfer(items) {
    const out = {};

    (items || []).forEach((row) => {
      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!masp || !size || sl <= 0) return;

      if (!out[masp]) {
        out[masp] = {
          masp,
          items: []
        };
      }

      out[masp].items.push({
        size,
        sl
      });
    });

    return Object.values(out);
  }

  function layDanhSachHangTheoTrangThai(trangThaiCanLay) {
    const thongTinTong = xayDungDuLieuTongVaChiTietLech();
    const chiTietLech = thongTinTong?.chiTietLech || [];
    const state = getState();
    const xuatMap = state.xuat || {};

    const ttCanLay = String(trangThaiCanLay || "").trim().toLowerCase();
    const rows = [];

    chiTietLech.forEach((row) => {
      const trangthai = String(row.trangthai_nhan || "").trim().toLowerCase();
      if (trangthai !== ttCanLay) return;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size || "0");
      const sl = normalizeNumber(row.sl_lech || 0);

      if (!masp || sl <= 0) return;

      // THIẾU + size=0 => bung toàn bộ size thật từ dữ liệu xuất nguồn
      if (ttCanLay === "thieu" && (!size || size === "0")) {
        const xuatRowsTheoMasp = Object.values(xuatMap)
          .filter(r => normalizeMasp(r?.masp) === masp)
          .map(r => ({
            masp,
            size: normalizeSize(r?.size || "0"),
            sl: normalizeNumber(r?.sl || 0)
          }))
          .filter(r => r.masp && r.size && r.size !== "0" && r.sl > 0);

        if (xuatRowsTheoMasp.length > 0) {
          xuatRowsTheoMasp.forEach(r => rows.push(r));
          return;
        }
      }

      rows.push({
        masp,
        size: size || "0",
        sl
      });
    });

    return groupByMaspForTransfer(rows);
  }

  // =========================
  // CHON DONG / COPY / PASTE / XOA DONG
  // =========================
  function chonDongTheoMasp(masp) {
    const state = getState();
    state.selectedMasp = normalizeMasp(masp);
    renderBangKetQua();
  }

  function bindRowSelection() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody || tbody.dataset.rowSelectBound === "1") return;

    tbody.dataset.rowSelectBound = "1";

    tbody.addEventListener("click", (e) => {
      // Nếu đang click vào ô cho phép sửa trực tiếp thì không chọn dòng
      const editableCell = e.target.closest(".cell-nhap-sizesl, .cell-nhap-tongsl");
      if (editableCell) {
        return;
      }

      const tr = e.target.closest("tr");
      if (!tr) return;

      const masp = normalizeMasp(tr.dataset.masp || "");
      if (!masp) return;

      chonDongTheoMasp(masp);
    });
  }

  async function copyDuLieuNhap() {
    try {
      docLaiNhapTuBangHTML();

      const tbody = document.querySelector("#bangketqua tbody");
      if (!tbody) {
        alert("Không tìm thấy bảng kết quả.");
        return;
      }

      const rows = Array.from(tbody.querySelectorAll("tr"));
      if (rows.length === 0) {
        alert("Không có dữ liệu để copy.");
        return;
      }

      const lines = rows.map((tr) => {
        const masp = normalizeMasp(tr.dataset.masp || tr.children[0]?.dataset?.masp || "");

        const sizeSlText = String(tr.querySelector(".cell-nhap-sizesl")?.innerText || "")
          .replace(/\r/g, "")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const tongSlText = String(tr.querySelector(".cell-nhap-tongsl")?.innerText || "").trim();

        if (!masp) return "";
        return [masp, sizeSlText, tongSlText].join("\t");
      }).filter(Boolean);

      const text = lines.join("\n");
      await navigator.clipboard.writeText(text);

      alert(`Đã copy ${lines.length} dòng dữ liệu phần nhập.`);
    } catch (err) {
      console.error("[KNK] copyDuLieuNhap error:", err);
      alert("Không copy được dữ liệu.");
    }
  }

  async function copyDuLieuXuat() {
    try {
      const tbody = document.querySelector("#bangketqua tbody");
      if (!tbody) {
        alert("Không tìm thấy bảng kết quả.");
        return;
      }

      const rows = Array.from(tbody.querySelectorAll("tr"));
      if (rows.length === 0) {
        alert("Không có dữ liệu để copy.");
        return;
      }

      const lines = rows.map((tr) => {
        const col1 = String(tr.children[3]?.innerText || "").trim();

        const col2 = String(tr.children[4]?.innerText || "")
          .replace(/\r/g, "")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const col3 = String(tr.children[5]?.innerText || "").trim();

        return [col1, col2, col3].join("\t");
      }).filter(Boolean);

      const text = lines.join("\n");
      await navigator.clipboard.writeText(text);

      alert(`Đã copy ${lines.length} dòng dữ liệu phần xuất.`);
    } catch (err) {
      console.error("[KNK] copyDuLieuXuat error:", err);
      alert("Không copy được dữ liệu phần xuất.");
    }
  }

  function parseClipboardToNhapMap(text) {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    const nhapMoi = {};

    for (const line of lines) {
      const cols = line.split("\t");

      let masp = normalizeMasp(cols[0] || "");

      // Nếu cột mã bị dính thêm dòng vị trí/kho thì chỉ lấy dòng đầu
      if (masp.includes("\n")) {
        masp = normalizeMasp(masp.split("\n")[0]);
      }

      const sizeSlText = String(cols[1] || "").trim();
      const tongSlText = String(cols[2] || "").trim();

      if (!masp) continue;

      const items = parseSizeSlText(sizeSlText);
      const tongSl = normalizeNumber(tongSlText);

      if (hasRealSizeItems(items)) {
        items.forEach((item) => {
          const key = makeKey(masp, item.size);
          nhapMoi[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
        continue;
      }

      if (tongSl > 0) {
        const key = makeKey(masp, "0");
        nhapMoi[key] = {
          masp,
          size: "0",
          sl: tongSl
        };
      }
    }

    return nhapMoi;
  }

  async function pasteDuLieuNhap() {
    try {
      const text = await navigator.clipboard.readText();
      if (!String(text || "").trim()) {
        alert("Clipboard đang trống.");
        return;
      }

      const nhapMoi = parseClipboardToNhapMap(text);
      const soDong = Object.keys(nhapMoi).length;

      if (soDong === 0) {
        alert("Dữ liệu dán không hợp lệ.");
        return;
      }

      const ok = confirm("Dán dữ liệu sẽ thay toàn bộ phần nhập hiện tại. Bạn có muốn tiếp tục không?");
      if (!ok) return;

      const state = getState();
      state.nhap = nhapMoi;
      state.ketQua = {};
      state.selectedMasp = "";
      state.nhapOrder = [...new Set(Object.values(nhapMoi).map(x => normalizeMasp(x.masp)))];

      autoKiemTraSauNhap();
      alert(`Đã dán ${soDong} dòng dữ liệu nhập.`);
    } catch (err) {
      console.error("[KNK] pasteDuLieuNhap error:", err);
      alert("Không đọc được dữ liệu từ clipboard.");
    }
  }

  function xoaDongDangChon() {
    docLaiNhapTuBangHTML();

    const state = getState();
    const masp = normalizeMasp(state.selectedMasp || "");

    if (!masp) {
      alert("Bạn chưa chọn dòng cần xóa.");
      return;
    }

    // const ok = confirm(`Bạn có chắc muốn xóa dòng mã hàng: ${masp} ?`); 
    // if (!ok) return;

    Object.keys(state.nhap || {}).forEach((key) => {
      const row = state.nhap[key];
      if (normalizeMasp(row?.masp) === masp) {
        delete state.nhap[key];
      }
    });

    Object.keys(state.ketQua || {}).forEach((key) => {
      const info = splitKey(key);
      if (normalizeMasp(info.masp) === masp) {
        delete state.ketQua[key];
      }
    });

    state.selectedMasp = "";
    autoKiemTraSauNhap();

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (maspEl) {
      maspEl.value = masp;
      maspEl.focus();

      setTimeout(() => {
        try {
          maspEl.select();
        } catch (err) { }
      }, 0);
    }

    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";

    hideSizePopup();
  }

  // =========================
  // BUTTONS
  // =========================

  // =========================
  // SAVE KIEM NHAP KHO
  // =========================

  function tinhTongSoLuongTheoMap(mapObj) {
    return Object.values(mapObj || {}).reduce((sum, row) => {
      return sum + normalizeNumber(row?.sl || 0);
    }, 0);
  }

  function groupRowsByMasp(mapObj) {
    const out = {};

    Object.keys(mapObj || {}).forEach((key) => {
      const row = mapObj[key];
      if (!row) return;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!masp) return;

      if (!out[masp]) {
        out[masp] = [];
      }

      out[masp].push({
        masp,
        size,
        sl,
        key
      });
    });

    return out;
  }

  function tinhTongTheoMasp(groupMap) {
    const out = {};
    Object.keys(groupMap || {}).forEach((masp) => {
      out[masp] = (groupMap[masp] || []).reduce((sum, row) => sum + normalizeNumber(row.sl), 0);
    });
    return out;
  }

  function xayDungDuLieuTongVaChiTietLech() {
    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const nhapGroup = groupRowsByMasp(nhapMap);
    const xuatGroup = groupRowsByMasp(xuatMap);

    const tongNhapTheoMasp = tinhTongTheoMasp(nhapGroup);
    const tongXuatTheoMasp = tinhTongTheoMasp(xuatGroup);

    const allMasps = Array.from(new Set([
      ...Object.keys(nhapGroup),
      ...Object.keys(xuatGroup)
    ])).sort();

    const chiTietLech = [];
    let tongSlLechThieu = 0;
    let tongSlLechThua = 0;

    for (const masp of allMasps) {
      const nhapRows = nhapGroup[masp] || [];
      const xuatRows = xuatGroup[masp] || [];

      const hasRealSizeNhap = nhapRows.some(r => {
        const s = normalizeSize(r.size);
        return s && s !== "0";
      });

      if (hasRealSizeNhap) {
        const allKeys = new Set([
          ...nhapRows.map(r => r.key),
          ...xuatRows.map(r => r.key)
        ]);

        for (const key of allKeys) {
          const kq = ketQuaMap[key];
          if (!kq || kq.trangthai === "OK") continue;

          const nhap = nhapMap[key];
          const xuat = xuatMap[key];

          const slNhap = normalizeNumber(nhap?.sl || 0);
          const slXuat = normalizeNumber(xuat?.sl || 0);
          const slLech = Math.abs(slNhap - slXuat);
          const size = splitKey(key).size || "0";

          let trangthai_nhan = "lech";
          if (kq.trangthai === "THIEU") {
            trangthai_nhan = "thieu";
            tongSlLechThieu += slLech;
          } else if (kq.trangthai === "THUA") {
            trangthai_nhan = "thua";
            tongSlLechThua += slLech;
          }

          chiTietLech.push({
            masp,
            size,
            trangthai_nhan,
            sl_xuat: slXuat,
            sl_nhan: slNhap,
            sl_lech: slLech,
            chi_tiet: `${slNhap}/${slXuat}`
          });
        }
      } else {
        const keyTong = makeKey(masp, "0");
        const kq = ketQuaMap[keyTong];
        if (!kq || kq.trangthai === "OK") continue;

        const slNhap = normalizeNumber(tongNhapTheoMasp[masp] || 0);
        const slXuat = normalizeNumber(tongXuatTheoMasp[masp] || 0);
        const slLech = Math.abs(slNhap - slXuat);

        let trangthai_nhan = "lech";
        if (kq.trangthai === "THIEU") {
          trangthai_nhan = "thieu";
          tongSlLechThieu += slLech;
        } else if (kq.trangthai === "THUA") {
          trangthai_nhan = "thua";
          tongSlLechThua += slLech;
        }

        chiTietLech.push({
          masp,
          size: "0",
          trangthai_nhan,
          sl_xuat: slXuat,
          sl_nhan: slNhap,
          sl_lech: slLech,
          chi_tiet: `${slNhap}/${slXuat}`
        });
      }
    }

    return {
      tong_so_mat_hang: allMasps.length,
      tong_so_luong_xuat: tinhTongSoLuongTheoMap(xuatMap),
      tong_so_luong_nhan: tinhTongSoLuongTheoMap(nhapMap),
      so_ma_lech: chiTietLech.length,
      tong_sl_lech_thieu: tongSlLechThieu,
      tong_sl_lech_thua: tongSlLechThua,
      ket_qua_chung: chiTietLech.length > 0 ? "lech" : "ok",
      chiTietLech
    };
  }

  function buildChiTietHoaDonRows(kiemNhapId, so_hd_kiemnhap, sohdccn, ngay_kiem, nhanvienkiem) {
    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const nhapGroupMap = groupByMasp(nhapMap);
    const xuatGroupMap = groupByMasp(xuatMap);

    const allMasps = Array.from(
      new Set([
        ...Object.keys(nhapGroupMap),
        ...Object.keys(xuatGroupMap)
      ])
    ).sort();

    const rows = [];

    allMasps.forEach((masp, index) => {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);
      const sohdXuatCnText = formatSohdNguonLuuTheoMasp(xuatGroup);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);

      const hasRealSizeNhap = (nhapGroup?.items || []).some(x => {
        const s = normalizeSize(x.size);
        return s && s !== "0";
      });

      rows.push({
        kiem_nhap_id: kiemNhapId,
        so_hd_kiemnhap,
        sohdccn,
        ngay_kiem,
        nhanvienkiem,
        sort_order: index + 1,

        masp_nhap: masp,
        size_sl_nhap: nhapText || "",
        tongsl_nhap: tongSoLuong(nhapGroup?.items || []) || 0,

        masp_xuat: masp,
        size_sl_xuat: xuatText || "",
        tongsl_xuat: tongSoLuong(xuatGroup?.items || []) || 0,
        sohd_xuat_cn: sohdXuatCnText || "",

        trangthai: kqTong.trangthai || "",
        chitiet: kqTong.chitiet || "",

        masp_key: masp,
        che_do_kiem: hasRealSizeNhap ? "size" : "tong",
        ghi_chu: null
      });
    });

    return rows;
  }

  async function danhDauHoaDonNguonDaKiemNhap(dsSoHd, soHdKiemNhap, ngayGioKiem, nhanVienKiem) {
    if (!window.supabase) {
      throw new Error("Không tìm thấy kết nối Supabase.");
    }

    const dsSach = Array.from(
      new Set(
        (Array.isArray(dsSoHd) ? dsSoHd : [])
          .map(x => String(x || "").trim())
          .filter(Boolean)
      )
    );

    if (!dsSach.length) {
      return { success: true, updated: 0, message: "Không có hóa đơn nguồn để đánh dấu." };
    }

    const { data, error } = await window.supabase.rpc("rpc_danh_dau_kiem_nhapkho_hoa_don", {
      p_ds_sohd: dsSach,
      p_so_hd_kiemnhap: String(soHdKiemNhap || "").trim(),
      p_ngay_kiem: String(ngayGioKiem || "").trim(),
      p_nhanvienkiem: String(nhanVienKiem || "").trim()
    });

    if (error) {
      console.error("[KNK] rpc_danh_dau_kiem_nhapkho_hoa_don error:", error);
      throw new Error("Lỗi khi đánh dấu hóa đơn nguồn đã kiểm nhập.");
    }

    return data || { success: true, updated: 0 };
  }

  async function xoaDuLieuPhieuKiemNhapCu(soHdKiemNhap) {
    if (!window.supabase) {
      throw new Error("Không tìm thấy kết nối Supabase.");
    }

    const sohd = String(soHdKiemNhap || "").trim();
    if (!sohd) {
      throw new Error("Thiếu số phiếu kiểm nhập để xóa dữ liệu cũ.");
    }

    // 1) tìm phiếu cũ
    const { data: phieuCu, error: errTim } = await window.supabase
      .from("kiem_nhap_kho")
      .select("id, so_hd_kiemnhap")
      .eq("so_hd_kiemnhap", sohd)
      .maybeSingle();

    if (errTim) {
      console.error("[KNK] xoaDuLieuPhieuKiemNhapCu - tìm phiếu cũ lỗi:", errTim);
      throw new Error("Lỗi khi tìm phiếu cũ.");
    }

    if (!phieuCu) {
      return { deleted: false, message: "Không tìm thấy phiếu cũ để xóa." };
    }

    const kiemNhapId = phieuCu.id;

    // 2) xóa chi tiết hóa đơn trước
    const { error: errCtHd } = await window.supabase
      .from("kiem_nhap_kho_chi_tiet_hoa_don")
      .delete()
      .eq("kiem_nhap_id", kiemNhapId);

    if (errCtHd) {
      console.error("[KNK] xóa kiem_nhap_kho_chi_tiet_hoa_don lỗi:", errCtHd);
      throw new Error("Lỗi khi xóa chi tiết hóa đơn phiếu cũ.");
    }

    // 3) xóa chi tiết lệch
    const { error: errLech } = await window.supabase
      .from("kiem_nhap_kho_chitiet_lech")
      .delete()
      .eq("kiem_nhap_id", kiemNhapId);

    if (errLech) {
      console.error("[KNK] xóa kiem_nhap_kho_chitiet_lech lỗi:", errLech);
      throw new Error("Lỗi khi xóa chi tiết lệch phiếu cũ.");
    }

    // 4) xóa bảng tổng sau cùng
    const { error: errTong } = await window.supabase
      .from("kiem_nhap_kho")
      .delete()
      .eq("id", kiemNhapId);

    if (errTong) {
      console.error("[KNK] xóa kiem_nhap_kho lỗi:", errTong);
      throw new Error("Lỗi khi xóa phiếu tổng cũ.");
    }

    return {
      deleted: true,
      id: kiemNhapId,
      so_hd_kiemnhap: sohd
    };
  }

  async function luuPhieuKiemNhapKho() {

    const hdState = document.getElementById("hd_state")?.value;

    if (hdState !== "da_nap") {
      alert("❌ Bạn phải nhấn 'Nạp chuyển chi nhánh theo mã sản phẩm' trước khi lưu!");
      return;
    }

    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      if (window.dangLuuKiemNhapKho) return;
      window.dangLuuKiemNhapKho = true;

      const sohdEl = byId("sohd");
      const ngayEl = byId("ngay");
      const tennvEl = byId("tennv");
      const ghichuEl = byId("ghichu_top");
      const hdStateEl = byId("hd_state");

      const so_hd_kiemnhap = String(sohdEl?.value || "").trim();
      const ngay_kiem = String(ngayEl?.value || "").trim();
      const nhanvienkiem = String(tennvEl?.value || "").trim();
      const ghi_chu = String(ghichuEl?.value || "").trim();

      if (!so_hd_kiemnhap) {
        alert("Chưa có số phiếu kiểm nhập.");
        sohdEl?.focus();
        return;
      }

      if (!ngay_kiem) {
        alert("Chưa có ngày kiểm.");
        ngayEl?.focus();
        return;
      }

      if (!nhanvienkiem) {
        alert("Chưa có nhân viên kiểm.");
        return;
      }

      const state = getState();

      if (!state.dsHoaDonNguon || state.dsHoaDonNguon.length === 0) {
        alert("Bạn chưa nạp hóa đơn nguồn.");
        return;
      }

      docLaiNhapTuBangHTML();
      kiemTraPhieu();

      const stateSauKiem = getState();

      if (!stateSauKiem.nhap || Object.keys(stateSauKiem.nhap).length === 0) {
        alert("Chưa có dữ liệu nhập để lưu.");
        return;
      }

      const thongTinTong = xayDungDuLieuTongVaChiTietLech();

      const sohdccn = (stateSauKiem.dsHoaDonNguon || []).join(" ; ");

      const dsNhanVienXuat = Array.from(
        new Set(
          (stateSauKiem.dsHoaDonNguonInfo || [])
            .map(x => String(x.tennv || x.manv || "").trim())
            .filter(Boolean)
        )
      );

      const nhanvienxuat = dsNhanVienXuat.join(" ; ");

      const hdState = String(hdStateEl?.value || "").trim().toLowerCase();

      const { data: tonTaiCu, error: errCheck } = await window.supabase
        .from("kiem_nhap_kho")
        .select("id, so_hd_kiemnhap")
        .eq("so_hd_kiemnhap", so_hd_kiemnhap)
        .maybeSingle();

      if (errCheck) {
        console.error("[kiem_nhap_kho] check ton tai error:", errCheck);
        alert("Lỗi khi kiểm tra phiếu đã tồn tại.");
        return;
      }

      // ===== PHIẾU MỚI =====
      if (hdState !== "xem") {
        if (tonTaiCu) {
          alert("Số phiếu kiểm nhập này đã được lưu rồi.");
          return;
        }
      }

      // ===== PHIẾU CŨ =====
      if (hdState === "xem") {
        const okSua = confirm(`Bạn có chắc chắn muốn sửa phiếu cũ ${so_hd_kiemnhap} không?`);
        if (!okSua) {
          return;
        }

        await xoaDuLieuPhieuKiemNhapCu(so_hd_kiemnhap);
      }

      const rowTong = {
        so_hd_kiemnhap,
        ngay_kiem,
        nhanvienkiem,
        sohdccn,
        nhanvienxuat,
        tu_co_so: CFG.fromBranch || "",
        den_co_so: CFG.toBranch || "",
        tong_so_mat_hang: thongTinTong.tong_so_mat_hang,
        tong_so_luong_xuat: thongTinTong.tong_so_luong_xuat,
        tong_so_luong_nhan: thongTinTong.tong_so_luong_nhan,
        so_ma_lech: thongTinTong.so_ma_lech,
        tong_sl_lech_thieu: thongTinTong.tong_sl_lech_thieu,
        tong_sl_lech_thua: thongTinTong.tong_sl_lech_thua,
        ket_qua_chung: thongTinTong.ket_qua_chung,
        ghi_chu
      };

      const { data: insertedTong, error: errTong } = await window.supabase
        .from("kiem_nhap_kho")
        .insert([rowTong])
        .select()
        .single();

      if (errTong) {
        console.error("[kiem_nhap_kho] insert tong error:", errTong);
        alert("Lỗi khi lưu bảng kiem_nhap_kho: " + (errTong.message || ""));
        return;
      }

      const rowsChiTietHoaDon = buildChiTietHoaDonRows(
        insertedTong.id,
        so_hd_kiemnhap,
        sohdccn,
        ngay_kiem,
        nhanvienkiem
      );

      if (rowsChiTietHoaDon.length > 0) {
        const { error: errChiTietHoaDon } = await window.supabase
          .from("kiem_nhap_kho_chi_tiet_hoa_don")
          .insert(rowsChiTietHoaDon);

        if (errChiTietHoaDon) {
          console.error("[kiem_nhap_kho_chi_tiet_hoa_don] insert error:", errChiTietHoaDon);
          alert("Đã lưu bảng tổng nhưng lỗi khi lưu chi tiết hóa đơn: " + (errChiTietHoaDon.message || ""));
          return;
        }
      }

      if (thongTinTong.chiTietLech.length > 0) {
        const rowsLech = thongTinTong.chiTietLech.map((row) => ({
          kiem_nhap_id: insertedTong.id,
          so_hd_kiemnhap,
          sohdccn,
          masp: row.masp,
          tenhang: "",
          size: row.size,
          trangthai_nhan: row.trangthai_nhan,
          sl_xuat: row.sl_xuat,
          sl_nhan: row.sl_nhan,
          sl_lech: row.sl_lech,
          chi_tiet: row.chi_tiet,
          ghi_chu: null
        }));

        const { error: errLech } = await window.supabase
          .from("kiem_nhap_kho_chitiet_lech")
          .insert(rowsLech);

        if (errLech) {
          console.error("[kiem_nhap_kho_chitiet_lech] insert error:", errLech);
          alert("Đã lưu bảng tổng nhưng lỗi khi lưu chi tiết lệch: " + (errLech.message || ""));
          return;
        }
      }

      const ngayGioKiemText = formatDateTimeForKiemNhapKho(new Date());

      await danhDauHoaDonNguonDaKiemNhap(
        stateSauKiem.dsHoaDonNguon || [],
        so_hd_kiemnhap,
        ngayGioKiemText,
        nhanvienkiem
      );

      alert(`Đã lưu phiếu kiểm nhập: ${so_hd_kiemnhap}`);
      await resetPhieu();

    } catch (err) {
      console.error("[luuPhieuKiemNhapKho] exception:", err);
      alert("Có lỗi khi lưu dữ liệu kiểm nhập kho.");
    } finally {
      window.dangLuuKiemNhapKho = false;
    }
  }

  function bindButtons() {
    const btnThem = byId("them");
    if (btnThem) {
      btnThem.addEventListener("click", async (e) => {
        e.preventDefault();
        await resetPhieu();
      });
    }

    const btnNapTheoMasp1 = byId("btnNapHoaDonCCNTheoMasp");
    const btnNapTheoMasp2 = byId("btnNapHoaDonCCNTheoMasp_footer");
    [btnNapTheoMasp1, btnNapTheoMasp2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        napHoaDonNguonTheoMasp();
      });
    });

    const btnNap1 = byId("btnNapHoaDonCCN");
    const btnNap2 = byId("btnNapHoaDonCCN_footer");
    [btnNap1, btnNap2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        napHoaDonNguonPlaceholder();
      });
    });

    const btnKiem1 = byId("btnKiemTraPhieu");
    const btnKiem2 = byId("btnKiemTraPhieu_footer");
    [btnKiem1, btnKiem2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        kiemTraPhieu();
      });
    });

    const btnTaoPhieuCCN2V1 = byId("btnTaoPhieuCCN2V1");
    if (btnTaoPhieuCCN2V1) {
      btnTaoPhieuCCN2V1.addEventListener("click", (e) => {
        e.preventDefault();
        moTrangChuyenChiNhanhTheoDir("2v1");
      });
    }

    const btnTaoPhieuCCN1V2 = byId("btnTaoPhieuCCN1V2");
    if (btnTaoPhieuCCN1V2) {
      btnTaoPhieuCCN1V2.addEventListener("click", (e) => {
        e.preventDefault();
        moTrangChuyenChiNhanhTheoDir("1v2");
      });
    }

    // ===== NÚT QUAY LẠI =====
    const btnPrev = byId("btnPrevPhieu");
    if (btnPrev) {
      btnPrev.addEventListener("click", async () => {
        const sohdHienTai = byId("sohd")?.value || "";
        const sohdTruoc = laySoPhieuLienTruoc(sohdHienTai);

        if (!sohdTruoc) return;

        await moLaiPhieuKiemNhapCu(sohdTruoc);
      });
    }

    // ===== NÚT TIẾP THEO =====
    const btnNext = byId("btnNextPhieu");
    if (btnNext) {
      btnNext.addEventListener("click", async () => {
        const sohdHienTai = byId("sohd")?.value || "";
        const sohdSau = laySoPhieuLienSau(sohdHienTai);

        if (!sohdSau) return;

        await moLaiPhieuKiemNhapCu(sohdSau);
      });
    }

    const btnCopy = byId("btn-copy-nhap");
    if (btnCopy) {
      btnCopy.addEventListener("click", async (e) => {
        e.preventDefault();
        await copyDuLieuNhap();
      });
    }

    const btnCopyXuat = byId("btn-copy-xuat");
    if (btnCopyXuat) {
      btnCopyXuat.addEventListener("click", async (e) => {
        e.preventDefault();
        await copyDuLieuXuat();
      });
    }

    const btnPaste = byId("btn-paste-nhap");
    if (btnPaste) {
      btnPaste.addEventListener("click", async (e) => {
        e.preventDefault();
        await pasteDuLieuNhap();
      });
    }

    const btnSua = byId("sua");
    if (btnSua) {
      btnSua.addEventListener("click", (e) => {
        e.preventDefault();
        xoaDongDangChon();
      });
    }

    bindRowSelection();
  }

  async function moLaiPhieuKiemNhapCu(soHdKiemNhap) {
    if (!window.supabase) {
      alert("Không tìm thấy kết nối Supabase.");
      return;
    }

    const sohd = String(soHdKiemNhap || "").trim();
    if (!sohd) {
      alert("Chưa có số phiếu kiểm nhập.");
      return;
    }

    const { data: phieuTong, error: errTong } = await window.supabase
      .from("kiem_nhap_kho")
      .select("*")
      .eq("so_hd_kiemnhap", sohd)
      .maybeSingle();

    if (errTong) {
      console.error(errTong);
      alert("Lỗi khi đọc phiếu kiểm nhập.");
      return;
    }

    if (!phieuTong) {
      alert("Không tìm thấy phiếu kiểm nhập.");
      return;
    }

    const { data: rows, error: errRows } = await window.supabase
      .from("kiem_nhap_kho_chi_tiet_hoa_don")
      .select("*")
      .eq("so_hd_kiemnhap", sohd)
      .order("sort_order", { ascending: true });

    if (errRows) {
      console.error(errRows);
      alert("Lỗi khi đọc chi tiết hóa đơn.");
      return;
    }

    const state = getState();
    state.nhap = {};
    state.xuat = {};
    state.ketQua = {};
    state.nhapOrder = [];
    state.xuatOrder = [];
    state.dsHoaDonNguon = String(phieuTong.sohdccn || "")
      .split(";")
      .map(x => String(x || "").trim())
      .filter(Boolean);
    state.dsHoaDonNguonInfo = [];

    byId("sohd").value = phieuTong.so_hd_kiemnhap || "";
    byId("ngay").value = phieuTong.ngay_kiem || "";
    byId("ghichu_top").value = phieuTong.sohdccn || "";

    const tennvEl = byId("tennv");
    if (tennvEl) {
      tennvEl.value = phieuTong.nhanvienkiem || "";
    }

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "xem";
      hdState.setAttribute("data-state", "xem");
    }


    (rows || []).forEach((row) => {
      const masp = normalizeMasp(row.masp_key || row.masp_nhap || row.masp_xuat);
      if (masp) {
        if (!state.nhapOrder.includes(masp)) state.nhapOrder.push(masp);
        if (!state.xuatOrder.includes(masp)) state.xuatOrder.push(masp);
      }

      const nhapItems = parseSizeSlText(row.size_sl_nhap || "");
      if (nhapItems.length > 0) {
        nhapItems.forEach(item => {
          const key = makeKey(masp, item.size);
          state.nhap[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
      } else if (normalizeNumber(row.tongsl_nhap) > 0) {
        const key = makeKey(masp, "0");
        state.nhap[key] = {
          masp,
          size: "0",
          sl: normalizeNumber(row.tongsl_nhap)
        };
      }

      const xuatItems = parseSizeSlText(row.size_sl_xuat || "");
      if (xuatItems.length > 0) {
        xuatItems.forEach(item => {
          const key = makeKey(masp, item.size);
          state.xuat[key] = {
            masp,
            size: item.size,
            sl: item.sl,
            sohd_list: []
          };
        });
      } else if (normalizeNumber(row.tongsl_xuat) > 0) {
        const key = makeKey(masp, "0");
        state.xuat[key] = {
          masp,
          size: "0",
          sl: normalizeNumber(row.tongsl_xuat),
          sohd_list: []
        };
      }

      ganSohdXuatCnChoStateXuat(masp, row.sohd_xuat_cn || "", state);
      const taohdccnText = String(row.taohdccn || "").trim();
      if (masp && taohdccnText) {
        state.taoHdCcnByMasp[masp] = taohdccnText;
      }

    });

    renderBangKetQua();
    kiemTraPhieu();
  }

  // =========================
  // API công khai
  // =========================
  window.NhapKiemKho = {
    resetPhieu,
    renderBangKetQua,
    kiemTraPhieu,
    themDongNhapBenTrai,
    getState,
    moTrangChuyenChiNhanhTheoDir,

    luuPhieuKiemNhapKho,
    copyDuLieuNhap,
    copyDuLieuXuat,
    pasteDuLieuNhap,
    xoaDongDangChon,
    moLaiPhieuKiemNhapCu,

    setXuatData(dataMap, orderArr) {
      const state = getState();
      state.xuat = dataMap || {};
      state.xuatOrder = Array.isArray(orderArr) ? orderArr.map(normalizeMasp).filter(Boolean) : [];
      state.ketQua = {};
      autoKiemTraSauNhap();
    }
  };

  // =========================
  // INIT
  // =========================
  async function init() {
    updateTitle();
    setDefaultBranchInfo();
    bindInputEvents();
    bindButtons();

    // Mở khóa beep cho trình duyệt
    setupBeepUnlockOnce(document);

    // Không reset phiếu ngay theo kiểu ép số 00001 nữa
    await khoiTaoSoPhieuBanDau();

    await resetPhieu();

    const hdStateEl = byId("hd_state");
    const trangThai = String(hdStateEl?.value || "").trim().toLowerCase();

    const state = getState();
    const daCoDuLieuXuat = !!Object.keys(state?.xuat || {}).length;
    const dangLaPhieuMoi = !trangThai || trangThai === "moi";

    if (dangLaPhieuMoi && !daCoDuLieuXuat) {
      setTimeout(async () => {
        try {
          await napHoaDonNguonPlaceholder();
        } catch (err) {
          console.warn("[AUTO NAP HOA DON NGUON] lỗi:", err);
        }
      }, 200);
    }

    console.log("[nhapkiemkho] init OK", CFG);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

// ✅ đảm bảo popup_size luôn tồn tại
document.addEventListener("DOMContentLoaded", () => {
  let popup = document.getElementById("popup_size");

  if (!popup) {
    popup = document.createElement("div");
    popup.id = "popup_size";

    popup.style.position = "absolute";
    popup.style.top = "100%";
    popup.style.left = "0";
    popup.style.width = "200px";
    popup.style.maxHeight = "200px";
    popup.style.background = "#fff";
    popup.style.border = "1px solid #ccc";
    popup.style.display = "none";
    popup.style.overflowY = "auto";
    popup.style.zIndex = "9999";

    document.body.appendChild(popup);
  }
});

