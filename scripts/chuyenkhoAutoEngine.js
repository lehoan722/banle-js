// scripts/chuyenkhoAutoEngine.js
// HOAN TUYET - Auto transfer suggestion engine V2
// Dùng TỒN SAU KIỂM + cùng luật chuẩn với scripts/chuyenkho.js

import { supabase } from './supabaseClient.js';
import {
  calcSuggestionsFromRows,
  normSize
} from './services/luatChuyenKho.js';

function normalizeMasp(v) {
  return String(v || '').trim().toUpperCase();
}

function normalizeSize(v) {
  const s = normSize(v);
  return String(s || '').trim();
}

function sizeSortValue(size) {
  const m = String(size || '').match(/\d{1,2}/);
  return m ? Number(m[0]) : 999999;
}

function isInvalidTransferSize(size) {
  const s = String(size ?? '').trim().toUpperCase();
  return s === '' || s === '0' || s === '0.0' || s === '00' || s === 'SIZE 0';
}

function getDirByPageKind(pageKind) {
  return String(pageKind || '').toLowerCase() === 'cs2' ? '2v1' : '1v2';
}

function getTargetUrlByPageKind(pageKind) {
  return String(pageKind || '').toLowerCase() === 'cs2'
    ? 'https://app.hoantuyet.vn/ccn2v1cs2.html'
    : 'https://app.hoantuyet.vn/ccn1v2cs1.html';
}

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchXntNhanhRows(masps) {
  const uniq = [...new Set((masps || []).map(normalizeMasp).filter(Boolean))];
  if (!uniq.length) return [];

  // xntnhanh giới hạn tối đa 50 mã/lần -> chia lô để module dùng chung an toàn.
  const out = [];
  const batchSize = 50;

  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize);
    const { data, error } = await supabase.rpc('xntnhanh', {
      p_masps: batch,
      p_den_ngay: todayYmd(),
      p_tonghop_size: false
    });
    if (error) throw error;
    out.push(...(data || []));
  }

  return out.map(r => ({
    masp: normalizeMasp(r.masp),
    size: normalizeSize(r.size),
    ton_cs1: Number(r.ton_cs1 || 0),
    ton_cs2: Number(r.ton_cs2 || 0),
    ban_cs1: Number(r.ban_cs1 || 0),
    ban_cs2: Number(r.ban_cs2 || 0),
    tong_ban: Number(r.tong_ban || 0),
    tong_nhap: Number(r.tong_nhap || 0),
    tong_ton: Number(r.tong_ton || 0)
  }));
}

async function fetchLatestCheckDeltaBulk(masps) {
  const uniq = [...new Set((masps || []).map(normalizeMasp).filter(Boolean))];
  const map = new Map();
  if (!uniq.length) return map;

  // RPC bulk không có giới hạn 50 nhưng chia lô vừa phải để payload ổn định.
  const batchSize = 200;
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize);
    const { data, error } = await supabase.rpc('rpc_stockquick_kiemton_bulk', {
      p_masps: batch
    });
    if (error) throw error;

    for (const item of (data || [])) {
      const masp = normalizeMasp(item.masp);
      if (!masp) continue;
      map.set(masp, {
        cs1: item.cs1 || { nguoi_kiem: null, ngay_kiem: null, lech: {} },
        cs2: item.cs2 || { nguoi_kiem: null, ngay_kiem: null, lech: {} }
      });
    }
  }
  return map;
}

function buildRowsAfterCheck(xntRows, kiemTonMap) {
  return (xntRows || [])
    .map(r => {
      const masp = normalizeMasp(r.masp);
      const size = normalizeSize(r.size);
      if (!masp || !size || isInvalidTransferSize(size)) return null;

      const kt = kiemTonMap.get(masp) || { cs1: { lech: {} }, cs2: { lech: {} } };
      const lech1 = Number(kt?.cs1?.lech?.[size] || 0);
      const lech2 = Number(kt?.cs2?.lech?.[size] || 0);

      // Quan trọng: ton_cs1/2 ở đây vẫn là tồn chứng từ.
      // calcSuggestionsFromRows() sẽ cộng lech_cs1/2 để ra tồn sau kiểm,
      // đúng cùng cách với luật chuẩn của trang chuyển kho.
      return {
        ...r,
        masp,
        size,
        lech_cs1: lech1,
        lech_cs2: lech2
      };
    })
    .filter(Boolean);
}

