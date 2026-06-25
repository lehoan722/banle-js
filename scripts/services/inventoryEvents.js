import { syncStockBalanceByMasps } from "./stockBalanceEngine.js";

let queue = new Set();
let lastMeta = {};
let timer = null;

function extractMaspsFromBangKetQua(bangKetQua) {
  return Array.from(new Set(
    Object.values(bangKetQua || {})
      .map(x => String(x?.masp || "").trim().toUpperCase())
      .filter(Boolean)
  ));
}

function extractMaspsFromChitiet(chitiet) {
  return Array.from(new Set(
    (chitiet || [])
      .map(x => String(x?.masp || "").trim().toUpperCase())
      .filter(Boolean)
  ));
}

export function emitInventoryChanged(maspsInput = [], meta = {}) {
  const masps = Array.from(new Set(
    (maspsInput || [])
      .map(x => String(x || "").trim().toUpperCase())
      .filter(Boolean)
  ));

  if (!masps.length) return;

  masps.forEach(m => queue.add(m));
  lastMeta = { ...lastMeta, ...meta };

  clearTimeout(timer);

  timer = setTimeout(async () => {
    const runMasps = Array.from(queue);
    queue.clear();

    try {
      await syncStockBalanceByMasps(runMasps, lastMeta);
    } catch (e) {
      console.error("[InventoryEvents] sync lỗi:", e);
    }
  }, 500);
}

export function emitInventoryChangedByBangKetQua(bangKetQua, meta = {}) {
  emitInventoryChanged(extractMaspsFromBangKetQua(bangKetQua), meta);
}

export function emitInventoryChangedByChitiet(chitiet, meta = {}) {
  emitInventoryChanged(extractMaspsFromChitiet(chitiet), meta);
}