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

  async function waitForSupabaseReady(maxWaitMs = 1000) {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const client = getSupabaseClient();

      if (
        client &&
        client.auth &&
        typeof client.auth.getSession === "function" &&
        typeof client.rpc === "function"
      ) {
        try {
          await client.auth.getSession();
          return client;
        } catch (e) { }
      }

      await new Promise(r => setTimeout(r, 150));
    }

    return getSupabaseClient();
  }

  function getIsAdminLocal() {
    try {
      return (sessionStorage.getItem("is_admin") || localStorage.getItem("is_admin")) === "true";
    } catch {
      return false;
    }
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

.sq-title-text {
  font-weight: 600;
}

.sq-title-price {
  color: #dc2626;
  font-weight: 700;
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

    /* Màu nền phân biệt tồn/bán theo từng cơ sở */
  .sq-stock-popup th.sq-col-k1,
  .sq-stock-popup td.sq-col-k1,
  .sq-stock-popup th.sq-col-b1,
  .sq-stock-popup td.sq-col-b1 {
    background: #fff7cc;   /* vàng nhạt */
  }

  .sq-stock-popup th.sq-col-k2,
  .sq-stock-popup td.sq-col-k2,
  .sq-stock-popup th.sq-col-b2,
  .sq-stock-popup td.sq-col-b2 {
    background: #eaf4ff;   /* xanh nhạt */
  }

  .sq-stock-popup td.num {
    text-align: right;
  }

    .sq-stock-popup tr.sum-row td {
  font-weight: 700;
  border-top: 1px solid #d1d5db;
  background: #f9fafb;
  color: #2563eb;         /* xanh */
  text-decoration: underline;  /* gạch chân */
}

  .sq-stock-popup tr.sq-hide-row td {
    cursor: pointer;
  }

  .sq-stock-popup tr.sq-hide-row:hover td {
    background: #eef2f7;
  }

  /* Dòng size bấm 1 lần để mở sản phẩm cùng nhóm */
  .sq-stock-popup tr.sq-open-similar-row td {
    cursor: pointer;
    transition: background-color .12s ease;
    -webkit-tap-highlight-color: rgba(37,99,235,0.18);
    user-select: none;
    touch-action: manipulation;
  }

  .sq-stock-popup tr.sq-open-similar-row:hover td {
    background: #eef2f7;
  }

  .sq-stock-popup tr.sq-open-similar-row.sq-row-press td {
    background: #dbeafe;
  }

  .sq-stock-popup tr.sq-hide-row td:first-child {
    color: #111827;
    font-weight: 700;
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

    .sq-vitri-actions-wrap {
    margin-top: 8px;
    border-top: 1px solid #e5e7eb;
    padding-top: 6px;
  }

  .sq-vitri-action-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin: 6px 0;
    font-size: 16px;
    color: #111827;
  }

  .sq-vitri-save-btn {
    font-weight: 700;
    color: #1d4ed8;
    cursor: pointer;
    user-select: none;
    border: 1px solid #93c5fd;
    background: #eff6ff;
    border-radius: 6px;
    padding: 3px 8px;
    line-height: 1.2;
  }

  .sq-vitri-save-btn:hover {
    background: #dbeafe;
  }

  .sq-vitri-save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background: #f3f4f6;
    color: #6b7280;
    border-color: #d1d5db;
  }

  .sq-vitri-label {
    font-weight: 700;
    color: #1d4ed8;
  }

  .sq-vitri-coso {
    font-weight: 700;
    color: #b91c1c;
  }

  .sq-vitri-input {
    min-width: 150px;
    max-width: 220px;
    padding: 4px 8px;
    font-size: 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    outline: none;
  }

  .sq-vitri-input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37,99,235,0.12);
  }

  .sq-vitri-value-readonly {
    font-weight: 700;
    color: #111827;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 4px 8px;
    display: inline-block;
  }

  .sq-vitri-msg {
    font-size: 14px;
    margin-left: 4px;
  }

  .sq-vitri-msg.ok {
    color: #15803d;
    font-weight: 700;
  }

  .sq-vitri-msg.err {
    color: #dc2626;
    font-weight: 700;
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
      width: 68vw;
      max-width: 68vw;

      /* GIẢM CHIỀU CAO POPUP */
      height: 78vh;
      max-height: 78vh;

      overflow-y: auto;
      overflow-x: hidden;

      top: 6px;
      right: 6px;
      left: auto;

      padding: 6px 8px;
      font-size: 16px;
      line-height: 1.2;
    }

    .sq-stock-popup-header {
      margin-bottom: 4px;
      gap: 6px;
      font-size: 15px;
      line-height: 1.15;
    }

    .sq-title-text {
      font-size: 15px;
      line-height: 1.15;
    }

    .sq-photo-btn {
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
    }

    .sq-stock-layout {
      flex-direction: column;
      gap: 6px;
    }

    .sq-stock-table-wrapper {
      max-height: none;
      overflow: visible;
    }

    .sq-stock-popup th,
    .sq-stock-popup td {
      padding: 2px 4px;
      font-size: 14px;
      line-height: 1.1;
    }

    .sq-stock-popup th {
      font-weight: 700;
    }

    .sq-stock-popup tr.sum-row td {
      padding-top: 3px;
      padding-bottom: 3px;
    }

    .sq-img-wrapper {
      flex: 0 0 auto;
      width: 100%;
      max-width: 100%;
      margin-top: 4px;
    }

    .sq-img-wrapper img {
      max-height: 22vh;
      object-fit: contain;
    }

    .sq-vitri-actions-wrap {
      margin-top: 6px;
      padding-top: 4px;
    }

    .sq-vitri-action-row {
      gap: 6px;
      margin: 4px 0;
      font-size: 14px;
      line-height: 1.1;
    }

    .sq-vitri-save-btn {
      font-size: 13px;
      padding: 2px 6px;
      border-radius: 6px;
    }

    .sq-vitri-input {
      min-width: 110px;
      max-width: 150px;
      padding: 3px 6px;
      font-size: 14px;
    }

    .sq-vitri-value-readonly {
      padding: 3px 6px;
      font-size: 14px;
    }

    .sq-vitri-msg {
      font-size: 12px;
      line-height: 1.1;
    }

    .sq-close {
      top: 0;
      right: 2px;
      font-size: 18px;
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
      "38": "38,2,S,46,240,165",
      "39": "39,3,M,48,245,170",
      "40": "40,4,L,50,250,175",
      "41": "41,5,XL,52,255,180",
      "42": "42,6,2XL,54,260,185",
      "43": "43,7,3X,56,265,190",
      "44": "44,8,4X,58,270,195",
      "45": "45,9,5X,60,275,200",
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

  async function saveVitriNhanh(maspRaw, cosoRaw, vitriRaw, loaiRaw = "kho") {
    const masp = String(maspRaw || "").trim().toUpperCase();
    const coso = String(cosoRaw || "").trim().toLowerCase();
    const vitri = String(vitriRaw || "").trim();
    const loai = String(loaiRaw || "kho").trim().toLowerCase();

    if (!masp) {
      return { ok: false, message: "Mã sản phẩm trống" };
    }
    if (!["cs1", "cs2"].includes(coso)) {
      return { ok: false, message: "Cơ sở không hợp lệ" };
    }
    if (!["kho", "baymau", "nhomhang"].includes(loai)) {
      return { ok: false, message: "Loại dữ liệu không hợp lệ" };
    }
    const isAdminNow = getIsAdminLocal();

    if (!vitri && !isAdminNow) {
      return {
        ok: false,
        message:
          loai === "baymau"
            ? "Vị trí bày mẫu trống"
            : loai === "nhomhang"
              ? "Nhóm hàng trống"
              : "Vị trí kho trống"
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, message: "Supabase chưa sẵn sàng" };
    }

    try {
      const { data, error } = await client.rpc("rpc_save_vitrikho_nhanh", {
        p_masp: masp,
        p_coso: coso,
        p_vitri: vitri,
        p_loai: loai,
      });

      if (error) {
        console.warn("[StockQuickPopup] rpc_save_vitrikho_nhanh error:", error);
        return { ok: false, message: error.message || "Lỗi gọi RPC" };
      }

      return data || { ok: false, message: "Không nhận được phản hồi từ RPC" };
    } catch (e) {
      console.warn("[StockQuickPopup] saveVitriNhanh exception:", e);
      return { ok: false, message: e.message || "Có lỗi xảy ra khi lưu dữ liệu" };
    }
  }

  async function fetchTonBanByMasp(maspRaw) {
    const masp = String(maspRaw || "").trim().toUpperCase();
    if (!masp) {
      return { masp: "", rows: [], vitri_cs1: "", vitri_cs2: "", nhap_dau_ma: "", nhap_cuoi_ma: "" };
    }

    // ===== Helpers nội bộ (tự chứa, không cần thêm nơi khác) =====
    function toYYYYMMDD(v) {
      if (!v) return "";
      const s = String(v).trim();
      if (!s) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toISOString().slice(0, 10);
    }
    function yyyymmddToDDMMYY(s) {
      if (!s) return "";
      const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return String(s).trim();
      const yy = m[1].slice(2);
      return `${m[3]}${m[2]}${yy}`; // ddmmyy
    }
    function normalizeND(v) {
      // nhận mọi kiểu input -> ddmmyy (giống RPC)
      const ymd = toYYYYMMDD(v);
      return yyyymmddToDDMMYY(ymd);
    }

    const denNgay = getDenNgay();
    console.log("[StockQuickPopup] Gọi xntnhanh", { masp, denNgay });

    let rows = [];
    let vitri_cs1 = "";
    let vitri_cs2 = "";
    let baymau_cs1 = "";
    let baymau_cs2 = "";
    let nhap_dau_ma = "";
    let nhap_cuoi_ma = "";
    let giale = "";
    let nhomhang = "";

    const client = await waitForSupabaseReady(1000);
    if (!client) {
      return { masp, rows, vitri_cs1, vitri_cs2, nhap_dau_ma, nhap_cuoi_ma };
    }

    try {
      // 1) Gọi RPC xntnhanh (giữ nguyên) + 2) Đọc dmhanghoa (thêm nhapdau)
      let [snapRes, hhRes] = await Promise.all([
        client.rpc("xntnhanh", {
          p_masps: [masp],
          p_den_ngay: denNgay,
          p_tonghop_size: false,
        }),
        client
          .from("dmhanghoa")
          .select("vitrikho1, vitrikho2, treomaucs1, treomaucs2, nhapdau, giale, nhomhang")
          .eq("masp", masp)
          .maybeSingle(),
      ]);

      const firstRows = Array.isArray(snapRes?.data) ? snapRes.data : [];

      if (!firstRows.length && !snapRes?.error) {
        await new Promise(r => setTimeout(r, 400));

        snapRes = await client.rpc("xntnhanh", {
          p_masps: [masp],
          p_den_ngay: denNgay,
          p_tonghop_size: false,
        });

        console.log("[StockQuickPopup] Gọi lại xntnhanh sau 400ms", {
          masp,
          denNgay,
          rows: Array.isArray(snapRes?.data) ? snapRes.data.length : 0
        });
      }

      // --- A) dữ liệu từ RPC ---
      const { data, error } = snapRes || {};
      if (!error && data && data.length) {
        // RPC trả ddmmyy sẵn
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
            tong_ban: ban1 + ban2,
            tong_nhap: Number(r.tong_nhap || 0),
            tong_ton: Number(r.tong_ton || 0),
          };
        });
      } else if (error) {
        console.warn("xntnhanh error:", error);
      }

      // --- B) dữ liệu từ dmhanghoa: vị trí + ưu tiên ND từ nhapdau ---
      const { data: hh, error: hhErr } = hhRes || {};
      if (hhErr) {
        console.warn("[StockQuickPopup] Lỗi đọc dmhanghoa:", hhErr);
      } else if (hh) {
        vitri_cs1 = hh.vitrikho1 || "";
        vitri_cs2 = hh.vitrikho2 || "";
        baymau_cs1 = hh.treomaucs1 || "";
        baymau_cs2 = hh.treomaucs2 || "";
        giale = hh.giale || "";
        nhomhang = hh.nhomhang || "";

        // ✅ Ưu tiên ND từ dmhanghoa.nhapdau (nếu có)
        const ndRaw = hh.nhapdau ? String(hh.nhapdau).trim() : "";
        if (ndRaw && !nhap_dau_ma) {
          nhap_dau_ma = normalizeND(ndRaw);
        }
      }

      // 3) Fallback ND/NC theo hóa đơn nếu còn thiếu (giống trang tìm kiếm 333)
      // - Chỉ chạy khi thiếu ND hoặc thiếu NC   

      // 4) Chuẩn hoá lại lần cuối (phòng khi RPC trả rỗng hoặc dữ liệu lạ)
      if (nhap_dau_ma) nhap_dau_ma = String(nhap_dau_ma).trim();
      if (nhap_cuoi_ma) nhap_cuoi_ma = String(nhap_cuoi_ma).trim();
    } catch (e) {
      console.warn("[StockQuickPopup] Exception trong fetchTonBanByMasp:", e);
    }

    // cache lại dữ liệu để dùng cho filter JS
    window.__SQ_DATA = window.__SQ_DATA || {};
    window.__SQ_DATA[masp] = {
      rows,
      nhomhang,
      giale
    };

    return {
      masp,
      rows,
      vitri_cs1,
      vitri_cs2,
      baymau_cs1,
      baymau_cs2,
      nhap_dau_ma,
      nhap_cuoi_ma,
      giale,
      nhomhang
    };

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
    const baymau_cs1 = payload && payload.baymau_cs1 ? payload.baymau_cs1 : "";
    const baymau_cs2 = payload && payload.baymau_cs2 ? payload.baymau_cs2 : "";

    const nhap_dau_ma = payload && payload.nhap_dau_ma ? String(payload.nhap_dau_ma).trim() : "";
    const nhap_cuoi_ma = payload && payload.nhap_cuoi_ma ? String(payload.nhap_cuoi_ma).trim() : "";
    const giale = payload && payload.giale ? payload.giale : "";
    const nhomhang = payload && payload.nhomhang ? payload.nhomhang : "";
    const isAdmin = getIsAdminLocal();

    const nhomhangRow = nhomhang
      ? (
        isAdmin
          ? `
    <div class="sq-vitri-action-row" data-coso="cs1" data-loai="nhomhang">
      <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="nhomhang">Lưu nhóm hàng</button>
      <span class="sq-vitri-label">Nhóm hàng:</span>
      <input
        type="text"
        class="sq-vitri-input"
        data-coso="cs1"
        data-loai="nhomhang"
        value="${nhomhang}"
        placeholder="Nhập nhóm hàng"
        autocomplete="off"
      />
      <span class="sq-vitri-msg"></span>
    </div>
  `
          : `
    <div class="sq-vitri-action-row" data-coso="cs1" data-loai="nhomhang">
      <button type="button" class="sq-vitri-save-btn" disabled>Lưu nhóm hàng</button>
      <span class="sq-vitri-label">Nhóm hàng:</span>
      <span class="sq-vitri-value-readonly">${nhomhang}</span>
      <span class="sq-vitri-msg"></span>
    </div>
  `
      )
      : `
    <div class="sq-vitri-action-row" data-coso="cs1" data-loai="nhomhang">
      <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="nhomhang">Lưu nhóm hàng</button>
      <span class="sq-vitri-label">Nhóm hàng:</span>
      <input
        type="text"
        class="sq-vitri-input"
        data-coso="cs1"
        data-loai="nhomhang"
        placeholder="Nhập nhóm hàng"
        autocomplete="off"
      />
      <span class="sq-vitri-msg"></span>
    </div>
  `;

    function formatPrice(v) {
      if (!v) return "";
      return Number(v).toLocaleString("vi-VN");
    }

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
        <tr class="sq-open-similar-row" data-size="${sizeNum}" title="Bấm để xem mã cùng nhóm cùng size">
          <td>${sizeLabel}</td>
          <td class="num sq-col-k1">${r.ton_cs1 ? r.ton_cs1 : ""}</td>
          <td class="num sq-col-k2">${r.ton_cs2 ? r.ton_cs2 : ""}</td>
          <td class="num sq-col-b1">${r.ban_cs1 ? r.ban_cs1 : ""}</td>
          <td class="num sq-col-b2">${r.ban_cs2 ? r.ban_cs2 : ""}</td>
          <td class="num sq-blue">${r.tong_nhap ? r.tong_nhap : ""}</td>
          <td class="num">${r.tong_ban ? r.tong_ban : ""}</td>
          <td class="num sq-red">${tonTong ? tonTong : ""}</td>
        </tr>`;
      })
      .join("");



    const sumRow = rows.length
      ? `
        <tr class="sum-row sq-hide-row" title="Bấm để đóng popup">
    <td>Tổng / Ẩn</td>
    <td class="num sq-col-k1">${sum1 || ""}</td>
    <td class="num sq-col-k2">${sum2 || ""}</td>
    <td class="num sq-col-b1">${sumBan1 || ""}</td>
    <td class="num sq-col-b2">${sumBan2 || ""}</td>
    <td class="num sq-blue">${sumNhap || ""}</td>
    <td class="num">${sumTongBan || ""}</td>
    <td class="num sq-red">${sumTongTon || ""}</td>
  </tr>`
      : "";

    const vitriRowCs1 = vitri_cs1
      ? (
        isAdmin
          ? `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="kho">Lưu vị trí</button>
          <span class="sq-vitri-coso">CS1:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs1"
            data-loai="kho"
            value="${vitri_cs1}"
            placeholder="Nhập vị trí CS1"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `
          : `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" disabled>Lưu vị trí</button>
          <span class="sq-vitri-coso">CS1:</span>
          <span class="sq-vitri-value-readonly">${vitri_cs1}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `
      )
      : `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="kho">Lưu vị trí</button>
          <span class="sq-vitri-coso">CS1:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs1"
            data-loai="kho"
            placeholder="Nhập vị trí CS1"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `;

    const vitriRowCs2 = vitri_cs2
      ? (
        isAdmin
          ? `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs2" data-loai="kho">Lưu vị trí</button>
          <span class="sq-vitri-coso">CS2:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs2"
            data-loai="kho"
            value="${vitri_cs2}"
            placeholder="Nhập vị trí CS2"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `
          : `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" disabled>Lưu vị trí</button>
          <span class="sq-vitri-coso">CS2:</span>
          <span class="sq-vitri-value-readonly">${vitri_cs2}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `
      )
      : `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="kho">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs2" data-loai="kho">Lưu vị trí</button>
          <span class="sq-vitri-coso">CS2:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs2"
            data-loai="kho"
            placeholder="Nhập vị trí CS2"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `;

    const baymauRowCs1 = baymau_cs1
      ? (
        isAdmin
          ? `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="baymau">Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS1:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs1"
            data-loai="baymau"
            value="${baymau_cs1}"
            placeholder="Nhập vị trí bày mẫu CS1"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `
          : `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" disabled>Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS1:</span>
          <span class="sq-vitri-value-readonly">${baymau_cs1}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `
      )
      : `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="baymau">Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS1:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs1"
            data-loai="baymau"
            placeholder="Nhập vị trí bày mẫu CS1"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `;

    const baymauRowCs2 = baymau_cs2
      ? (
        isAdmin
          ? `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs2" data-loai="baymau">Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS2:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs2"
            data-loai="baymau"
            value="${baymau_cs2}"
            placeholder="Nhập vị trí bày mẫu CS2"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `
          : `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" disabled>Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS2:</span>
          <span class="sq-vitri-value-readonly">${baymau_cs2}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `
      )
      : `
        <div class="sq-vitri-action-row" data-coso="cs2" data-loai="baymau">
          <button type="button" class="sq-vitri-save-btn" data-coso="cs2" data-loai="baymau">Lưu bày mẫu</button>
          <span class="sq-vitri-coso">CS2:</span>
          <input
            type="text"
            class="sq-vitri-input"
            data-coso="cs2"
            data-loai="baymau"
            placeholder="Nhập vị trí bày mẫu CS2"
            autocomplete="off"
          />
          <span class="sq-vitri-msg"></span>
        </div>
      `;

    const vitriEditorBlock = `
  <div class="sq-vitri-actions-wrap">
    ${vitriRowCs1}
    ${baymauRowCs1}
    ${vitriRowCs2}
    ${baymauRowCs2}
    ${nhomhangRow}
  </div>
