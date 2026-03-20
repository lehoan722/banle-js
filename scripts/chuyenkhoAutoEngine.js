// scripts/chuyenkhoAutoEngine.js
import { supabase } from './supabaseClient.js';

const SIZE_ORDER = ['size 0', 'size 38', 'size 39', 'size 40', 'size 41', 'size 42', 'size 43', 'size 44', 'size 45'];

const CFG = {
  keep_min_src: 1,
  dest_min: 2,
  max_move: 999999,
  prefer_cs2: true
};

function normalizeMasp(v) {
  return String(v || '').trim().toUpperCase();
}

function normalizeSize(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === '0' || s === 'size 0') return 'size 0';

  const m = s.match(/\d{1,2}/);
  if (!m) return String(v ?? '').trim();

  return `size ${m[0]}`;
}

function sizeSortValue(size) {
  const s = String(size || '').trim().toLowerCase();
  const m = s.match(/\d{1,2}/);
  return m ? Number(m[0]) : 999999;
}

function sortSizesAsc(arr) {
  return [...arr].sort((a, b) => {
    const av = sizeSortValue(a.size ?? a);
    const bv = sizeSortValue(b.size ?? b);
    if (av !== bv) return av - bv;
    return String(a.size ?? a).localeCompare(String(b.size ?? b), 'vi');
  });
}

function calcGoiy(cs1, cs2) {
  if (cs1 >= 1 && cs2 === 0) return '1v2';
  if (cs1 === 0 && cs2 >= 2) return '2v1';
  if (cs1 <= 1 && cs2 > 2) return '2v1';
  if (cs2 <= 1 && cs1 > 2) return '1v2';
  return 'cân bằng';
}

function calcMoveQty(cs1, cs2, goiy) {
  const keep = CFG.keep_min_src;
  const maxm = CFG.max_move;
  const total = (cs1 || 0) + (cs2 || 0);

  if (total === 1) {
    if (goiy === '1v2' && cs1 === 1) return Math.min(1, maxm);
    return 0;
  }

  if (total === 5) {
    const t1 = 2;
    if (goiy === '1v2') {
      const srcCap = Math.max(0, cs1 - keep);
      return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
    }
    if (goiy === '2v1') {
      const srcCap = Math.max(0, cs2 - keep);
      return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
    }
    return 0;
  }

  if (total > 5) {
    const t1 = Math.round(total / 3);
    if (goiy === '1v2') {
      const srcCap = Math.max(0, cs1 - keep);
      return Math.max(0, Math.min(cs1 - t1, srcCap, maxm));
    }
    if (goiy === '2v1') {
      const srcCap = Math.max(0, cs2 - keep);
      return Math.max(0, Math.min(t1 - cs1, srcCap, maxm));
    }
    return 0;
  }

  if (cs1 === 0 && cs2 > 1) {
    const srcCap = Math.max(0, cs2 - keep);
    return Math.min(1, srcCap);
  }

  if (goiy === '1v2') {
    const need_min = Math.max(0, CFG.dest_min - cs2);
    const need_bias = CFG.prefer_cs2
      ? Math.ceil((cs1 - cs2 + 1) / 2)
      : Math.ceil((cs1 - cs2) / 2);
    const q0 = Math.max(need_min, need_bias, 0);
    const srcCap = Math.max(0, cs1 - keep);
    return Math.max(0, Math.min(q0, srcCap, maxm));
  }

  if (goiy === '2v1') {
    const need_min = Math.max(0, CFG.dest_min - cs1);
    const need_bias = CFG.prefer_cs2
      ? Math.ceil((cs2 - cs1 - 1) / 2)
      : Math.ceil((cs2 - cs1) / 2);
    const q0 = Math.max(need_min, need_bias, 0);
    const srcCap = Math.max(0, cs2 - keep);
    return Math.max(0, Math.min(q0, srcCap, maxm));
  }

  return 0;
}

function getDirByPageKind(pageKind) {
  return pageKind === 'cs2' ? '2v1' : '1v2';
}

function getTargetUrlByPageKind(pageKind) {
  return pageKind === 'cs2'
    ? 'https://banle-js.vercel.app/ccn2v1cs2.html'
    : 'https://banle-js.vercel.app/ccn1v2cs1.html';
}

async function fetchXntNhanhRows(masps) {
  const uniq = [...new Set((masps || []).map(normalizeMasp).filter(Boolean))];
  if (!uniq.length) return [];

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const denNgay = `${y}-${m}-${d}`;

  const { data, error } = await supabase.rpc('xntnhanh', {
    p_masps: uniq,
    p_den_ngay: denNgay,
    p_tonghop_size: false
  });

  if (error) throw error;

  return (data || []).map(r => ({
    masp: normalizeMasp(r.masp),
    size: normalizeSize(r.size),
    ton_cs1: Number(r.ton_cs1 || 0),
    ton_cs2: Number(r.ton_cs2 || 0)
  }));
}

function buildTransferGroupsFromXntRows(xntRows, dir) {
  const grouped = new Map();

  for (const r of xntRows) {
    const masp = normalizeMasp(r.masp);
    const size = normalizeSize(r.size);
    if (!masp || !size) continue;

    const cs1 = Number(r.ton_cs1 || 0);
    const cs2 = Number(r.ton_cs2 || 0);
    const goiy = calcGoiy(cs1, cs2);

    if (goiy !== dir) continue;

    const sl = calcMoveQty(cs1, cs2, goiy);
    if (!sl || sl <= 0) continue;

    if (!grouped.has(masp)) {
      grouped.set(masp, { masp, items: [] });
    }

    grouped.get(masp).items.push({
      size,
      sl: Number(sl)
    });
  }

  const out = [];
  for (const [, g] of grouped) {
    const items = sortSizesAsc(g.items)
      .filter(x => Number(x.sl || 0) > 0);

    if (!items.length) continue;

    out.push({
      masp: g.masp,
      items
    });
  }

  out.sort((a, b) => a.masp.localeCompare(b.masp, 'vi'));
  return out;
}

function buildPrefillPayload(groups, pageKind, note = '') {
  return {
    dir: getDirByPageKind(pageKind),
    note: note || 'Tạo tự động từ trang nhập tạm',
    items: groups.map(g => ({
      masp: g.masp,
      items: g.items.map(x => ({
        size: x.size,
        sl: Number(x.sl || 0)
      }))
    }))
  };
}

export async function autoSuggestAndOpenCcn({
  masps,
  pageKind,
  note
}) {
  const dir = getDirByPageKind(pageKind);
  const targetUrl = getTargetUrlByPageKind(pageKind);

  const xntRows = await fetchXntNhanhRows(masps);
  const groups = buildTransferGroupsFromXntRows(xntRows, dir);

  if (!groups.length) {
    return {
      ok: false,
      reason: 'empty',
      message: 'Không có mã nào cần chuyển kho.'
    };
  }

  const payload = buildPrefillPayload(groups, pageKind, note);
  localStorage.setItem('ccn_prefill_payload', JSON.stringify(payload));
  window.open(targetUrl, '_blank');

  return {
    ok: true,
    count_masp: groups.length,
    count_size: groups.reduce((s, g) => s + g.items.length, 0)
  };
}