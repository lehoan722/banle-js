// /scripts/datHangChuyenKhoKhan.js
// Đặt hàng chuyển kho KHẨN CẤP - thủ công, realtime, tách biệt hoàn toàn với luồng tự động.

import { calcSuggestionsFromPayload } from "./services/luatChuyenKho.js";

let ctx = null;
let realtimeChannel = null;
let panelOpen = false;
let userCollapsed = false;
let suppressRealtimeUntil = 0;
let audioCtx = null;
let audioUnlocked = false;
let repositionTimer = null;

const TABLE = "dat_hang_chuyen_kho_khan";
const OPEN_STATUSES = ["moi", "dang_chuyen"];

function norm(v) {
  return String(v ?? "").trim();
}

function normMasp(v) {
  return norm(v).toUpperCase();
}

function normSize(v) {
  const s = norm(v).replace(/^size\s+/i, "");
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}

function getCurrentCoso() {
  return norm(
    ctx?.diadiem ||
    window.__BANLE_PAGE_DIADIEM ||
    localStorage.getItem("diadiem") ||
    window.diadiem ||
    ""
  ).toLowerCase();
}

function getManv() {
  return norm(
    ctx?.manvDangNhap ||
    localStorage.getItem("manv") ||
    document.getElementById("manv")?.value ||
    ""
  ).toUpperCase();
}

function otherCoso(coso) {
  return coso === "cs1" ? "cs2" : "cs1";
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function statusText(v) {
  const s = norm(v).toLowerCase();
  if (s === "moi") return "Mới";
  if (s === "dang_chuyen") return "Đang chuyển";
  if (s === "da_chuyen") return "Đã chuyển";
  if (s === "huy") return "Đã hủy";
  return s || "-";
}

function buildKey(x) {
  return [normMasp(x.masp), normSize(x.size), norm(x.huong_chuyen).toLowerCase()].join("|");
}

function ensureStyles() {
  if (document.getElementById("dhkhan-style")) return;
  const style = document.createElement("style");
  style.id = "dhkhan-style";
  style.textContent = `
    #dhkhan-panel { font-family: Arial, sans-serif; }
    #dhkhan-panel th, #dhkhan-panel td {
      border:1px solid #efb0a9; padding:3px 5px; white-space:nowrap; font-size:13px;
    }
    #dhkhan-panel .dhkhan-masp-link { color:#9b1c1c; font-weight:800; text-decoration:underline; cursor:pointer; }
    #dhkhan-panel .dhkhan-note { min-width:120px; max-width:220px; width:100%; box-sizing:border-box; padding:3px 5px; }
    #dhkhan-panel .dhkhan-new td { background:#fff4f2; }
    #dhkhan-panel .dhkhan-moving td { background:#fff8df; }
    #dhkhan-panel.dhkhan-flash { animation: dhkhanFlash .45s ease-in-out 0s 4 alternate; }
    @keyframes dhkhanFlash { from { box-shadow:0 0 0 2px #d00000,0 3px 14px rgba(0,0,0,.3); } to { box-shadow:0 0 0 6px rgba(208,0,0,.15),0 3px 14px rgba(0,0,0,.3); } }
    #dhkhan-create-box input, #dhkhan-create-box select { font-size:15px; padding:6px; box-sizing:border-box; }
    @media (max-width: 480px) {
      #dhkhan-panel { left:0 !important; right:0 !important; width:100vw !important; max-width:100vw !important; font-size:12px !important; }
      #dhkhan-panel th, #dhkhan-panel td { font-size:12px; padding:3px 4px; }
      #dhkhan-panel .dhkhan-note { min-width:100px; }
      #dhkhan-create-box { width:94vw !important; min-width:0 !important; }
    }
  `;
  document.head.appendChild(style);
}

function unlockAudioOnce() {
  if (audioUnlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    audioCtx.resume?.();
    audioUnlocked = true;
  } catch (_) {}
}

function setupAudioUnlock() {
  const fn = () => unlockAudioOnce();
  document.addEventListener("pointerdown", fn, { once:true, capture:true });
  document.addEventListener("keydown", fn, { once:true, capture:true });
}

function ding(freq, when, duration = 0.13) {
  if (!audioCtx || audioCtx.state !== "running") return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.20, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.02);
}

