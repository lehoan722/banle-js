// /scripts/datHangChuyenKho.js

import {
  normSize,
  calcSuggestionsFromPayload,
  calcSuggestionsFromRows,
  hasNegativeStockRows
} from "./services/luatChuyenKho.js";

let ctx = null;
let timer = null;
let popupOpen = false;
let realtimeChannel = null;
let suppressRealtimeUntil = 0;
let userClosedPanel = false;
let restorePanelExpandedOnce = false;
let autoRecheckRunning = false;

function getCurrentCoso() {
  return String(
    ctx?.diadiem ||
    localStorage.getItem("diadiem") ||
    window.diadiem ||
    ""
  ).trim().toLowerCase();
}

function getManv() {
  return String(
    ctx?.manvDangNhap ||
    localStorage.getItem("manv") ||
    document.getElementById("manv")?.value ||
    ""
  ).trim();
}

async function isAdminUser() {
  if (ctx?.isAdmin === true || window.isAdmin === true) return true;

  if (!ctx?.supabase) return false;

  const { data, error } = await ctx.supabase.rpc("is_admin");

  if (error) {
    console.warn("[Đặt hàng CK] Không kiểm tra được admin:", error);
    return false;
  }

  return data === true;
}

function escAttr(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function insertOrders(items, note = "") {
  if (!ctx?.supabase || !items.length) return false;

  const manv = getManv();

  const rows = items.map(x => ({
    masp: String(x.masp || "").toUpperCase(),
    size: String(x.size || ""),
    soluong: Number(x.soluong || 1),
    huong_chuyen: x.huong_chuyen,
    tu_coso: x.tu_coso,
    den_coso: x.den_coso,
    manv_dat: manv,
    ghichu_dat: note,
    trang_thai: "moi",
    nguon: "stockquick"
  }));

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .insert(rows);

  if (error) {
    console.error("[Đặt hàng CK] insert lỗi:", error);
    alert("❌ Không lưu được đặt hàng chuyển kho.");
    return false;
  }

  alert("✅ Đã tạo đặt hàng chuyển kho.");
  userClosedPanel = false;
  await runDatHangCheck(true);
  return true;
}

function showCreateConfirm(items) {
  if (!items.length) {
    alert("Không có size nào cần gợi ý chuyển kho.");
    return;
  }

  document.getElementById("dhck-confirm")?.remove();

  const box = document.createElement("div");
  box.id = "dhck-confirm";
  box.style.cssText = `
    position:fixed;
    top:120px;
    left:50%;
    transform:translateX(-50%);
    background:#fff;
    border:1px solid #999;
    box-shadow:0 0 12px rgba(0,0,0,.35);
    z-index:10050;
    padding:10px;
    min-width:360px;
    max-width:520px;
    font-size:14px;
  `;

  const lines = items.map(x => `
    <label style="display:block;margin:4px 0;">
      <input type="checkbox" class="dhck-pick" checked
        data-masp="${x.masp}"
        data-size="${x.size}"
        data-sl="${x.soluong}"
        data-huong="${x.huong_chuyen}"
        data-tu="${x.tu_coso}"
        data-den="${x.den_coso}">
      ${x.huong_chuyen} | ${x.masp} | size ${x.size} | SL ${x.soluong}
    </label>
  `).join("");

  box.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px;">Tạo đặt hàng chuyển kho</div>
    ${lines}
    <input id="dhck-note" placeholder="Ghi chú đặt hàng" style="width:100%;box-sizing:border-box;margin:6px 0;padding:5px;">
    <div style="text-align:right;">
      <button id="dhck-ok">OK</button>
      <button id="dhck-cancel">Hủy</button>
    </div>
  `;

  document.body.appendChild(box);

  box.querySelector("#dhck-cancel").onclick = () => box.remove();

  box.querySelector("#dhck-ok").onclick = async () => {
    const picked = Array.from(box.querySelectorAll(".dhck-pick:checked")).map(c => ({
      masp: c.dataset.masp,
      size: c.dataset.size,
      soluong: Number(c.dataset.sl || 1),
      huong_chuyen: c.dataset.huong,
      tu_coso: c.dataset.tu,
      den_coso: c.dataset.den
    }));

    const note = box.querySelector("#dhck-note")?.value || "";
    if (!picked.length) {
      alert("Bạn chưa chọn dòng nào.");
      return;
    }

    const ok = await insertOrders(picked, note);
    if (ok) box.remove();
  };
}

function statusText(s) {
  const v = String(s || "moi");
  if (v === "moi") return "Mới";
  if (v === "dang_chuyen") return "Đang chuyển";
  if (v === "da_tao_phieu") return "Đã tạo phiếu";
  if (v === "da_chuyen") return "Đã chuyển";
  if (v === "huy") return "Hủy";
  if (v === "loi_thoi") return "Lỗi thời";
  if (v === "yeu_cau_kiem_kho") return "Yêu cầu kiểm kho";
  return v;
}

function isOutdatedMovingRow(r) {
  return String(r.trang_thai || "") === "loi_thoi" && r.chon_chuyen === true;
}

function isNeedStockCheckRow(r) {
  return String(r.trang_thai || "") === "yeu_cau_kiem_kho";
}

function sortOrdersForDisplay(rows) {
  const arr = Array.isArray(rows) ? rows.slice() : [];

  // Thời điểm mới nhất của từng mã sản phẩm
  const latestByMasp = new Map();

  arr.forEach(r => {
    const masp = String(r.masp || "").trim().toUpperCase();
    const t = new Date(r.created_at || r.updated_at || 0).getTime();

    if (!latestByMasp.has(masp) || t > latestByMasp.get(masp)) {
      latestByMasp.set(masp, t);
    }
  });

  return arr.sort((a, b) => {

    // Dòng lỗi thời nhưng đang chuyển luôn đẩy xuống cuối danh sách
    const oa = isOutdatedMovingRow(a) ? 1 : 0;
    const ob = isOutdatedMovingRow(b) ? 1 : 0;

    if (oa !== ob) return oa - ob;

    const ma = String(a.masp || "").trim().toUpperCase();
    const mb = String(b.masp || "").trim().toUpperCase();

    // ===== Ưu tiên 1 =====
    const ga = latestByMasp.get(ma) || 0;
    const gb = latestByMasp.get(mb) || 0;

    if (gb !== ga) return gb - ga;

    // ===== Ưu tiên 2 =====
    if (ma !== mb) {
      return ma.localeCompare(mb);
    }

    // ===== Ưu tiên 3 =====
    const sa = Number(a.size) || 0;
    const sb = Number(b.size) || 0;

    if (sa !== sb) return sa - sb;

    // ===== Ưu tiên 4 =====
    const ta = new Date(a.created_at || a.updated_at || 0).getTime();
    const tb = new Date(b.created_at || b.updated_at || 0).getTime();

    return tb - ta;
  });
}

function getDenNgayForDhck() {
  try {
    const raw = sessionStorage.getItem("XNT14_FILTERS");
    if (raw) {
      const f = JSON.parse(raw);
      if (f.den_ngay) return f.den_ngay;
    }
  } catch { }

  return new Date().toISOString().slice(0, 10);
}

async function fetchCurrentSuggestionKeysByMasp(masp) {
  if (!ctx?.supabase || !masp) return new Set();

  const code = String(masp || "").trim().toUpperCase();
  const denNgay = getDenNgayForDhck();

  const [snapRes, kiemRes] = await Promise.all([
    ctx.supabase.rpc("xntnhanh", {
      p_masps: [code],
      p_den_ngay: denNgay,
      p_tonghop_size: false
    }),

    ctx.supabase.rpc("rpc_stockquick_kiemton", {
      p_masp: code
    })
  ]);

  if (snapRes.error) {
    console.warn("[Đặt hàng CK] Không đọc được tồn hiện tại:", code, snapRes.error);
    return new Set();
  }

  const kiemton = kiemRes?.data || { cs1: {}, cs2: {} };
  const data = Array.isArray(snapRes.data) ? snapRes.data : [];

  const rows = data.map(r => {
    const sizeKey = String(r.size || "").replace(/^size\s+/i, "").trim();

    return {
      masp: String(r.masp || code).toUpperCase(),
      size: r.size,
      ton_cs1: Number(r.ton_cs1 || 0),
      ton_cs2: Number(r.ton_cs2 || 0),
      lech_cs1: Number(kiemton?.cs1?.lech?.[sizeKey] || 0),
      lech_cs2: Number(kiemton?.cs2?.lech?.[sizeKey] || 0),

      // Quan trọng: truyền dữ liệu bán để luật thông minh hoạt động
      ban_cs1: Number(r.ban_cs1 || 0),
      ban_cs2: Number(r.ban_cs2 || 0),
      tong_ban: Number(r.tong_ban || 0),
      tong_nhap: Number(r.tong_nhap || 0),
      tong_ton: Number(r.tong_ton || 0)
    };
  });

  const hasNegative = hasNegativeStockRows(rows);
  const suggestions = hasNegative ? [] : calcSuggestionsFromRows(rows, code);

  return {
    hasNegative,
    suggestions,
    keys: new Set(
      suggestions.map(x =>
        `${String(x.masp).toUpperCase()}|${normSize(x.size)}|${x.huong_chuyen}`
      )
    )
  };
}

async function autoMarkOutdatedNewOrders(rows) {
  if (!ctx?.supabase || !Array.isArray(rows) || !rows.length) return false;
  if (autoRecheckRunning) return false;
  autoRecheckRunning = true;

  try {

    const coso = getCurrentCoso();

    const newRows = rows
      .filter(r =>
        ["moi", "yeu_cau_kiem_kho"].includes(String(r.trang_thai || "")) &&
        String(r.tu_coso || "").toLowerCase() === coso
      )
      .slice(0, 200);

    if (!newRows.length) return false;

    const masps = Array.from(
      new Set(newRows.map(r => String(r.masp || "").trim().toUpperCase()).filter(Boolean))
    ).slice(0, 200);

    if (!masps.length) return false;

    const suggestionInfoByMasp = new Map();

    for (const masp of masps) {
      const info = await fetchCurrentSuggestionKeysByMasp(masp);
      suggestionInfoByMasp.set(masp, info);
    }

    const outdatedIds = [];
    const needCheckIds = [];
    const restoreCheckIds = [];

    newRows.forEach(r => {
      const masp = String(r.masp || "").trim().toUpperCase();
      if (!suggestionInfoByMasp.has(masp)) return;

      const info = suggestionInfoByMasp.get(masp);

      const status = String(r.trang_thai || "");
      const key = `${masp}|${normSize(r.size)}|${r.huong_chuyen}`;

      if (info?.hasNegative) {
        if (status === "moi") {
          needCheckIds.push(Number(r.id));
        }
        return;
      }

      const stillNeeded = info.keys.has(key);

      if (status === "yeu_cau_kiem_kho") {
        if (stillNeeded) {
          restoreCheckIds.push(Number(r.id));
        } else {
          outdatedIds.push(Number(r.id));
        }
        return;
      }

      if (!stillNeeded) {
        outdatedIds.push(Number(r.id));
      }
    });

    if (needCheckIds.length) {
      const { error } = await ctx.supabase
        .from("dat_hang_chuyen_kho")
        .update({
          trang_thai: "yeu_cau_kiem_kho",
          chon_chuyen: false,
          updated_at: new Date().toISOString()
        })
        .in("id", needCheckIds)
        .eq("trang_thai", "moi");

      if (error) {
        console.warn("[Đặt hàng CK] Không cập nhật được dòng yêu cầu kiểm kho:", error);
      }
    }

    if (restoreCheckIds.length) {
      const { error } = await ctx.supabase
        .from("dat_hang_chuyen_kho")
        .update({
          trang_thai: "moi",
          chon_chuyen: false,
          updated_at: new Date().toISOString()
        })
        .in("id", restoreCheckIds)
        .eq("trang_thai", "yeu_cau_kiem_kho");

      if (error) {
        console.warn("[Đặt hàng CK] Không khôi phục được dòng yêu cầu kiểm kho:", error);
      }
    }

    if (!outdatedIds.length && !needCheckIds.length && !restoreCheckIds.length) return false;
    if (!outdatedIds.length) return true;

    const { error } = await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "loi_thoi",
        chon_chuyen: false,
        updated_at: new Date().toISOString()
      })
      .in("id", outdatedIds)
      .eq("trang_thai", "moi");

    if (error) {
      console.warn("[Đặt hàng CK] Không cập nhật được dòng mới lỗi thời:", error);
      return false;
    }

    return true;

  } finally {
    autoRecheckRunning = false;
  }

}

async function fetchOrders() {
  const { data, error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("*")
    .or(
      "trang_thai.in.(moi,dang_chuyen,da_tao_phieu,yeu_cau_kiem_kho),and(trang_thai.eq.loi_thoi,chon_chuyen.eq.true)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Đặt hàng CK] fetch lỗi:", error);
    return [];
  }

  const sortedRows = sortOrdersForDisplay(data || []);

  const changed = await autoMarkOutdatedNewOrders(sortedRows);

  if (changed) {
    const { data: data2, error: error2 } = await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .select("*")
      .or(
        "trang_thai.in.(moi,dang_chuyen,da_tao_phieu,yeu_cau_kiem_kho),and(trang_thai.eq.loi_thoi,chon_chuyen.eq.true)"
      )
      .order("created_at", { ascending: false });

    if (error2) {
      console.error("[Đặt hàng CK] fetch lại lỗi:", error2);
      return sortedRows;
    }

    return sortOrdersForDisplay(data2 || []);
  }

  return sortedRows;
}

function openStockQuickFromDatHang(masp) {
  const code = String(masp || "").trim().toUpperCase();
  if (!code) return;

  try {
    if (window.StockQuick?.showFor) {
      window.StockQuick.showFor(document.body, code);
      return;
    }

    if (typeof window.stockQuickPopup === "function") {
      window.stockQuickPopup(code);
      return;
    }

    alert("Chưa tải được module tồn kho nhanh.");
  } catch (e) {
    console.error("[Đặt hàng CK] lỗi mở stock quick:", e);
  }
}

function renderRows(rows, allowMove) {
  return rows.map(r => {
    const outdatedMoving = isOutdatedMovingRow(r);
    const needStockCheck = isNeedStockCheckRow(r);

    return `
      <tr class="${allowMove ? "" : "dhck-readonly"} ${outdatedMoving ? "dhck-outdated-moving" : ""} ${needStockCheck ? "dhck-need-stock-check" : ""}">
        <td style="text-align:center;">
          <input type="checkbox" class="dhck-delete-check"
            ${allowMove ? "" : "disabled"}
            data-id="${r.id}">
        </td>

        <td style="text-align:center;">
          <input type="checkbox" class="dhck-move-check"
            ${allowMove ? "" : "disabled"}
            ${r.chon_chuyen ? "checked" : ""}
            data-id="${r.id}"
            data-status="${r.trang_thai || ""}">
        </td>

        <td>
          <span class="dhck-masp-link" data-masp="${r.masp || ""}">
            ${r.masp || ""}
          </span>
        </td>

        <td>${r.soluong || 1}</td>
        <td>${r.size || ""}</td>
        <td>${r.huong_chuyen || ""}</td>
        <td>${r.manv_dat || ""}</td>

        <td>
          <input class="dhck-note-inline" data-id="${r.id}"
            value="${escAttr(r.ghichu_dat || "")}"
            ${allowMove ? "" : "readonly"}
            style="width:90px;box-sizing:border-box;">
        </td>

        <td class="dhck-status-cell">
         ${needStockCheck ? "Yêu cầu kiểm kho" : outdatedMoving ? "Lỗi thời - trả lại kho" : statusText(r.trang_thai)}
        </td>
      </tr>
    `;
  }).join("");
}

const noteSaveTimers = new Map();

async function saveInlineNote(id, value, input = null) {
  if (!ctx?.supabase || !id) return false;

  if (input) {
    input.dataset.saving = "1";
    input.style.background = "#fff7cc";
  }

  suppressRealtimeUntil = Date.now() + 2000;

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .update({
      ghichu_dat: String(value || ""),
      updated_at: new Date().toISOString()
    })
    .eq("id", Number(id));

  if (input) {
    input.dataset.saving = "0";
    input.style.background = error ? "#ffe0e0" : "";
  }

  if (error) {
    console.error("[Đặt hàng CK] Lỗi lưu ghi chú:", error);
    return false;
  }

  return true;
}

function bindInlineNoteAutosave(box) {
  box.querySelectorAll(".dhck-note-inline:not([readonly])").forEach(input => {
    input.addEventListener("input", () => {
      const id = input.dataset.id;
      clearTimeout(noteSaveTimers.get(id));

      const t = setTimeout(() => {
        saveInlineNote(id, input.value, input);
      }, 800);

      noteSaveTimers.set(id, t);
    });

    input.addEventListener("blur", () => {
      const id = input.dataset.id;
      clearTimeout(noteSaveTimers.get(id));
      saveInlineNote(id, input.value, input);
    });
  });
}

async function flushInlineNotes(box) {
  const inputs = Array.from(
    box.querySelectorAll(".dhck-note-inline:not([readonly])")
  );

  await Promise.all(inputs.map(input => {
    const id = input.dataset.id;
    clearTimeout(noteSaveTimers.get(id));
    return saveInlineNote(id, input.value, input);
  }));
}

async function saveMoveCheck(id, checked) {
  if (!ctx?.supabase || !id) return false;

  const now = new Date().toISOString();

  const currentStatus = String(
    document.querySelector(`.dhck-move-check[data-id="${id}"]`)?.dataset.status || ""
  );

  const patch = checked
    ? {
      chon_chuyen: true,
      trang_thai: currentStatus === "loi_thoi" ? "loi_thoi" : "dang_chuyen",
      updated_at: now
    }
    : {
      chon_chuyen: false,
      trang_thai: currentStatus === "loi_thoi" ? "loi_thoi" : "moi",
      updated_at: now
    };

  suppressRealtimeUntil = Date.now() + 800;

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .update(patch)
    .eq("id", Number(id))
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu", "loi_thoi"]);

  if (error) {
    console.error("[Đặt hàng CK] Lỗi lưu tick chuyển:", error);
    alert("❌ Không lưu được trạng thái chuyển.");
    return false;
  }

  return true;
}

function bindMoveCheck(box) {
  box.querySelectorAll(".dhck-move-check").forEach(input => {
    input.addEventListener("change", async () => {
      input.disabled = true;

      const row = input.closest("tr");
      const statusCell = row?.querySelector(".dhck-status-cell");

      const ok = await saveMoveCheck(input.dataset.id, input.checked);

      if (!ok) {
        input.checked = !input.checked;
      } else if (statusCell) {
        const oldStatus = String(input.dataset.status || "");

        if (oldStatus === "loi_thoi") {
          statusCell.textContent = "Lỗi thời";
          input.closest("tr")?.remove();
        } else {
          statusCell.textContent = input.checked ? "Đang chuyển" : "Mới";
          input.dataset.status = input.checked ? "dang_chuyen" : "moi";
        }
      }

      input.disabled = false;
    });
  });
}

async function showPanel(allRows) {
  const coso = getCurrentCoso();
  if (!coso || !allRows.length || popupOpen) return;

  popupOpen = true;
  document.getElementById("dhck-panel")?.remove();

  const canMove = allRows.filter(r => String(r.tu_coso).toLowerCase() === coso);
  const onlyView = allRows.filter(r => String(r.tu_coso).toLowerCase() !== coso);
  const isAdmin = await isAdminUser();

  const box = document.createElement("div");
  box.id = "dhck-panel";
  box.style.cssText = `
    position:fixed;
    left:6px;
    top:16vh;
    width:620px;
    max-width:94vw;
    height:66vh;
    max-height:66vh;
    overflow:auto;
    overscroll-behavior: contain;
    background:#fff4d6;
    border:1px solid #d8a63b;
    box-shadow:0 2px 10px rgba(0,0,0,.25);
    z-index:9997;
    font-size:13px;
    padding:6px;
    box-sizing:border-box;
  `;

  if (window.matchMedia("(max-width: 480px)").matches) {
    const baymau = document.getElementById("baymau-popup");
    const footer = document.querySelector(".footer-buttons");

    const vh = window.visualViewport?.height || window.innerHeight;

    const bayRect = baymau?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();

    const top = bayRect ? Math.round(bayRect.bottom + 4) : 520;
    const bottomLimit = footerRect ? Math.round(footerRect.top - 6) : Math.round(vh - 120);
    const h = Math.max(90, bottomLimit - top);

    box.style.left = "0";
    box.style.right = "0";
    box.style.top = top + "px";
    box.style.bottom = "auto";
    box.style.width = "100vw";
    box.style.maxWidth = "100vw";
    box.style.height = h + "px";
    box.style.maxHeight = h + "px";
    box.style.overflowY = "auto";
    box.style.overflowX = "auto";
    box.style.fontSize = "12px";
    box.style.zIndex = "10020";
  }

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;font-weight:bold;margin-bottom:4px;">
  <span class="dhck-title-count">ĐẶT HÀNG CHUYỂN KHO | Cần chuyển: ${canMove.length} | Theo dõi: ${onlyView.length}</span>
  <div>
    <button id="dhck-toggle" style="border:none;background:transparent;font-weight:bold;font-size:18px;">▼</button>
    <button id="dhck-close" style="border:none;background:transparent;font-weight:bold;font-size:18px;">×</button>
  </div>
</div>

<div id="dhck-body">
    
    <table style="width:100%;border-collapse:collapse;background:#fff;">
      <thead>
        <tr style="background:#f4c985;">
          <th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>ghi chú</th><th>trạng thái</th>
        </tr>
      </thead>
      <tbody>${renderRows(canMove, true)}</tbody>
    </table>

    <div style="text-align:right;margin:6px 0;">
  ${isAdmin ? `<button id="dhck-delete-outdated">Xóa lỗi thời</button>` : ""}
  ${isAdmin ? `<button id="dhck-delete">Xóa đặt hàng</button>` : ""}
  <button id="dhck-create-ccn">Tạo hóa đơn CCN</button>
 </div>

    <table style="width:100%;border-collapse:collapse;background:#f7f7f7;">
      <thead>
        <tr style="background:#ddd;">
          <th>Xóa</th><th>Chuyển</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>ghi chú</th><th>trạng thái</th>
        </tr>
      </thead>
      <tbody>${renderRows(onlyView, false)}</tbody>
    </table>

</div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #dhck-panel th, #dhck-panel td {
      border:1px solid #ccc;
      padding:3px 5px;
      white-space:nowrap;
    }
    #dhck-panel .dhck-readonly {
      opacity:.65;
    }

    #dhck-panel > div:first-child {
  min-height: 24px;
  line-height: 24px;
}

    #dhck-panel .dhck-masp-link {
  color:#0b57d0;
  font-weight:700;
  text-decoration:underline;
  cursor:pointer;
}

#dhck-panel tr.dhck-outdated-moving td {
  background:#ffd6d6 !important;
  color:#b00000 !important;
  font-weight:700;
}

#dhck-panel tr.dhck-outdated-moving .dhck-masp-link {
  color:#b00000 !important;
}

#dhck-panel tr.dhck-need-stock-check td {
  background:#fff3b0 !important;
  color:#7a4b00 !important;
  font-weight:700;
}

#dhck-panel tr.dhck-need-stock-check .dhck-masp-link {
  color:#7a4b00 !important;
}
  
  `;
  box.appendChild(style);

  document.body.appendChild(box);
  box.addEventListener("wheel", (e) => {
    e.stopPropagation();
  }, { passive: true });

  box.querySelectorAll(".dhck-masp-link").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      openStockQuickFromDatHang(el.dataset.masp);
    });
  });

  bindInlineNoteAutosave(box);
  bindMoveCheck(box);

  box.querySelector("#dhck-close").onclick = async () => {
    userClosedPanel = true;
    suppressRealtimeUntil = Date.now() + 3000;

    await flushInlineNotes(box);

    popupOpen = false;
    box.remove();
  };
  let dhckCollapsed = false;

  const oldTop = box.style.top;
  const oldBottom = box.style.bottom;
  const oldHeight = box.style.height;
  const oldMaxHeight = box.style.maxHeight;
  const oldOverflowY = box.style.overflowY;
  const oldOverflowX = box.style.overflowX;
  const oldOverflow = box.style.overflow;

  function placeCollapsedBox() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const h = isMobile ? 36 : 34;

    if (isMobile) {
      const footer =
        document.querySelector(".footer-buttons") ||
        document.querySelector(".bottom-buttons") ||
        document.querySelector("#footer-buttons") ||
        document.querySelector("#bottomButtons");

      if (footer) {
        const r = footer.getBoundingClientRect();
        const top = Math.max(0, Math.round(r.top - h - 4));
        box.style.setProperty("top", top + "px", "important");
      } else {
        box.style.setProperty("top", "auto", "important");
        box.style.setProperty("bottom", "84px", "important");
      }

      box.style.setProperty("left", "0", "important");
      box.style.setProperty("right", "0", "important");
      box.style.setProperty("width", "100vw", "important");
      box.style.setProperty("max-width", "100vw", "important");
    } else {
      const maKhach =
        document.querySelector('input[placeholder*="mã khách"]') ||
        document.getElementById("makhach") ||
        document.querySelector("#maKhach");

      if (maKhach) {
        const r = maKhach.getBoundingClientRect();
        const top = Math.max(0, Math.round(r.top - h - 38));
        box.style.setProperty("top", top + "px", "important");
      }

      box.style.setProperty("bottom", "auto", "important");
    }

    box.style.setProperty("height", h + "px", "important");
    box.style.setProperty("min-height", h + "px", "important");
    box.style.setProperty("max-height", h + "px", "important");
    box.style.setProperty("overflow", "hidden", "important");
    box.style.setProperty("overflow-y", "hidden", "important");
    box.style.setProperty("overflow-x", "hidden", "important");
    box.style.setProperty("padding", "4px 6px", "important");
  }

  box.querySelector("#dhck-toggle").onclick = () => {
    dhckCollapsed = !dhckCollapsed;

    const body = box.querySelector("#dhck-body");
    const btn = box.querySelector("#dhck-toggle");

    if (dhckCollapsed) {
      body.style.setProperty("display", "none", "important");
      body.style.setProperty("height", "0", "important");
      body.style.setProperty("max-height", "0", "important");
      body.style.setProperty("overflow", "hidden", "important");

      btn.textContent = "▲";

      placeCollapsedBox();
    } else {
      body.style.removeProperty("display");
      body.style.removeProperty("height");
      body.style.removeProperty("max-height");
      body.style.removeProperty("overflow");

      btn.textContent = "▼";

      box.style.top = oldTop;
      box.style.bottom = oldBottom;
      box.style.height = oldHeight;
      box.style.maxHeight = oldMaxHeight;
      box.style.overflow = oldOverflow || "auto";
      box.style.overflowY = oldOverflowY || "auto";
      box.style.overflowX = oldOverflowX || "auto";
      box.style.padding = "6px";
    }
  };

  // Mặc định mở lần đầu thì thu gọn.
  // Nhưng nếu realtime cập nhật khi người dùng đang mở bảng,
  // thì giữ nguyên trạng thái mở, không tự thu gọn.
  setTimeout(() => {
    const body = box.querySelector("#dhck-body");
    const btn = box.querySelector("#dhck-toggle");

    if (restorePanelExpandedOnce) {
      dhckCollapsed = false;
      btn.textContent = "▼";
      restorePanelExpandedOnce = false;
      return;
    }

    dhckCollapsed = true;

    body.style.setProperty("display", "none", "important");
    body.style.setProperty("height", "0", "important");
    body.style.setProperty("max-height", "0", "important");
    body.style.setProperty("overflow", "hidden", "important");

    btn.textContent = "▲";

    placeCollapsedBox();
  }, 0);

  box.querySelector("#dhck-create-ccn").onclick = () => createCcnFromChecked(box, canMove);
  box.querySelector("#dhck-delete")?.addEventListener("click", () => {
    deleteCheckedOrders(box, canMove);
  });

  box.querySelector("#dhck-delete-outdated")?.addEventListener("click", () => {
    deleteOutdatedMovingOrders(box, canMove);
  });

  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape" && document.getElementById("dhck-panel")) {
      popupOpen = false;
      box.remove();
      document.removeEventListener("keydown", esc, true);
    }
  }, true);
}

