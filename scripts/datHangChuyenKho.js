// /scripts/datHangChuyenKho.js

let ctx = null;
let timer = null;
let popupOpen = false;
let realtimeChannel = null;
let suppressRealtimeUntil = 0;
let userClosedPanel = false;
let restorePanelExpandedOnce = false;

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

function normSize(v) {
  const s = String(v || "").trim();
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}

function escAttr(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const ACCEPTED_STOCK_RULES = {
  1: [{ cs1: 0, cs2: 1 }],
  2: [{ cs1: 1, cs2: 1 }],
  3: [{ cs1: 1, cs2: 2 }],
  4: [
    { cs1: 1, cs2: 3 },
    { cs1: 2, cs2: 2 }
  ],
  5: [
    { cs1: 1, cs2: 4 },
    { cs1: 2, cs2: 3 },
    { cs1: 3, cs2: 2 }
  ],
  6: [
    { cs1: 2, cs2: 4 },
    { cs1: 3, cs2: 3 },
    { cs1: 4, cs2: 2 }
  ],
  7: [
    { cs1: 2, cs2: 5 },
    { cs1: 3, cs2: 4 },
    { cs1: 4, cs2: 3 },
    { cs1: 5, cs2: 2 }
  ]
};

const BEAUTIFUL_STOCK_TARGET = {
  1: { cs1: 0, cs2: 1 },
  2: { cs1: 1, cs2: 1 },
  3: { cs1: 1, cs2: 2 },
  4: { cs1: 2, cs2: 2 },
  5: { cs1: 2, cs2: 3 },
  6: { cs1: 2, cs2: 4 },
  7: { cs1: 3, cs2: 4 }
};

function getAcceptedStockRules(total) {
  const t = Number(total || 0);

  if (ACCEPTED_STOCK_RULES[t]) {
    return ACCEPTED_STOCK_RULES[t];
  }

  if (t <= 0) {
    return [{ cs1: 0, cs2: 0 }];
  }

  const cs1 = Math.floor(t / 3);
  return [{ cs1, cs2: t - cs1 }];
}

function getTargetStockByTotal(total) {
  const t = Number(total || 0);

  if (BEAUTIFUL_STOCK_TARGET[t]) {
    return BEAUTIFUL_STOCK_TARGET[t];
  }

  if (t <= 0) {
    return { cs1: 0, cs2: 0 };
  }

  const cs1 = Math.floor(t / 3);
  return { cs1, cs2: t - cs1 };
}

function isAcceptedStock(total, ton1, ton2) {
  return getAcceptedStockRules(total).some(r =>
    Number(r.cs1) === Number(ton1) &&
    Number(r.cs2) === Number(ton2)
  );
}

function getTonSauKiem(r, coso) {
  const tonKey = coso === "cs2" ? "ton_cs2" : "ton_cs1";
  const lechKey = coso === "cs2" ? "lech_cs2" : "lech_cs1";

  const ton = Number(r?.[tonKey] || 0);
  const lech = Number(r?.[lechKey] || 0);

  // Tồn thực tế sau kiểm = tồn sổ + lệch kiểm
  return Math.max(0, ton + lech);
}

function calcSuggestionsFromPayload(masp, payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const out = [];

  rows.forEach(r => {
    const size = normSize(r.size);
    if (!size || size === "0") return;

    const ton1 = getTonSauKiem(r, "cs1");
    const ton2 = getTonSauKiem(r, "cs2");

    const total = ton1 + ton2;
    if (total <= 0) return;

    if (isAcceptedStock(total, ton1, ton2)) {
      return;
    }

    const target = getTargetStockByTotal(total);

    if (ton1 > target.cs1 && ton2 < target.cs2) {
      out.push({
        masp,
        size,
        soluong: Math.min(ton1 - target.cs1, target.cs2 - ton2),
        huong_chuyen: "1v2",
        tu_coso: "cs1",
        den_coso: "cs2",
        ton_sau_kiem_cs1: ton1,
        ton_sau_kiem_cs2: ton2
      });
    }

    if (ton2 > target.cs2 && ton1 < target.cs1) {
      out.push({
        masp,
        size,
        soluong: Math.min(ton2 - target.cs2, target.cs1 - ton1),
        huong_chuyen: "2v1",
        tu_coso: "cs2",
        den_coso: "cs1",
        ton_sau_kiem_cs1: ton1,
        ton_sau_kiem_cs2: ton2
      });
    }
  });

  return out.filter(x => Number(x.soluong || 0) > 0);
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
  return v;
}

async function fetchOrders() {
  const { data, error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("*")
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Đặt hàng CK] fetch lỗi:", error);
    return [];
  }

  return data || [];
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
  return rows.map(r => `
    <tr class="${allowMove ? "" : "dhck-readonly"}">
      <td style="text-align:center;">
  <input type="checkbox" class="dhck-delete-check"
    ${allowMove ? "" : "disabled"}
    data-id="${r.id}">
</td>

<td style="text-align:center;">
  <input type="checkbox" class="dhck-move-check"
    ${allowMove ? "" : "disabled"}
    ${r.chon_chuyen ? "checked" : ""}
    data-id="${r.id}">
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
      <td class="dhck-status-cell">${statusText(r.trang_thai)}</td>
    </tr>
  `).join("");
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

  const patch = checked
    ? {
      chon_chuyen: true,
      trang_thai: "dang_chuyen",
      updated_at: now
    }
    : {
      chon_chuyen: false,
      trang_thai: "moi",
      updated_at: now
    };

  suppressRealtimeUntil = Date.now() + 800;

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .update(patch)
    .eq("id", Number(id))
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu"]);

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
        statusCell.textContent = input.checked ? "Đang chuyển" : "Mới";
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
  <span>ĐẶT HÀNG CHUYỂN KHO | Cần chuyển: ${canMove.length} | Theo dõi: ${onlyView.length}</span>
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

  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape" && document.getElementById("dhck-panel")) {
      popupOpen = false;
      box.remove();
      document.removeEventListener("keydown", esc, true);
    }
  }, true);
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
    !["moi", "dang_chuyen", "da_tao_phieu"].includes(String(r.trang_thai || ""))
  );

  if (badRows.length) {
    alert(
      "⚠️ Có dòng đặt hàng đã lỗi thời hoặc không còn hợp lệ.\n" +
      "Hệ thống sẽ tải lại danh sách, vui lòng chọn lại."
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
  const ids = Array.from(box.querySelectorAll(".dhck-move-check:checked"))
    .map(c => Number(c.dataset.id))
    .filter(Boolean);

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
          console.log("[Đặt hàng CK] Bỏ qua realtime do chính mình vừa lưu ghi chú/đóng popup");
          return;
        }

        console.log("[Đặt hàng CK] Realtime thay đổi, tải lại panel");

        const oldPanel = document.getElementById("dhck-panel");
        const oldBody = oldPanel?.querySelector("#dhck-body");

        // Nếu máy người khác đang mở bảng, sau realtime phải mở lại như cũ
        restorePanelExpandedOnce = !!oldBody && oldBody.style.display !== "none";

        popupOpen = false;
        oldPanel?.remove();

        await runDatHangCheck(false);
      }
    )
    .subscribe((status) => {
      console.log("[Đặt hàng CK] realtime status:", status);
    });
}

export function initDatHangChuyenKho(options = {}) {
  ctx = options;

  window.DatHangChuyenKho = {
    attachStockQuickPopup,
    openFromStockQuick,
    triggerCheck: () => runDatHangCheck(true),
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

  console.log("[Đặt hàng CK] afterCcnSaved ids:", ids, "result:", result);

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