function playUrgentSound() {
  try {
    unlockAudioOnce();
    if (!audioCtx || audioCtx.state !== "running") return;
    const t = audioCtx.currentTime + 0.02;
    ding(880, t, 0.14);
    ding(1175, t + 0.19, 0.16);
  } catch (e) {
    console.warn("[Đặt hàng khẩn] Không phát được âm thanh:", e);
  }
}

function openStockQuick(masp) {
  const code = normMasp(masp);
  if (!code) return;
  // Trên mobile, thu gọn bảng khẩn trước để không che StockQuickPopup.
  userCollapsed = true;
  const panel = document.getElementById("dhkhan-panel");
  const body = panel?.querySelector("#dhkhan-body");
  const toggle = panel?.querySelector("#dhkhan-toggle");
  if (body) body.style.display = "none";
  if (toggle) toggle.textContent = "▲";
  positionPanel();
  try {
    if (window.StockQuick?.showFor) return window.StockQuick.showFor(document.body, code);
    if (typeof window.stockQuickPopup === "function") return window.stockQuickPopup(code);
  } catch (e) {
    console.warn("[Đặt hàng khẩn] Không mở được StockQuick:", e);
  }
}

async function fetchOpenOrders() {
  if (!ctx?.supabase) return [];
  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select("*")
    .in("trang_thai", OPEN_STATUSES)
    .order("created_at", { ascending:false });

  if (error) {
    console.error("[Đặt hàng khẩn] Lỗi tải dữ liệu:", error);
    return [];
  }

  return (data || []).sort((a,b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });
}

async function checkDuplicates(items) {
  if (!ctx?.supabase || !items.length) return { newItems:items, existed:[] };
  const masps = [...new Set(items.map(x => normMasp(x.masp)).filter(Boolean))];
  if (!masps.length) return { newItems:[], existed:[] };

  const { data, error } = await ctx.supabase
    .from(TABLE)
    .select("id,masp,size,huong_chuyen,trang_thai")
    .in("trang_thai", OPEN_STATUSES)
    .in("masp", masps);

  if (error) {
    console.warn("[Đặt hàng khẩn] Không kiểm tra được trùng:", error);
    return { newItems:items, existed:[] };
  }

  const opened = new Set((data || []).map(buildKey));
  return {
    newItems: items.filter(x => !opened.has(buildKey(x))),
    existed: items.filter(x => opened.has(buildKey(x)))
  };
}

async function insertUrgentOrders(items, note = "", source = "stockquick") {
  if (!ctx?.supabase || !items?.length) return false;

  const unique = new Map();
  items.forEach(x => {
    const huong = norm(x.huong_chuyen).toLowerCase();
    const fallbackTu = huong === "1v2" ? "cs1" : (huong === "2v1" ? "cs2" : "");
    const fallbackDen = huong === "1v2" ? "cs2" : (huong === "2v1" ? "cs1" : "");
    const row = {
      masp: normMasp(x.masp),
      size: normSize(x.size),
      soluong: Math.max(1, Number(x.soluong || 1)),
      huong_chuyen: huong,
      tu_coso: norm(x.tu_coso || fallbackTu).toLowerCase(),
      den_coso: norm(x.den_coso || fallbackDen).toLowerCase()
    };
    if (row.masp && row.size && ["1v2","2v1"].includes(row.huong_chuyen)) {
      unique.set(buildKey(row), row);
    }
  });

  const checked = await checkDuplicates([...unique.values()]);
  if (checked.existed.length) {
    const text = checked.existed
      .map(x => `${x.huong_chuyen} | ${x.masp} | size ${x.size}`)
      .join("\n");
    alert("⚠️ Một số dòng đã có trong ĐẶT HÀNG KHẨN nên không tạo trùng:\n\n" + text);
  }

  if (!checked.newItems.length) return false;

  const rows = checked.newItems.map(x => ({
    ...x,
    manv_dat: getManv(),
    ghichu_dat: norm(note),
    trang_thai: "moi",
    nguon: source
  }));

  suppressRealtimeUntil = Date.now() + 900;
  const { error } = await ctx.supabase.from(TABLE).insert(rows);
  if (error) {
    console.error("[Đặt hàng khẩn] Insert lỗi:", error);
    alert("❌ Không lưu được đặt hàng khẩn cấp: " + (error.message || "Lỗi không xác định"));
    return false;
  }

  await refreshPanel({ forceOpen:true });
  return true;
}