async function recheckNeedStockCheckOrders(canMove) {
  if (!ctx?.supabase) return { restored: 0, outdated: 0 };

  const checkRows = (canMove || []).filter(r =>
    String(r.trang_thai || "") === "yeu_cau_kiem_kho"
  );

  if (!checkRows.length) {
    return { restored: 0, outdated: 0 };
  }

  const restoreIds = [];
  const outdatedIds = [];

  for (const r of checkRows) {
    const masp = String(r.masp || "").trim().toUpperCase();
    const info = await fetchCurrentSuggestionKeysByMasp(masp);

    // Nếu vẫn còn âm thì giữ cảnh báo vàng
    if (info?.hasNegative) continue;

    const key = `${masp}|${normSize(r.size)}|${r.huong_chuyen}`;

    if (info?.keys?.has(key)) {
      restoreIds.push(Number(r.id));
    } else {
      outdatedIds.push(Number(r.id));
    }
  }

  const now = new Date().toISOString();

  if (restoreIds.length) {
    await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "moi",
        chon_chuyen: false,
        updated_at: now
      })
      .in("id", restoreIds)
      .eq("trang_thai", "yeu_cau_kiem_kho");
  }

  if (outdatedIds.length) {
    await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "loi_thoi",
        chon_chuyen: false,
        updated_at: now
      })
      .in("id", outdatedIds)
      .eq("trang_thai", "yeu_cau_kiem_kho");
  }

  return {
    restored: restoreIds.length,
    outdated: outdatedIds.length
  };
}

