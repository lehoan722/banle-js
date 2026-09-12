// scripts/xaHangRules.js
// HOAN TUYET - module dung chung doc goi y xa hang.
// V1: logic nam trong RPC rpc_goiy_xahang_v1.
// Module KHONG ghi giam_gia_pct, chi tra ve goi y noi bo.

const norm = (v) => String(v ?? "").trim().toUpperCase();

function uniqueMasps(masps) {
  return [...new Set((masps || []).map(norm).filter(Boolean))];
}

/**
 * Tra ve Map:
 *   MASP -> {
 *     masp, goi_y_pct, rule_code, tong_nhap_mua, ngay_nhap_cuoi,
 *     so_ngay_tu_nhap_cuoi, ton_cs1_thuc, ton_cs2_thuc,
 *     ton_hientai, tyle_ton, nhomhang, chungloai
 *   }
 */
export async function getXaHangSuggestions({
  supabase,
  masps,
  denNgay
} = {}) {
  if (!supabase?.rpc) throw new Error("Supabase chưa sẵn sàng cho module xả hàng.");

  const arr = uniqueMasps(masps);
  if (!arr.length) return new Map();

  const { data, error } = await supabase.rpc("rpc_goiy_xahang_v1", {
    p_masps: arr,
    p_den_ngay: denNgay || null
  });

  if (error) throw error;

  const map = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const key = norm(row?.masp);
    if (!key) continue;
    map.set(key, {
      ...row,
      goi_y_pct: Number(row?.goi_y_pct || 0),
      tong_nhap_mua: Number(row?.tong_nhap_mua || 0),
      so_ngay_tu_nhap_cuoi: Number(row?.so_ngay_tu_nhap_cuoi || 0),
      ton_cs1_thuc: Number(row?.ton_cs1_thuc || 0),
      ton_cs2_thuc: Number(row?.ton_cs2_thuc || 0),
      ton_hientai: Number(row?.ton_hientai || 0),
      tyle_ton: row?.tyle_ton == null ? null : Number(row.tyle_ton)
    });
  }
  return map;
}

/**
 * Gan ket qua goi y vao cac record san pham ma khong sua cau truc goc.
 * Field su dung tren UI:
 *   goi_y_xa_pct
 *   goi_y_xa_rule
 *   goi_y_xa_detail
 */
export function attachXaHangSuggestions(rows, suggestionMap) {
  const map = suggestionMap instanceof Map ? suggestionMap : new Map();

  return (rows || []).map((sp) => {
    const suggestion = map.get(norm(sp?.masp)) || null;
    return {
      ...sp,
      goi_y_xa_pct: Number(suggestion?.goi_y_pct || 0),
      goi_y_xa_rule: suggestion?.rule_code || "",
      goi_y_xa_detail: suggestion
    };
  });
}