function showStockQuickConfirm(items) {
  if (!items?.length) {
    alert("Không có size nào cần gợi ý chuyển kho cho mã này.");
    return;
  }

  document.getElementById("dhkhan-confirm")?.remove();
  const box = document.createElement("div");
  box.id = "dhkhan-confirm";
  box.style.cssText = `position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:10080;background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.3);padding:12px;min-width:360px;max-width:94vw;font-size:14px;`;

  box.innerHTML = `
    <div style="font-weight:900;color:#b00000;font-size:16px;margin-bottom:8px;">🚨 TẠO ĐẶT HÀNG KHẨN CẤP</div>
    <div style="max-height:42vh;overflow:auto;">
      ${items.map((x,i) => `
        <label style="display:block;padding:5px 3px;border-bottom:1px solid #eee;cursor:pointer;">
          <input type="checkbox" class="dhkhan-pick" checked
            data-i="${i}"> ${esc(x.huong_chuyen)} | <b>${esc(x.masp)}</b> | size ${esc(x.size)} | SL ${Number(x.soluong || 1)}
        </label>`).join("")}
    </div>
    <input id="dhkhan-confirm-note" placeholder="Ghi chú (vd: khách đang chờ)" style="width:100%;box-sizing:border-box;margin:9px 0 7px;padding:7px;font-size:14px;">
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="dhkhan-confirm-cancel">Hủy</button>
      <button id="dhkhan-confirm-ok" style="background:#d00000;color:#fff;border:0;border-radius:6px;padding:7px 12px;font-weight:800;">ĐẶT KHẨN</button>
    </div>`;

  document.body.appendChild(box);
  box.querySelector("#dhkhan-confirm-cancel").onclick = () => box.remove();
  box.querySelector("#dhkhan-confirm-ok").onclick = async () => {
    const selectedIndexes = [...box.querySelectorAll(".dhkhan-pick:checked")].map(el => Number(el.dataset.i));
    const picked = selectedIndexes.map(i => items[i]).filter(Boolean);
    if (!picked.length) {
      alert("Bạn chưa chọn size nào.");
      return;
    }
    const note = box.querySelector("#dhkhan-confirm-note")?.value || "";
    const ok = await insertUrgentOrders(picked, note, "stockquick");
    if (ok) box.remove();
  };
}

async function openFromStockQuick(popup, payload) {
  const masp = normMasp(popup?.dataset?.masp || payload?.masp);
  if (!masp || !payload) {
    alert("Thiếu dữ liệu StockQuick để tạo đặt hàng khẩn.");
    return;
  }

  let suggestions = [];
  try {
    suggestions = calcSuggestionsFromPayload(masp, payload) || [];
  } catch (e) {
    console.error("[Đặt hàng khẩn] Lỗi tính size cần chuyển:", e);
    alert("Không tính được size cần chuyển kho cho mã này.");
    return;
  }

  if (!suggestions.length) {
    alert("Không có size nào cần gợi ý chuyển kho cho mã này.");
    return;
  }

  showStockQuickConfirm(suggestions);
}

function renderRows(rows, canAct) {
  return rows.map(r => {
    const moving = norm(r.trang_thai).toLowerCase() === "dang_chuyen";
    return `<tr class="${moving ? "dhkhan-moving" : "dhkhan-new"}" data-id="${Number(r.id)}">
      <td style="text-align:center;"><input type="checkbox" class="dhkhan-delete-pick" data-id="${Number(r.id)}"></td>
      <td style="text-align:center;"><input type="checkbox" class="dhkhan-move" data-id="${Number(r.id)}" ${moving ? "checked" : ""} ${canAct ? "" : "disabled"}></td>
      <td><span class="dhkhan-masp-link" data-masp="${esc(r.masp)}">${esc(r.masp)}</span></td>
      <td style="text-align:center;">${Number(r.soluong || 1)}</td>
      <td style="text-align:center;">${esc(r.size)}</td>
      <td style="font-weight:700;">${esc(r.huong_chuyen)}</td>
      <td>${esc(r.manv_dat || "")}</td>
      <td>${esc(fmtTime(r.created_at))}</td>
      <td><input class="dhkhan-note" data-id="${Number(r.id)}" value="${esc(r.ghichu_dat || "")}"></td>
      <td class="dhkhan-status">${esc(statusText(r.trang_thai))}</td>
      <td>${canAct ? `<button class="dhkhan-done" data-id="${Number(r.id)}">Xong</button>` : ""}</td>
    </tr>`;
  }).join("");
}

