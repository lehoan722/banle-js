// /scripts/datHangChuyenKho.js

let ctx = null;
let timer = null;
let popupOpen = false;

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

function normSize(v) {
  const s = String(v || "").trim();
  const m = s.match(/\d{1,2}/);
  return m ? m[0] : s;
}

function getTargetStockByTotal(total) {
  const t = Number(total || 0);
  if (t <= 0) return { cs1: 0, cs2: 0 };
  if (t === 1) return { cs1: 0, cs2: 1 };
  if (t === 2) return { cs1: 1, cs2: 1 };
  if (t === 3) return { cs1: 1, cs2: 2 };
  if (t === 4) return { cs1: 1, cs2: 3 };
  if (t === 5) return { cs1: 2, cs2: 3 };

  const cs1 = Math.floor(t / 3);
  return { cs1, cs2: t - cs1 };
}

function calcSuggestionsFromPayload(masp, payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const out = [];

  rows.forEach(r => {
    const size = normSize(r.size);
    if (!size || size === "0") return;

    const ton1 = Number(r.ton_cs1 || 0);
    const ton2 = Number(r.ton_cs2 || 0);
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

  box.addEventListener("click", (e) => {
    e.stopPropagation();
  }, true);

  box.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  }, true);

  box.addEventListener("touchstart", (e) => {
    e.stopPropagation();
  }, true);

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
        <input type="checkbox" class="dhck-row-check"
          ${allowMove ? "" : "disabled"}
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
          value="${r.ghichu_dat || ""}"
          ${allowMove ? "" : "readonly"}
          style="width:90px;box-sizing:border-box;">
      </td>
      <td>${statusText(r.trang_thai)}</td>
    </tr>
  `).join("");
}

function showPanel(allRows) {
  const coso = getCurrentCoso();
  if (!coso || !allRows.length || popupOpen) return;

  popupOpen = true;
  document.getElementById("dhck-panel")?.remove();

  const canMove = allRows.filter(r => String(r.tu_coso).toLowerCase() === coso);
  const onlyView = allRows.filter(r => String(r.tu_coso).toLowerCase() !== coso);

  const box = document.createElement("div");
  box.id = "dhck-panel";
  box.style.cssText = `
    position:fixed;
    left:6px;
    top:56vh;
    width:620px;
    max-width:94vw;
    height:36vh;
max-height:36vh;
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
      <button id="dhck-close" style="border:none;background:transparent;font-weight:bold;font-size:18px;">×</button>
    </div>

    <div style="font-weight:bold;color:#b00000;margin:3px 0;">Cơ sở này cần chuẩn bị</div>
    <table style="width:100%;border-collapse:collapse;background:#fff;">
      <thead>
        <tr style="background:#f4c985;">
          <th>✓</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>ghi chú</th><th>trạng thái</th>
        </tr>
      </thead>
      <tbody>${renderRows(canMove, true)}</tbody>
    </table>

    <div style="text-align:right;margin:6px 0;">
      <button id="dhck-create-ccn">Tạo hóa đơn CCN</button>
    </div>

    <div style="font-weight:bold;color:#555;margin:5px 0 3px;">Chỉ xem / theo dõi</div>
    <table style="width:100%;border-collapse:collapse;background:#f7f7f7;">
      <thead>
        <tr style="background:#ddd;">
          <th>✓</th><th>mã sp</th><th>SL</th><th>size</th><th>hướng</th><th>NV đặt</th><th>ghi chú</th><th>trạng thái</th>
        </tr>
      </thead>
      <tbody>${renderRows(onlyView, false)}</tbody>
    </table>
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

  box.querySelector("#dhck-close").onclick = () => {
    popupOpen = false;
    box.remove();
  };

  box.querySelector("#dhck-create-ccn").onclick = () => createCcnFromChecked(box, canMove);

  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape" && document.getElementById("dhck-panel")) {
      popupOpen = false;
      box.remove();
      document.removeEventListener("keydown", esc, true);
    }
  }, true);
}

async function createCcnFromChecked(box, canMove) {
  const ids = Array.from(box.querySelectorAll(".dhck-row-check:checked"))
    .map(c => Number(c.dataset.id))
    .filter(Boolean);

  if (!ids.length) {
    alert("Bạn chưa tick dòng nào để tạo hóa đơn CCN.");
    return;
  }

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

  await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .update({
      trang_thai: "dang_chuyen",
      updated_at: new Date().toISOString()
    })
    .in("id", ids);

  const url = dir === "2v1"
    ? "/ccn2v1cs2.html"
    : "/ccn1v2cs1.html";

  window.open(location.origin + url, "_blank");
}

async function runDatHangCheck(forceShow = false) {
  if (!ctx?.supabase) return;

  const rows = await fetchOrders();
  if (!rows.length) return;

  if (forceShow) {
    popupOpen = false;
    document.getElementById("dhck-panel")?.remove();
  }

  showPanel(rows);
}

function openFromStockQuick(popup, payload) {
  const masp = String(popup?.dataset?.masp || payload?.masp || "").toUpperCase();
  const suggestions = calcSuggestionsFromPayload(masp, payload);
  showCreateConfirm(suggestions);
}

function autoOpenFromStockQuick(popup, payload) {
  const masp = String(popup?.dataset?.masp || payload?.masp || "").toUpperCase();

  const suggestions = calcSuggestionsFromPayload(masp, payload);

  // Không có gợi ý thì im lặng, không báo gì
  if (!suggestions.length) return false;

  showCreateConfirm(suggestions);
  return true;
}

export function initDatHangChuyenKho(options = {}) {
  ctx = options;

  window.DatHangChuyenKho = {
    attachStockQuickPopup,
    openFromStockQuick,
    autoOpenFromStockQuick,
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

export async function afterCcnSaved(result) {
  if (!result?.ok || !result?.sohd || !ctx?.supabase) return;

  let ids = [];
  try {
    ids = JSON.parse(localStorage.getItem("dhck_pending_ids") || "[]");
  } catch {
    ids = [];
  }

  ids = ids.map(Number).filter(Boolean);
  if (!ids.length) return;

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .update({
      trang_thai: "da_chuyen",
      da_chuyen: true,
      sohd_chuyen: result.sohd,
      manv_chuyen: getManv(),
      ngay_chuyen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in("id", ids);

  if (error) {
    console.error("[Đặt hàng CK] cập nhật sau lưu CCN lỗi:", error);
    alert("⚠️ Hóa đơn đã lưu nhưng chưa cập nhật được trạng thái đặt hàng.");
    return;
  }

  localStorage.removeItem("dhck_pending_ids");
  localStorage.removeItem("ccn_prefill_payload");
}
