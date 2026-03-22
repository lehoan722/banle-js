// ================= CORE =================

// config
export const CFG = {
  SIZE_DEFAULT: 'FREESIZE'
};

// state global
export const state = {
  nhapMap: new Map(),
  xuatMap: new Map(),
  selectedMasp: null,
  currentHoaDon: null,
  nhanVien: null
};

// ===== helper DOM =====
export function byId(id) {
  return document.getElementById(id);
}

// ===== normalize =====
export function normalizeMasp(masp) {
  return (masp || '').trim().toUpperCase();
}

export function normalizeSize(size) {
  return (size || '').toString().trim().toUpperCase();
}

export function parseNumber(val) {
  return Number(val) || 0;
}

// ===== key =====
export function makeKey(masp, size) {
  return `${masp}__${size}`;
}

export function splitKey(key) {
  const [masp, size] = key.split('__');
  return { masp, size };
}

// ===== format =====
export function formatNumber(num) {
  return Number(num || 0).toLocaleString('vi-VN');
}

// ===== beep =====
export function beepError() {
  try {
    const a = new Audio('./soundBeep.mp3');
    a.play();
  } catch {}
}

export function beepSuccess() {
  try {
    const a = new Audio('./soundSuccess.mp3');
    a.play();
  } catch {}
}

// ===== tiện ích =====
export function focusEnd(el) {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  el.setSelectionRange(len, len);
}