function positionPanel() {
  const box = document.getElementById("dhkhan-panel");
  if (!box) return;
  const mobile = window.matchMedia("(max-width: 480px)").matches;
  const vh = window.visualViewport?.height || window.innerHeight;

  box.style.left = mobile ? "0" : "6px";
  box.style.right = "auto";
  box.style.width = mobile ? "100vw" : "680px";
  box.style.maxWidth = mobile ? "100vw" : "96vw";
  box.style.zIndex = "10050";

  if (userCollapsed) {
    const bay = document.getElementById("baymau-popup");
    const bayTop = bay?.getBoundingClientRect()?.top;
    const top = Number.isFinite(bayTop) ? Math.max(6, bayTop - 38) : Math.max(6, vh - 250);
    box.style.top = `${Math.round(top)}px`;
    box.style.height = "32px";
    box.style.maxHeight = "32px";
    return;
  }

  box.style.top = mobile ? "6px" : "8px";
  box.style.height = mobile ? "38vh" : "46vh";
  box.style.maxHeight = mobile ? "38vh" : "46vh";
}

function schedulePosition() {
  clearTimeout(repositionTimer);
  repositionTimer = setTimeout(positionPanel, 40);
}

function bindPanelEvents(box) {
  box.querySelector("#dhkhan-toggle")?.addEventListener("click", (e) => {
    e.stopPropagation();
    userCollapsed = !userCollapsed;
    const body = box.querySelector("#dhkhan-body");
    const btn = box.querySelector("#dhkhan-toggle");
    if (body) body.style.display = userCollapsed ? "none" : "block";
    if (btn) btn.textContent = userCollapsed ? "▲" : "▼";
    positionPanel();
  });

  box.querySelector("#dhkhan-create")?.addEventListener("click", () => showManualCreate());

  box.querySelector("#dhkhan-delete")?.addEventListener("click", async () => {
    const ids = [...box.querySelectorAll(".dhkhan-delete-pick:checked")]
      .map(x => Number(x.dataset.id)).filter(Boolean);
    if (!ids.length) {
      alert("Bạn chưa chọn dòng nào để xóa.");
      return;
    }
    if (!confirm(`Xóa ${ids.length} đặt hàng khẩn? Dữ liệu sẽ chuyển sang trạng thái HỦY để vẫn còn lịch sử.`)) return;
    suppressRealtimeUntil = Date.now() + 900;
    const { error } = await ctx.supabase.from(TABLE)
      .update({ trang_thai:"huy", updated_at:new Date().toISOString() })
      .in("id", ids);
    if (error) return alert("❌ Không xóa được: " + error.message);
    await refreshPanel();
  });

  box.querySelectorAll(".dhkhan-move:not(:disabled)").forEach(el => {
    el.addEventListener("change", async () => {
      const id = Number(el.dataset.id);
      const next = el.checked ? "dang_chuyen" : "moi";
      suppressRealtimeUntil = Date.now() + 700;
      const { error } = await ctx.supabase.from(TABLE)
        .update({ trang_thai:next, updated_at:new Date().toISOString() })
        .eq("id", id);
      if (error) {
        el.checked = !el.checked;
        alert("❌ Không cập nhật được trạng thái chuyển.");
      } else {
        const tr = el.closest("tr");
        tr?.classList.toggle("dhkhan-moving", next === "dang_chuyen");
        tr?.classList.toggle("dhkhan-new", next !== "dang_chuyen");
        const st = tr?.querySelector(".dhkhan-status");
        if (st) st.textContent = statusText(next);
      }
    });
  });

  box.querySelectorAll(".dhkhan-done").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xác nhận đã chuyển xong dòng này?")) return;
      suppressRealtimeUntil = Date.now() + 700;
      const { error } = await ctx.supabase.from(TABLE)
        .update({ trang_thai:"da_chuyen", updated_at:new Date().toISOString() })
        .eq("id", Number(btn.dataset.id));
      if (error) return alert("❌ Không hoàn thành được dòng này.");
      await refreshPanel();
    });
  });

  box.querySelectorAll(".dhkhan-note").forEach(input => {
    input.addEventListener("change", async () => {
      suppressRealtimeUntil = Date.now() + 600;
      const { error } = await ctx.supabase.from(TABLE)
        .update({ ghichu_dat:input.value || "", updated_at:new Date().toISOString() })
        .eq("id", Number(input.dataset.id));
      input.style.background = error ? "#ffd6d6" : "#e8f7e8";
      setTimeout(() => { input.style.background = ""; }, 650);
    });
  });

  box.querySelectorAll(".dhkhan-masp-link").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); openStockQuick(el.dataset.masp);
    });
  });
}

