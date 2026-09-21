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
    duDuLieu: n(row.confidence_score) >= 20,
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

// ------------------------------------------------------------
// V1.4 - helper hien thi va giai thich 6 chi so dung chung
// ------------------------------------------------------------
export const SALES_CAPABILITY_HELP = {
  doDayDuSize: {
    title: '1. Độ đầy đủ size',
    short: 'Đo mức độ dải size hiện tại còn phủ đúng nhu cầu bán của chính mã sản phẩm.',
    detail: 'Không lấy toàn bộ size của nhóm hàng làm chuẩn. Hệ thống xác định dải size thực mà riêng SKU này từng kinh doanh trên cả hai cơ sở, sau đó chuẩn hóa trọng số nhu cầu size trong chính dải đó. Ví dụ SKU từ đầu chỉ có 39–42 thì khi còn đủ 39–42 sẽ là 100 điểm. Nếu một cơ sở chỉ được cấp một phần dải size, độ đầy đủ tại cơ sở đó sẽ thấp tương ứng để phản ánh cơ hội bán bị hạn chế.'
  },
  ngayBanHieuDung: {
    title: '2. Ngày bán hiệu dụng',
    short: 'Số ngày sản phẩm thực sự có cơ hội bán, sau khi điều chỉnh theo tình trạng size.',
    detail: 'Một ngày lịch không mặc định bằng 1 ngày bán. Ngày đủ dải size của SKU được tính gần 1 ngày; ngày thiếu các size quan trọng bị giảm trọng số; ngày hết hàng có trọng số 0. Nhờ đó cơ sở không bị đánh giá bán chậm chỉ vì không được cấp hàng hoặc bị gãy size.'
  },
  tocDoBan: {
    title: '3. Tốc độ bán thực tế',
    short: 'Số sản phẩm bán được chia cho tổng ngày bán hiệu dụng.',
    detail: 'Đây là tốc độ bán đã loại ảnh hưởng của những ngày không có hàng hoặc cơ cấu size quá yếu. Trên giao diện hiển thị theo dạng dễ đọc, ví dụ 0,1 sp/ngày sẽ được viết thành “1 sản phẩm / 10 ngày hiệu dụng”. Đây là chỉ số cốt lõi để so sánh năng lực bán giữa CS1 và CS2.'
  },
  nangLucBan: {
    title: '4. Năng lực bán của cơ sở',
    short: 'Điểm tổng hợp cho biết mã này thực sự phù hợp với cơ sở nào hơn.',
    detail: 'Điểm nền gồm khoảng 55% tốc độ bán đã chuẩn hóa trong cùng nhóm hàng và cơ sở, 30% khả năng chuyển hàng được giao thành doanh số, 15% xu hướng bán gần đây. Khi dữ liệu còn ít, hệ thống vẫn cho điểm để so sánh nhưng kéo điểm về gần mức trung tính 50 theo độ tin cậy. Vì vậy cần đọc cùng chỉ số “tin cậy”: điểm cao nhưng tin cậy thấp mới chỉ là tín hiệu sơ bộ.'
  },
  chuyenDoi: {
    title: '5. Tỷ lệ hàng được chuyển thành doanh số',
    short: 'Đo phần hàng thực sự được giao cho cơ sở đã biến thành bán.',
    detail: 'V1.4 dùng toàn bộ khoảng dữ liệu tính toán (thường 365 ngày), lấy lượng bán chia cho lượng hàng thực tế có cơ hội bán tại cơ sở. Hàng đã chuyển ra khỏi cơ sở được trừ khỏi lượng cung để tránh đánh giá oan. Ví dụ cơ sở được cấp 2 chiếc và bán hết cả 2 thì tỷ lệ có thể đạt 100% dù mẫu còn nhỏ.'
  },
  sucKhoeTon: {
    title: '6. Sức khỏe tồn kho',
    short: 'Đo tồn hiện tại còn khỏe để tiếp tục bán hay đã thành tồn xấu.',
    detail: 'Không phải tồn càng nhiều càng khỏe. Điểm kết hợp độ đầy đủ size hiện tại, số ngày phủ tồn so với tốc độ bán, xu hướng bán gần đây và tuổi tồn. Hết hàng thì sức khỏe tồn bằng 0 vì không còn hàng để bán; một mã còn đủ size nhưng bán quá chậm có thể bị xếp “tồn chậm”, không bị gọi nhầm là “gãy size”.'
  }
};

export function formatVelocityRatio(value, maximumFractionDigits = 1) {
  const v = Number(value || 0);
  if (!Number.isFinite(v) || v <= 0) return '—';
  const fmt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits });
  if (v <= 1) {
    const days = 1 / v;
    return `1 sp / ${fmt(days)} ngày hiệu dụng`;
  }
  return `${fmt(v)} sp / 1 ngày hiệu dụng`;
}
