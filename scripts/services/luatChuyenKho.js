// scripts/services/luatChuyenKho.js

export function normMasp(v) {
  return String(v || "").trim().toUpperCase();
}

export function normSize(v) {
  const s = String(v || "").replace(/^size\s+/i, "").trim();
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}

export const ACCEPTED_STOCK_RULES = {
  1: [{ cs1: 0, cs2: 1 }],
  2: [{ cs1: 1, cs2: 1 }],
  3: [{ cs1: 1, cs2: 2 }, { cs1: 2, cs2: 1 }],
  4: [{ cs1: 1, cs2: 3 }, { cs1: 2, cs2: 2 }],
  5: [{ cs1: 1, cs2: 4 }, { cs1: 2, cs2: 3 }, { cs1: 3, cs2: 2 }],
  6: [{ cs1: 2, cs2: 4 }, { cs1: 3, cs2: 3 }, { cs1: 4, cs2: 2 }],
  7: [{ cs1: 2, cs2: 5 }, { cs1: 3, cs2: 4 }, { cs1: 4, cs2: 3 }, { cs1: 5, cs2: 2 }]
};

export const BEAUTIFUL_STOCK_TARGET = {
  1: { cs1: 0, cs2: 1 },
  2: { cs1: 1, cs2: 1 },
  3: { cs1: 1, cs2: 2 },
  4: { cs1: 2, cs2: 2 },
  5: { cs1: 2, cs2: 3 },
  6: { cs1: 2, cs2: 4 },
  7: { cs1: 3, cs2: 4 }
};

export function getAcceptedStockRules(total) {
  const t = Number(total || 0);
  if (ACCEPTED_STOCK_RULES[t]) return ACCEPTED_STOCK_RULES[t];
  if (t <= 0) return [{ cs1: 0, cs2: 0 }];

  const cs1 = Math.floor(t / 3);
  return [{ cs1, cs2: t - cs1 }];
}

export function getSalesWinner(ban1, ban2) {
  const b1 = Number(ban1 || 0);
  const b2 = Number(ban2 || 0);

  if (b1 <= 0 && b2 <= 0) return "";

  // Một bên bán hơn bên kia ít nhất 2 sản phẩm
  // và đồng thời phải có sức bán vượt trội rõ ràng.
  if (b1 >= b2 + 2 && (b2 === 0 || b1 >= b2 * 2)) return "cs1";
  if (b2 >= b1 + 2 && (b1 === 0 || b2 >= b1 * 2)) return "cs2";

  return "";
}

export function getSmartTargetBySales(total, ban1, ban2) {
  const t = Number(total || 0);
  const winner = getSalesWinner(ban1, ban2);

  if (!winner) return getTargetStockByTotal(t);
  if (t <= 0) return { cs1: 0, cs2: 0 };

  const baseTarget = getTargetStockByTotal(t);

  if (winner === "cs1") {
    const cs1Need = Math.max(baseTarget.cs1, Math.round(t * 0.6), 1);
    return { cs1: Math.min(t, cs1Need), cs2: t - Math.min(t, cs1Need) };
  }

  if (winner === "cs2") {
    const cs2Need = Math.max(baseTarget.cs2, Math.round(t * 0.6), 1);
    return { cs1: t - Math.min(t, cs2Need), cs2: Math.min(t, cs2Need) };
  }

  return baseTarget;
}

export function getTargetStockByTotal(total) {
  const t = Number(total || 0);
  if (BEAUTIFUL_STOCK_TARGET[t]) return BEAUTIFUL_STOCK_TARGET[t];
  if (t <= 0) return { cs1: 0, cs2: 0 };

  const cs1 = Math.floor(t / 3);
  return { cs1, cs2: t - cs1 };
}

export function isAcceptedStock(total, cs1, cs2) {
  return getAcceptedStockRules(total).some(r =>
    Number(r.cs1) === Number(cs1) &&
    Number(r.cs2) === Number(cs2)
  );
}

export function getTonSauKiemRaw(row, coso) {
  const tonKey = coso === "cs2" ? "ton_cs2" : "ton_cs1";
  const lechKey = coso === "cs2" ? "lech_cs2" : "lech_cs1";

  return Number(row?.[tonKey] || 0) + Number(row?.[lechKey] || 0);
}

export function hasNegativeStockRow(row) {
  return getTonSauKiemRaw(row, "cs1") < 0 || getTonSauKiemRaw(row, "cs2") < 0;
}

