// Hoan Tuyet - Module Nang Luc Ban Hang V1
// Module dung chung cho cac trang: ton kho, chuyen kho, nhap hang, xa hang, tim kiem nhanh...
// Khong tu dong refresh toan bo. Trang goi module chi refresh targeted khi can.

import { getSupabaseClient } from './authModule.js';

const supabase = getSupabaseClient();

const cleanCode = v => String(v || '').trim().toUpperCase();
const cleanBranch = v => {
  const x = String(v || '').trim().toLowerCase();
  return (x === 'cs1' || x === 'cs2') ? x : null;
};
const uniqueCodes = arr => [...new Set((arr || []).map(cleanCode).filter(Boolean))];

function one(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

/**
 * Refresh dung cac ma can dung, khong quet toan bo he thong.
 * Nen goi truoc khi mot trang can dua ra quyet dinh quan trong tren 1 vai ma.
 */
export async function refreshSalesCapability(masps, days = 365) {
  const codes = uniqueCodes(masps);
  if (!codes.length) return { processed: 0 };
  const { data, error } = await supabase.rpc('nlbh_refresh_masps_v1', {
    p_masps: codes,
    p_days: Math.max(30, Math.min(Number(days || 365), 1095))
  });
  if (error) throw error;
  return one(data) || { processed: 0 };
}

/**
 * Refresh mot batch cac ma dang dirty. Phu hop dashboard/admin, KHONG goi lien tuc moi page load.
 */
export async function refreshDirtySalesCapability(limit = 100, days = 365) {
  const { data, error } = await supabase.rpc('nlbh_refresh_dirty_v1', {
    p_limit: Math.max(1, Math.min(Number(limit || 100), 500)),
    p_days: Math.max(30, Math.min(Number(days || 365), 1095))
  });
  if (error) throw error;
  return one(data) || { processed: 0, remaining: 0 };
}

/**
 * Doc snapshot 6 chi so. Day la ham nen ma cac trang khac nen tham chieu.
 */
export async function getSalesCapability({ masps = null, diadiem = null, nhomhang = null, limit = 500 } = {}) {
  const codes = masps ? uniqueCodes(masps) : null;
  const { data, error } = await supabase.rpc('nlbh_get_v1', {
    p_masps: codes && codes.length ? codes : null,
    p_diadiem: cleanBranch(diadiem),
    p_nhomhang: nhomhang ? String(nhomhang).trim().toUpperCase() : null,
    p_limit: Math.max(1, Math.min(Number(limit || 500), 5000))
  });
  if (error) throw error;
  return Array.isArray(data) ? data : (data ? [data] : []);
}

/** Lay 1 ma + 1 co so. */
export async function getProductBranchCapability(masp, diadiem, { fresh = false, days = 365 } = {}) {
  const code = cleanCode(masp);
  const branch = cleanBranch(diadiem);
  if (!code || !branch) return null;
  if (fresh) await refreshSalesCapability([code], days);
  const rows = await getSalesCapability({ masps: [code], diadiem: branch, limit: 2 });
  return rows[0] || null;
}

/** Lay dong thoi CS1 + CS2. */
export async function getProductBothBranches(masp, { fresh = false, days = 365 } = {}) {
  const code = cleanCode(masp);
  if (!code) return { cs1: null, cs2: null };
  if (fresh) await refreshSalesCapability([code], days);
  const rows = await getSalesCapability({ masps: [code], limit: 10 });
  return {
    cs1: rows.find(r => r.diadiem === 'cs1') || null,
    cs2: rows.find(r => r.diadiem === 'cs2') || null
  };
}

/**
 * So sanh 2 co so + goi y hanh dong nen.
 * Trang nghiep vu co the them dieu kien rieng cua minh sau khi doc ket qua nay.
 */
export async function compareBranches(masp, { fresh = false, days = 365 } = {}) {
  const code = cleanCode(masp);
  if (!code) return null;
  if (fresh) await refreshSalesCapability([code], days);
  const { data, error } = await supabase.rpc('nlbh_compare_branches_v1', { p_masp: code });
  if (error) throw error;
  return one(data);
}

/**
 * Chuyen snapshot thanh object gon cho UI.
 */
export function normalizeCapability(row) {
  if (!row) return null;
  const n = v => Number(v || 0) || 0;
  return {
    masp: row.masp,
    diadiem: row.diadiem,
    nhomhang: row.nhomhang,
    tonHienTai: n(row.ton_hientai),
    doDayDuSize: n(row.do_day_du_size),
    ngayBanHieuDung90: n(row.ngay_ban_hieu_dung_90),
    tocDoBanThucTe90: n(row.toc_do_ban_thuc_te_90),
    nangLucBan: n(row.nang_luc_ban_coso),
    tyLeChuyenDoi: n(row.ty_le_chuyen_doi_doanh_so),
    sucKhoeTon: n(row.suc_khoe_ton_kho),
    confidence: n(row.confidence_score),
    xuHuongBan: n(row.xu_huong_ban),
    soNgayPhuTon: row.so_ngay_phu_ton == null ? null : n(row.so_ngay_phu_ton),
    trangThaiTon: row.trang_thai_ton,
    coThieuHang: !!row.co_thieu_hang,
    coTonLe: !!row.co_ton_le,
    coTonCham: !!row.co_ton_cham,
    updatedAt: row.updated_at
  };
}

export default {
  refreshSalesCapability,
  refreshDirtySalesCapability,
  getSalesCapability,
  getProductBranchCapability,
  getProductBothBranches,
  compareBranches,
  normalizeCapability
};