async function renderPanel(rows, { forceOpen = false, flash = false } = {}) {
  ensureStyles();
  const coso = getCurrentCoso();
  if (!coso) return;

  if (!rows.length) {
    document.getElementById("dhkhan-panel")?.remove();
    panelOpen = false;
    return;
  }

  const canMove = rows.filter(r => norm(r.tu_coso).toLowerCase() === coso);
  const onlyView = rows.filter(r => norm(r.tu_coso).toLowerCase() !== coso);

  document.getElementById("dhkhan-panel")?.remove();
  const box = document.createElement("div");
  box.id = "dhkhan-panel";
  box.style.cssText = `position:fixed;background:#ffe5df;border:2px solid #d00000;border-radius:7px;box-shadow:0 3px 14px rgba(0,0,0,.3);overflow:auto;padding:6px;box-sizing:border-box;`;
  if (forceOpen) userCollapsed = false;

  box.innerHTML = `
    <div id="dhkhan-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;z-index:5;background:#ffe5df;min-height:26px;font-weight:900;color:#9b0000;">
      <span>🚨 ĐẶT HÀNG KHẨN CẤP | Cần chuyển: ${canMove.length} | Theo dõi: ${onlyView.length}</span>
      <div style="display:flex;gap:5px;align-items:center;">
        <button id="dhkhan-create" style="font-weight:800;color:#9b0000;">+ Đặt khẩn</button>
        <button id="dhkhan-toggle" style="border:0;background:transparent;font-size:18px;font-weight:900;">${userCollapsed ? "▲" : "▼"}</button>
      </div>
    </div>
    <div id="dhkhan-body" style="display:${userCollapsed ? "none" : "block"};">
      <table style="width:100%;border-collapse:collapse;background:#fff;margin-top:4px;">
        <thead><tr style="background:#f7b3a9;">
          <th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th><th>Xong</th>
        </tr></thead>
        <tbody>${renderRows(canMove, true)}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin:6px 0;">
        <button id="dhkhan-delete">Xóa đặt hàng</button>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fafafa;">
        <thead><tr style="background:#e5e5e5;">
          <th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>giờ</th><th>ghi chú</th><th>trạng thái</th><th>Xong</th>
        </tr></thead>
        <tbody>${renderRows(onlyView, false)}</tbody>
      </table>
    </div>`;

  document.body.appendChild(box);
  panelOpen = true;
  positionPanel();
  bindPanelEvents(box);

  if (flash) {
    box.classList.add("dhkhan-flash");
    setTimeout(() => box.classList.remove("dhkhan-flash"), 2200);
  }
}

async function refreshPanel(options = {}) {
  const rows = await fetchOpenOrders();
  await renderPanel(rows, options);
}

