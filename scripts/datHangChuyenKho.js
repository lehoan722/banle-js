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
let suggestedDeleteIds = new Set();
let suggestedNeedCheckIds = new Set();

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

function makeOrderKey(x) {
  return [
    String(x.masp || "").trim().toUpperCase(),
    normSize(x.size),
    String(x.huong_chuyen || "").trim().toLowerCase()
  ].join("|");
}

async function insertOrders(items, note = "") {
  if (!ctx?.supabase || !items.length) return false;

  const manv = getManv();

  // 1) Chống trùng ngay trong danh sách chuẩn bị insert
  const uniqueMap = new Map();

  (items || []).forEach(x => {
    const key = makeOrderKey(x);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, x);
    }
  });

  const uniqueItems = Array.from(uniqueMap.values());

  const masps = Array.from(new Set(
    uniqueItems.map(x => String(x.masp || "").trim().toUpperCase()).filter(Boolean)
  ));

  const sizes = Array.from(new Set(
    uniqueItems.map(x => String(x.size || "").trim()).filter(Boolean)
  ));

  // 2) Kiểm tra lại trong DB ngay trước khi insert
  const { data: existed, error: checkErr } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .select("masp, size, huong_chuyen, trang_thai")
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu", "yeu_cau_kiem_kho"])
    .in("masp", masps)
    .in("size", sizes);

  if (checkErr) {
    console.warn("[Đặt hàng CK] Không kiểm tra được dòng trùng:", checkErr);
    alert("❌ Không kiểm tra được dữ liệu đặt hàng hiện có.");
    return false;
  }

  const existedKeys = new Set(
    (existed || []).map(r => makeOrderKey(r))
  );

  const rows = uniqueItems
    .filter(x => !existedKeys.has(makeOrderKey(x)))
    .map(x => ({
      masp: String(x.masp || "").trim().toUpperCase(),
      size: String(x.size || "").trim(),
      soluong: Number(x.soluong || 1),
      huong_chuyen: x.huong_chuyen,
      tu_coso: x.tu_coso,
      den_coso: x.den_coso,
      manv_dat: manv,
      ghichu_dat: note,
      trang_thai: "moi",
      chon_chuyen: false,
      nguon: "stockquick"
    }));

  if (!rows.length) {
    alert("Các size này đã có trong hàng đợi, không tạo trùng nữa.");
    return false;
  }

  const { error } = await ctx.supabase
    .from("dat_hang_chuyen_kho")
    .insert(rows);

  if (error) {
    console.error("[Đặt hàng CK] insert lỗi:", error);
    alert("❌ Không lưu được đặt hàng chuyển kho.");
    return false;
  }

  alert(`✅ Đã tạo ${rows.length} dòng đặt hàng chuyển kho.`);
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
  // Luôn dùng ngày hiện tại theo giờ máy đang mở trang.
  // Không lấy bộ lọc XNT14_FILTERS của trang khác vì có thể còn lưu ngày cũ.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

