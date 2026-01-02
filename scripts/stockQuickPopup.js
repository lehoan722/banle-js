// stockQuickPopup.js
// Module dùng chung: popup bán/tồn theo mã SP – lấy dữ liệu từ xnt17_tonban_snapshot
// LƯU Ý: supabase phải được tạo global ở nơi khác (authModule.js / supabaseClient.js)

(function () {
  // ===== HÀM LẤY SUPABASE GLOBAL AN TOÀN =====
  function getSupabaseClient() {
    if (typeof window === "undefined") return null;
    const client = window.supabase;
    if (
      !client ||
      !client.auth || // client hợp lệ của supabase-js v2 đều có .auth
      typeof client.from !== "function"
    ) {
      console.warn(
        "[StockQuickPopup] supabase global chưa sẵn sàng. Hãy đảm bảo đã load authModule.js hoặc supabaseClient.js trước."
      );
      return null;
    }
    return client;
  }

  // ===== CSS cho popup =====
  const css = `
  .card {
    /* không cần gì đặc biệt nữa, chỉ đánh dấu dòng có popup */
  }

  .sq-stock-popup {
    position: fixed;
    min-width: 260px;
    max-width: 900px;              /* PC: đủ chỗ cho bảng + ảnh */
    max-height: 600px;
    background: rgba(255,255,255,0.98);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    border: 1px solid #e5e7eb;
    padding: 8px 10px;
    font-size: 20px;
    line-height: 1.35;
    z-index: 9999;
    display: none;
    overflow: hidden;
    top: 8px;
    right: 8px;
    left: auto;
    transform: none;
  }

  .sq-stock-popup.show {
    display: block;
  }

  /* layout PC: bảng bên trái, ảnh bên phải */
  .sq-stock-layout {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .sq-stock-table-wrapper {
    flex: 1 1 auto;
    min-width: 0;
  }

  .sq-stock-popup table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .sq-stock-popup th,
  .sq-stock-popup td {
    padding: 4px 6px;
    text-align: center;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  .sq-stock-popup th {
    background: #f3f4f6;
    font-weight: 600;
  }

  .sq-stock-popup td.num {
    text-align: right;
  }

  .sq-stock-popup tr.sum-row td {
    font-weight: 600;
    border-top: 1px solid #d1d5db;
    background: #f9fafb;
  }

  .sq-stock-popup-header {
    font-weight: 600;
    margin-bottom: 4px;
    text-align: left;
    cursor: move;
    user-select: none;
  }

  .sq-vitri-row td {
    font-weight: 500;
    font-size: 16px;
    text-align: left;
    color: #b91c1c;
    border-bottom: none;
  }

  .sq-close {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: 20px;
    cursor: pointer;
    opacity: .6;
  }
  .sq-close:hover { opacity: 1; }

  .sq-img-wrapper {
    flex: 0 0 260px;
    max-width: 320px;
  }

  .sq-img-wrapper img {
    width: 100%;
    height: auto;
    max-height: 460px;
    object-fit: contain;
    display: block;
  }

  /* ===== Layout cho ĐIỆN THOẠI DỌC ===== */
  @media (max-width: 800px) and (orientation: portrait) {
    .sq-stock-popup {
      max-width: 47.5vw;          /* gần full chiều ngang */
      max-height: 45vh;         /* full chiều cao, cho phép cuộn */
      overflow: auto;
    }

    .sq-stock-layout {
      flex-direction: column;   /* xếp dọc: bảng trên, ảnh dưới */
    }

    .sq-img-wrapper {
      flex: 0 0 auto;
      width: 100%;
      max-width: 100%;
      margin-top: 8px;
    }

    .sq-img-wrapper img {
      max-height: 30vh;         /* ảnh không quá cao, vẫn cuộn được */
    }
  }
  `;

  const s = document.createElement("style");
  s.textContent = css;
  document.head.appendChild(s);

  const IMG_BASE =
    "https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/";

  // ===== Helpers =====
  function normalizeSize(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "";
    if (/^\d+$/.test(s)) return "size " + s;
    if (s.startsWith("size ")) return s;
    return "size " + s.replace(/^size\s*/, "").trim();
  }

  function displaySizeLabel(size) {
    // Hiển thị giống ảnh bạn gửi:
    // - Size "0" giữ nguyên là "0"
    // - Size 38..45 hiển thị dạng: "38,S,46,240,165" ...
    // - Nếu dữ liệu đã là chuỗi có dấu phẩy (vd: "39,M,48,245,170") thì giữ nguyên
    // - Nếu dữ liệu có dạng "size 39" thì bỏ tiền tố "size "
    const raw = String(size ?? "").trim();
    if (!raw) return "";
    const noPrefix = raw.replace(/^size\s+/i, "").trim();

    // Nếu đã là dạng đầy đủ (có dấu phẩy) thì trả thẳng
    if (noPrefix.includes(",")) return noPrefix;

    // Map size 38..45 -> mô tả đầy đủ
    const SIZE_FULL_MAP = {
      "38": "38,S,46,240,165",
      "39": "39,M,48,245,170",
      "40": "40,L,50,250,175",
      "41": "41,XL,52,255,180",
      "42": "42,2XL,54,260,185",
      "43": "43,3X,56,265,190",
      "44": "44,4X,58,270,195",
      "45": "45,5X,60,275,200",
    };

    // Rút số size nếu chuỗi có lẫn chữ (vd: "39", "39.0", "Size 39", "39 ")
    const m = noPrefix.match(/(\d{1,2})/);
    const num = m ? m[1] : noPrefix;

    if (num === "0") return "0";

    return SIZE_FULL_MAP[num] || num;
  }

  function isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  function getDenNgay() {
    try {
      const raw = sessionStorage.getItem("XNT14_FILTERS");
      if (raw) {
        const f = JSON.parse(raw);
        if (f.den_ngay) return f.den_ngay;
      }
    } catch (e) {}
    return new Date().toISOString().slice(0, 10);
  }

  // ===== Gọi RPC xnt17_tonban_snapshot + lấy vị trí kho =====
  async function fetchTonBanByMasp(maspRaw) {
    const masp = String(maspRaw || "").trim().toUpperCase();
    if (!masp) {
      return { masp: "", rows: [], vitri_cs1: "", vitri_cs2: "" };
    }

    const denNgay = getDenNgay();
    console.log("[StockQuickPopup] Gọi xnt17_tonban_snapshot", { masp, denNgay });

    let rows = [];
    let vitri_cs1 = "";
    let vitri_cs2 = "";

    const client = getSupabaseClient();
    if (!client) {
      // Không có client → không crash, chỉ trả về rỗng
      return { masp, rows, vitri_cs1, vitri_cs2 };
    }

    try {
      const [snapRes, vitriRes] = await Promise.all([
        client.rpc("xnt17_tonban_snapshot", {
          p_masps: [masp],
          p_den_ngay: denNgay,
          p_tonghop_size: false,
        }),
        client
          .from("dmhanghoa")
          .select("vitrikho1, vitrikho2")
          .eq("masp", masp),
      ]);

      const { data, error } = snapRes || {};
      if (!error && data && data.length) {
        rows = data.map((r) => ({
          masp: String(r.masp || "").toUpperCase(),
          size: normalizeSize(r.size),
          ton_cs1: Number(r.ton_cs1 || 0),
          ton_cs2: Number(r.ton_cs2 || 0),
          ban_cs1: Number(r.ban_cs1 || 0),
          ban_cs2: Number(r.ban_cs2 || 0),
        }));
      } else if (error) {
        console.warn("xnt17_tonban_snapshot error:", error);
      }

      const { data: vitriData, error: vitriErr } = vitriRes || {};
      if (vitriErr) {
        console.warn("[StockQuickPopup] Lỗi đọc vị trí kho:", vitriErr);
      } else if (Array.isArray(vitriData) && vitriData.length > 0) {
        vitri_cs1 = vitriData[0].vitrikho1 || "";
        vitri_cs2 = vitriData[0].vitrikho2 || "";
      }
    } catch (e) {
      console.warn("[StockQuickPopup] Exception trong fetchTonBanByMasp:", e);
    }

    return { masp, rows, vitri_cs1, vitri_cs2 };
  }

  // ===== HTML popup =====
  function buildTableHtml(masp, payload) {
    const upper = String(masp || "").toUpperCase();
    const rows = payload && Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(payload)
        ? payload
        : [];
    const vitri_cs1 = payload && payload.vitri_cs1 ? payload.vitri_cs1 : "";
    const vitri_cs2 = payload && payload.vitri_cs2 ? payload.vitri_cs2 : "";

    if (!rows.length && !vitri_cs1 && !vitri_cs2) {
      return `
        <div class="sq-stock-popup" data-masp="${upper}">
          <span class="sq-close">✕</span>
          <div class="sq-stock-popup-header">Mã: ${upper}</div>
          <div>Không có dữ liệu tồn kho.</div>
        </div>`;
    }

    let sum1 = 0,
      sum2 = 0,
      sumBan1 = 0,
      sumBan2 = 0;

    const body = (rows || [])
      .map((r) => {
        const sizeLabel = displaySizeLabel(r.size);
        sum1 += r.ton_cs1;
        sum2 += r.ton_cs2;
        sumBan1 += r.ban_cs1;
        sumBan2 += r.ban_cs2;

        return `
        <tr>
          <td>${sizeLabel}</td>
          <td class="num">${r.ton_cs1 || ""}</td>
          <td class="num">${r.ton_cs2 || ""}</td>
          <td class="num">${r.ban_cs1 || ""}</td>
          <td class="num">${r.ban_cs2 || ""}</td>
        </tr>`;
      })
      .join("");

    const sumRow = rows.length
      ? `
      <tr class="sum-row">
        <td>tong</td>
        <td class="num">${sum1 || ""}</td>
        <td class="num">${sum2 || ""}</td>
        <td class="num">${sumBan1 || ""}</td>
        <td class="num">${sumBan2 || ""}</td>
      </tr>`
      : "";

    const vitriParts = [];
    if (vitri_cs1) vitriParts.push("CS1: " + vitri_cs1);
    if (vitri_cs2) vitriParts.push("CS2: " + vitri_cs2);

    const vitriRow = vitriParts.length
      ? `
      <tr class="sq-vitri-row">
        <td colspan="5">Vị trí: ${vitriParts.join(" , ")}</td>
      </tr>`
      : "";

    const imgUrl = IMG_BASE + upper + ".JPG";
    const imgBlock = `
      <div class="sq-img-wrapper" data-masp="${upper}">
        <img src="${imgUrl}"
             alt="${upper}"
             onerror="this.parentElement.style.display='none';" />
      </div>`;

    return `
      <div class="sq-stock-popup" data-masp="${upper}">
        <span class="sq-close">✕</span>
        <div class="sq-stock-popup-header">Mã: ${upper} – bán/tồn đến ${getDenNgay()}</div>
        <div class="sq-stock-layout">
          <div class="sq-stock-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Tồn CS1</th>
                  <th>Tồn CS2</th>
                  <th>Bán CS1</th>
                  <th>Bán CS2</th>
                </tr>
              </thead>
              <tbody>
                ${body}
                ${sumRow}
                ${vitriRow}
              </tbody>
            </table>
          </div>
          ${imgBlock}
        </div>
      </div>`;
  }

  function hideAllPopups() {
    document.querySelectorAll(".sq-stock-popup.show").forEach((p) => {
      p.classList.remove("show");
    });
  }

  let globalCloseBound = false;

  function bindGlobalCloseHandlers() {
    if (globalCloseBound) return;
    globalCloseBound = true;

    // ESC để đóng popup
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") {
        hideAllPopups();
      }
    });

    // Click ra ngoài popup để đóng
    document.addEventListener("click", (e) => {
      const popup = document.querySelector(".sq-stock-popup.show");
      if (!popup) return;
      if (e.target.closest(".sq-stock-popup")) return;
      hideAllPopups();
    });
  }

  // ===== Drag để kéo popup =====
  function makeDraggable(popup, handle) {
    if (!popup || !handle) return;

    let dragging = false;
    let startX = 0,
      startY = 0;
    let startLeft = 0,
      startTop = 0;

    const getPoint = (e) =>
      e.touches && e.touches[0] ? e.touches[0] : e;

    const onDown = (e) => {
      const p = getPoint(e);
      dragging = true;
      startX = p.clientX;
      startY = p.clientY;

      const rect = popup.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
    };

    const onMove = (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();

      const p = getPoint(e);
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;

      let left = startLeft + dx;
      let top = startTop + dy;

      const vw =
        window.innerWidth || document.documentElement.clientWidth;
      const vh =
        window.innerHeight || document.documentElement.clientHeight;
      const rect = popup.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (left < 0) left = 0;
      if (top < 0) top = 0;
      if (left + w > vw) left = vw - w;
      if (top + h > vh) left = vw - w;

      popup.style.left = left + "px";
      popup.style.top = top + "px";
      popup.style.transform = "none";
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };

    handle.addEventListener("mousedown", onDown);
    handle.addEventListener("touchstart", onDown, { passive: false });
  }

  let globalHost = null;

  async function ensurePopup(card, masp) {
    if (!card) return;

    if (!globalHost) {
      globalHost = document.createElement("div");
      globalHost.id = "sq-stock-host";
      document.body.appendChild(globalHost);
    }

    const payload = await fetchTonBanByMasp(masp);
    globalHost.innerHTML = buildTableHtml(masp, payload);

    const popup = globalHost.querySelector(".sq-stock-popup");
    if (!popup) return;

    // đảm bảo có data-masp (để toggle theo mã)
    popup.dataset.masp = String(masp || "").trim().toUpperCase();

    const closeBtn = popup.querySelector(".sq-close");
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        popup.classList.remove("show");
      };
    }

    const headerEl = popup.querySelector(".sq-stock-popup-header");
    if (headerEl && !headerEl.dataset.dragBound) {
      makeDraggable(popup, headerEl);
      headerEl.dataset.dragBound = "1";
    }

        // Luôn cố định popup ở góc trên bên phải
    popup.style.position = "fixed";
    popup.style.top = "8px";
    popup.style.right = "8px";
    popup.style.left = "auto";
    popup.style.transform = "none";


    bindGlobalCloseHandlers();
    hideAllPopups();
    popup.classList.add("show");
  }

  // ===== attach: luôn dùng CLICK để bật/tắt popup =====
  function attach(card, masp) {
    if (!card || !masp) return;

    card.addEventListener("click", async (e) => {
      // không cho click lan ra ngoài (để global click không đóng ngay)
      e.stopPropagation();

      const targetMasp = String(masp).trim().toUpperCase();
      const current = document.querySelector(".sq-stock-popup.show");

      // Nếu popup đang mở cho đúng mã này → đóng
      if (current && current.dataset.masp === targetMasp) {
        hideAllPopups();
        return;
      }

      // Nếu popup đang mở cho mã khác → mở lại cho mã mới
      await ensurePopup(card, masp);
    });
  }

  window.StockQuick = {
    attach,
    showFor(card, masp) {
      return ensurePopup(card, masp);
    },
  };

  if (typeof window !== "undefined") {
    window.stockQuickPopup = function (masp) {
      return window.StockQuick.showFor(document.body, masp);
    };
  }
})();