`;

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
  <span class="sq-title-text">
  Mã: ${upper}
${nhomhang ? ` / ${nhomhang}` : ""}
${giale ? ` / <span class="sq-title-price">${formatPrice(giale)}</span>` : ""} - ${nhap_dau_ma || "--"} - ${nhap_cuoi_ma || "--"}
</span>
  <button class="sq-photo-btn" type="button" title="Copy mã & mở trang up ảnh nhanh">📷 Chụp ảnh/copy</button>
</div>

        <div class="sq-stock-layout">
          <div class="sq-stock-table-wrapper">
            <table>
                            <thead>
                <tr>
                  <th>Size</th>
                  <th class="sq-col-k1">K1</th>
                  <th class="sq-col-k2">K2</th>
                  <th class="sq-col-b1">B1</th>
                  <th class="sq-col-b2">B2</th>
                  <th class="sq-blue">Tnhập</th>
                  <th>Tban</th>
                  <th class="sq-red">Ttồn</th>
                </tr>
              </thead>
              <tbody>
                ${body}
                ${sumRow}
              </tbody>
            </table>
          </div>
          ${imgBlock}
        </div>
        ${vitriEditorBlock}
      </div>`;
  }

  function hideAllPopups() {
    document.querySelectorAll(".sq-stock-popup.show").forEach((p) => {
      p.classList.remove("show");
    });
  }

  function bindVitriActions(popup) {
    if (!popup) return;

    const actionRows = popup.querySelectorAll(".sq-vitri-action-row");

    actionRows.forEach((row) => {
      const btn = row.querySelector(".sq-vitri-save-btn[data-coso]");
      const input = row.querySelector(".sq-vitri-input[data-coso]");
      const msgEl = row.querySelector(".sq-vitri-msg");
      const coso = row.dataset.coso || (btn ? btn.dataset.coso : "");
      const loai = row.dataset.loai || (btn ? btn.dataset.loai : "kho") || "kho";

      if (!btn || !input || !coso) return;

      const runSave = async () => {
        const masp = String(popup.dataset.masp || "").trim().toUpperCase();
        const vitri = String(input.value || "").trim();
        const nhan =
          loai === "baymau"
            ? "vị trí bày mẫu"
            : loai === "nhomhang"
              ? "nhóm hàng"
              : "vị trí";

        const isAdminNow = getIsAdminLocal();

        if (!vitri && !isAdminNow) {
          if (msgEl) {
            msgEl.textContent = `Chưa nhập ${nhan}`;
            msgEl.className = "sq-vitri-msg err";
          }
          input.focus();
          input.select();
          return;
        }

        btn.disabled = true;
        const oldBtnText = btn.textContent;
        btn.textContent = "Đang lưu...";

        if (msgEl) {
          msgEl.textContent = "";
          msgEl.className = "sq-vitri-msg";
        }

        const rs = await saveVitriNhanh(masp, coso, vitri, loai);

        if (rs && rs.ok) {
          const vitriMoi = String(
            Object.prototype.hasOwnProperty.call(rs, "vitri_moi") ? rs.vitri_moi : vitri
          ).trim();

          const isAdminNow = getIsAdminLocal();
          const btnLabel =
            loai === "baymau"
              ? "Lưu bày mẫu"
              : loai === "nhomhang"
                ? "Lưu nhóm hàng"
                : "Lưu vị trí";

          if (isAdminNow) {
            row.innerHTML = `
      <button type="button" class="sq-vitri-save-btn" data-coso="${coso}" data-loai="${loai}">${btnLabel}</button>
      <span class="sq-vitri-coso">${coso.toUpperCase()}:</span>
      <input
        type="text"
        class="sq-vitri-input"
        data-coso="${coso}"
        data-loai="${loai}"
        value="${vitriMoi}"
        autocomplete="off"
      />
      <span class="sq-vitri-msg ok">${rs.message || "Đã lưu"}</span>
    `;
            bindVitriActions(popup);
            return;
          }

          const readonlyHtml = `
    <button type="button" class="sq-vitri-save-btn" disabled>${btnLabel}</button>
    <span class="sq-vitri-coso">${coso.toUpperCase()}:</span>
    <span class="sq-vitri-value-readonly">${vitriMoi || ""}</span>
    <span class="sq-vitri-msg ok">${rs.message || "Đã lưu"}</span>
  `;

          row.innerHTML = readonlyHtml;
          return;
        }

        btn.disabled = false;
        btn.textContent = oldBtnText;

        if (msgEl) {
          msgEl.textContent =
            (rs && rs.message)
              ? rs.message
              : (loai === "baymau"
                ? "Lưu vị trí bày mẫu thất bại"
                : loai === "nhomhang"
                  ? "Lưu nhóm hàng thất bại"
                  : "Lưu vị trí thất bại");
          msgEl.className = "sq-vitri-msg err";
        }

        input.focus();
        input.select();
      };

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        runSave();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          runSave();
        }
      });
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

  function bindOpenSimilarRows(popup) {
    if (!popup) return;

    const tbody = popup.querySelector("tbody");
    if (!tbody) return;
    if (tbody.dataset.similarBound === "1") return;
    tbody.dataset.similarBound = "1";

    let opening = false;
    let lastOpenAt = 0;

    function findClickableRow(target) {
      if (!target) return null;
      const tr = target.closest("tr.sq-open-similar-row");
      if (!tr || !tbody.contains(tr)) return null;
      return tr;
    }

    async function runOpen(tr) {
      if (!tr) return;
      if (tr.classList.contains("sq-hide-row")) return;

      const now = Date.now();
      if (opening) return;
      if (now - lastOpenAt < 450) return;

      const size = String(tr.dataset.size || "").trim();
      const masp = String(popup.dataset.masp || "").trim().toUpperCase();
      const nhomhang = String(popup.dataset.nhomhang || "").trim();

      if (!size || !masp || !nhomhang) return;

      if (!window.StockQuickSimilar || typeof window.StockQuickSimilar.openFromPopup !== "function") {
        console.warn("[StockQuickPopup] StockQuickSimilar chưa sẵn sàng");
        return;
      }

      opening = true;
      lastOpenAt = now;

      tr.classList.add("sq-row-press");

      try {
        await Promise.resolve(
          window.StockQuickSimilar.openFromPopup({
            masp,
            size,
            nhomhang,
            denNgay: getDenNgay()
          })
        );
      } catch (err) {
        console.warn("[StockQuickPopup] openFromPopup error:", err);
      } finally {
        setTimeout(() => {
          tr.classList.remove("sq-row-press");
        }, 180);

        setTimeout(() => {
          opening = false;
        }, 250);
      }
    }

    // CLICK: chạy tốt trên PC / đa số mobile
    tbody.addEventListener("click", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;

      e.preventDefault();
      e.stopPropagation();
      runOpen(tr);
    });

    // POINTERUP: tăng độ ổn định cho iPhone / máy cảm ứng / Safari
    tbody.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return; // chuột đã có click xử lý
      const tr = findClickableRow(e.target);
      if (!tr) return;

      e.preventDefault();
      e.stopPropagation();
      runOpen(tr);
    });

    // Hiệu ứng nhấn
    tbody.addEventListener("pointerdown", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.add("sq-row-press");
    });

    tbody.addEventListener("pointercancel", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.remove("sq-row-press");
    });

    tbody.addEventListener("pointerleave", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.remove("sq-row-press");
    });

    // fallback cho iPhone cũ
    tbody.addEventListener("touchstart", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      tr.classList.add("sq-row-press");
    }, { passive: true });

    tbody.addEventListener("touchend", (e) => {
      const tr = findClickableRow(e.target);
      if (!tr) return;
      setTimeout(() => tr.classList.remove("sq-row-press"), 180);
    }, { passive: true });
  }

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
    popup.dataset.nhomhang = payload.nhomhang || "";

    // auto-fit độ rộng cột theo nội dung
    applyAutoFitInPopup(popup);

    // bind lưu vị trí kho nhanh cho CS1 / CS2
    bindVitriActions(popup);

    // bind click dòng size mở sản phẩm cùng nhóm
    bindOpenSimilarRows(popup);

    popup.querySelectorAll(".sq-vitri-input, .sq-vitri-save-btn").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    });

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

    const hideRow = popup.querySelector(".sq-hide-row");
    if (hideRow) {
      hideRow.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        popup.classList.remove("show");
      });
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




