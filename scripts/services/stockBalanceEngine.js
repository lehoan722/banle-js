import { supabase } from "../supabaseClient.js";

const ACTIVE_STATUS = ["moi", "dang_chuyen", "da_tao_phieu"];

function normMasp(v) {
  return String(v || "").trim().toUpperCase();
}

function normSize(v) {
  const s = String(v || "").replace(/^size\s+/i, "").trim();
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}

function getTargetStockByTotal(total) {
  const t = Number(total || 0);

  if (t <= 0) return { cs1: 0, cs2: 0 };
  if (t === 1) return { cs1: 0, cs2: 1 };
  if (t === 2) return { cs1: 1, cs2: 1 };
  if (t === 3) return { cs1: 1, cs2: 2 };
  if (t === 4) return { cs1: 2, cs2: 2 };
  if (t === 5) return { cs1: 2, cs2: 3 };
  if (t === 6) return { cs1: 3, cs2: 3 };
  if (t === 7) return { cs1: 3, cs2: 4 };
  if (t === 8) return { cs1: 3, cs2: 5 };
  if (t === 9) return { cs1: 3, cs2: 6 };
  if (t === 10) return { cs1: 4, cs2: 6 };

  const cs1 = Math.floor(t / 3);
  return { cs1, cs2: t - cs1 };
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
      lech_cs2: Number(kiemton?.cs2?.lech?.[size] || 0)
    };
  });
}

function calcSuggestions(masp, rows) {
  const out = [];

  rows.forEach(r => {
    const size = normSize(r.size);
    if (!size || size === "0") return;

    const ton1 = Math.max(0, Number(r.ton_cs1 || 0) + Number(r.lech_cs1 || 0));
    const ton2 = Math.max(0, Number(r.ton_cs2 || 0) + Number(r.lech_cs2 || 0));

    const total = ton1 + ton2;
    if (total <= 0) return;

    const target = getTargetStockByTotal(total);

    if (ton1 > target.cs1 && ton2 < target.cs2) {
      out.push({
        masp,
        size,
        soluong: Math.min(ton1 - target.cs1, target.cs2 - ton2),
        huong_chuyen: "1v2",
        tu_coso: "cs1",
        den_coso: "cs2"
      });
    }

    if (ton2 > target.cs2 && ton1 < target.cs1) {
      out.push({
        masp,
        size,
        soluong: Math.min(ton2 - target.cs2, target.cs1 - ton1),
        huong_chuyen: "2v1",
        tu_coso: "cs2",
        den_coso: "cs1"
      });
    }
  });

  return out.filter(x => Number(x.soluong || 0) > 0);
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

  for (const masp of masps) {
    const rows = await fetchCurrentPayload(masp);
    const suggestions = calcSuggestions(masp, rows);
    allSuggestions = allSuggestions.concat(suggestions);
  }

  const suggestionKeySet = new Set(
    allSuggestions.map(x =>
      `${normMasp(x.masp)}|${normSize(x.size)}|${x.huong_chuyen}`
    )
  );

  const outdatedIds = [];

  for (const row of pendingRows || []) {
    const key = `${normMasp(row.masp)}|${normSize(row.size)}|${row.huong_chuyen}`;
    const stillValid = suggestionKeySet.has(key);

    if (!stillValid) {
      outdatedIds.push(Number(row.id));
    }
  }

  if (outdatedIds.length) {
    const { error } = await supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "loi_thoi",
        updated_at: new Date().toISOString()
      })
      .in("id", outdatedIds);

    if (error) {
      console.error("[StockBalance] Lỗi đánh lỗi thời:", error);
    }
  }

  const activeKeySet = new Set(
    (pendingRows || [])
      .filter(r => !outdatedIds.includes(Number(r.id)))
      .map(r => `${normMasp(r.masp)}|${normSize(r.size)}|${r.huong_chuyen}`)
  );

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
      ghichu_dat: meta.sohd || "",
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
    outdated: outdatedIds.length,
    inserted: rowsToInsert.length
  };
}
