// scripts/luuhoadon/pricing.js
// Tính toán số tiền (tongthanhtien, v.v.)
export function normalizeBangKetQua(bkq) {
    if (!bkq) return;
    Object.values(bkq).forEach(item => {
        if (Array.isArray(item?.sizes)) {
            item.sizes = item.sizes.map(sz => {
                const s = String(sz ?? "").trim();
                return s === "" ? "0" : s;
            });
        }
    });
}

export function calcTongThanhTienFromBangKetQua(bangKetQua) {
  let sum = 0;
  try {
    Object.values(bangKetQua || {}).forEach((item) => {
      const gia = Number(item?.gia || 0);
      const km = Number(item?.km || 0);
      const soluongs = item?.soluongs || [];
      for (let i = 0; i < soluongs.length; i++) {
        const sl = Number(soluongs[i] || 0);
        sum += (gia - km) * sl;
      }
    });
  } catch (e) {
    console.warn("calcTongThanhTienFromBangKetQua error:", e);
  }
  // đảm bảo số nguyên (VND)
  return Math.round(sum);
}

