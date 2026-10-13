import { getSupabaseClient } from "./authModule.js";

const supabase = getSupabaseClient();

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function blankZero(v) {
  const n = num(v);
  return n === 0 ? "" : String(n).replace(".", ",");
}

function vnDate(ymd) {
  const s = String(ymd || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function todayVN() {
  try {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const get = t => p.find(x => x.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (_) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function pick(obj, names, fallback = null) {
  for (const k of names) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
}

function getHistory(payload) {
  const candidates = [
    payload?.phat_sinh_90_ngay,
    payload?.phatsinh_90_ngay,
    payload?.phatSinh90Ngay,
    payload?.phat_sinh_90,
    payload?.phatsinh90
  ];
  for (const c of candidates) {
    const a = normalizeArray(c);
    if (a.length) return a;
  }
  return [];
}

function getRatioValue(r) {
  const direct = pick(r, [
    "toc_do_ban_tich_luy",
    "ty_le_ban_tich_luy",
    "tocdo_ban_tich_luy",
    "toc_do_tich_luy"
  ]);
  if (direct !== null && direct !== "") {
    const n = Number(direct);
    if (Number.isFinite(n)) return n;
  }

  const sold = num(pick(r, ["ban_tich_luy", "ban_tichluy", "luy_ke_ban"]));
  const days = num(pick(r, [
    "so_ngay_ban_tich_luy",
    "ngay_ban_tich_luy",
    "so_ngay_tich_luy",
    "so_ngay"
  ]));
  return days > 0 ? sold / days : 0;
}

function getCumulativeText(r) {
  const soldRaw = pick(r, ["ban_tich_luy", "ban_tichluy", "luy_ke_ban"], "");
  if (soldRaw === "" || soldRaw === null || soldRaw === undefined) return "";

  const sold = num(soldRaw);
  if (!sold) return "";

  const days = num(pick(r, [
    "so_ngay_ban_tich_luy",
    "ngay_ban_tich_luy",
    "so_ngay_tich_luy",
    "so_ngay"
  ]));

  if (days <= 0) return String(sold);

  const ratio = getRatioValue(r);
  const ratioTxt = ratio > 0
    ? ratio.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : "";

  return `${sold} / ${days} ngày${ratioTxt ? ` = ${ratioTxt}` : ""}`;
}

function getRankClasses(rows) {
  const vals = rows
    .map((r, i) => ({ i, v: getRatioValue(r) }))
    .filter(x => x.v > 0);

  const unique = [...new Set(vals.map(x => x.v))].sort((a,b) => b-a);
  const max1 = unique[0] ?? null;
  const max2 = unique[1] ?? null;

  return rows.map(r => {
    const v = getRatioValue(r);
    if (max1 !== null && v === max1) return "ps90-fast-1";
    if (max2 !== null && v === max2) return "ps90-fast-2";
    return "";
  });
}

function buildRows(history) {
  const rank = getRankClasses(history);

  return history.map((r, i) => {
    const ngay = pick(r, ["ngay", "ngay_ps", "date"], "");
    const nhap = pick(r, ["nhap_mua", "nhap", "tong_nhap"], 0);
    const b1 = pick(r, ["ban_cs1", "xuat_ban_cs1"], 0);
    const b2 = pick(r, ["ban_cs2", "xuat_ban_cs2"], 0);
    const tongBan = pick(r, ["tong_ban", "ban_tong"], num(b1) + num(b2));
    const ton = pick(r, ["ton", "ton_hien_tai", "ton_sau_ngay"], 0);
    const thieu = pick(r, ["thieu_size", "size_thieu", "thieu_sai"], "");
    const tich = getCumulativeText(r);

    return `
      <tr>
        <td>${esc(vnDate(ngay))}</td>
        <td class="n">${esc(blankZero(nhap))}</td>
        <td class="n">${esc(blankZero(b1))}</td>
        <td class="n">${esc(blankZero(b2))}</td>
        <td class="n ps90-bold">${esc(blankZero(tongBan))}</td>
        <td class="${rank[i]}">${esc(tich)}</td>
        <td class="n">${esc(blankZero(ton))}</td>
        <td>${esc(thieu || "")}</td>
      </tr>`;
  }).join("");
}

function ensureStyle() {
  if (document.getElementById("ps90-style")) return;
  const st = document.createElement("style");
  st.id = "ps90-style";
  st.textContent = `
    .ps90-backdrop{
      position:fixed; inset:0; z-index:120000;
      background:rgba(15,23,42,.48);
      display:flex; align-items:center; justify-content:center;
      padding:12px;
    }
    .ps90-card{
      width:min(1050px,96vw); max-height:94vh;
      background:#fff; border-radius:12px;
      box-shadow:0 18px 55px rgba(0,0,0,.3);
      overflow:hidden; display:flex; flex-direction:column;
      color:#111827;
    }
    .ps90-head{
      display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap;
      padding:12px 14px 10px; border-bottom:1px solid #dbe3ee;
    }
    .ps90-title{font-size:22px;font-weight:900;color:#155e9f;line-height:1.2}
    .ps90-sub{font-size:13px;color:#64748b;margin-top:3px}
    .ps90-tools{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
    .ps90-btn{
      border:0;border-radius:8px;padding:8px 12px;
      background:#e8f2f9;color:#0b5f9e;font-weight:800;cursor:pointer;
    }
    .ps90-btn.primary{background:#2580d8;color:#fff}
    .ps90-wrap{overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 12px 14px}
    .ps90-table{border-collapse:collapse;min-width:790px;width:100%;font-size:15px}
    .ps90-table th,.ps90-table td{
      border:1px solid #d9e1ea;padding:6px 8px;white-space:nowrap;text-align:left
    }
    .ps90-table th{background:#eef4f8;font-weight:900;position:sticky;top:0;z-index:1}
    .ps90-table td.n{text-align:right;font-variant-numeric:tabular-nums}
    .ps90-bold{font-weight:900}
    .ps90-fast-1{color:#d00000;font-weight:900}
    .ps90-fast-2{color:#0b57d0;font-weight:900}
    .ps90-empty{padding:28px;text-align:center;color:#64748b;font-size:16px}
    .ps90-error{padding:18px;color:#b91c1c;font-weight:700}
    @media(max-width:800px) and (orientation:portrait){
      .ps90-backdrop{padding:5px;align-items:flex-start}
      .ps90-card{width:calc(100vw - 10px);max-height:calc(100dvh - 10px);border-radius:10px}
      .ps90-head{padding:9px 10px 8px}
      .ps90-title{font-size:18px}
      .ps90-sub{font-size:12px}
      .ps90-tools{margin-left:0;width:100%}
      .ps90-btn{padding:7px 9px;font-size:14px}
      .ps90-wrap{padding:7px 7px 12px}
      .ps90-table{font-size:13px;min-width:720px}
      .ps90-table th,.ps90-table td{padding:5px 6px}
    }
  `;
  document.head.appendChild(st);
}

function closeExisting() {
  document.querySelectorAll(".ps90-backdrop").forEach(el => el.remove());
}

function openStockLedger(masp) {
  const url = `${window.location.origin}/sochitiettonkho.html?masp=${encodeURIComponent(masp)}`;
  const w = window.open(url, "_blank");
  if (w) {
    try { w.focus(); } catch (_) {}
  } else {
    alert("Trình duyệt đang chặn mở tab mới.");
  }
}

async function loadData(masp) {
  const { data, error } = await supabase.rpc("rpc_nhapbu2_kiemtra_nguon_v1", {
    p_masp: String(masp || "").trim().toUpperCase(),
    p_ngay: todayVN()
  });
  if (error) throw error;
  return data || {};
}

async function open(maspRaw) {
  const masp = String(maspRaw || "").trim().toUpperCase();
  if (!masp) return;

  ensureStyle();
  closeExisting();

  const overlay = document.createElement("div");
  overlay.className = "ps90-backdrop";
  overlay.innerHTML = `
    <div class="ps90-card" role="dialog" aria-modal="true">
      <div class="ps90-head">
        <div>
          <div class="ps90-title">PHÁT SINH 90 NGÀY · ${esc(masp)}</div>
          <div class="ps90-sub">Đang tải dữ liệu...</div>
        </div>
        <div class="ps90-tools">
          <button class="ps90-btn ps90-ledger" type="button">Sổ chi tiết tồn</button>
          <button class="ps90-btn primary ps90-close" type="button">Đóng</button>
        </div>
      </div>
      <div class="ps90-wrap"><div class="ps90-empty">Đang tải...</div></div>
    </div>`;

  document.body.appendChild(overlay);

  const card = overlay.querySelector(".ps90-card");
  const sub = overlay.querySelector(".ps90-sub");
  const wrap = overlay.querySelector(".ps90-wrap");

  overlay.querySelector(".ps90-close")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector(".ps90-ledger")?.addEventListener("click", () => openStockLedger(masp));
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.remove();
  });
  card?.addEventListener("click", e => e.stopPropagation());

  const onKey = e => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  try {
    const payload = await loadData(masp);
    const history = getHistory(payload);

    if (sub) sub.textContent = history.length
      ? `${history.length} dòng phát sinh · đến ${vnDate(todayVN())}`
      : `Không có phát sinh 90 ngày`;

    if (!history.length) {
      wrap.innerHTML = `<div class="ps90-empty">Không có dữ liệu Phát sinh 90 ngày cho mã ${esc(masp)}.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="ps90-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Nhập mua</th>
            <th>Bán CS1</th>
            <th>Bán CS2</th>
            <th>Tổng bán</th>
            <th>Bán tích lũy / ngày / tốc độ</th>
            <th>Tồn</th>
            <th>Thiếu size</th>
          </tr>
        </thead>
        <tbody>${buildRows(history)}</tbody>
      </table>`;
  } catch (err) {
    console.error("[PhatSinh90NgayPopup] Lỗi tải dữ liệu:", err);
    if (sub) sub.textContent = "Lỗi tải dữ liệu";
    wrap.innerHTML = `<div class="ps90-error">Không tải được Phát sinh 90 ngày: ${esc(err?.message || err)}</div>`;
  }
}

window.PhatSinh90NgayPopup = { open };
export { open };