async function deleteOutdatedMovingOrders(box, canMove) {
  await flushInlineNotes(box);

  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    alert("Bạn không có quyền xóa dòng lỗi thời.");
    return;
  }

  const deleteIds = canMove
    .filter(r => isOutdatedMovingRow(r))
    .map(r => Number(r.id))
    .filter(Boolean);

  if (!deleteIds.length) {
    const checkResult = await recheckNeedStockCheckOrders(canMove);

    alert(
      "Đã kiểm tra lại dữ liệu.\n" +
      `Khôi phục dòng yêu cầu kiểm kho: ${checkResult.restored}\n` +
      `Chuyển lỗi thời: ${checkResult.outdated}`
    );

    popupOpen = false;
    document.getElementById("dhck-panel")?.remove();
    await runDatHangCheck(true);
    return;
  }

  if (!confirm(`Bạn chắc chắn muốn xóa ${deleteIds.length} dòng lỗi thời đang chuyển của cơ sở mình?`)) {
    return;
  }

  suppressRealtimeUntil = Date.now() + 1500;

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .delete()
    .in("id", deleteIds)
    .eq("trang_thai", "loi_thoi")
    .eq("chon_chuyen", true);

  if (error) {
    console.error("[Đặt hàng CK] Lỗi xóa dòng lỗi thời:", error);
    alert("❌ Không xóa được dòng lỗi thời.");
    return;
  }

  const checkResult = await recheckNeedStockCheckOrders(canMove);

  alert(
    `✅ Đã xóa ${deleteIds.length} dòng lỗi thời.\n` +
    `Khôi phục dòng yêu cầu kiểm kho: ${checkResult.restored}\n` +
    `Chuyển lỗi thời: ${checkResult.outdated}`
  );

  popupOpen = false;
  document.getElementById("dhck-panel")?.remove();
  await runDatHangCheck(true);
}

