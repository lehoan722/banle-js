// ===== CORE =====

// config
export const CFG = {
  SIZE_DEFAULT: 'FREESIZE'
};

// state dùng chung
export const state = {
  nhapMap: new Map(),
  xuatMap: new Map(),
  selectedMasp: null
};

// helpers
export function byId(id) {
  return document.getElementById(id);
}

export function normalizeMasp(masp) {
  return (masp || '').trim().toUpperCase();
}

export function normalizeSize(size) {
  return (size || '').toString().trim().toUpperCase();
}

export function makeKey(masp, size) {
  return `${masp}__${size}`;
}

export function splitKey(key) {
  const [masp, size] = key.split('__');
  return { masp, size };
}

export function parseNumber(val) {
  return Number(val) || 0;
}

// beep
export function beep() {
  try {
    const audio = new Audio('./soundBeep.mp3');
    audio.play();
  } catch {}
}