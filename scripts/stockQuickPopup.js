// stockQuickPopup.js
// Module dùng chung: popup bán/tồn theo mã SP – lấy dữ liệu từ xntnhanh
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
    overflow: visible;
    top: 8px;
    right: 8px;
    left: auto;
    transform: none;
  }

  .sq-red { color:#dc2626; font-weight:700; }
.sq-blue { color:#2563eb; font-weight:700; }

  .sq-stock-popup.show {
    display: block;
  }

  /* layout PC: bảng bên trái, ảnh bên phải */
  .sq-stock-layout {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .sq-stock-table-wrapper{
  overflow: auto;                 /* bật cuộn dọc + ngang */
  -webkit-overflow-scrolling: touch; /* iOS cuộn mượt */
  max-height: 70vh;               /* giới hạn chiều cao để cuộn dọc xuất hiện */
  touch-action: pan-x pan-y;      /* giúp kéo ngang/dọc dễ hơn trên mobile */
}

  .sq-stock-popup table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
   
  }

  .sq-stock-popup th,
  .sq-stock-popup td {
    padding: 4px 6px;
    text-align: center;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
  }
  /* Auto-fit support: allow specific columns to wrap if needed */
  .sq-stock-popup th.col-sai,
  .sq-stock-popup td.col-sai { 
    white-space: pre-line; 
    text-align: left;
  }
  .sq-stock-popup th.col-size,
  .sq-stock-popup td.col-size {
    white-space: nowrap;
    text-align: left;
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

    /* NEW: cho tiêu đề + nút nằm chung 1 hàng */
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* NEW: nút chụp ảnh */
  .sq-photo-btn {
    margin-left: auto;            /* đẩy nút về cuối dòng */
    font-size: 14px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: #fff;
    cursor: pointer;
    line-height: 1.2;
    user-select: none;
  }
  .sq-photo-btn:active {
    transform: translateY(1px);
  }

  .sq-photo-btn .ok {
    font-size: 12px;
    margin-left: 6px;
    opacity: 0.8;
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
    /* RỘNG HƠN ~20% */
    width: 68vw;          /* trước ~47.5vw */
    max-width: 68vw;

    /* CAO GẤP ĐÔI */
    height: 90vh;         /* trước ~45vh */
    max-height: 90vh;

    overflow-y: auto;
    overflow-x: visible;

    /* giữ cố định góc trên phải */
    top: 6px;
    right: 6px;
    left: auto;
  

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

  async function copyTextToClipboard(text) {
    const t = String(text || "").trim();
    if (!t) return false;

    // ưu tiên Clipboard API (cần HTTPS)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(t);
        return true;
      } catch (e) {
        // fallback xuống dưới
      }
    }

    // fallback iOS/Safari cũ
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }


  function getDenNgay() {
    try {
      const raw = sessionStorage.getItem("XNT14_FILTERS");
      if (raw) {
        const f = JSON.parse(raw);
        if (f.den_ngay) return f.den_ngay;
      }
    } catch (e) { }
    return new Date().toISOString().slice(0, 10);
  }

  // ===== Gọi RPC xntnhanh + lấy vị trí kho =====
  async function fetchTonBanByMasp(maspRaw) {
    const masp = String(maspRaw || "").trim().toUpperCase();
    if (!masp) {
      return { masp: "", rows: [], vitri_cs1: "", vitri_cs2: "", nhap_dau_ma: "", nhap_cuoi_ma: "" };
    }

    const denNgay = getDenNgay();
    console.log("[StockQuickPopup] Gọi xntnhanh", { masp, denNgay });

    let rows = [];
    let vitri_cs1 = "";
    let vitri_cs2 = "";
    let nhap_dau_ma = "";
    let nhap_cuoi_ma = "";

    const client = getSupabaseClient();
    if (!client) {
      // Không có client → không crash, chỉ trả về rỗng
      return { masp, rows, vitri_cs1, vitri_cs2, nhap_dau_ma, nhap_cuoi_ma };
    }

    try {
      const [snapRes, vitriRes] = await Promise.all([
        client.rpc("xntnhanh", {
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
        // lấy ngày nhập đầu/cuối (ddmmyy) từ RPC xntnhanh
        nhap_dau_ma = String(data[0].nhap_dau_ma || "").trim();
        nhap_cuoi_ma = String(data[0].nhap_cuoi_ma || "").trim();

        rows = data.map((r) => {
          const ban1 = Number(r.ban_cs1 || 0);
          const ban2 = Number(r.ban_cs2 || 0);

          return {
            masp: String(r.masp || "").toUpperCase(),
            size: normalizeSize(r.size),
            ton_cs1: Number(r.ton_cs1 || 0),
            ton_cs2: Number(r.ton_cs2 || 0),
            ban_cs1: ban1,
            ban_cs2: ban2,
            tong_ban: ban1 + ban2,                 // ✅ THÊM
            tong_nhap: Number(r.tong_nhap || 0),
            tong_ton: Number(r.tong_ton || 0),
          };
        });

      } else if (error) {
        console.warn("xntnhanh error:", error);
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

    return { masp, rows, vitri_cs1, vitri_cs2, nhap_dau_ma, nhap_cuoi_ma };
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

    const nhap_dau_ma = payload && payload.nhap_dau_ma ? String(payload.nhap_dau_ma).trim() : "";
    const nhap_cuoi_ma = payload && payload.nhap_cuoi_ma ? String(payload.nhap_cuoi_ma).trim() : "";

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
      sumBan2 = 0,
      sumNhap = 0,
      sumTongBan = 0,     // ✅ THÊM
      sumTongTon = 0;

    // ===== Luôn hiển thị đủ các dòng size: 0, 38..45 (kể cả không có dữ liệu) =====
    const SIZE_ORDER = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];

    // Map dữ liệu trả về theo số size (0/38/39...)
    const bySizeNum = new Map();
    (rows || []).forEach((r) => {
      const raw = String(r.size ?? "").trim();
      // normalizeSize() tạo dạng "size 39" -> rút số
      const noPrefix = raw.replace(/^size\s+/i, "").trim();
      const m = noPrefix.match(/(\d{1,2})/);
      const num = (m ? m[1] : noPrefix).trim();
      if (!num) return;
      bySizeNum.set(num, r);
    });

    const body = SIZE_ORDER
      .map((sizeNum) => {
        const r = bySizeNum.get(sizeNum) || {
          size: "size " + sizeNum,
          ton_cs1: 0,
          ton_cs2: 0,
          ban_cs1: 0,
          ban_cs2: 0,
          tong_ban: 0,        // ✅ THÊM
          tong_nhap: 0,
          tong_ton: 0,
        };

        const sizeLabel = displaySizeLabel(r.size);

        // cộng tổng (dòng thiếu dữ liệu sẽ là 0)
        sum1 += Number(r.ton_cs1 || 0);
        sum2 += Number(r.ton_cs2 || 0);
        sumBan1 += Number(r.ban_cs1 || 0);
        sumBan2 += Number(r.ban_cs2 || 0);
        sumNhap += Number(r.tong_nhap || 0);
        sumTongBan += Number(r.tong_ban || 0);   // ✅ THÊM

        const tonTong = Number(r.ton_cs1 || 0) + Number(r.ton_cs2 || 0);
        sumTongTon += tonTong;


        return `
        <tr>
          <td>${sizeLabel}</td>
          <td class="num">${r.ton_cs1 ? r.ton_cs1 : ""}</td>
          <td class="num">${r.ton_cs2 ? r.ton_cs2 : ""}</td>
          <td class="num">${r.ban_cs1 ? r.ban_cs1 : ""}</td>
          <td class="num">${r.ban_cs2 ? r.ban_cs2 : ""}</td>
          <td class="num sq-blue">${r.tong_nhap ? r.tong_nhap : ""}</td>
          <td class="num">${r.tong_ban ? r.tong_ban : ""}</td>          <!-- ✅ THÊM -->
          <td class="num sq-red">${tonTong ? tonTong : ""}</td>

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
        <td class="num sq-blue">${sumNhap || ""}</td>
        <td class="num">${sumTongBan || ""}</td>       <!-- ✅ THÊM -->
        <td class="num sq-red">${sumTongTon || ""}</td>

      </tr>`
      : "";

    const vitriParts = [];
    if (vitri_cs1) vitriParts.push("CS1: " + vitri_cs1);
    if (vitri_cs2) vitriParts.push("CS2: " + vitri_cs2);

    const vitriRow = vitriParts.length
      ? `
      <tr class="sq-vitri-row">
        <td colspan="8">Vị trí: ${vitriParts.join(" , ")}</td>
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
        <div class="sq-stock-popup-header">
  <span class="sq-title-text">Mã: ${upper} - ${nhap_dau_ma || "--"} - ${nhap_cuoi_ma || "--"}</span>
  <button class="sq-photo-btn" type="button" title="Copy mã & mở trang up ảnh nhanh">📷 Chụp ảnh/copy</button>
</div>

        <div class="sq-stock-layout">
          <div class="sq-stock-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>T1</th>
                  <th>T2</th>
                  <th>B1</th>
                  <th>B2</th>
                  <th class="sq-blue">Tnhập</th>
                  <th>Tban</th>                 <!-- ✅ THÊM -->
                  <th class="sq-red">Ttồn</th>

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


  // ===== Auto-fit độ rộng cột theo nội dung (giống Excel) =====
  function autoFitTableColumns(table, opts = {}) {
    const {
      minPx = 70,
      maxPx = 420,
      paddingPx = 28,
      // cột cho phép xuống dòng: giới hạn nhỏ hơn để không "ăn" hết popup
      wrapColumns = new Set(["Sai"]),
      wrapMaxPx = 260,
    } = opts;

    if (!table) return;

    // Canvas để đo độ rộng chữ theo font thật
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const getFont = (el) => {
      const s = window.getComputedStyle(el);
      return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    };

    const rows = Array.from(table.rows);
    if (!rows.length) return;

    const headerCells = Array.from(rows[0].cells || []);
    const colCount = headerCells.length;
    if (!colCount) return;

    const headers = headerCells.map((th) => (th.textContent || "").trim());

    // Tạo colgroup để set width
    let colgroup = table.querySelector("colgroup");
    if (!colgroup) {
      colgroup = document.createElement("colgroup");
      table.insertBefore(colgroup, table.firstChild);
    }
    while (colgroup.children.length < colCount) colgroup.appendChild(document.createElement("col"));

    for (let c = 0; c < colCount; c++) {
      const headerName = headers[c] || "";
      const isWrap = wrapColumns.has(headerName);

      let maxW = 0;

      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r].cells[c];
        if (!cell) continue;

        ctx.font = getFont(cell);

        const raw = (cell.textContent || "").trim();
        // nếu cell có nhiều dòng (vd: cột Sai), đo dòng dài nhất
        const parts = raw.split("\n").map((s) => s.trim()).filter(Boolean);
        const list = parts.length ? parts : [raw];

        for (const t of list) {
          const w = ctx.measureText(t).width + paddingPx;
          if (w > maxW) maxW = w;
        }
      }

      let finalW = Math.max(minPx, Math.min(maxW, isWrap ? wrapMaxPx : maxPx));
      colgroup.children[c].style.width = `${Math.round(finalW)}px`;
    }
  }

  function applyAutoFitInPopup(popupEl) {
    if (!popupEl) return;

    const table = popupEl.querySelector("table");
    if (!table) return;

    // gắn class để CSS xử lý wrap đúng cột
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, idx) => {
      const t = (th.textContent || "").trim();
      if (t === "Size") th.classList.add("col-size");
      if (t === "Sai") th.classList.add("col-sai");
    });

    const headerTexts = Array.from(ths).map(th => (th.textContent || "").trim());
    const idxSize = headerTexts.indexOf("Size");
    const idxSai = headerTexts.indexOf("Sai");

    const trs = table.querySelectorAll("tbody tr");
    trs.forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (idxSize >= 0 && tds[idxSize]) tds[idxSize].classList.add("col-size");
      if (idxSai >= 0 && tds[idxSai]) tds[idxSai].classList.add("col-sai");
    });

    // chạy auto-fit sau khi DOM đã gắn xong
    requestAnimationFrame(() => {
      autoFitTableColumns(table, { minPx: 70, maxPx: 420, paddingPx: 28, wrapColumns: new Set(["Sai"]), wrapMaxPx: 260 });
    });

    // nếu ảnh bên phải load xong làm layout đổi -> fit lại lần nữa
    const img = popupEl.querySelector(".sq-stock-img img");
    if (img) {
      img.addEventListener("load", () => {
        autoFitTableColumns(table, { minPx: 70, maxPx: 420, paddingPx: 28, wrapColumns: new Set(["Sai"]), wrapMaxPx: 260 });
      }, { once: true });
    }
  }

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

    // auto-fit độ rộng cột theo nội dung
    applyAutoFitInPopup(popup);

    // NEW: nút chụp ảnh -> copy MASP + mở trang up ảnh nhanh
    const btnPhoto = popup.querySelector(".sq-photo-btn");
    if (btnPhoto) {
      btnPhoto.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const maspPopup = String(popup.dataset.masp || "").trim().toUpperCase();
        const ok = await copyTextToClipboard(maspPopup);

        // feedback nhỏ cho user (không bắt buộc)
        const old = btnPhoto.innerHTML;
        btnPhoto.innerHTML = ok ? "📷 Chụp ảnh <span class='ok'>(đã copy)</span>" : "📷 Chụp ảnh <span class='ok'>(copy lỗi)</span>";
        setTimeout(() => (btnPhoto.innerHTML = old), 900);

        // mở trang up ảnh nhanh (tab mới)
        const url = "https://banle-js.vercel.app/upanhnhanh.html?masp=" + encodeURIComponent(maspPopup);
        window.open(url, "_blank");

      };
    }

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




