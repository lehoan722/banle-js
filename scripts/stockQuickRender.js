// stockQuickRender.js
// Dựng giao diện HTML/CSS cho popup tồn kho nhanh.

(function () {
  "use strict";

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
  cursor: default;
}

.sq-title-price {
  color: #dc2626;
  font-weight: 700;
}

.sq-color-link {
  color: #2563eb;
  font-weight: 700;
  cursor: pointer !important;
  text-decoration: underline;
  user-select: none;
  position: relative;
  z-index: 3;
}

.sq-color-link:hover {
  color: #dc2626;
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
    text-align: left;
  }

  .sq-lech {
    color: #dc2626;
    font-weight: 700;
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
    cursor: default;
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

  function injectCssOnce() {
    if (document.getElementById("sq-stock-popup-style")) return;
    const s = document.createElement("style");
    s.id = "sq-stock-popup-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildActionRow({ coso, loai, value, placeholder, label, buttonText, isAdmin }) {
    const hasValue = value !== undefined && value !== null && String(value).trim() !== "";
    const safeValue = String(value || "");

    if (hasValue && !isAdmin) {
      return `
        <div class="sq-vitri-action-row" data-coso="${coso}" data-loai="${loai}">
          <button type="button" class="sq-vitri-save-btn" disabled>${buttonText}</button>
          <span class="sq-vitri-coso">${label}</span>
          <span class="sq-vitri-value-readonly">${safeValue}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `;
    }

    return `
      <div class="sq-vitri-action-row" data-coso="${coso}" data-loai="${loai}">
        <button type="button" class="sq-vitri-save-btn" data-coso="${coso}" data-loai="${loai}">${buttonText}</button>
        <span class="sq-vitri-coso">${label}</span>
        <input
          type="text"
          class="sq-vitri-input"
          data-coso="${coso}"
          data-loai="${loai}"
          ${hasValue ? `value="${safeValue}"` : ""}
          placeholder="${placeholder}"
          autocomplete="off"
        />
        <span class="sq-vitri-msg"></span>
      </div>
    `;
  }

  function buildNhomhangRow(nhomhang, isAdmin) {
    const hasValue = !!String(nhomhang || "").trim();

    if (hasValue && !isAdmin) {
      return `
        <div class="sq-vitri-action-row" data-coso="cs1" data-loai="nhomhang">
          <button type="button" class="sq-vitri-save-btn" disabled>Lưu nhóm hàng</button>
          <span class="sq-vitri-label">Nhóm hàng:</span>
          <span class="sq-vitri-value-readonly">${nhomhang}</span>
          <span class="sq-vitri-msg"></span>
        </div>
      `;
    }

    return `
      <div class="sq-vitri-action-row" data-coso="cs1" data-loai="nhomhang">
        <button type="button" class="sq-vitri-save-btn" data-coso="cs1" data-loai="nhomhang">Lưu nhóm hàng</button>
        <span class="sq-vitri-label">Nhóm hàng:</span>
        <input
          type="text"
          class="sq-vitri-input"
          data-coso="cs1"
          data-loai="nhomhang"
          ${hasValue ? `value="${nhomhang}"` : ""}
          placeholder="Nhập nhóm hàng"
          autocomplete="off"
        />
        <span class="sq-vitri-msg"></span>
      </div>
    `;
  }

  function renderTonLech(tonRaw, lechRaw) {
    const ton = Number(tonRaw || 0);
    const lech = lechRaw === null || lechRaw === undefined ? null : Number(lechRaw);

    if ((ton === 0 || !ton) && (lech === null || lech === 0)) return "";
    const tonText = ton !== 0 ? String(ton) : "0";
    if (lech === null || lech === 0) return ton !== 0 ? tonText : "";

    const sign = lech > 0 ? "+" : "";
    return `${tonText}<span class="sq-lech">${sign}${lech}</span>`;
  }

  function renderSumTonLech(tonRaw, lechRaw) {
    const ton = Number(tonRaw || 0);
    const lech = Number(lechRaw || 0);

    if (!ton && !lech) return "";

    const tonText = ton ? String(ton) : "0";
    if (!lech) return tonText;

    const sign = lech > 0 ? "+" : "";
    return `${tonText}<span class="sq-lech">${sign}${lech}</span>`;
  }

  function buildTableHtml(masp, payload) {
    const U = window.StockQuickUtils;
    const C = window.StockQuickColor;
    const I = window.StockQuickImage;

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
    const mau_khac = payload && payload.mau_khac ? payload.mau_khac : "";
    const kiemton = payload && payload.kiemton ? payload.kiemton : {};

    const kiemParts = [];
    if (kiemton?.cs1?.nguoi_kiem) kiemParts.push(`CS1 ${kiemton.cs1.nguoi_kiem} - ${kiemton.cs1.ngay_kiem || ""}`);
    if (kiemton?.cs2?.nguoi_kiem) kiemParts.push(`CS2 ${kiemton.cs2.nguoi_kiem} - ${kiemton.cs2.ngay_kiem || ""}`);
    const thongTinKiem = kiemParts.length ? kiemParts.join(" / ") : "";

    function getLechTheoSize(coso, sizeNum) {
      const v = kiemton?.[coso]?.lech?.[String(sizeNum)];
      return v === undefined || v === null || Number(v) === 0 ? null : Number(v);
    }

    const isAdmin = U.getIsAdminLocal();

    if (!rows.length && !vitri_cs1 && !vitri_cs2) {
      return `
        <div class="sq-stock-popup" data-masp="${upper}">
          <span class="sq-close">✕</span>
          <div class="sq-stock-popup-header">Mã: ${upper}</div>
          <div>Không có dữ liệu tồn kho.</div>
        </div>`;
    }

    let sum1 = 0, sum2 = 0, sumLech1 = 0, sumLech2 = 0, sumBan1 = 0, sumBan2 = 0, sumNhap = 0, sumTongBan = 0, sumTongTon = 0;
    const SIZE_ORDER = ["0", "38", "39", "40", "41", "42", "43", "44", "45"];
    const bySizeNum = new Map();

    (rows || []).forEach((r) => {
      const raw = String(r.size ?? "").trim();
      const noPrefix = raw.replace(/^size\s+/i, "").trim();
      const m = noPrefix.match(/(\d{1,2})/);
      const num = (m ? m[1] : noPrefix).trim();
      if (!num) return;
      bySizeNum.set(num, r);
    });

    const body = SIZE_ORDER.map((sizeNum) => {
      const r = bySizeNum.get(sizeNum) || {
        size: "size " + sizeNum,
        ton_cs1: 0,
        ton_cs2: 0,
        lech_cs1: getLechTheoSize("cs1", sizeNum),
        lech_cs2: getLechTheoSize("cs2", sizeNum),
        ban_cs1: 0,
        ban_cs2: 0,
        tong_ban: 0,
        tong_nhap: 0,
        tong_ton: 0,
      };

      if (r.lech_cs1 === undefined || r.lech_cs1 === null) r.lech_cs1 = getLechTheoSize("cs1", sizeNum);
      if (r.lech_cs2 === undefined || r.lech_cs2 === null) r.lech_cs2 = getLechTheoSize("cs2", sizeNum);

      const sizeLabel = U.displaySizeLabel(r.size);

      sum1 += Number(r.ton_cs1 || 0);
      sum2 += Number(r.ton_cs2 || 0);
      sumLech1 += Number(r.lech_cs1 || 0);
      sumLech2 += Number(r.lech_cs2 || 0);
      sumBan1 += Number(r.ban_cs1 || 0);
      sumBan2 += Number(r.ban_cs2 || 0);
      sumNhap += Number(r.tong_nhap || 0);
      sumTongBan += Number(r.tong_ban || 0);

      const tonTong = Number(r.ton_cs1 || 0) + Number(r.ton_cs2 || 0);
      sumTongTon += tonTong;

      return `
        <tr class="sq-open-similar-row" data-size="${sizeNum}" title="Bấm để xem mã cùng nhóm cùng size">
          <td>${sizeLabel}</td>
          <td class="num sq-col-k1">${renderTonLech(r.ton_cs1, r.lech_cs1)}</td>
          <td class="num sq-col-k2">${renderTonLech(r.ton_cs2, r.lech_cs2)}</td>
          <td class="num sq-col-b1">${r.ban_cs1 ? r.ban_cs1 : ""}</td>
          <td class="num sq-col-b2">${r.ban_cs2 ? r.ban_cs2 : ""}</td>
          <td class="num sq-blue">${r.tong_nhap ? r.tong_nhap : ""}</td>
          <td class="num">${r.tong_ban ? r.tong_ban : ""}</td>
          <td class="num sq-red">${tonTong ? tonTong : ""}</td>
        </tr>`;
    }).join("");

    const sumRow = rows.length
      ? `
        <tr class="sum-row sq-hide-row" title="Bấm để đóng popup">
          <td>Tổng / Ẩn</td>
          <td class="num sq-col-k1">${renderSumTonLech(sum1, sumLech1)}</td>
          <td class="num sq-col-k2">${renderSumTonLech(sum2, sumLech2)}</td>
          <td class="num sq-col-b1">${sumBan1 || ""}</td>
          <td class="num sq-col-b2">${sumBan2 || ""}</td>
          <td class="num sq-blue">${sumNhap || ""}</td>
          <td class="num">${sumTongBan || ""}</td>
          <td class="num sq-red">${sumTongTon || ""}</td>
        </tr>`
      : "";

    const vitriEditorBlock = `
      <div class="sq-vitri-actions-wrap">
        ${buildActionRow({ coso: "cs1", loai: "kho", value: vitri_cs1, placeholder: "Nhập vị trí CS1", label: "CS1:", buttonText: "Lưu vị trí", isAdmin })}
        ${buildActionRow({ coso: "cs1", loai: "baymau", value: baymau_cs1, placeholder: "Nhập vị trí bày mẫu CS1", label: "CS1:", buttonText: "Lưu bày mẫu", isAdmin })}
        ${buildActionRow({ coso: "cs2", loai: "kho", value: vitri_cs2, placeholder: "Nhập vị trí CS2", label: "CS2:", buttonText: "Lưu vị trí", isAdmin })}
        ${buildActionRow({ coso: "cs2", loai: "baymau", value: baymau_cs2, placeholder: "Nhập vị trí bày mẫu CS2", label: "CS2:", buttonText: "Lưu bày mẫu", isAdmin })}
        ${buildNhomhangRow(nhomhang, isAdmin)}
      </div>
    `;

    const imgBlock = I.buildImageBlock(upper);

    return `
      <div class="sq-stock-popup" data-masp="${upper}">
        <span class="sq-close">✕</span>
        <div class="sq-stock-popup-header">
          <span class="sq-title-text">
            ${upper}
            ${mau_khac ? ` / ${C.buildOtherColorLinksHtml(upper, mau_khac)}` : ""}
            ${nhomhang ? ` / ${nhomhang}` : ""}
            ${giale ? ` / <span class="sq-title-price">${U.formatShortPrice(giale)}</span>` : ""} - ${nhap_dau_ma || "--"} - ${nhap_cuoi_ma || "--"}
            ${thongTinKiem ? ` / Kiểm: ${thongTinKiem}` : ""}
          </span>
          <button class="sq-photo-btn" type="button" title="Copy mã & mở trang up ảnh nhanh">📷 Chụp ảnh/copy</button>
        </div>

        <div class="sq-stock-layout">
          <div class="sq-stock-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th class="sq-col-k1">tk1</th>
                  <th class="sq-col-k2">tk2</th>
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

  function autoFitTableColumns(table, opts = {}) {
    const {
      minPx = 70,
      maxPx = 420,
      paddingPx = 28,
      wrapColumns = new Set(["Sai"]),
      wrapMaxPx = 260,
    } = opts;

    if (!table) return;

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

    const ths = table.querySelectorAll("thead th");
    ths.forEach((th) => {
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

    requestAnimationFrame(() => {
      autoFitTableColumns(table, { minPx: 70, maxPx: 420, paddingPx: 28, wrapColumns: new Set(["Sai"]), wrapMaxPx: 260 });
    });

    const img = popupEl.querySelector(".sq-img-wrapper img");
    if (img) {
      img.addEventListener("load", () => {
        autoFitTableColumns(table, { minPx: 70, maxPx: 420, paddingPx: 28, wrapColumns: new Set(["Sai"]), wrapMaxPx: 260 });
      }, { once: true });
    }
  }

  injectCssOnce();

  window.StockQuickRender = {
    injectCssOnce,
    buildTableHtml,
    applyAutoFitInPopup,
  };
})();
