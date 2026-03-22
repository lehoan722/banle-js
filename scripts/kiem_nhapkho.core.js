// ================= CORE =================

export const CFG = {
  SIZE_DEFAULT: "0",
  VALID_SIZES: ["0", "38", "39", "40", "41", "42", "43", "44", "45"]
};

const state = {
  nhap: {},
  xuat: {},
  ketQua: {},
  nhapOrder: [],
  xuatOrder: [],
  selectedMasp: "",
  currentSoPhieu: "",
  currentHoaDon: null,
  nhanVien: null,
  dsHoaDonNguon: [],
  branchInfo: null
};

export function getState() {
  return state;
}

export function byId(id) {
  return document.getElementById(id);
}

export function normalizeMasp(masp) {
  return String(masp || "").trim().toUpperCase();
}

export function normalizeSize(size) {
  return String(size || "").trim().toUpperCase();
}

export function normalizeNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function makeKey(masp, size) {
  return `${normalizeMasp(masp)}__${normalizeSize(size)}`;
}

export function splitKey(key) {
  const [masp = "", size = ""] = String(key || "").split("__");
  return { masp, size };
}

export function formatNumber(num) {
  return Number(num || 0).toLocaleString("vi-VN");
}

export function formatDateTimeVN(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isValidSize(size) {
  return CFG.VALID_SIZES.includes(normalizeSize(size));
}

export function parseSizeSlText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  return raw
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [size, sl] = part.split("/");
      return {
        size: normalizeSize(size),
        sl: normalizeNumber(sl)
      };
    })
    .filter(x => x.size);
}

export function hasRealSizeItems(items = []) {
  return (items || []).some(item => normalizeSize(item?.size) !== "0");
}

export function focusEnd(el) {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  try {
    el.setSelectionRange(len, len);
  } catch {}
}

export function phatAmThanhLoi() {
  try {
    const a = new Audio("./soundBeep.mp3");
    a.play();
  } catch {}
}

export function phatAmThanhSize() {
  try {
    const a = new Audio("./soundBeep.mp3");
    a.play();
  } catch {}
}

export function phatAmThanhThanhCong() {
  try {
    const a = new Audio("./soundBeep.mp3");
    a.play();
  } catch {}
}

export function ensureMaspAtTop(order = [], masp) {
  const m = normalizeMasp(masp);
  const arr = (order || []).filter(x => normalizeMasp(x) !== m);
  arr.unshift(m);
  return arr;
}

export function buildOrderedMasps(stateObj, gNhap = {}, gXuat = {}) {
  const set = new Set();

  (stateObj.nhapOrder || []).forEach(x => set.add(normalizeMasp(x)));
  (stateObj.xuatOrder || []).forEach(x => set.add(normalizeMasp(x)));
  Object.keys(gNhap || {}).forEach(x => set.add(normalizeMasp(x)));
  Object.keys(gXuat || {}).forEach(x => set.add(normalizeMasp(x)));

  return Array.from(set).filter(Boolean);
}

export function capNhatThongKeDauTrang() {
  const stateObj = getState();

  const tongNhap = Object.values(stateObj.nhap || {}).reduce((sum, r) => sum + normalizeNumber(r?.sl), 0);
  const tongXuat = Object.values(stateObj.xuat || {}).reduce((sum, r) => sum + normalizeNumber(r?.sl), 0);

  const el = byId("thongke_dautrang");
  if (el) {
    el.textContent = `Nhập: ${tongNhap}, Xuất: ${tongXuat}`;
  }
}

export function getBranchInfoFromPath(pathname = "") {
  const path = String(pathname || "").toLowerCase();

  if (path.includes("cs2")) {
    return {
      title: "NHẬP CS2",
      fromBranch: "cs1",
      toBranch: "cs2",
      diaDiemXuat: "cs1",
      diaDiemNhap: "cs2",
      prefixXuat: "xcncs1_",
      prefixNhap: "ncncs2_",
      prefixPhieu: "kiemnhap1v2cs2"
    };
  }

  return {
    title: "NHẬP CS1",
    fromBranch: "cs2",
    toBranch: "cs1",
    diaDiemXuat: "cs2",
    diaDiemNhap: "cs1",
    prefixXuat: "xcncs2_",
    prefixNhap: "ncncs1_",
    prefixPhieu: "kiemnhap2v1cs1"
  };
}