async function deleteCheckedOrders(box, canMove) {
  await flushInlineNotes(box);
  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    alert("Bạn không có quyền xóa đặt hàng.");
    return;
  }

  const ids = Array.from(box.querySelectorAll(".dhck-delete-check:checked"))
    .map(c => Number(c.dataset.id))
    .filter(Boolean);

  if (!ids.length) {
    alert("Bạn chưa tick dòng nào để xóa.");
    return;
  }

  const allowedIds = canMove.map(r => Number(r.id));
  const deleteIds = ids.filter(id => allowedIds.includes(id));

  if (!deleteIds.length) {
    alert("Bạn chỉ được xóa dòng đặt hàng của cơ sở mình.");
    return;
  }

  if (!confirm(`Bạn chắc chắn muốn xóa ${deleteIds.length} dòng đặt hàng này?`)) {
    return;
  }

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .delete()
    .in("id", deleteIds);

  if (error) {
    console.error("[Đặt hàng CK] Lỗi xóa:", error);
    alert("❌ Không xóa được đặt hàng.");
    return;
  }

  alert("✅ Đã xóa đặt hàng.");

  popupOpen = false;
  document.getElementById("dhck-panel")?.remove();
  await runDatHangCheck(true);
}

async function validateOrderIdsBeforeCreate(ids) {
  if (!ctx?.supabase || !ids?.length) {
    return { ok: false, rows: [] };
  }

  const { data, error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("id, masp, size, soluong, huong_chuyen, trang_thai")
    .in("id", ids);

  if (error) {
    console.error("[Đặt hàng CK] Lỗi kiểm tra trạng thái trước khi tạo CCN:", error);
    alert("❌ Không kiểm tra được trạng thái đặt hàng. Vui lòng thử lại.");
    return { ok: false, rows: [] };
  }

  const badRows = (data || []).filter(r =>
    ["loi_thoi", "yeu_cau_kiem_kho"].includes(String(r.trang_thai || "")) ||
    !["moi", "dang_chuyen", "da_tao_phieu"].includes(String(r.trang_thai || ""))
  );

  if (badRows.length) {
    alert(
      "⚠️ Có dòng đặt hàng lỗi thời hoặc yêu cầu kiểm kho.\n" +
      "Không được tạo hóa đơn chuyển kho cho dòng này.\n\n" +
      "Vui lòng kiểm kho lại trước khi chuyển."
    );

    popupOpen = false;
    document.getElementById("dhck-panel")?.remove();
    await runDatHangCheck(true);

    return { ok: false, rows: data || [] };
  }

  return { ok: true, rows: data || [] };
}

async function createCcnFromChecked(box, canMove) {
  await flushInlineNotes(box);
  const allowedIds = new Set(canMove.map(r => Number(r.id)));

  const ids = Array.from(box.querySelectorAll(".dhck-move-check:checked"))
    .map(c => Number(c.dataset.id))
    .filter(id => allowedIds.has(id));

  if (!ids.length) {
    alert("Bạn chưa tick dòng nào để tạo hóa đơn CCN.");
    return;
  }

  const validCheck = await validateOrderIdsBeforeCreate(ids);
  if (!validCheck.ok) return;

  const selected = canMove.filter(r => ids.includes(Number(r.id)));
  const dirs = Array.from(new Set(selected.map(r => r.huong_chuyen)));

  if (dirs.length !== 1) {
    alert("Chỉ được tạo một hướng chuyển mỗi lần.");
    return;
  }

  const dir = dirs[0];
  const grouped = new Map();

  selected.forEach(r => {
    const masp = String(r.masp || "").toUpperCase();
    if (!grouped.has(masp)) grouped.set(masp, []);
    grouped.get(masp).push({
      size: String(r.size || ""),
      sl: Number(r.soluong || 1)
    });
  });

  const payload = {
    dir,
    note: "ĐẶT HÀNG CK: " + ids.join(","),
    source: "dat_hang_chuyen_kho",
    order_ids: ids,
    items: Array.from(grouped.entries()).map(([masp, items]) => ({ masp, items }))
  };

  localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
  localStorage.setItem("dhck_pending_ids", JSON.stringify(ids));

  const url = dir === "2v1"
    ? "/ccn2v1cs2.html"
    : "/ccn1v2cs1.html";

  window.open(location.origin + url, "_blank");
}

async function runDatHangCheck(forceShow = false) {
  if (!ctx?.supabase) return;

  if (forceShow) {
    userClosedPanel = false;
  }

  if (userClosedPanel && !forceShow) {
    return;
  }

  const rows = await fetchOrders();
  if (!rows.length) return;

  if (forceShow) {
    popupOpen = false;
    document.getElementById("dhck-panel")?.remove();
  }

  showPanel(rows);
}

async function filterSuggestionsNotPending(items) {
  const result = {
    newItems: items || [],
    pendingItems: []
  };

  if (!ctx?.supabase || !items?.length) return result;

  const masps = Array.from(new Set(items.map(x => String(x.masp || "").toUpperCase())));
  const sizes = Array.from(new Set(items.map(x => String(x.size || ""))));

  const { data, error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("masp, size, huong_chuyen, trang_thai")
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu"])
    .in("masp", masps)
    .in("size", sizes);

  if (error) {
    console.warn("[Đặt hàng CK] Không kiểm tra được dòng đang mở:", error);
    return result;
  }

  const opened = new Set(
    (data || []).map(r =>
      `${String(r.masp).toUpperCase()}|${normSize(r.size)}|${r.huong_chuyen}`
    )
  );

  result.newItems = [];
  result.pendingItems = [];

  (items || []).forEach(x => {
    const key = `${String(x.masp).toUpperCase()}|${normSize(x.size)}|${x.huong_chuyen}`;

    if (opened.has(key)) {
      result.pendingItems.push(x);
    } else {
      result.newItems.push(x);
    }
  });

  return result;
}

async function openFromStockQuick(popup, payload) {
  const masp = String(popup?.dataset?.masp || payload?.masp || "").toUpperCase();

  const suggestions = calcSuggestionsFromPayload(masp, payload);
  const checked = await filterSuggestionsNotPending(suggestions);

  const newItems = checked.newItems || [];
  const pendingItems = checked.pendingItems || [];

  if (!suggestions.length) {
    alert("Không có size nào cần gợi ý chuyển kho.");
    return;
  }

  if (!newItems.length && pendingItems.length) {
    const lines = pendingItems
      .map(x => `${x.huong_chuyen} | ${x.masp} | size ${x.size} | SL ${x.soluong}`)
      .join("\n");

    alert(
      "Các size cần chuyển kho đã được đặt rồi, đang nằm trong hàng đợi:\n\n" +
      lines
    );
    return;
  }

  if (newItems.length && pendingItems.length) {
    const lines = pendingItems
      .map(x => `${x.huong_chuyen} | ${x.masp} | size ${x.size}`)
      .join("\n");

    alert(
      "Một số size đã được đặt rồi nên sẽ không tạo lại:\n\n" +
      lines
    );
  }

  showCreateConfirm(newItems);
}

async function refreshPanelSmooth() {
  const panel = document.getElementById("dhck-panel");

  // Nếu panel chưa có thì mở như bình thường
  if (!panel) {
    await runDatHangCheck(false);
    return;
  }

  const rows = await fetchOrders();

  if (!rows.length) {
    popupOpen = false;
    panel.remove();
    return;
  }

  const coso = getCurrentCoso();
  const canMove = rows.filter(r => String(r.tu_coso).toLowerCase() === coso);
  const onlyView = rows.filter(r => String(r.tu_coso).toLowerCase() !== coso);

  const tables = panel.querySelectorAll("tbody");

  if (tables[0]) {
    tables[0].innerHTML = renderRows(canMove, true);
  }

  if (tables[1]) {
    tables[1].innerHTML = renderRows(onlyView, false);
  }

  const title = panel.querySelector(".dhck-title-count");
  if (title) {
    title.textContent = `ĐẶT HÀNG CHUYỂN KHO | Cần chuyển: ${canMove.length} | Theo dõi: ${onlyView.length}`;
  }

  bindMoveCheck(panel);
  bindInlineNoteAutosave(panel);

  panel.querySelectorAll(".dhck-masp-link").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openStockQuickFromDatHang(el.dataset.masp);
    });
  });
}