async function fetchCurrentSuggestionKeysByMasp(masp) {
  if (!ctx?.supabase || !masp) {
    return {
      ok: false,
      reason: "missing_context",
      hasNegative: false,
      suggestions: [],
      keys: new Set()
    };
  }

  const code = String(masp || "").trim().toUpperCase();
  const denNgay = getDenNgayForDhck();

  try {
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

    if (snapRes?.error) {
      console.warn("[Đặt hàng CK] Không đọc được tồn hiện tại:", code, snapRes.error);
      return {
        ok: false,
        reason: "xnt_error",
        error: snapRes.error,
        hasNegative: false,
        suggestions: [],
        keys: new Set()
      };
    }

    if (kiemRes?.error) {
      console.warn("[Đặt hàng CK] Không đọc được chênh lệch kiểm tồn:", code, kiemRes.error);
      return {
        ok: false,
        reason: "kiemton_error",
        error: kiemRes.error,
        hasNegative: false,
        suggestions: [],
        keys: new Set()
      };
    }

    const data = Array.isArray(snapRes?.data) ? snapRes.data : [];

    // Không có dữ liệu không đồng nghĩa với không còn cần chuyển.
    // Phải coi là thiếu căn cứ và bỏ qua mã này để tránh ẩn nhầm dữ liệu.
    if (!data.length) {
      console.warn("[Đặt hàng CK] xntnhanh trả về rỗng, bỏ qua kiểm tra mã:", code);
      return {
        ok: false,
        reason: "empty_stock_rows",
        hasNegative: false,
        suggestions: [],
        keys: new Set()
      };
    }

    const kiemton = kiemRes?.data || { cs1: {}, cs2: {} };

    const rows = data.map(r => {
      const sizeKey = String(r.size || "").replace(/^size\s+/i, "").trim();

      return {
        masp: String(r.masp || code).toUpperCase(),
        size: r.size,
        ton_cs1: Number(r.ton_cs1 || 0),
        ton_cs2: Number(r.ton_cs2 || 0),
        lech_cs1: Number(kiemton?.cs1?.lech?.[sizeKey] || 0),
        lech_cs2: Number(kiemton?.cs2?.lech?.[sizeKey] || 0),
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
      ok: true,
      reason: "ok",
      hasNegative,
      suggestions,
      keys: new Set(
        suggestions.map(x =>
          `${String(x.masp).toUpperCase()}|${normSize(x.size)}|${x.huong_chuyen}`
        )
      )
    };
  } catch (error) {
    console.error("[Đặt hàng CK] Exception khi đọc tồn:", code, error);
    return {
      ok: false,
      reason: "exception",
      error,
      hasNegative: false,
      suggestions: [],
      keys: new Set()
    };
  }
}

async function analyzeOutdatedOrders(rows) {
  if (!ctx?.supabase || !Array.isArray(rows) || !rows.length) {
    return {
      deleteCandidateIds: [],
      needStockCheckIds: [],
      skippedMasps: []
    };
  }

  if (autoRecheckRunning) {
    return {
      deleteCandidateIds: [],
      needStockCheckIds: [],
      skippedMasps: [],
      busy: true
    };
  }

  autoRecheckRunning = true;

  try {
    const coso = getCurrentCoso();

    // Phân tích cả dòng "mới" và dòng đã tick "đang chuyển"
    // của cơ sở hiện tại. Đây chỉ là bước ĐỀ XUẤT trên giao diện,
    // tuyệt đối không đổi trạng thái trong database.
    // Không phân tích "da_tao_phieu" để tránh đề xuất xóa dòng
    // đang thuộc một quy trình tạo phiếu chưa hoàn tất.
    const analyzableStatuses = new Set(["moi", "dang_chuyen"]);

    const openRows = rows
      .filter(r =>
        analyzableStatuses.has(String(r.trang_thai || "")) &&
        String(r.tu_coso || "").toLowerCase() === coso
      )
      .slice(0, 200);

    if (!openRows.length) {
      return {
        deleteCandidateIds: [],
        needStockCheckIds: [],
        skippedMasps: []
      };
    }

    const masps = Array.from(
      new Set(
        openRows
          .map(r => String(r.masp || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const suggestionInfoByMasp = new Map();
    const skippedMasps = [];

    for (const masp of masps) {
      const info = await fetchCurrentSuggestionKeysByMasp(masp);

      if (!info?.ok) {
        skippedMasps.push({
          masp,
          reason: info?.reason || "unknown"
        });
        continue;
      }

      suggestionInfoByMasp.set(masp, info);
    }

    const deleteCandidateIds = [];
    const needStockCheckIds = [];

    openRows.forEach(r => {
      const id = Number(r.id);
      const masp = String(r.masp || "").trim().toUpperCase();
      const key = `${masp}|${normSize(r.size)}|${r.huong_chuyen}`;

      if (!id || !suggestionInfoByMasp.has(masp)) return;

      const info = suggestionInfoByMasp.get(masp);

      // Tồn âm: chỉ cảnh báo cần kiểm kho trên giao diện, không ghi DB.
      if (info.hasNegative) {
        needStockCheckIds.push(id);
        return;
      }

      // Không còn nằm trong gợi ý hiện tại: đề xuất tick cột Xóa.
      if (!info.keys.has(key)) {
        deleteCandidateIds.push(id);
      }
    });

    return {
      deleteCandidateIds,
      needStockCheckIds,
      skippedMasps
    };

  } finally {
    autoRecheckRunning = false;
  }
}

async function fetchOrders() {
  // QUAN TRỌNG:
  // Hàm tải danh sách chỉ được phép SELECT, tuyệt đối không tự đổi trạng thái.
  // Việc kiểm tra lỗi thời chỉ chạy khi người dùng bấm nút thủ công.
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

  return sortOrdersForDisplay(data || []);
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
    const suggestedDelete = suggestedDeleteIds.has(Number(r.id));
    const suggestedNeedCheck = suggestedNeedCheckIds.has(Number(r.id));

    return `
      <tr
        data-original-status="${escAttr(String(r.trang_thai || "moi"))}"
        class="${allowMove ? "" : "dhck-readonly"} ${outdatedMoving ? "dhck-outdated-moving" : ""} ${needStockCheck ? "dhck-need-stock-check" : ""} ${suggestedDelete ? "dhck-suggested-delete" : ""} ${suggestedNeedCheck ? "dhck-suggested-need-check" : ""}">
        <td style="text-align:center;">
          <input type="checkbox" class="dhck-delete-check"
            ${allowMove ? "" : "disabled"}
            ${suggestedDelete ? "checked" : ""}
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
         ${suggestedNeedCheck ? "Đề xuất kiểm kho" : suggestedDelete ? "Đề xuất xóa" : needStockCheck ? "Yêu cầu kiểm kho" : outdatedMoving ? "Lỗi thời - trả lại kho" : statusText(r.trang_thai)}
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

  const { error } = await ctx.supabase.rpc("dhck_update_note", {
    p_id: Number(id),
    p_note: String(value || "")
  });

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

  const { error } = await ctx.supabase.rpc("dhck_set_move_check", {
    p_id: Number(id),
    p_checked: checked
  });

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

function restoreTemporaryRowDisplay(row) {
  if (!row) return;

  const id = Number(
    row.querySelector(".dhck-delete-check")?.dataset.id
  );
  const statusCell = row.querySelector(".dhck-status-cell");
  const originalStatus = String(
    row.dataset.originalStatus || "moi"
  );

  row.classList.remove("dhck-suggested-delete");

  if (suggestedNeedCheckIds.has(id)) {
    row.classList.add("dhck-suggested-need-check");
    if (statusCell) statusCell.textContent = "Đề xuất kiểm kho";
    return;
  }

  row.classList.remove("dhck-suggested-need-check");

  if (statusCell) {
    statusCell.textContent = statusText(originalStatus);
  }
}

function updateDeleteCheckAllState(box) {
  if (!box) return;

  const checkAll = box.querySelector("#dhck-delete-check-all");

  if (!checkAll) return;

  // Chỉ lấy các checkbox xóa được phép thao tác.
  // Checkbox của bảng theo dõi cơ sở khác đang disabled nên không tính.
  const rowChecks = Array.from(
    box.querySelectorAll(
      '.dhck-delete-check:not(:disabled)'
    )
  );

  if (!rowChecks.length) {
    checkAll.checked = false;
    checkAll.indeterminate = false;
    checkAll.disabled = true;
    return;
  }

  checkAll.disabled = false;

  const checkedCount = rowChecks.filter(
    checkbox => checkbox.checked
  ).length;

  checkAll.checked =
    checkedCount === rowChecks.length;

  checkAll.indeterminate =
    checkedCount > 0 &&
    checkedCount < rowChecks.length;
}

function bindDeleteCheckAll(box) {
  if (!box) return;

  const checkAll = box.querySelector(
    "#dhck-delete-check-all"
  );

  if (!checkAll) return;

  // Chỉ gắn sự kiện cho checkbox đầu cột một lần
  if (checkAll.dataset.bound !== "1") {
    checkAll.dataset.bound = "1";

    checkAll.addEventListener("click", e => {
      e.stopPropagation();
    });

    checkAll.addEventListener("change", () => {
      const checked = !!checkAll.checked;

      box.querySelectorAll(
        ".dhck-delete-check:not(:disabled)"
      ).forEach(checkbox => {
        checkbox.checked = checked;

        const id = Number(checkbox.dataset.id);
        const row = checkbox.closest("tr");
        const statusCell = row?.querySelector(".dhck-status-cell");

        if (checked) {
          suggestedDeleteIds.add(id);
          row?.classList.add("dhck-suggested-delete");
          if (statusCell) statusCell.textContent = "Đề xuất xóa";
        } else {
          suggestedDeleteIds.delete(id);
          restoreTemporaryRowDisplay(row);
        }
      });

      checkAll.indeterminate = false;
    });
  }

  // Các dòng tbody có thể bị tạo lại bởi realtime,
  // nên phải gắn lại sự kiện cho checkbox dòng mới.
  box.querySelectorAll(
    ".dhck-delete-check:not(:disabled)"
  ).forEach(checkbox => {
    if (checkbox.dataset.deleteBound === "1") {
      return;
    }

    checkbox.dataset.deleteBound = "1";

    checkbox.addEventListener("change", () => {
      const id = Number(checkbox.dataset.id);
      const row = checkbox.closest("tr");
      const statusCell = row?.querySelector(".dhck-status-cell");

      if (checkbox.checked) {
        suggestedDeleteIds.add(id);
        row?.classList.add("dhck-suggested-delete");
        if (statusCell) statusCell.textContent = "Đề xuất xóa";
      } else {
        suggestedDeleteIds.delete(id);
        restoreTemporaryRowDisplay(row);
      }

      updateDeleteCheckAllState(box);
    });
  });

  updateDeleteCheckAllState(box);
}


function bindAutoDhFabDrag(button) {
  if (!button || button.dataset.dragBound === "1") return;
  button.dataset.dragBound = "1";

  const STORAGE_KEY = "hoantuyet_fab_pos_auto_dh_v1";
  const DEFAULT_RIGHT = 118;
  const DEFAULT_BOTTOM = 14;
  const MARGIN = 4;
  let drag = null;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

  const applySavedPosition = () => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) {}

    const rect = button.getBoundingClientRect();
    const w = rect.width || button.offsetWidth || 48;
    const h = rect.height || button.offsetHeight || 48;

    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const x = clamp(saved.x, MARGIN, window.innerWidth - w - MARGIN);
      const y = clamp(saved.y, MARGIN, window.innerHeight - h - MARGIN);
      button.style.left = x + "px";
      button.style.top = y + "px";
      button.style.right = "auto";
      button.style.bottom = "auto";
    } else {
      button.style.left = "auto";
      button.style.top = "auto";
      button.style.right = DEFAULT_RIGHT + "px";
      button.style.bottom = `calc(${DEFAULT_BOTTOM}px + env(safe-area-inset-bottom))`;
    }
  };

  const saveCurrentPosition = () => {
    const r = button.getBoundingClientRect();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
    } catch (_) {}
  };

  button.addEventListener("pointerdown", e => {
    if (e.button != null && e.button !== 0) return;
    const r = button.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      left: r.left,
      top: r.top,
      moved: false
    };
    try { button.setPointerCapture(e.pointerId); } catch (_) {}
  });

  button.addEventListener("pointermove", e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved && Math.hypot(dx, dy) < 7) return;
    drag.moved = true;
    e.preventDefault();

    const w = button.offsetWidth || 48;
    const h = button.offsetHeight || 48;
    const x = clamp(drag.left + dx, MARGIN, window.innerWidth - w - MARGIN);
    const y = clamp(drag.top + dy, MARGIN, window.innerHeight - h - MARGIN);

    button.style.left = x + "px";
    button.style.top = y + "px";
    button.style.right = "auto";
    button.style.bottom = "auto";
  });

  const endDrag = e => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const moved = drag.moved;
    drag = null;
    try { button.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      button.dataset.suppressClickUntil = String(Date.now() + 350);
      saveCurrentPosition();
    }
  };

  button.addEventListener("pointerup", endDrag);
  button.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", applySavedPosition);
  window.visualViewport?.addEventListener("resize", applySavedPosition);

  applySavedPosition();
}

function ensureAutoDhFab() {
  let fab = document.getElementById("dhck-auto-fab");
  if (!fab) {
    const styleId = "dhck-auto-fab-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        #dhck-auto-fab{
          position:fixed;
          right:118px;
          bottom:calc(14px + env(safe-area-inset-bottom));
          z-index:26020;
          width:48px;height:48px;
          border:2px solid #d39a21;border-radius:50%;
          background:#fff0b8;color:#6b4700;
          box-shadow:0 4px 14px rgba(0,0,0,.25);
          padding:0;display:flex;align-items:center;justify-content:center;
          flex-direction:column;font-family:Arial,sans-serif;font-weight:900;
          cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;
          user-select:none;-webkit-user-select:none;
        }
        #dhck-auto-fab .l1{font-size:10px;line-height:1.02}
        #dhck-auto-fab .l2{font-size:10px;line-height:1.02}
        #dhck-auto-fab:active{transform:scale(.94)}
      `;
      document.head.appendChild(style);
    }

    fab = document.createElement("button");
    fab.id = "dhck-auto-fab";
    fab.type = "button";
    fab.title = "Đặt hàng chuyển kho tự động – bấm mở/đóng, giữ và kéo để di chuyển";
    fab.setAttribute("aria-label", "Mở hoặc đóng đặt hàng chuyển kho tự động");
    fab.innerHTML = '<span class="l1">AUTO</span><span class="l2">ĐH</span>';
    document.body.appendChild(fab);

    bindAutoDhFabDrag(fab);

    fab.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      if (Date.now() < Number(fab.dataset.suppressClickUntil || 0)) return;

      const panel = document.getElementById("dhck-panel");
      if (panel && popupOpen) {
        suppressRealtimeUntil = Date.now() + 1500;
        await flushInlineNotes(panel);
        popupOpen = false;
        userClosedPanel = true;
        panel.remove();
        return;
      }

      await runDatHangCheck(true);
    });
  } else {
    bindAutoDhFabDrag(fab);
  }
  return fab;
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
   <div id="dhck-header" style="display:flex;justify-content:space-between;align-items:center;font-weight:bold;margin-bottom:4px;position:sticky;top:0;background:#fff4d6;z-index:5;cursor:pointer;">
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
  <th style="text-align:center;">
    <label
      title="Chọn hoặc bỏ chọn toàn bộ dòng để xóa"
      style="display:flex;align-items:center;justify-content:center;gap:3px;cursor:pointer;"
    >
      <input
        type="checkbox"
        id="dhck-delete-check-all"
      >
      <span>Xóa</span>
    </label>
  </th>
  <th>Chuyển</th>
  <th>mã sp</th>
  <th>SL</th>
  <th>size</th>
  <th>hướng</th>
  <th>NV đặt</th>
  <th>ghi chú</th>
  <th>trạng thái</th>
</tr>
      </thead>
      <tbody>${renderRows(canMove, true)}</tbody>
    </table>

    <div style="text-align:right;margin:6px 0;">
  <button
    id="dhck-recheck-outdated"
    title="Phân tích theo tồn kho hiện tại và tick tạm cột Xóa; chưa thay đổi dữ liệu"
  >
    Kiểm tra lỗi thời ngay
  </button>

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

#dhck-panel tr.dhck-suggested-delete td {
  background:#ffe0e0 !important;
  color:#9b0000 !important;
  font-weight:700;
}

#dhck-panel tr.dhck-suggested-need-check td {
  background:#fff3b0 !important;
  color:#7a4b00 !important;
  font-weight:700;
}

#dhck-panel thead th {
  position: sticky;
  top: 30px;
  z-index: 4;
}

