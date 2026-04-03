// scripts/chuyenkhoAutoEngine.js
import { supabase } from './supabaseClient.js';

function normalizeMasp(v) {
  return String(v || '').trim().toUpperCase();
}

function normalizeSize(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '';

  const s = raw.toLowerCase();
  if (s === '0' || s === 'size 0') return 'SIZE 0';

  const m = s.match(/\d{1,2}/);
  if (!m) return raw.toUpperCase();

  return `SIZE ${m[0]}`;
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

function isInvalidTransferSize(size) {
  const s = String(size ?? '').trim().toUpperCase();
  return s === '' || s === '0' || s === '0.0' || s === '00' || s === 'SIZE 0';
}

function getTargetStockByTotal(total) {
  const t = Number(total || 0);

  if (t <= 0) {
    return { cs1: 0, cs2: 0 };
  }

  // Quy tắc cố định từ 1 đến 5
  if (t === 1) return { cs1: 0, cs2: 1 };
  if (t === 2) return { cs1: 1, cs2: 1 };
  if (t === 3) return { cs1: 1, cs2: 2 };
  if (t === 4) return { cs1: 1, cs2: 3 };
  if (t === 5) return { cs1: 2, cs2: 3 };

  // Từ 6 trở lên:
  // CS1 = 1/3 tổng làm tròn xuống
  // CS2 = phần còn lại
  const targetCs1 = Math.floor(t / 3);
  const targetCs2 = t - targetCs1;

  return {
    cs1: targetCs1,
    cs2: targetCs2
  };
}

function calcGoiy(cs1, cs2) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  const target = getTargetStockByTotal(total);

  if (n1 > target.cs1) return '1v2';
  if (n1 < target.cs1) return '2v1';
  return 'cân bằng';
}

function calcMoveQty(cs1, cs2, goiy) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  const target = getTargetStockByTotal(total);

  if (goiy === '1v2') {
    return Math.max(0, n1 - target.cs1);
  }

  if (goiy === '2v1') {
    return Math.max(0, target.cs1 - n1);
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
    if (isInvalidTransferSize(size)) continue;

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