export function hasNegativeStockRows(rows = []) {
  return (rows || []).some(r => hasNegativeStockRow(r));
}

export function getTonSauKiem(row, coso) {
  const tonKey = coso === "cs2" ? "ton_cs2" : "ton_cs1";
  const lechKey = coso === "cs2" ? "lech_cs2" : "lech_cs1";

  return Math.max(
    0,
    Number(row?.[tonKey] || 0) + Number(row?.[lechKey] || 0)
  );
}

export function calcGoiy(cs1, cs2, ban1 = 0, ban2 = 0) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  if (total <= 0) return "cân bằng";

  // LUẬT CỨNG:
  // Tổng tồn = 3, CS1 = 2, CS2 = 1
  // => luôn cân bằng, tuyệt đối không chuyển kho
  if (total === 3 && n1 === 2 && n2 === 1) {
    return "cân bằng";
  }

  const salesWinner = getSalesWinner(ban1, ban2);

  // Nếu không có cơ sở bán vượt trội thì dùng luật chấp nhận cũ
  if (!salesWinner && isAcceptedStock(total, n1, n2)) {
    return "cân bằng";
  }

  const target = salesWinner
    ? getSmartTargetBySales(total, ban1, ban2)
    : getTargetStockByTotal(total);

  if (n1 > target.cs1 && n2 < target.cs2 && n2 < 3) return "1v2";
  if (n2 > target.cs2 && n1 < target.cs1 && n1 < 2) return "2v1";

  return "cân bằng";
}

export function calcMoveQty(cs1, cs2, goiy = "", ban1 = 0, ban2 = 0) {
  const n1 = Number(cs1 || 0);
  const n2 = Number(cs2 || 0);
  const total = n1 + n2;

  if (total <= 0) return 0;

  // LUẬT CỨNG:
  // Tổng tồn = 3, CS1 = 2, CS2 = 1
  // => số lượng chuyển luôn bằng 0
  if (total === 3 && n1 === 2 && n2 === 1) {
    return 0;
  }

  const salesWinner = getSalesWinner(ban1, ban2);

  // Nếu không có cơ sở bán vượt trội thì giữ luật cân bằng cũ
  if (!salesWinner && isAcceptedStock(total, n1, n2)) return 0;

  const target = salesWinner
    ? getSmartTargetBySales(total, ban1, ban2)
    : getTargetStockByTotal(total);

  if (goiy === "1v2") {
    if (n2 >= target.cs2) return 0;
    return Math.max(0, Math.min(n1 - target.cs1, target.cs2 - n2));
  }

  if (goiy === "2v1") {
    if (n1 >= target.cs1) return 0;
    return Math.max(0, Math.min(n2 - target.cs2, target.cs1 - n1));
  }

  return 0;
}

export function calcSuggestionFromRow(row, maspInput = "", salesContext = null) {
  const masp = normMasp(row?.masp || maspInput);
  const size = normSize(row?.size);

  if (!masp || !size || size === "0") return null;

  const ton1 = getTonSauKiem(row, "cs1");
  const ton2 = getTonSauKiem(row, "cs2");

  const ban1 = Number(salesContext?.ban_cs1 ?? row?.ban_cs1 ?? 0);
  const ban2 = Number(salesContext?.ban_cs2 ?? row?.ban_cs2 ?? 0);

  const huong = calcGoiy(ton1, ton2, ban1, ban2);
  if (huong === "cân bằng") return null;

  const soluong = calcMoveQty(ton1, ton2, huong, ban1, ban2);
  if (soluong <= 0) return null;

  return {
    masp,
    size,
    soluong,
    huong_chuyen: huong,
    tu_coso: huong === "1v2" ? "cs1" : "cs2",
    den_coso: huong === "1v2" ? "cs2" : "cs1",
    ton_sau_kiem_cs1: ton1,
    ton_sau_kiem_cs2: ton2,
    ban_cs1: ban1,
    ban_cs2: ban2,
    sales_winner: getSalesWinner(ban1, ban2),
    smart_target: getSmartTargetBySales(ton1 + ton2, ban1, ban2)
  };
}

export function calcSuggestionsFromRows(rows = [], maspInput = "") {
  if (hasNegativeStockRows(rows)) return [];

  return (rows || [])
    .map(r => calcSuggestionFromRow(r, maspInput))
    .filter(Boolean);
}

export function calcSuggestionsFromPayload(masp, payload) {
  return calcSuggestionsFromRows(payload?.rows || [], masp);
}
