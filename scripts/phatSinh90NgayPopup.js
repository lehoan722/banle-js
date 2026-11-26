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

function formattedMovement(qty, sizes) {
  const n = num(qty);
  if (!n) return "";
  const parts = Object.entries(sizes && typeof sizes === "object" && !Array.isArray(sizes) ? sizes : {})
    .filter(([, value]) => num(value) > 0)
    .sort(([a], [b]) => a.localeCompare(b, "vi", { numeric: true }))
    .map(([size, value]) => `${size}${num(value) === 1 ? "" : `×${num(value)}`}`);
  return `${blankZero(n)}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

// V3 FAST UI Compact: chỉ thay cách trình bày, không thay dữ liệu hay RPC.
function movementHtml(qty, sizes) {
  const n = num(qty);
  if (!n) return "";
  const parts = Object.entries(sizes && typeof sizes === "object" && !Array.isArray(sizes) ? sizes : {})
    .filter(([, value]) => num(value) > 0)
    .sort(([a], [b]) => a.localeCompare(b, "vi", { numeric: true }))
    .map(([size, value]) => `${size}${num(value) === 1 ? "" : `×${num(value)}`}`);
  const detail = parts.length ? `<span class="ps90-size">(${esc(parts.join(", "))})</span>` : "";
  return `<span class="ps90-quantity">${esc(blankZero(n))}</span>${detail}`;
}

function cumulativeHtml(r) {
  const raw = getCumulativeText(r);
  if (!raw) return "";
  const pieces = raw.split(" = ");
  return `<span class="ps90-cumulative">${esc(pieces[0])}</span>${pieces.length > 1 ? `<span class="ps90-speed">= ${esc(pieces.slice(1).join(" = "))}</span>` : ""}`;
}

function historyCell(label, content, cssClass = "", value = "") {
  const empty = !content;
  const title = value ? ` title="${esc(value)}"` : "";
  return `<td data-label="${esc(label)}" class="${cssClass}${empty ? " ps90-cell-empty" : ""}"${title}>${content}</td>`;
}

function buildRows(history) {
  const rank = getRankClasses(history);
  return history.map((r, i) => {
    const ngay = pick(r, ["ngay", "ngay_ps", "date"], "");
    const nhap = pick(r, ["nhapmua", "nhap_mua", "nhap", "tong_nhap"], 0);
    const b1 = pick(r, ["ban_cs1", "xuat_ban_cs1"], 0);
    const b2 = pick(r, ["ban_cs2", "xuat_ban_cs2"], 0);
    const tongBan = pick(r, ["tong_ban", "ban_tong"], num(b1) + num(b2));
    const c12 = pick(r, ["chuyen_cs1_cs2"], 0);
    const c21 = pick(r, ["chuyen_cs2_cs1"], 0);
    const traNcc = pick(r, ["tra_ncc"], 0);
    const ton = pick(r, ["ton", "ton_hien_tai", "ton_sau_ngay"], 0);
    const thieu = pick(r, ["thieu_size", "size_thieu", "thieu_sai"], "");
    const tich = getCumulativeText(r);
    const cells = [
      historyCell("Ngày", `<span class="ps90-date-full">${esc(vnDate(ngay))}</span><span class="ps90-date-short">${esc(vnDate(ngay).replace(/(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, "$1$2"))}</span>`, "ps90-date"),
      historyCell("Nhập mua", esc(blankZero(nhap)), "n"),
      historyCell("Bán CS1", movementHtml(b1, r.size_ban_cs1), "n", formattedMovement(b1, r.size_ban_cs1)),
      historyCell("Bán CS2", movementHtml(b2, r.size_ban_cs2), "n", formattedMovement(b2, r.size_ban_cs2)),
      historyCell("CS1 → CS2", c12 ? `<button type="button" class="ps90-transfer" data-date="${esc(String(ngay).slice(0,10))}" data-direction="cs1_cs2" title="Xem hóa đơn chuyển CS1 → CS2">${movementHtml(c12, r.size_chuyen_cs1_cs2)}</button>` : "", "n", formattedMovement(c12, r.size_chuyen_cs1_cs2)),
      historyCell("CS2 → CS1", c21 ? `<button type="button" class="ps90-transfer" data-date="${esc(String(ngay).slice(0,10))}" data-direction="cs2_cs1" title="Xem hóa đơn chuyển CS2 → CS1">${movementHtml(c21, r.size_chuyen_cs2_cs1)}</button>` : "", "n", formattedMovement(c21, r.size_chuyen_cs2_cs1)),
      historyCell("Trả NCC", movementHtml(traNcc, r.size_tra_ncc), "n", formattedMovement(traNcc, r.size_tra_ncc)),
      historyCell("Tổng bán", esc(blankZero(tongBan)), "n ps90-bold"),
      historyCell("Bán tích lũy / ngày / tốc độ", cumulativeHtml(r), rank[i], tich),
      historyCell("Tồn", esc(blankZero(ton)), "n"),
      historyCell("Thiếu size", esc(String(thieu || "")))
    ];
    return `<tr>${cells.join("")}</tr>`;
  }).join("");
}

function ensureStyle() {
  if (document.getElementById("ps90-style")) return;
  const st = document.createElement("style");
  st.id = "ps90-style";
  st.textContent = `
    .ps90-backdrop{
      position:fixed;inset:0;z-index:320200;background:rgba(15,23,42,.48);
      display:flex;align-items:center;justify-content:center;padding:10px;
    }
    .ps90-card{
      width:min(1280px,98vw);max-height:95vh;background:#fff;border-radius:12px;
      box-shadow:0 18px 55px rgba(0,0,0,.3);overflow:hidden;
      display:flex;flex-direction:column;min-width:0;color:#111827;
    }
    .ps90-head{
      display:flex;align-items:center;gap:8px;flex-wrap:wrap;
      padding:10px 12px;border-bottom:1px solid #dbe3ee;
      cursor:grab;touch-action:none;user-select:none;
    }
    .ps90-head.ps90-dragging{cursor:grabbing}
    .ps90-tools,.ps90-tools *{cursor:pointer;touch-action:manipulation}
    .ps90-transfer{display:block;width:100%;border:0;background:transparent;padding:3px 1px;
      color:inherit;font:inherit;cursor:pointer;border-radius:5px;touch-action:manipulation;}
    .ps90-transfer:hover,.ps90-transfer:focus-visible{background:#e0f2fe;outline:1px solid #60a5fa}
    .ps90-transfer .ps90-quantity{color:#1267ab;text-decoration:underline;text-underline-offset:2px}
    .ps90-detail{position:fixed;z-index:320205;background:#fff;border:1px solid #a6cce7;border-radius:12px;
      box-shadow:0 16px 38px rgba(15,23,42,.26);padding:12px;width:min(360px,calc(100vw - 20px));
      max-height:min(440px,calc(100dvh - 25px));overflow:auto;color:#0f172a;font-size:13px;line-height:1.45;}
    .ps90-detail-header{display:flex;align-items:start;justify-content:space-between;gap:6px;margin-bottom:7px}
    .ps90-detail-close{border:0;background:#f1f5f9;border-radius:7px;padding:3px 8px;cursor:pointer;font-size:18px}
    .ps90-detail-row{padding:9px 0;border-top:1px solid #e2e8f0}
    .ps90-detail-open{margin-top:5px;border:1px solid #a5cbee;border-radius:6px;
      color:#0b65ac;background:#eff6ff;padding:5px 9px;cursor:pointer;font-weight:700}
    .ps90-detail-small{font-size:12px;color:#475569;overflow-wrap:anywhere}
    .ps90-detail-warn{font-size:12px;color:#b45309}
    .ps90-title{font-size:19px;font-weight:900;color:#155e9f;line-height:1.2;overflow-wrap:anywhere}
    .ps90-sub{font-size:12px;color:#64748b;margin-top:3px}
    .ps90-tools{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
    .ps90-btn{border:0;border-radius:8px;padding:7px 10px;background:#e8f2f9;color:#0b5f9e;font-weight:800;cursor:pointer}
    .ps90-btn.primary{background:#2580d8;color:#fff}
    .ps90-wrap{overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 10px 12px;min-height:0}
    /* Desktop: bỏ min-width:1310px và white-space:nowrap trên tất cả ô */
    .ps90-table{table-layout:fixed;border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:1.25}
    .ps90-table th,.ps90-table td{
      border:1px solid #d9e1ea;padding:5px 4px;text-align:center;
      white-space:normal;overflow-wrap:anywhere;vertical-align:middle;
    }
    .ps90-table th{background:#eef4f8;font-weight:900;position:sticky;top:0;z-index:3;line-height:1.2}
    .ps90-table td.n{text-align:center;font-variant-numeric:tabular-nums}
    .ps90-table th:first-child,.ps90-table td:first-child{position:sticky;left:0;background:#fff;z-index:2}
    .ps90-table th:first-child{background:#eef4f8;z-index:4}
    .ps90-table th:nth-child(1){width:9%}
    .ps90-table th:nth-child(2){width:7%}
    .ps90-table th:nth-child(3),.ps90-table th:nth-child(4){width:9%}
    .ps90-table th:nth-child(5),.ps90-table th:nth-child(6){width:10%}
    .ps90-table th:nth-child(7){width:8%}
    .ps90-table th:nth-child(8){width:7%}
    .ps90-table th:nth-child(9){width:15%}
    .ps90-table th:nth-child(10){width:6%}
    .ps90-table th:nth-child(11){width:10%}
    .ps90-date-short{display:none}
    .ps90-quantity,.ps90-size,.ps90-cumulative,.ps90-speed{display:block}
    .ps90-size{font-size:11px;line-height:1.2;color:#475569;font-weight:500;overflow-wrap:anywhere}
    .ps90-speed{font-weight:800}
    .ps90-bold{font-weight:900}
    .ps90-fast-1{color:#d00000;font-weight:900}
    .ps90-fast-2{color:#0b57d0;font-weight:900}
    .ps90-empty{padding:28px;text-align:center;color:#64748b;font-size:16px}
    .ps90-error{padding:18px;color:#b91c1c;font-weight:700}
    @media(max-width:800px){
      .ps90-backdrop{padding:4px;align-items:center}
      .ps90-card{width:calc(100vw - 8px);max-height:calc(100dvh - 8px);border-radius:10px}
      .ps90-head{padding:8px 9px;align-items:flex-start}
      .ps90-title{font-size:16px}
      .ps90-sub{font-size:11px}
      .ps90-tools{margin-left:0;width:100%;gap:5px}
      .ps90-btn{padding:6px 8px;font-size:12px}
      /* Mobile: giữ TABLE thật, chỉ hiển thị 8 cột thiết yếu (1-6, 10-11). */
      .ps90-wrap{padding:3px;overflow-x:hidden;overflow-y:auto;background:#fff}
      .ps90-table{display:table;width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;font-size:9px;line-height:1.15}
      .ps90-table thead{display:table-header-group}
      .ps90-table tbody{display:table-row-group}
      .ps90-table tr{display:table-row}
      .ps90-table th,.ps90-table td,.ps90-table td:first-child{
        display:table-cell;position:static;box-sizing:border-box;
        padding:4px 1px;border:1px solid #dce4ed;
        text-align:center!important;vertical-align:middle;
        overflow-wrap:anywhere;word-break:normal;white-space:normal;
        min-width:0;max-width:0;
      }
      .ps90-table th{position:sticky;top:0;background:#eef4f8;z-index:2;font-size:9px;font-weight:800}
      .ps90-table th:first-child{z-index:3}
      .ps90-table td::before{display:none!important;content:none!important}
      /* Ẩn: Trả NCC (7), Tổng bán (8), Bán tích lũy/tốc độ (9). */
      .ps90-table th:nth-child(7),.ps90-table td:nth-child(7),
      .ps90-table th:nth-child(8),.ps90-table td:nth-child(8),
      .ps90-table th:nth-child(9),.ps90-table td:nth-child(9){display:none!important}
      /* Bắt buộc vẫn hiện ô trống để không làm lệch cột. */
      .ps90-table td.ps90-cell-empty{display:table-cell}
      .ps90-table th:nth-child(1),.ps90-table td:nth-child(1){width:18%}
      .ps90-table th:nth-child(2),.ps90-table td:nth-child(2){width:10%}
      .ps90-table th:nth-child(3),.ps90-table td:nth-child(3){width:11%}
      .ps90-table th:nth-child(4),.ps90-table td:nth-child(4){width:11%}
      .ps90-table th:nth-child(5),.ps90-table td:nth-child(5){width:13%}
      .ps90-table th:nth-child(6),.ps90-table td:nth-child(6){width:13%}
      .ps90-table th:nth-child(10),.ps90-table td:nth-child(10){width:10%}
      .ps90-table th:nth-child(11),.ps90-table td:nth-child(11){width:14%}
      .ps90-date-full{display:none}
      .ps90-date-short{display:inline}
      .ps90-table td.ps90-date{font-weight:800;color:#075d9e;font-size:9px;background:#f1f7fd}
      .ps90-size{display:block;font-size:8.5px;line-height:1.13;overflow-wrap:anywhere;word-break:break-word}
      .ps90-quantity{display:block;font-size:10px;font-weight:800}
      .ps90-table td.n{font-variant-numeric:tabular-nums}
      .ps90-table td:nth-child(11){font-size:9px}
      @media(max-width:370px){
        .ps90-table{font-size:8px}
        .ps90-table th{font-size:8px}
        .ps90-size{font-size:8px}
        .ps90-table td.ps90-date{font-size:8px}
      }
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

// Both 90-day and all-history views use the same V2 movement source.
async function load90History(masp) {
  return loadPagedHistory(masp, 90);
}

// V20261101-PAGE: toàn bộ vòng đời được tải theo từng lô nhỏ để tránh
// Supabase/Postgres statement_timeout ở các mã có lịch sử rất dài.
// 90 ngày vẫn đi qua rpc_nhapbu2_kiemtra_nguon_v1, không thay đổi.
async function loadPagedHistory(masp, days, onProgress) {
  const PAGE_SIZE = 60;
  const MAX_PAGES = 300; // chốt an toàn: tối đa 7.200 ngày phát sinh
  const code = String(masp || "").trim().toUpperCase();
  const all = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const { data, error } = await supabase.rpc("rpc_nhapbu2_phatsinh_page_v3", {
      p_masp: code,
      p_ngay: todayVN(),
      p_so_ngay: days,
      p_offset: offset,
      p_limit: PAGE_SIZE
    });
    if (error) throw error;

    const rows = normalizeArray(data);
    if (rows.length) all.push(...rows);
    try { onProgress?.(all.slice(), rows.length < PAGE_SIZE); } catch (_) {}

    if (rows.length < PAGE_SIZE) return all;
  }

  throw new Error("Lịch sử quá dài, đã vượt giới hạn tải an toàn.");
}

const loadAllHistory = (masp, onProgress) => loadPagedHistory(masp, 0, onProgress);

// Chỉ truy vấn hóa đơn khi người dùng nhấn ô số lượng chuyển, không ảnh hưởng thời gian mở popup.
async function fetchTransferInvoices(masp, ngay, direction) {
  const { data, error } = await supabase.rpc("rpc_ps90_hoa_don_chuyen_ngay_v1", {
    p_masp: masp, p_ngay: ngay, p_huong: direction
  });
  if (error) throw error;
  return normalizeArray(data);
}

function openTransferInvoice(sohd) {
  const url = `${window.location.origin}/xemhoadon111.html?sohd=${encodeURIComponent(sohd)}`;
  const win = window.open(url, "_blank", "noopener");
  if (!win) window.location.href = url;
}

function setupDragHead(card, head, onMoveStart) {
  if (!card || !head) return;
  let drag = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, Math.max(lo, hi)));
  head.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest("button, a, input, select")) return;
    const rect = card.getBoundingClientRect();
    // Chuyển từ layout centered sang vị trí tuyệt đối trong overlay.
    card.style.position = "fixed";
    card.style.margin = "0";
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.width = `${rect.width}px`;
    drag = { x:e.clientX, y:e.clientY, left:rect.left, top:rect.top, id:e.pointerId };
    head.classList.add("ps90-dragging");
    try { head.setPointerCapture(e.pointerId); } catch(_) {}
    onMoveStart?.();
    e.preventDefault();
  });
  head.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = card.getBoundingClientRect();
    // Cho phép kéo một phần popup ra ngoài rìa để nhìn bảng phía sau,
    // nhưng luôn giữ ít nhất 240px chiều ngang và thanh tiêu đề có thể kéo lại.
    const visibleGrip = Math.min(240, rect.width);
    card.style.left = `${clamp(drag.left + e.clientX - drag.x, -rect.width + visibleGrip, innerWidth - visibleGrip)}px`;
    card.style.top = `${clamp(drag.top + e.clientY - drag.y, 0, innerHeight - Math.min(56, rect.height))}px`;
  });
  const finish = e => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      head.classList.remove("ps90-dragging");
      try {head.releasePointerCapture(e.pointerId);}catch(_){}
    }
  };
  head.addEventListener("pointerup", finish);
  head.addEventListener("pointercancel", finish);
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
          <div class="ps90-title">PHÁT SINH TOÀN BỘ · ${esc(masp)}</div>
          <div class="ps90-sub">Đang tải dữ liệu...</div>
        </div>
        <div class="ps90-tools">
          <button class="ps90-btn ps90-ledger" type="button">Sổ chi tiết tồn</button>
          <button class="ps90-btn ps90-all" type="button">Xem 90 ngày</button>
          <button class="ps90-btn primary ps90-close" type="button">Đóng</button>
        </div>
      </div>
      <div class="ps90-wrap"><div class="ps90-empty">Đang tải...</div></div>
    </div>`;

  document.body.appendChild(overlay);

  const card = overlay.querySelector(".ps90-card");
  const title = overlay.querySelector(".ps90-title");
  const sub = overlay.querySelector(".ps90-sub");
  const wrap = overlay.querySelector(".ps90-wrap");
  const btnAll = overlay.querySelector(".ps90-all");
  const head = overlay.querySelector(".ps90-head");
  let detailPanel = null;
  let detailRequest = 0;
  const closeDetail = () => {
    detailRequest++;
    detailPanel?.remove();
    detailPanel = null;
  };
  setupDragHead(card, head, closeDetail);

  async function showTransferDetail(button) {
    const ngay = button.dataset.date;
    const direction = button.dataset.direction;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay || "") || !["cs1_cs2", "cs2_cs1"].includes(direction)) return;
    closeDetail();
    const req = detailRequest;
    const popup = document.createElement("div");
    popup.className = "ps90-detail";
    popup.setAttribute("role", "dialog");
    const heading = direction === "cs1_cs2" ? "CS1 → CS2" : "CS2 → CS1";
    popup.innerHTML = `<div class="ps90-detail-header"><div><strong>Hóa đơn chuyển ${heading}</strong><div class="ps90-detail-small">${esc(masp)} · ${esc(vnDate(ngay))}</div></div><button class="ps90-detail-close" type="button" aria-label="Đóng">×</button></div><div class="ps90-detail-content">Đang lấy hóa đơn...</div>`;
    overlay.appendChild(popup);
    detailPanel = popup;
    popup.addEventListener("click", e => e.stopPropagation());
    popup.querySelector(".ps90-detail-close").addEventListener("click", closeDetail);
    const move = () => {
      const rect = button.getBoundingClientRect();
      const w = popup.getBoundingClientRect().width;
      const h = popup.getBoundingClientRect().height;
      const left = Math.max(10, Math.min(rect.left, innerWidth - w - 10));
      const below = rect.bottom + 8;
      const top = below + h <= innerHeight - 10 ? below : Math.max(8, rect.top - h - 8);
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    move();
    try {
      const rows = await fetchTransferInvoices(masp, ngay, direction);
      if (req !== detailRequest || !popup.isConnected) return;
      const content = popup.querySelector(".ps90-detail-content");
      if (!rows.length) {
        content.innerHTML = `<div class="ps90-detail-warn">Không tìm thấy chứng từ xuất chuyển tương ứng trong hóa đơn đã lưu. Có thể số tổng hợp gồm điều chỉnh khác; hãy đối chiếu sổ chi tiết tồn.</div>`;
      } else {
        const total = rows.reduce((s,r)=>s+num(r.qty),0);
        content.innerHTML = `<div><strong>${esc(String(total))} sản phẩm · ${rows.length} hóa đơn</strong></div>` +
          rows.map(r => `<div class="ps90-detail-row"><strong>${esc(r.sohd)}</strong>` +
            `<div class="ps90-detail-small">${esc(vnDate(r.ngay))} · NV: ${esc(r.manv || "—")} · SL: ${esc(String(r.qty))}</div>` +
            `<button class="ps90-detail-open" data-sohd="${esc(r.sohd)}" type="button">Xem hóa đơn</button></div>`).join("");
        content.querySelectorAll(".ps90-detail-open").forEach(btn => btn.addEventListener("click", () => openTransferInvoice(btn.dataset.sohd)));
      }
      move();
    } catch(err) {
      if (req !== detailRequest || !popup.isConnected) return;
      popup.querySelector(".ps90-detail-content").textContent = `Không tải được thông tin: ${err?.message || err}`;
      move();
    }
  }
  // Event delegation hoạt động cả khi bảng tiếp tục nạp các trang lịch sử.
  wrap.addEventListener("click", e => {
    const target = e.target.closest(".ps90-transfer");
    if (target && wrap.contains(target)) {
      e.stopPropagation();
      showTransferDetail(target);
    } else if (detailPanel) {
      closeDetail();
    }
  });
  let mode = "all";
  let history90 = null;
  let historyAll = null;
  let loading = false;

  let renderedCount = 0;
  function render(history, nextMode, isFinal = true) {
    const sameMode = mode === nextMode;
    const prevCount = renderedCount;
    mode = nextMode;
    const isAll = mode === "all";
    if (title) title.textContent = `${isAll ? "PHÁT SINH TOÀN BỘ" : "PHÁT SINH 90 NGÀY"} · ${masp}`;
    if (btnAll) btnAll.textContent = isAll ? "Xem 90 ngày" : "Xem toàn bộ";

    if (sub) sub.textContent = history.length
      ? `${history.length} dòng phát sinh${isAll ? " toàn bộ vòng đời" : ""} · đến ${vnDate(todayVN())}`
      : (isAll ? "Không có phát sinh trong toàn bộ vòng đời" : "Không có phát sinh 90 ngày");

    if (!history.length) {
      wrap.innerHTML = `<div class="ps90-empty">Không có dữ liệu ${isAll ? "Phát sinh toàn bộ" : "Phát sinh 90 ngày"} cho mã ${esc(masp)}.</div>`;
      return;
    }

    if (!isFinal && sameMode && prevCount > 0 && history.length > prevCount) {
      const tbody = wrap.querySelector(".ps90-table tbody");
      if (tbody) {
        tbody.insertAdjacentHTML("beforeend", buildRows(history.slice(prevCount)));
        renderedCount = history.length;
        return;
      }
    }
    renderedCount = history.length;
    wrap.innerHTML = `
      <table class="ps90-table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Nhập mua</th>
            <th>Bán CS1</th>
            <th>Bán CS2</th>
            <th>CS1 → CS2</th>
            <th>CS2 → CS1</th>
            <th>Trả NCC</th>
            <th>Tổng bán</th>
            <th>Bán tích lũy / ngày / tốc độ</th>
            <th>Tồn</th>
            <th>Thiếu size</th>
          </tr>
        </thead>
        <tbody>${buildRows(history)}</tbody>
      </table>`;
    try { wrap.scrollTop = 0; wrap.scrollLeft = 0; } catch (_) {}
  }

  async function switchMode() {
    if (loading) return;
    closeDetail();
    const target = mode === "90" ? "all" : "90";
    loading = true;
    if (btnAll) btnAll.disabled = true;
    if (sub) sub.textContent = target === "all" ? "Đang tải toàn bộ vòng đời..." : "Đang tải 90 ngày...";
    try {
      if (target === "all") {
        if (!historyAll) {
          historyAll = await loadAllHistory(masp, (rows, done) => {
            render(rows, "all", false);
            if (!done && sub) sub.textContent = `Đang tải toàn bộ vòng đời... đã nạp ${rows.length} dòng`;
          });
        }
        render(historyAll, "all");
      } else {
        if (!history90) {
          history90 = await load90History(masp);
        }
        render(history90, "90");
      }
    } catch (err) {
      console.error("[PhatSinh90NgayPopup] Lỗi chuyển chế độ:", err);
      if (sub) sub.textContent = "Lỗi tải dữ liệu";
      wrap.innerHTML = `<div class="ps90-error">Không tải được ${target === "all" ? "toàn bộ vòng đời" : "90 ngày"}: ${esc(err?.message || err)}</div>`;
    } finally {
      loading = false;
      if (btnAll) btnAll.disabled = false;
    }
  }

  function removePopup() {
    closeDetail();
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  overlay.querySelector(".ps90-close")?.addEventListener("click", removePopup);
  overlay.querySelector(".ps90-ledger")?.addEventListener("click", () => openStockLedger(masp));
  btnAll?.addEventListener("click", switchMode);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) removePopup();
  });
  card?.addEventListener("click", e => e.stopPropagation());

  const onKey = e => {
    if (e.key === "Escape") {
      removePopup();
    }
  };
  document.addEventListener("keydown", onKey);

  try {
    historyAll = await loadAllHistory(masp, (rows, done) => {
      render(rows, "all", false);
      if (!done && sub) sub.textContent = `Đang tải toàn bộ vòng đời... đã nạp ${rows.length} dòng`;
    });
    render(historyAll, "all");
  } catch (err) {
    console.error("[PhatSinh90NgayPopup] Lỗi tải dữ liệu toàn bộ:", err);
    if (sub) sub.textContent = "Lỗi tải dữ liệu";
    wrap.innerHTML = `<div class="ps90-error">Không tải được Phát sinh toàn bộ: ${esc(err?.message || err)}</div>`;
  }
}

window.PhatSinh90NgayPopup = { open };
export { open };
