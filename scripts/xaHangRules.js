// scripts/xaHangRules.js - V2
// Module dung chung doc goi y xa hang.
// Toan bo luat V2 nam trong rpc_goiy_xahang_v1.
// KHONG ghi dmhanghoa.giam_gia_pct.

const norm = (v) => String(v ?? "").trim().toUpperCase();

function uniqueMasps(masps) {
  return [...new Set((masps || []).map(norm).filter(Boolean))];
}

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
      so_ngay_tu_nhap_cuoi: row?.so_ngay_tu_nhap_cuoi == null
        ? null
        : Number(row.so_ngay_tu_nhap_cuoi),
      ton_cs1_thuc: Number(row?.ton_cs1_thuc || 0),
      ton_cs2_thuc: Number(row?.ton_cs2_thuc || 0),
      ton_hientai: Number(row?.ton_hientai || 0),
      tyle_ton: row?.tyle_ton == null ? null : Number(row.tyle_ton),
      sizes_con_lai: String(row?.sizes_con_lai || ""),
      tat_ca_size_kho: row?.tat_ca_size_kho === true
    });
  }

  return map;
}

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
