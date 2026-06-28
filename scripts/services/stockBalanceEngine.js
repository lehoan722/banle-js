import { supabase } from "../supabaseClient.js";
import {
  normMasp,
  normSize,
  calcSuggestionsFromRows,
  hasNegativeStockRows
} from "./luatChuyenKho.js";

const ACTIVE_STATUS = ["moi", "dang_chuyen", "da_tao_phieu", "yeu_cau_kiem_kho"];
function makeKey(x) {
  return `${normMasp(x.masp)}|${normSize(x.size)}|${x.huong_chuyen}`;
}

async function fetchCurrentPayload(masp) {
  const today = new Date().toISOString().slice(0, 10);

  const [snapRes, kiemRes] = await Promise.all([
    supabase.rpc("xntnhanh", {
      p_masps: [masp],
      p_den_ngay: today,
      p_tonghop_size: false
    }),
    supabase.rpc("rpc_stockquick_kiemton", {
      p_masp: masp
    })
  ]);

  if (snapRes.error) {
    console.error("[StockBalance] xntnhanh lỗi:", masp, snapRes.error);
    return [];
  }

  const kiemton = kiemRes.data || { cs1: {}, cs2: {} };

  return (snapRes.data || []).map(r => {

    const size = normSize(r.size);

    return {

      masp,
      size,

      ton_cs1: Number(r.ton_cs1 || 0),
      ton_cs2: Number(r.ton_cs2 || 0),

      lech_cs1: Number(kiemton?.cs1?.lech?.[size] || 0),
      lech_cs2: Number(kiemton?.cs2?.lech?.[size] || 0),

      // ===== truyền đầy đủ dữ liệu bán =====

      ban_cs1: Number(r.ban_cs1 || 0),
      ban_cs2: Number(r.ban_cs2 || 0),

      tong_ban: Number(r.tong_ban || 0),
      tong_nhap: Number(r.tong_nhap || 0),
      tong_ton: Number(r.tong_ton || 0)
    };

  });
}

export async function syncStockBalanceByMasps(maspsInput = [], meta = {}) {
  const masps = Array.from(new Set(
    (maspsInput || []).map(normMasp).filter(Boolean)
  ));

  if (!masps.length) return { ok: true, skipped: true };

  console.log("[StockBalance] sync:", { masps, meta });

  const { data: pendingRows, error: pendingErr } = await supabase
    .from("dat_hang_chuyen_kho")
    .select("*")
    .in("masp", masps)
    .in("trang_thai", ACTIVE_STATUS);

  if (pendingErr) {
    console.error("[StockBalance] Lỗi đọc hàng đợi:", pendingErr);
    return { ok: false, error: pendingErr };
  }

  let allSuggestions = [];
  const negativeMasps = new Set();

  for (const masp of masps) {
    const rows = await fetchCurrentPayload(masp);

    if (hasNegativeStockRows(rows)) {
      negativeMasps.add(masp);
      continue;
    }

    const suggestions = calcSuggestionsFromRows(rows, masp);
    allSuggestions = allSuggestions.concat(suggestions);
  }

  const suggestionKeySet = new Set(
    allSuggestions.map(makeKey)
  );

  const outdatedIds = [];
  const needCheckIds = [];
  const restoreFromCheckIds = [];

  for (const row of pendingRows || []) {
    const masp = normMasp(row.masp);
    const status = String(row.trang_thai || "");
    const key = makeKey(row);

    if (negativeMasps.has(masp)) {
      if (status === "moi") {
        needCheckIds.push(Number(row.id));
      }
      continue;
    }

    const stillValid = suggestionKeySet.has(key);

    if (status === "yeu_cau_kiem_kho") {
      if (stillValid) {
        restoreFromCheckIds.push(Number(row.id));
      } else {
        outdatedIds.push(Number(row.id));
      }
      continue;
    }

    if (!stillValid) {
      outdatedIds.push(Number(row.id));
    }
  }

  if (needCheckIds.length) {
    const { error } = await supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "yeu_cau_kiem_kho",
        chon_chuyen: false,
        updated_at: new Date().toISOString()
      })
      .in("id", needCheckIds)
      .eq("trang_thai", "moi");

    if (error) {
      console.error("[StockBalance] Lỗi đánh yêu cầu kiểm kho:", error);
    }
  }

  if (restoreFromCheckIds.length) {
    const { error } = await supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "moi",
        chon_chuyen: false,
        updated_at: new Date().toISOString()
      })
      .in("id", restoreFromCheckIds)
      .eq("trang_thai", "yeu_cau_kiem_kho");

    if (error) {
      console.error("[StockBalance] Lỗi khôi phục yêu cầu kiểm kho:", error);
    }
  }

  if (outdatedIds.length) {
    const { error } = await supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "loi_thoi",
        chon_chuyen: false,
        updated_at: new Date().toISOString()
      })
      .in("id", outdatedIds);

    if (error) {
      console.error("[StockBalance] Lỗi đánh lỗi thời:", error);
    }
  }

  const activeKeySet = new Set(
    (pendingRows || [])
      .filter(r =>
        !outdatedIds.includes(Number(r.id)) &&
        !needCheckIds.includes(Number(r.id))
      )
      .map(makeKey)
  );

  if (negativeMasps.size) {
    console.warn("[StockBalance] Có mã tồn âm, không tạo gợi ý:", Array.from(negativeMasps));
  }

  const rowsToInsert = allSuggestions
    .filter(x => {
      const key = `${normMasp(x.masp)}|${normSize(x.size)}|${x.huong_chuyen}`;
      return !activeKeySet.has(key);
    })
    .map(x => ({
      masp: normMasp(x.masp),
      size: normSize(x.size),
      soluong: Number(x.soluong || 1),
      huong_chuyen: x.huong_chuyen,
      tu_coso: x.tu_coso,
      den_coso: x.den_coso,
      manv_dat: meta.manv || localStorage.getItem("manv") || "",
      ghichu_dat: meta.sohd ? `${meta.sohd}` : "",
      trang_thai: "moi",
      nguon: "auto_stock_balance"
    }));

  if (rowsToInsert.length) {
    const { error } = await supabase
      .from("dat_hang_chuyen_kho")
      .insert(rowsToInsert);

    if (error) {
      console.error("[StockBalance] Lỗi tạo gợi ý tự động:", error);
    }
  }

  return {
    ok: true,
    masps,
    negative: Array.from(negativeMasps),
    need_check: needCheckIds.length,
    restored_from_check: restoreFromCheckIds.length,
    outdated: outdatedIds.length,
    inserted: rowsToInsert.length
  };
}