function setupDatHangRealtime() {
  if (!ctx?.supabase || realtimeChannel) return;

  realtimeChannel = ctx.supabase
    .channel("dat_hang_chuyen_kho_realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "dat_hang_chuyen_kho"
      },
      async () => {
        if (Date.now() < suppressRealtimeUntil) {
          return;
        }

        await refreshPanelSmooth();
      }
    )
    .subscribe();
}

export function initDatHangChuyenKho(options = {}) {
  ctx = options;

  window.DatHangChuyenKho = {
    attachStockQuickPopup,
    openFromStockQuick,
    triggerCheck: () => runDatHangCheck(true),
    calcSuggestionsFromPayloadForView: calcSuggestionsFromPayload,
    afterCcnSaved
  };

  window.addEventListener("stockquick:rendered", (e) => {
    const popup = e.detail?.popup;
    const payload = e.detail?.payload;

    if (popup && payload) {
      attachStockQuickPopup(popup, payload);
    }
  });

  // Nếu stockQuick đã mở trước khi module đặt hàng sẵn sàng
  setTimeout(() => {
    if (window.__LAST_STOCKQUICK_POPUP__ && window.__LAST_STOCKQUICK_PAYLOAD__) {
      attachStockQuickPopup(
        window.__LAST_STOCKQUICK_POPUP__,
        window.__LAST_STOCKQUICK_PAYLOAD__
      );
    }
  }, 300);

  runDatHangCheck();
  setupDatHangRealtime();

  if (timer) clearInterval(timer);
  timer = setInterval(() => runDatHangCheck(), 5 * 60 * 1000);
}