function buildTransferGroups(rowsAfterCheck, dir) {
  const groupedRows = new Map();
  for (const row of rowsAfterCheck) {
    if (!groupedRows.has(row.masp)) groupedRows.set(row.masp, []);
    groupedRows.get(row.masp).push(row);
  }

  const transferMap = new Map();

  for (const [masp, rows] of groupedRows) {
    const suggestions = calcSuggestionsFromRows(rows, masp)
      .filter(x => x.huong_chuyen === dir);

    for (const s of suggestions) {
      if (!transferMap.has(masp)) transferMap.set(masp, []);
      transferMap.get(masp).push({
        size: normalizeSize(s.size),
        sl: Number(s.soluong || 0),
        ton_sau_kiem_cs1: Number(s.ton_sau_kiem_cs1 || 0),
        ton_sau_kiem_cs2: Number(s.ton_sau_kiem_cs2 || 0)
      });
    }
  }

  return [...transferMap.entries()]
    .map(([masp, items]) => ({
      masp,
      items: items
        .filter(x => !isInvalidTransferSize(x.size) && x.sl > 0)
        .sort((a, b) => sizeSortValue(a.size) - sizeSortValue(b.size))
    }))
    .filter(g => g.items.length)
    .sort((a, b) => a.masp.localeCompare(b.masp, 'vi'));
}

function buildPrefillPayload(groups, pageKind, note = '', source = 'AUTO') {
  const sourceNorm = String(source || 'AUTO').trim().toUpperCase();
  const fromNhapTam = sourceNorm === 'NHAPTAM';

  return {
    version: 2,
    dir: getDirByPageKind(pageKind),
    source: sourceNorm,
    from_nhaptam: fromNhapTam,
    lock_after_save: fromNhapTam,
    stock_basis: 'TON_SAU_KIEM',
    note: note || (fromNhapTam ? 'Tạo tự động từ trang nhập tạm' : 'Tạo tự động'),
    items: groups.map(g => ({
      masp: g.masp,
      items: g.items.map(x => ({
        size: x.size,
        sl: Number(x.sl || 0),
        ton_sau_kiem_cs1: Number(x.ton_sau_kiem_cs1 || 0),
        ton_sau_kiem_cs2: Number(x.ton_sau_kiem_cs2 || 0)
      }))
    }))
  };
}

export async function autoSuggestAndOpenCcn({
  masps,
  pageKind,
  note,
  source = 'AUTO'
}) {
  const cleanMasps = [...new Set((masps || []).map(normalizeMasp).filter(Boolean))];
  if (!cleanMasps.length) {
    return { ok: false, reason: 'empty_input', message: 'Không có mã sản phẩm để tính chuyển kho.' };
  }

  const dir = getDirByPageKind(pageKind);
  const targetUrl = getTargetUrlByPageKind(pageKind);

  // Hai nguồn chạy song song để giảm thời gian chờ.
  const [xntRows, kiemTonMap] = await Promise.all([
    fetchXntNhanhRows(cleanMasps),
    fetchLatestCheckDeltaBulk(cleanMasps)
  ]);

  const rowsAfterCheck = buildRowsAfterCheck(xntRows, kiemTonMap);
  const groups = buildTransferGroups(rowsAfterCheck, dir);

  if (!groups.length) {
    return {
      ok: false,
      reason: 'empty',
      message: 'Không có mã nào cần chuyển kho theo tồn sau kiểm và luật chuyển kho hiện hành.'
    };
  }

  const payload = buildPrefillPayload(groups, pageKind, note, source);
  localStorage.setItem('ccn_prefill_payload', JSON.stringify(payload));
  window.open(targetUrl, '_blank');

  return {
    ok: true,
    stock_basis: 'TON_SAU_KIEM',
    count_masp: groups.length,
    count_size: groups.reduce((s, g) => s + g.items.length, 0)
  };
}