#dhck-panel table:first-of-type thead th {
  background: #f4c985;
}

#dhck-panel table:last-of-type thead th {
  background: #ddd;
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
  bindDeleteCheckAll(box);

  const closePanelToFab = async () => {
    userClosedPanel = true;
    suppressRealtimeUntil = Date.now() + 1500;
    await flushInlineNotes(box);
    popupOpen = false;
    box.remove();
  };

  box.querySelector("#dhck-close").onclick = async (e) => {
    e?.stopPropagation?.();
    await closePanelToFab();
  };

  // Đồng nhất trải nghiệm với BM/CK KHẨN: không còn thu thành thanh ngang.
  // Bấm mũi tên hoặc cả dòng tiêu đề sẽ đóng về nút tròn AUTO ĐH.
  box.querySelector("#dhck-toggle").onclick = async (e) => {
    e.stopPropagation();
    await closePanelToFab();
  };

  box.querySelector("#dhck-header").onclick = async (e) => {
    if (e.target?.id === "dhck-close" || e.target?.id === "dhck-toggle") return;
    await closePanelToFab();
  };

  box.querySelector("#dhck-create-ccn").onclick = () => {
    createCcnFromChecked(box, canMove);
  };

  box.querySelector("#dhck-recheck-outdated")?.addEventListener(
    "click",
    async () => {
      await manualRecheckOutdatedOrders(box, canMove);
    }
  );

  box.querySelector("#dhck-delete")?.addEventListener("click", () => {
    deleteCheckedOrders(box, canMove);
  });

  document.addEventListener("keydown", async function esc(e) {
    if (e.key === "Escape" && document.getElementById("dhck-panel")) {
      await closePanelToFab();
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

    // Không đủ dữ liệu thì giữ nguyên, tuyệt đối không đổi trạng thái.
    if (!info?.ok) continue;

    // Nếu vẫn còn âm thì giữ cảnh báo vàng
    if (info.hasNegative) continue;

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
    .update({
      trang_thai: "loi_thoi",
      chon_chuyen: false,
      updated_at: new Date().toISOString()
    })
    .in("id", deleteIds)
    .eq("trang_thai", "loi_thoi");

  if (error) {
    console.error("[Đặt hàng CK] Lỗi xóa dòng lỗi thời:", error);
    alert("❌ Không xóa được dòng lỗi thời.");
    return;
  }

  const checkResult = await recheckNeedStockCheckOrders(canMove);

  alert(
    `✅ Đã ẩn ${deleteIds.length} dòng lỗi thời.\n` +
    `Khôi phục dòng yêu cầu kiểm kho: ${checkResult.restored}\n` +
    `Chuyển lỗi thời: ${checkResult.outdated}`
  );

  popupOpen = false;
  document.getElementById("dhck-panel")?.remove();
  await runDatHangCheck(true);
}

async function manualRecheckOutdatedOrders(box, canMove) {
  if (!ctx?.supabase) {
    alert("Supabase chưa sẵn sàng.");
    return;
  }

  if (autoRecheckRunning) {
    alert("Hệ thống đang kiểm tra lỗi thời. Vui lòng chờ một chút.");
    return;
  }

  const confirmed = confirm(
    "Bạn có chắc muốn kiểm tra lại các đặt hàng theo tồn kho hiện tại?\n\n" +
    "Hệ thống sẽ kiểm tra cả dòng Mới và dòng Đang chuyển, sau đó chỉ ĐỀ XUẤT bằng cách tick cột Xóa. Không có dữ liệu nào bị đổi trạng thái hoặc bị xóa ở bước này."
  );

  if (!confirmed) return;

  await flushInlineNotes(box);

  const button = box.querySelector("#dhck-recheck-outdated");
  const oldText = button?.textContent || "Kiểm tra lỗi thời ngay";

  if (button) {
    button.disabled = true;
    button.textContent = "Đang kiểm tra...";
  }

  try {
    const result = await analyzeOutdatedOrders(canMove || []);

    if (result?.busy) {
      alert("Hệ thống đang có một lượt kiểm tra khác. Vui lòng thử lại.");
      return;
    }

    suggestedDeleteIds = new Set(
      (result?.deleteCandidateIds || []).map(Number).filter(Boolean)
    );

    suggestedNeedCheckIds = new Set(
      (result?.needStockCheckIds || []).map(Number).filter(Boolean)
    );

    // Bỏ mọi tick Xóa cũ rồi tick lại đúng danh sách hệ thống vừa đề xuất.
    box.querySelectorAll(".dhck-delete-check:not(:disabled)").forEach(input => {
      const id = Number(input.dataset.id);
      input.checked = suggestedDeleteIds.has(id);
    });

    // Tô màu và cập nhật trạng thái tạm ngay trên bảng hiện tại.
    box.querySelectorAll(".dhck-delete-check:not(:disabled)").forEach(input => {
      const id = Number(input.dataset.id);
      const row = input.closest("tr");
      const statusCell = row?.querySelector(".dhck-status-cell");

      row?.classList.toggle("dhck-suggested-delete", suggestedDeleteIds.has(id));
      row?.classList.toggle("dhck-suggested-need-check", suggestedNeedCheckIds.has(id));

      if (statusCell) {
        if (suggestedDeleteIds.has(id)) {
          statusCell.textContent = "Đề xuất xóa";
        } else if (suggestedNeedCheckIds.has(id)) {
          statusCell.textContent = "Đề xuất kiểm kho";
        } else {
          // Khi chạy kiểm tra lần mới, phải trả các dòng không còn
          // nằm trong đề xuất về đúng trạng thái gốc (Mới/Đang chuyển...).
          restoreTemporaryRowDisplay(row);
        }
      }
    });

    bindDeleteCheckAll(box);
    updateDeleteCheckAllState(box);

    const skippedMasps = Array.isArray(result?.skippedMasps)
      ? result.skippedMasps
      : [];

    const skippedText = skippedMasps.length
      ? `\nBỏ qua do thiếu dữ liệu: ${skippedMasps.length} mã.`
      : "";

    alert(
      "✅ Đã kiểm tra xong.\n\n" +
      `Đề xuất xóa: ${suggestedDeleteIds.size} dòng.\n` +
      `Đề xuất kiểm kho: ${suggestedNeedCheckIds.size} dòng.` +
      skippedText +
      "\n\nHãy xem lại các dòng đã được tick ở cột Xóa. " +
      "Bỏ tick những dòng bạn muốn giữ, sau đó bấm “Xóa đặt hàng”.\n\n" +
      "Chưa có dữ liệu nào bị thay đổi trong cơ sở dữ liệu."
    );

  } catch (error) {
    console.error("[Đặt hàng CK] Lỗi phân tích lỗi thời:", error);
    alert("❌ Không thể kiểm tra lỗi thời lúc này. Vui lòng thử lại.");

  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

async function deleteCheckedOrders(box, canMove) {
  if (!ctx?.supabase) {
    alert("Supabase chưa sẵn sàng.");
    return;
  }

  const isAdmin = await isAdminUser();

  if (!isAdmin) {
    alert("Bạn không có quyền xóa đặt hàng.");
    return;
  }

  const checkedIds = Array.from(
    box.querySelectorAll(
      ".dhck-delete-check:checked:not(:disabled)"
    )
  )
    .map(checkbox => Number(checkbox.dataset.id))
    .filter(Boolean);

  if (!checkedIds.length) {
    alert("Bạn chưa tick dòng nào để xóa.");
    return;
  }

  // Chỉ cho phép xóa các dòng thuộc cơ sở hiện tại
  const allowedIdSet = new Set(
    (canMove || [])
      .map(row => Number(row.id))
      .filter(Boolean)
  );

  const deleteIds = checkedIds.filter(
    id => allowedIdSet.has(id)
  );

  if (!deleteIds.length) {
    alert("Bạn chỉ được xóa dòng đặt hàng của cơ sở mình.");
    return;
  }

  const selectedRows = (canMove || []).filter(
    row => deleteIds.includes(Number(row.id))
  );

  const previewLines = selectedRows
    .slice(0, 10)
    .map(row =>
      `${row.masp || ""} | size ${row.size || ""} | ${row.huong_chuyen || ""}`
    )
    .join("\n");

  const moreText =
    selectedRows.length > 10
      ? `\n... và ${selectedRows.length - 10} dòng khác`
      : "";

  const confirmed = confirm(
    `Bạn chắc chắn muốn XÓA THẬT ${deleteIds.length} dòng đặt hàng?\n\n` +
    `${previewLines}${moreText}\n\n` +
    `Dữ liệu sẽ bị xóa khỏi bảng và không còn hiển thị.`
  );

  if (!confirmed) return;

  suppressRealtimeUntil = Date.now() + 2500;

  const deleteButton = box.querySelector("#dhck-delete");
  const oldButtonText = deleteButton?.textContent || "Xóa đặt hàng";

  if (deleteButton) {
    deleteButton.disabled = true;
    deleteButton.textContent = "Đang xóa...";
  }

  try {
    const { data, error } = await ctx.supabase.rpc(
      "dhck_delete_orders",
      {
        p_ids: deleteIds
      }
    );

    if (error) {
      console.error(
        "[Đặt hàng CK] Lỗi xóa thật:",
        error
      );

      alert(
        "❌ Không xóa được đặt hàng.\n\n" +
        (error.message || "Lỗi không xác định")
      );

      return;
    }

    const result =
      data && typeof data === "object"
        ? data
        : {};

    if (result.ok === false) {
      alert(
        "❌ " +
        (
          result.message ||
          "Không xóa được đặt hàng."
        )
      );

      return;
    }

    const deletedCount = Number(
      result.deleted_count ?? deleteIds.length
    );

    alert(
      `✅ Đã xóa thật ${deletedCount} dòng đặt hàng chuyển kho.`
    );

    deleteIds.forEach(id => {
      suggestedDeleteIds.delete(Number(id));
      suggestedNeedCheckIds.delete(Number(id));
    });

    popupOpen = false;
    document.getElementById("dhck-panel")?.remove();

    await runDatHangCheck(true);

  } catch (error) {
    console.error(
      "[Đặt hàng CK] Exception khi xóa thật:",
      error
    );

    alert(
      "❌ Có lỗi khi xóa đặt hàng chuyển kho."
    );

  } finally {
    if (deleteButton?.isConnected) {
      deleteButton.disabled = false;
      deleteButton.textContent = oldButtonText;
    }
  }
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

  const rows = await fetchOrders();

  // Mặc định chỉ chạy nền. Không tự bật popup nữa.
  if (!forceShow) return rows;

  userClosedPanel = false;
  popupOpen = false;
  document.getElementById("dhck-panel")?.remove();

  if (!rows.length) {
    alert("Hiện tại không có đặt hàng chuyển kho tự động đang chờ.");
    return rows;
  }

  await showPanel(rows);
  return rows;
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
    .in("trang_thai", ["moi", "dang_chuyen", "da_tao_phieu", "yeu_cau_kiem_kho"])
    .in("masp", masps);

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

  // Panel đang đóng thì realtime chỉ cập nhật nền, tuyệt đối không tự bật giao diện.
  if (!panel) {
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
  bindDeleteCheckAll(panel);

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
  ensureAutoDhFab();

  window.DatHangChuyenKho = {
    attachStockQuickPopup,
    openFromStockQuick,
    triggerCheck: () => runDatHangCheck(true),
    calcSuggestionsFromPayloadForView: calcSuggestionsFromPayload,
    afterCcnSaved
  };

  // 2026-08-23: Không còn gắn thao tác đặt hàng thủ công vào StockQuickPopup ở module này.
  // datHangChuyenKho.js chỉ phụ trách luồng TỰ ĐỘNG. Nút Size / Đặt khẩn do datHangChuyenKhoKhan.js xử lý.

  runDatHangCheck();
  setupDatHangRealtime();

  if (timer) clearInterval(timer);
  timer = setInterval(() => runDatHangCheck(), 5 * 60 * 1000);
}

export function attachStockQuickPopup(popup, payload) {
  // Giữ export để tương thích code cũ, nhưng không còn gắn nút thủ công.
  // Nút Size / Đặt khẩn được datHangChuyenKhoKhan.js quản lý.
  return;
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

  // ===== HÓA ĐƠN TỪ ĐẶT HÀNG KHẨN CẤP =====
  // Tách xử lý khỏi dat_hang_chuyen_kho để tuyệt đối không cập nhật nhầm ID
  // của bảng chuyển kho tự động.
  if (payload?.source === "dat_hang_chuyen_kho_khan") {
    let urgentIds = [];
    try {
      urgentIds = JSON.parse(localStorage.getItem("dhkhan_pending_ids") || "[]");
    } catch {
      urgentIds = [];
    }

    if ((!urgentIds || !urgentIds.length) && Array.isArray(payload?.order_ids)) {
      urgentIds = payload.order_ids;
    }
    urgentIds = (urgentIds || []).map(Number).filter(Boolean);

    if (!urgentIds.length) {
      console.warn("[Đặt hàng khẩn] Không xác định được order_ids sau khi lưu CCN.");
      return;
    }

    const dir = payload?.dir ||
      (location.pathname.toLowerCase().includes("ccn2v1") ? "2v1" : "1v2");
    const normMaspUrgent = v => String(v || "").trim().toUpperCase();
    const normSizeUrgent = v => {
      const s = String(v || "").replace(/^size\s+/i, "").trim();
      const m = s.match(/\d{1,2}/);
      return m ? m[0] : s;
    };

    const qtyMap = new Map();
    (result.chitiet || []).forEach(r => {
      const masp = normMaspUrgent(r.masp);
      const size = normSizeUrgent(r.size);
      const sl = Number(r.soluong || 0);
      if (!masp || !size || !sl) return;
      const key = `${masp}|${size}|${dir}`;
      qtyMap.set(key, (qtyMap.get(key) || 0) + sl);
    });

    const { data: urgentOrders, error: urgentFetchErr } = await ctx.supabase
      .from("dat_hang_chuyen_kho_khan")
      .select("id,masp,size,soluong,huong_chuyen,trang_thai")
      .in("id", urgentIds);

    if (urgentFetchErr) {
      console.error("[Đặt hàng khẩn] Không đọc được dòng sau khi lưu CCN:", urgentFetchErr);
      alert("⚠️ Hóa đơn đã lưu nhưng chưa cập nhật được đặt hàng khẩn.");
      return;
    }

    const idsDaChuyen = [];
    (urgentOrders || []).forEach(o => {
      const key = `${normMaspUrgent(o.masp)}|${normSizeUrgent(o.size)}|${o.huong_chuyen}`;
      const canCo = Number(o.soluong || 1);
      const trongPhieu = Number(qtyMap.get(key) || 0);
      if (trongPhieu >= canCo) {
        idsDaChuyen.push(Number(o.id));
        qtyMap.set(key, trongPhieu - canCo);
      }
    });

    if (idsDaChuyen.length) {
      const now = new Date().toISOString();
      const manv = getManv();
      const { error: urgentUpdateErr } = await ctx.supabase
        .from("dat_hang_chuyen_kho_khan")
        .update({
          trang_thai: "da_chuyen",
          manv_thuc_hien: manv || null,
          updated_at: now
        })
        .in("id", idsDaChuyen);

      if (urgentUpdateErr) {
        console.error("[Đặt hàng khẩn] Lỗi cập nhật đã chuyển:", urgentUpdateErr);
        alert("⚠️ Hóa đơn đã lưu nhưng chưa cập nhật được trạng thái Đã chuyển của đặt hàng khẩn.");
        return;
      }
    }

    localStorage.removeItem("dhkhan_pending_ids");
    localStorage.removeItem("ccn_prefill_payload");
    return;
  }

  if ((!ids || !ids.length) && Array.isArray(payload?.order_ids)) {
    ids = payload.order_ids;
  }

  ids = ids.map(Number).filter(Boolean);

  // Dự phòng: nếu localStorage bị mất hoặc tab CCN mở độc lập,
  // lấy order ID từ ghi chú "ĐẶT HÀNG CK: 123,124,...".
  if (!ids.length) {
    const note = String(
      document.getElementById("ghichu")?.value ||
      result?.hoadon?.ghichu ||
      result?.ghichu ||
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

  if (!ids.length) {
    console.warn("[Đặt hàng CK] Không xác định được order_ids sau khi lưu CCN.");
    return;
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
        chon_chuyen: false,
        updated_at: now
      })
      .in("id", idsTraVeMoi);
  }

  localStorage.removeItem("dhck_pending_ids");
  localStorage.removeItem("ccn_prefill_payload");
}