export function attachStockQuickPopup(popup, payload) {
  if (!popup || popup.dataset.dhckBound === "1") return;
  popup.dataset.dhckBound = "1";

  const thSize = popup.querySelector("thead th:first-child");
  if (!thSize) return;

  thSize.textContent = "Size / Đặt hàng";
  thSize.style.cursor = "pointer";
  thSize.style.color = "#d00000";
  thSize.title = "Bấm để tạo gợi ý đặt hàng chuyển kho";

  thSize.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const masp = String(popup.dataset.masp || payload?.masp || "").toUpperCase();
    const suggestions = calcSuggestionsFromPayload(masp, payload);
    showCreateConfirm(suggestions);
  });
}

async function afterCcnSaved(result) {
  if (!result?.ok || !result?.sohd || !ctx?.supabase) return;

  let ids = [];
  let payload = null;

  try {
    ids = JSON.parse(localStorage.getItem("dhck_pending_ids") || "[]");
  } catch {
    ids = [];
  }

  try {
    payload = JSON.parse(localStorage.getItem("ccn_prefill_payload") || "null");
  } catch {
    payload = null;
  }

  if ((!ids || !ids.length) && Array.isArray(payload?.order_ids)) {
    ids = payload.order_ids;
  }

  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return;

  if (!ids.length) {
    const note = String(
      document.getElementById("ghichu")?.value ||
      result?.hoadon?.ghichu ||
      ""
    );

    const m = note.match(/ĐẶT\s*HÀNG\s*CK\s*:\s*([0-9,\s]+)/i);

    if (m && m[1]) {
      ids = m[1]
        .split(",")
        .map(x => Number(String(x).trim()))
        .filter(Boolean);
    }
  }

  const dir =
    payload?.dir ||
    (location.pathname.toLowerCase().includes("ccn2v1") ? "2v1" : "1v2");

  const normMasp = v => String(v || "").trim().toUpperCase();

  const normSize = v => {
    const s = String(v || "").replace(/^size\s+/i, "").trim();
    const m = s.match(/\d{1,2}/);
    return m ? m[0] : s;
  };

  const qtyMap = new Map();

  (result.chitiet || []).forEach(r => {
    const masp = normMasp(r.masp);
    const size = normSize(r.size);
    const sl = Number(r.soluong || 0);
    if (!masp || !size || !sl) return;

    const key = `${masp}|${size}|${dir}`;
    qtyMap.set(key, (qtyMap.get(key) || 0) + sl);
  });

  const { data: orders, error: fetchErr } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("id, masp, size, soluong, huong_chuyen, trang_thai")
    .in("id", ids);

  if (fetchErr) {
    console.error("[Đặt hàng CK] Không đọc được dòng đặt hàng:", fetchErr);
    alert("⚠️ Hóa đơn đã lưu nhưng chưa kiểm tra được trạng thái đặt hàng.");
    return;
  }

  const idsDaChuyen = [];
  const idsTraVeMoi = [];

  (orders || []).forEach(o => {
    const key = `${normMasp(o.masp)}|${normSize(o.size)}|${o.huong_chuyen}`;
    const canCo = Number(o.soluong || 1);
    const dangCoTrongPhieu = Number(qtyMap.get(key) || 0);

    if (dangCoTrongPhieu >= canCo) {
      idsDaChuyen.push(o.id);
      qtyMap.set(key, dangCoTrongPhieu - canCo);
    } else {
      idsTraVeMoi.push(o.id);
    }
  });

  const now = new Date().toISOString();
  const manv = getManv();

  if (idsDaChuyen.length) {
    const { error } = await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "da_chuyen",
        sohd_chuyen: result.sohd,
        manv_chuyen: manv,
        ngay_chuyen: now,
        updated_at: now
      })
      .in("id", idsDaChuyen);

    if (error) {
      console.error("[Đặt hàng CK] Lỗi cập nhật đã chuyển:", error);
      alert("⚠️ Hóa đơn đã lưu nhưng chưa cập nhật được trạng thái đã chuyển.");
      return;
    }
  }

  if (idsTraVeMoi.length) {
    await ctx.supabase
      .from("dat_hang_chuyen_kho")
      .update({
        trang_thai: "moi",
        updated_at: now
      })
      .in("id", idsTraVeMoi);
  }

  localStorage.removeItem("dhck_pending_ids");
  localStorage.removeItem("ccn_prefill_payload");
}