function showManualCreate() {
  document.getElementById("dhkhan-create-box")?.remove();
  const coso = getCurrentCoso();
  const from = otherCoso(coso);
  if (!coso || !from) return alert("Không xác định được cơ sở hiện tại.");

  const box = document.createElement("div");
  box.id = "dhkhan-create-box";
  box.style.cssText = `position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:10090;background:#fff;border:2px solid #d00000;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.32);padding:12px;width:390px;max-width:94vw;`;
  box.innerHTML = `
    <div style="font-weight:900;color:#a00000;font-size:17px;margin-bottom:10px;">🚨 ĐẶT HÀNG KHẨN CẤP</div>
    <div style="display:grid;grid-template-columns:90px 1fr;gap:7px;align-items:center;">
      <label>Mã SP</label><input id="dhkhan-masp" autocomplete="off" style="text-transform:uppercase;">
      <label>Size</label><input id="dhkhan-size" inputmode="numeric" placeholder="VD: 42">
      <label>Số lượng</label><input id="dhkhan-sl" type="number" min="1" value="1">
      <label>Hướng</label><div style="font-weight:800;">${from.toUpperCase()} → ${coso.toUpperCase()}</div>
      <label>Ghi chú</label><input id="dhkhan-note" placeholder="VD: khách đang chờ">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:11px;">
      <button id="dhkhan-cancel">Hủy</button>
      <button id="dhkhan-save" style="background:#d00000;color:#fff;border:0;border-radius:6px;padding:8px 13px;font-weight:900;">ĐẶT KHẨN</button>
    </div>`;
  document.body.appendChild(box);
  const maspEl = box.querySelector("#dhkhan-masp");
  setTimeout(() => maspEl?.focus(), 20);
  box.querySelector("#dhkhan-cancel").onclick = () => box.remove();
  box.querySelector("#dhkhan-save").onclick = async () => {
    const masp = normMasp(maspEl?.value);
    const size = normSize(box.querySelector("#dhkhan-size")?.value);
    const sl = Math.max(1, Number(box.querySelector("#dhkhan-sl")?.value || 1));
    const note = box.querySelector("#dhkhan-note")?.value || "";
    if (!masp || !size) return alert("Bạn cần nhập Mã SP và Size.");

    // Kiểm tra mã tồn tại để tránh gõ sai.
    const { data, error } = await ctx.supabase.from("dmhanghoa").select("masp").eq("masp", masp).maybeSingle();
    if (error || !data) return alert("❌ Mã sản phẩm không tồn tại trong danh mục.");

    const huong = from === "cs1" ? "1v2" : "2v1";
    const ok = await insertUrgentOrders([{
      masp, size, soluong:sl, huong_chuyen:huong, tu_coso:from, den_coso:coso
    }], note, "manual");
    if (ok) box.remove();
  };
}

function setupRealtime() {
  if (!ctx?.supabase || realtimeChannel) return;
  realtimeChannel = ctx.supabase
    .channel("dat_hang_chuyen_kho_khan_realtime")
    .on("postgres_changes", { event:"*", schema:"public", table:TABLE }, async (payload) => {
      if (Date.now() < suppressRealtimeUntil) return;

      const eventType = payload?.eventType || payload?.event || "";
      const row = payload?.new || {};
      const current = getCurrentCoso();
      const incomingForThisBranch = eventType === "INSERT" && norm(row.tu_coso).toLowerCase() === current;

      if (incomingForThisBranch) {
        userCollapsed = false;
        playUrgentSound();
        await refreshPanel({ forceOpen:true, flash:true });
      } else {
        await refreshPanel();
      }
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") console.warn("[Đặt hàng khẩn] Realtime channel lỗi");
    });
}

function bindStockQuickExisting() {
  const tryBind = (popup, payload) => {
    if (!popup || popup.dataset.dhkhanBound === "1") return;
    const th = popup.querySelector(".sq-dhck-open") || popup.querySelector("thead th:first-child");
    if (!th) return;
    popup.dataset.dhkhanBound = "1";
    th.textContent = "Size / Đặt khẩn";
    th.title = "Bấm để tạo đặt hàng chuyển kho khẩn cấp";
    th.style.cursor = "pointer";
    th.style.color = "#d00000";
    th.style.fontWeight = "800";
    th.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      openFromStockQuick(popup, payload);
    }, true);
  };

  window.addEventListener("stockquick:rendered", e => tryBind(e.detail?.popup, e.detail?.payload));
  setTimeout(() => tryBind(window.__LAST_STOCKQUICK_POPUP__, window.__LAST_STOCKQUICK_PAYLOAD__), 350);
}

export function initDatHangChuyenKhoKhan(options = {}) {
  ctx = options;
  ensureStyles();
  setupAudioUnlock();

  window.DatHangChuyenKhoKhan = {
    openFromStockQuick,
    openManual: showManualCreate,
    refresh: () => refreshPanel({ forceOpen:true })
  };

  bindStockQuickExisting();
  refreshPanel();
  setupRealtime();

  window.addEventListener("resize", schedulePosition);
  window.visualViewport?.addEventListener("resize", schedulePosition);
  setInterval(() => {
    if (document.getElementById("dhkhan-panel")) schedulePosition();
  }, 2000);
}
