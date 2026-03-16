// scripts/nhapkiemkho.js
(function () {
  "use strict";

  const CFG = window.KIEM_NHAP_CONFIG || {
    pageId: "kiemnhap_cs1",
    fromBranch: "cs2",
    toBranch: "cs1",
    soPhieuPrefix: "kiemnhap_",
    title: "KIỂM NHẬP KHO"
  };

  // =========================
  // STATE
  // =========================
  window.kiemNhapState = {
    nhap: {},      // { MASP: { masp, size, sl } }
    xuat: {},      // { MASP: { masp, size, sl } }
    ketQua: {},    // { MASP: { trangthai, chitiet } }
    dsHoaDonNguon: []
  };

  // =========================
  // HELPERS
  // =========================
  function byId(id) {
    return document.getElementById(id);
  }

  function normalizeMasp(v) {
    return String(v || "").trim().toUpperCase();
  }

  function normalizeSize(v) {
    return String(v || "").trim();
  }

  function makeKey(masp, size) {
    return `${normalizeMasp(masp)}@@${normalizeSize(size)}`;
  }

  function splitKey(key) {
    const [masp = "", size = ""] = String(key || "").split("@@");
    return {
      masp: normalizeMasp(masp),
      size: normalizeSize(size)
    };
  }

  function parseSizeSlText(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];

    const parts = raw
      .split(/\s+/)
      .map(x => x.trim())
      .filter(Boolean);

    const out = [];

    for (const part of parts) {
      const m = part.match(/^(.+?)\/(-?\d+(?:[.,]\d+)?)$/);
      if (!m) continue;

      const size = normalizeSize(m[1]);
      const sl = normalizeNumber(m[2]);

      if (!size) continue;
      if (sl <= 0) continue;

      out.push({ size, sl });
    }

    return out;
  }

  function hasRealSizeItems(items) {
    return (items || []).some(x => {
      const size = normalizeSize(x.size);
      return size && size !== "0";
    });
  }

  function getAvailableSizesForMasp(masp) {
    masp = normalizeMasp(masp);
    if (!masp) return [];

    const state = getState();
    const sizeMap = new Map();

    Object.keys(state.xuat || {}).forEach((key) => {
      const row = state.xuat[key];
      if (!row) return;
      if (normalizeMasp(row.masp) !== masp) return;

      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);
      if (!size) return;

      sizeMap.set(size, {
        size,
        slXuat: sl,
        slNhap: 0
      });
    });

    Object.keys(state.nhap || {}).forEach((key) => {
      const row = state.nhap[key];
      if (!row) return;
      if (normalizeMasp(row.masp) !== masp) return;

      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);
      if (!size) return;

      if (!sizeMap.has(size)) {
        sizeMap.set(size, {
          size,
          slXuat: 0,
          slNhap: sl
        });
      } else {
        sizeMap.get(size).slNhap = sl;
      }
    });

    const arr = Array.from(sizeMap.values());
    arr.sort((a, b) => {
      const na = Number(a.size);
      const nb = Number(b.size);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size), "vi");
    });

    return arr;
  }

  function hideSizePopup() {
    const popup = byId("popup_size");
    if (!popup) return;
    popup.style.display = "none";
    popup.innerHTML = "";
  }

  function themNhanhTheoSize(size, giuPopup = true) {
  const maspEl = byId("masp");
  const sizeEl = byId("size");
  const slEl = byId("soluong");

  const masp = normalizeMasp(maspEl?.value);
  const sizeVal = normalizeSize(size);
  const sl = normalizeNumber(slEl?.value || 1) || 1;

  if (!masp || !sizeVal) return;

  const key = makeKey(masp, sizeVal);
  const state = getState();

  if (!state.nhap[key]) {
    state.nhap[key] = { masp, size: sizeVal, sl };
  } else {
    state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
  }

  delete state.ketQua[key];
  renderBangKetQua();

  if (sizeEl) sizeEl.value = "";
  if (slEl) slEl.value = "1";

  if (giuPopup && sizeEl) {
    setTimeout(() => {
      sizeEl.focus();
      showSizePopup(masp, "");
    }, 0);
  }
}

function themNhanhKhongCanSize() {
  const maspEl = byId("masp");
  const slEl = byId("soluong");

  const masp = normalizeMasp(maspEl?.value);
  const sl = normalizeNumber(slEl?.value || 1) || 1;

  if (!masp) return;

  const key = makeKey(masp, "0");
  const state = getState();

  if (!state.nhap[key]) {
    state.nhap[key] = {
      masp,
      size: "0",
      sl
    };
  } else {
    state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
  }

  delete state.ketQua[key];
  renderBangKetQua();

  if (slEl) slEl.value = "1";

  if (maspEl) {
    maspEl.value = masp;
    maspEl.focus();

    setTimeout(() => {
      try {
        maspEl.select();
      } catch (err) {}
    }, 0);
  }

  hideSizePopup();
}

  function showSizePopup(masp, keyword = "") {
    const popup = byId("popup_size");
    const sizeEl = byId("size");
    if (!popup || !sizeEl) return;

    const list = getAvailableSizesForMasp(masp);
    const kw = normalizeSize(keyword).toLowerCase();

    const filtered = list.filter(item =>
      !kw || String(item.size).toLowerCase().includes(kw)
    );

    if (!filtered.length) {
      hideSizePopup();
      return;
    }

    popup.innerHTML = "";

    filtered.forEach(item => {
      const row = document.createElement("div");
      row.style.padding = "6px 8px";
      row.style.borderBottom = "1px solid #eee";
      row.style.cursor = "pointer";
      row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <b>${escapeHtml(item.size)}</b>
        <span>X:${item.slXuat} | N:${item.slNhap}</span>
      </div>
    `;

      row.addEventListener("mouseenter", () => {
        row.style.background = "#f2f2f2";
      });

      row.addEventListener("mouseleave", () => {
        row.style.background = "#fff";
      });

      row.addEventListener("mousedown", (e) => {
        e.preventDefault(); // tránh blur làm popup tắt trước
      });

      row.addEventListener("click", () => {
  dangChonSizeTrongPopup = true;
  themNhanhTheoSize(item.size, true);

  setTimeout(() => {
    dangChonSizeTrongPopup = false;
  }, 0);
});

      popup.appendChild(row);
    });

    popup.style.display = "block";
  }

  function splitKey(key) {
    const [masp = "", size = ""] = String(key || "").split("@@");
    return {
      masp: normalizeMasp(masp),
      size: normalizeSize(size)
    };
  }

  function normalizeNumber(v) {
    const raw = String(v ?? "")
      .replace(/\./g, "")
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getState() {
    return window.kiemNhapState;
  }

  function taoSoPhieuMoi() {
    const now = new Date();
    const stamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    return `${CFG.soPhieuPrefix}${stamp}`;
  }

  function updateTitle() {
    document.title = CFG.title || document.title;
  }

  function setDefaultBranchInfo() {
    const diadiem = byId("diadiem");
    if (diadiem && !diadiem.value) diadiem.value = CFG.toBranch || "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    const ngay = byId("ngay");
    if (ngay && !ngay.value) {
      const d = new Date();
      ngay.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    const gio = byId("gio");
    if (gio) {
      const tick = () => {
        const d = new Date();
        gio.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      tick();
      setInterval(tick, 1000 * 15);
    }
  }

  // =========================
  // RENDER
  // =========================
  function groupByMasp(mapObj) {
    const out = {};

    for (const key of Object.keys(mapObj || {})) {
      const row = mapObj[key];
      if (!row || !row.masp) continue;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!out[masp]) {
        out[masp] = {
          masp,
          items: []
        };
      }

      out[masp].items.push({
        key,
        size,
        sl
      });
    }

    // sắp xếp size tăng dần cho dễ nhìn
    Object.values(out).forEach(group => {
      group.items.sort((a, b) => {
        const na = Number(a.size);
        const nb = Number(b.size);

        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return String(a.size).localeCompare(String(b.size), "vi");
      });
    });

    return out;
  }

  function formatSizeSl(items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return items.map(x => `${x.size}/${x.sl}`).join("\n");
  }

  function tongSoLuong(items) {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, x) => sum + normalizeNumber(x.sl), 0);
  }

  function buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap) {
    const allSizeKeys = new Set([
      ...((nhapGroup?.items || []).map(x => x.key)),
      ...((xuatGroup?.items || []).map(x => x.key))
    ]);

    const thieuParts = [];
    const thuaParts = [];
    let tongThieu = 0;
    let tongThua = 0;
    let hasOk = false;

    for (const key of allSizeKeys) {
      const kq = ketQuaMap[key];
      if (!kq) continue;

      const { size } = splitKey(key);
      const diff = normalizeNumber(kq.chitiet || 0);

      if (kq.trangthai === "THIEU") {
        tongThieu += diff;
        thieuParts.push(`${size}/${diff}`);
      } else if (kq.trangthai === "THUA") {
        tongThua += diff;
        thuaParts.push(`${size}/${diff}`);
      } else if (kq.trangthai === "OK") {
        hasOk = true;
      }
    }

    if (tongThieu > 0 && tongThua === 0) {
      return {
        trangthai: "THIEU",
        chitiet: thieuParts.join(" ")
      };
    }

    if (tongThua > 0 && tongThieu === 0) {
      return {
        trangthai: "THUA",
        chitiet: thuaParts.join(" ")
      };
    }

    if (tongThieu === 0 && tongThua === 0 && hasOk) {
      return { trangthai: "OK", chitiet: "" };
    }

    if (tongThieu > 0 && tongThua > 0) {
      return {
        trangthai: "LECH",
        chitiet: `Thiếu: ${thieuParts.join(" ")} | Thừa: ${thuaParts.join(" ")}`
      };
    }

    return { trangthai: "", chitiet: "" };
  }

  function renderBangKetQua() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const nhapGroupMap = groupByMasp(nhapMap);
    const xuatGroupMap = groupByMasp(xuatMap);

    const allMasps = Array.from(
      new Set([
        ...Object.keys(nhapGroupMap),
        ...Object.keys(xuatGroupMap)
      ])
    ).sort();

    tbody.innerHTML = "";

    for (const masp of allMasps) {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);

      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td>${escapeHtml(masp)}</td>
  <td contenteditable="true"
      class="cell-nhap-sizesl"
      data-masp="${escapeHtml(masp)}"
      style="white-space: pre-line; text-align:left;">${escapeHtml(nhapText)}</td>
  <td contenteditable="true"
      class="cell-nhap-tongsl"
      data-masp="${escapeHtml(masp)}">${tongSoLuong(nhapGroup?.items || []) || ""}</td>

  <td>${escapeHtml(masp)}</td>
  <td style="white-space: pre-line; text-align:left;">${escapeHtml(xuatText)}</td>
  <td>${tongSoLuong(xuatGroup?.items || []) || ""}</td>

  <td>${escapeHtml(kqTong.trangthai || "")}</td>
  <td style="white-space: pre-line; text-align:left;">${escapeHtml(kqTong.chitiet || "")}</td>
    `;
      tbody.appendChild(tr);
    }
  }

  function docLaiNhapTuBangHTML() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const nhapMoi = {};

    rows.forEach((tr) => {
      const tdMasp = tr.children[0];
      const tdSizeSl = tr.querySelector(".cell-nhap-sizesl");
      const tdTongSl = tr.querySelector(".cell-nhap-tongsl");

      const masp = normalizeMasp(tdMasp?.innerText || "");
      if (!masp) return;

      const sizeSlText = String(tdSizeSl?.innerText || "").trim();
      const tongSlText = String(tdTongSl?.innerText || "").trim();

      const items = parseSizeSlText(sizeSlText);
      const tongSl = normalizeNumber(tongSlText);

      // Có size thật => ưu tiên kiểm chi tiết
      if (hasRealSizeItems(items)) {
        items.forEach((item) => {
          const key = makeKey(masp, item.size);
          nhapMoi[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
        return;
      }

      // Không có size thật nhưng có tổng => kiểm tổng bằng size 0
      if (tongSl > 0) {
        const key = makeKey(masp, "0");
        nhapMoi[key] = {
          masp,
          size: "0",
          sl: tongSl
        };
      }
    });

    state.nhap = nhapMoi;
  }

  // Expose để HTML cũ không lỗi nếu còn gọi
  window.renderBangKetQua = renderBangKetQua;
  window.capNhatTongTien = function () { return; };

  // =========================
  // NHẬP BÊN TRÁI
  // =========================
  function themDongNhapBenTrai() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (!maspEl || !slEl) return;

    const masp = normalizeMasp(maspEl.value);
    const size = normalizeSize(sizeEl?.value);
    const sl = normalizeNumber(slEl.value || 1);

    if (!masp) {
      alert("Vui lòng nhập mã sản phẩm.");
      maspEl.focus();
      return;
    }

    if (!size) {
      if (sizeEl) {
        sizeEl.focus();
        sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      }
      return;
    }

    if (sl <= 0) {
      alert("Số lượng phải lớn hơn 0.");
      slEl.focus();
      return;
    }

    const key = makeKey(masp, size);
    const state = getState();

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size,
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    delete state.ketQua[key];

    renderBangKetQua();

    if (sizeEl) sizeEl.value = "";
    slEl.value = "1";

    if (sizeEl) {
      sizeEl.focus();
      sizeEl.dispatchEvent(new Event("focus", { bubbles: true }));
      sizeEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    } else {
      maspEl.focus();
    }
  }

  function bindInputEvents() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (maspEl) {
  maspEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const masp = normalizeMasp(maspEl.value);
      if (!masp) {
        alert("Vui lòng nhập mã sản phẩm.");
        maspEl.focus();
        return;
      }

      maspEl.value = masp;

      const chkNhapNhanh = byId("chkNhapNhanh");
      const isNhapNhanh = !!chkNhapNhanh?.checked;

      if (isNhapNhanh) {
        themNhanhKhongCanSize();
        return;
      }

      if (slEl && !normalizeNumber(slEl.value)) {
        slEl.value = "1";
      }

      if (sizeEl) {
        sizeEl.focus();
        sizeEl.value = "";
        showSizePopup(masp, "");
      }
    }
  });

      maspEl.addEventListener("blur", () => {
        maspEl.value = normalizeMasp(maspEl.value);
      });
    }

    if (sizeEl) {
      sizeEl.addEventListener("focus", () => {
        const masp = normalizeMasp(maspEl?.value);
        if (!masp) return;
        showSizePopup(masp, sizeEl.value);
      });

      sizeEl.addEventListener("input", () => {
        const masp = normalizeMasp(maspEl?.value);
        if (!masp) return;
        showSizePopup(masp, sizeEl.value);
      });

      sizeEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const masp = normalizeMasp(maspEl?.value);
          if (!masp) {
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl?.focus();
            return;
          }

          const typedSize = normalizeSize(sizeEl.value);
          if (!typedSize) {
            showSizePopup(masp, "");
            return;
          }

          themNhanhTheoSize(typedSize);
        }

        if (e.key === "Escape") {
          hideSizePopup();
          maspEl?.focus();
        }
      });
    }

    if (slEl) {
      slEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();

          const masp = normalizeMasp(maspEl?.value);
          if (!masp) {
            alert("Vui lòng nhập mã sản phẩm.");
            maspEl?.focus();
            return;
          }

          if (sizeEl) {
            sizeEl.focus();
            showSizePopup(masp, sizeEl.value);
          }
        }
      });
    }

    document.addEventListener("click", (e) => {
  const popup = byId("popup_size");
  if (!popup) return;

  if (dangChonSizeTrongPopup) return;
  if (e.target === sizeEl || e.target === maspEl || popup.contains(e.target)) return;

  hideSizePopup();
});
  }

  // =========================
  // RESET PHIẾU
  // =========================
  function resetPhieu() {
    window.kiemNhapState = {
      nhap: {},
      xuat: {},
      ketQua: {},
      dsHoaDonNguon: []
    };

     let dangChonSizeTrongPopup = false;

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");
    const sohdEl = byId("sohd");
    const ghichuEl = byId("ghichu_top");

    if (maspEl) maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";
    if (sohdEl) sohdEl.value = taoSoPhieuMoi();
    if (ghichuEl) ghichuEl.value = "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    renderBangKetQua();

    if (maspEl) maspEl.focus();
  }

  // =========================
  // KIỂM TRA
  // Bản đầu: so tổng SL theo mã
  // =========================
  function kiemTraPhieu() {
    // luôn đọc lại dữ liệu người dùng vừa sửa trực tiếp trên bảng
    docLaiNhapTuBangHTML();

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQua = {};

    // Gom xuat theo mã để dùng cho chế độ kiểm tổng
    const xuatTheoMasp = {};
    Object.keys(xuatMap).forEach((key) => {
      const row = xuatMap[key];
      if (!row) return;
      const masp = normalizeMasp(row.masp);
      const sl = normalizeNumber(row.sl);
      xuatTheoMasp[masp] = (xuatTheoMasp[masp] || 0) + sl;
    });

    // Gom nhap theo mã để biết mã nào đang ở chế độ tổng
    const nhapTheoMasp = {};
    Object.keys(nhapMap).forEach((key) => {
      const row = nhapMap[key];
      if (!row) return;
      const masp = normalizeMasp(row.masp);
      if (!nhapTheoMasp[masp]) nhapTheoMasp[masp] = [];
      nhapTheoMasp[masp].push(row);
    });

    const allMasps = new Set([
      ...Object.keys(nhapTheoMasp),
      ...Object.keys(xuatTheoMasp),
      ...Object.values(xuatMap).map(r => normalizeMasp(r.masp))
    ]);

    for (const masp of allMasps) {
      const nhapRows = nhapTheoMasp[masp] || [];
      const hasRealSize = nhapRows.some(r => normalizeSize(r.size) !== "0" && normalizeSize(r.size) !== "");

      // CHẾ ĐỘ 1: kiểm chi tiết theo size
      if (hasRealSize) {
        const xuatKeys = Object.keys(xuatMap).filter(k => normalizeMasp(xuatMap[k]?.masp) === masp);
        const nhapKeys = Object.keys(nhapMap).filter(k => normalizeMasp(nhapMap[k]?.masp) === masp);

        const allKeys = new Set([...xuatKeys, ...nhapKeys]);

        for (const key of allKeys) {
          const nhap = nhapMap[key];
          const xuat = xuatMap[key];

          const slNhap = normalizeNumber(nhap?.sl || 0);
          const slXuat = normalizeNumber(xuat?.sl || 0);

          if (slNhap === slXuat) {
            ketQua[key] = { trangthai: "OK", chitiet: "" };
          } else if (slNhap < slXuat) {
            ketQua[key] = { trangthai: "THIEU", chitiet: String(slXuat - slNhap) };
          } else {
            ketQua[key] = { trangthai: "THUA", chitiet: String(slNhap - slXuat) };
          }
        }

        continue;
      }

      // CHẾ ĐỘ 2: kiểm tổng
      const tongNhap = nhapRows.reduce((sum, r) => sum + normalizeNumber(r.sl), 0);
      const tongXuat = xuatTheoMasp[masp] || 0;

      const keyTong = makeKey(masp, "0");

      if (tongNhap === tongXuat) {
        ketQua[keyTong] = { trangthai: "OK", chitiet: "" };
      } else if (tongNhap < tongXuat) {
        ketQua[keyTong] = { trangthai: "THIEU", chitiet: String(tongXuat - tongNhap) };
      } else {
        ketQua[keyTong] = { trangthai: "THUA", chitiet: String(tongNhap - tongXuat) };
      }
    }

    state.ketQua = ketQua;
    renderBangKetQua();
  }

  // =========================
  // NẠP HÓA ĐƠN NGUỒN
  // Bản đầu: chưa query thật, chỉ placeholder
  // =========================

  function moPopupChonHoaDonNguon(dsHd) {
    return new Promise((resolve) => {
      const popup = byId("popupChonHoaDonNguon");
      const box = byId("dsHoaDonNguonPopup");
      const btnDong = byId("btnDongPopupHoaDonNguon");
      const btnOk = byId("btnXacNhanHoaDonNguon");

      if (!popup || !box || !btnDong || !btnOk) {
        resolve(null);
        return;
      }

      box.innerHTML = "";

      dsHd.forEach((hd, index) => {
        const sohd = String(hd.sohd || "").trim();
        const ngay = hd.ngay || "";
        const diadiem = hd.diadiem || "";

        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "6px 4px";
        row.style.borderBottom = "1px solid #eee";
        row.style.cursor = "pointer";

        row.innerHTML = `
        <input type="checkbox" class="chk-hd-nguon" value="${escapeHtml(sohd)}" ${index === 0 ? "checked" : ""}>
        <span>${escapeHtml(sohd)} | ${escapeHtml(ngay)} | ${escapeHtml(diadiem)}</span>
      `;
        box.appendChild(row);
      });

      popup.style.display = "block";

      const closePopup = (result) => {
        popup.style.display = "none";
        btnDong.onclick = null;
        btnOk.onclick = null;
        resolve(result);
      };

      btnDong.onclick = () => closePopup(null);

      btnOk.onclick = () => {
        const checked = Array.from(
          box.querySelectorAll(".chk-hd-nguon:checked")
        ).map(x => x.value);

        if (!checked.length) {
          alert("Vui lòng chọn ít nhất 1 hóa đơn.");
          return;
        }

        closePopup(checked);
      };
    });
  }

  async function napHoaDonNguonPlaceholder() {
    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      const prefixNguon = CFG.fromBranch === "cs2" ? "xcncs2_" : "xcncs1_";

      const { data: dsHd, error: errHd } = await window.supabase
        .from("hoadon_banle")
        .select("sohd, ngay, created_at, diadiem")
        .ilike("sohd", `${prefixNguon}%`)
        .order("created_at", { ascending: false })
        .limit(30);

      if (errHd) {
        console.error("[nhapkiemkho] load ds hoa don nguon error:", errHd);
        alert("Lỗi khi lấy danh sách hóa đơn nguồn.");
        return;
      }

      if (!dsHd || dsHd.length === 0) {
        alert("Không tìm thấy hóa đơn nguồn phù hợp.");
        return;
      }

      const dsSoHdChon = await moPopupChonHoaDonNguon(dsHd);
      if (!dsSoHdChon || dsSoHdChon.length === 0) return;

      const { data: ctRows, error: errCt } = await window.supabase
        .from("ct_hoadon_banle")
        .select("sohd, masp, size, soluong")
        .in("sohd", dsSoHdChon)
        .order("id", { ascending: true });

      if (errCt) {
        console.error("[nhapkiemkho] load ct_hoadon_banle error:", errCt);
        alert("Lỗi khi lấy chi tiết hóa đơn nguồn.");
        return;
      }

      if (!ctRows || ctRows.length === 0) {
        alert("Hóa đơn nguồn không có chi tiết.");
        return;
      }

      const xuatMap = {};

      for (const row of ctRows) {
        const masp = normalizeMasp(row.masp);
        const size = normalizeSize(row.size);
        const sl = normalizeNumber(row.soluong);

        if (!masp || !size || sl <= 0) continue;

        const key = makeKey(masp, size);

        if (!xuatMap[key]) {
          xuatMap[key] = {
            masp,
            size,
            sl
          };
        } else {
          xuatMap[key].sl = normalizeNumber(xuatMap[key].sl) + sl;
        }
      }

      const state = getState();
      state.dsHoaDonNguon = dsSoHdChon;

      const ghichuEl = byId("ghichu_top");
      if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

      window.NhapKiemKho.setXuatData(xuatMap);

      alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn.`);
    } catch (err) {
      console.error("[nhapkiemkho] napHoaDonNguonPlaceholder exception:", err);
      alert("Có lỗi khi nạp hóa đơn nguồn.");
    }
  }

  // =========================
  // BUTTONS
  // =========================

    // =========================
  // SAVE KIEM NHAP KHO
  // =========================

  function tinhTongSoLuongTheoMap(mapObj) {
    return Object.values(mapObj || {}).reduce((sum, row) => {
      return sum + normalizeNumber(row?.sl || 0);
    }, 0);
  }

  function groupRowsByMasp(mapObj) {
    const out = {};

    Object.keys(mapObj || {}).forEach((key) => {
      const row = mapObj[key];
      if (!row) return;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!masp) return;

      if (!out[masp]) {
        out[masp] = [];
      }

      out[masp].push({
        masp,
        size,
        sl,
        key
      });
    });

    return out;
  }

  function tinhTongTheoMasp(groupMap) {
    const out = {};
    Object.keys(groupMap || {}).forEach((masp) => {
      out[masp] = (groupMap[masp] || []).reduce((sum, row) => sum + normalizeNumber(row.sl), 0);
    });
    return out;
  }

  function xayDungDuLieuTongVaChiTietLech() {
    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const nhapGroup = groupRowsByMasp(nhapMap);
    const xuatGroup = groupRowsByMasp(xuatMap);

    const tongNhapTheoMasp = tinhTongTheoMasp(nhapGroup);
    const tongXuatTheoMasp = tinhTongTheoMasp(xuatGroup);

    const allMasps = Array.from(new Set([
      ...Object.keys(nhapGroup),
      ...Object.keys(xuatGroup)
    ])).sort();

    const chiTietLech = [];
    let tongSlLechThieu = 0;
    let tongSlLechThua = 0;

    for (const masp of allMasps) {
      const nhapRows = nhapGroup[masp] || [];
      const xuatRows = xuatGroup[masp] || [];

      const hasRealSizeNhap = nhapRows.some(r => {
        const s = normalizeSize(r.size);
        return s && s !== "0";
      });

      if (hasRealSizeNhap) {
        const allKeys = new Set([
          ...nhapRows.map(r => r.key),
          ...xuatRows.map(r => r.key)
        ]);

        for (const key of allKeys) {
          const kq = ketQuaMap[key];
          if (!kq || kq.trangthai === "OK") continue;

          const nhap = nhapMap[key];
          const xuat = xuatMap[key];

          const slNhap = normalizeNumber(nhap?.sl || 0);
          const slXuat = normalizeNumber(xuat?.sl || 0);
          const slLech = Math.abs(slNhap - slXuat);
          const size = splitKey(key).size || "0";

          let trangthai_nhan = "lech";
          if (kq.trangthai === "THIEU") {
            trangthai_nhan = "thieu";
            tongSlLechThieu += slLech;
          } else if (kq.trangthai === "THUA") {
            trangthai_nhan = "thua";
            tongSlLechThua += slLech;
          }

          chiTietLech.push({
            masp,
            size,
            trangthai_nhan,
            sl_xuat: slXuat,
            sl_nhan: slNhap,
            sl_lech: slLech,
            chi_tiet: `${slNhap}/${slXuat}`
          });
        }
      } else {
        const keyTong = makeKey(masp, "0");
        const kq = ketQuaMap[keyTong];
        if (!kq || kq.trangthai === "OK") continue;

        const slNhap = normalizeNumber(tongNhapTheoMasp[masp] || 0);
        const slXuat = normalizeNumber(tongXuatTheoMasp[masp] || 0);
        const slLech = Math.abs(slNhap - slXuat);

        let trangthai_nhan = "lech";
        if (kq.trangthai === "THIEU") {
          trangthai_nhan = "thieu";
          tongSlLechThieu += slLech;
        } else if (kq.trangthai === "THUA") {
          trangthai_nhan = "thua";
          tongSlLechThua += slLech;
        }

        chiTietLech.push({
          masp,
          size: "0",
          trangthai_nhan,
          sl_xuat: slXuat,
          sl_nhan: slNhap,
          sl_lech: slLech,
          chi_tiet: `${slNhap}/${slXuat}`
        });
      }
    }

    return {
      tong_so_mat_hang: allMasps.length,
      tong_so_luong_xuat: tinhTongSoLuongTheoMap(xuatMap),
      tong_so_luong_nhan: tinhTongSoLuongTheoMap(nhapMap),
      so_ma_lech: chiTietLech.length,
      tong_sl_lech_thieu: tongSlLechThieu,
      tong_sl_lech_thua: tongSlLechThua,
      ket_qua_chung: chiTietLech.length > 0 ? "lech" : "ok",
      chiTietLech
    };
  }

  async function luuPhieuKiemNhapKho() {
    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      if (window.dangLuuKiemNhapKho) return;
      window.dangLuuKiemNhapKho = true;

      const sohdEl = byId("sohd");
      const ngayEl = byId("ngay");
      const tennvEl = byId("tennv");
      const ghichuEl = byId("ghichu_top");
      const hdStateEl = byId("hd_state");

      const so_hd_kiemnhap = String(sohdEl?.value || "").trim();
      const ngay_kiem = String(ngayEl?.value || "").trim();
      const nhanvienkiem = String(tennvEl?.value || "").trim();
      const ghi_chu = String(ghichuEl?.value || "").trim();

      if (!so_hd_kiemnhap) {
        alert("Chưa có số phiếu kiểm nhập.");
        sohdEl?.focus();
        return;
      }

      if (!ngay_kiem) {
        alert("Chưa có ngày kiểm.");
        ngayEl?.focus();
        return;
      }

      if (!nhanvienkiem) {
        alert("Chưa có nhân viên kiểm.");
        return;
      }

      const state = getState();

      if (!state.dsHoaDonNguon || state.dsHoaDonNguon.length === 0) {
        alert("Bạn chưa nạp hóa đơn nguồn.");
        return;
      }

      docLaiNhapTuBangHTML();
      kiemTraPhieu();

      const stateSauKiem = getState();

      if (!stateSauKiem.nhap || Object.keys(stateSauKiem.nhap).length === 0) {
        alert("Chưa có dữ liệu nhập để lưu.");
        return;
      }

      const thongTinTong = xayDungDuLieuTongVaChiTietLech();

      const sohdccn = (stateSauKiem.dsHoaDonNguon || []).join(" ; ");

      let nhanvienxuat = "";
      if (stateSauKiem.dsHoaDonNguon.length === 1) {
        nhanvienxuat = "";
      }

      const rowTong = {
        so_hd_kiemnhap,
        ngay_kiem,
        nhanvienkiem,
        sohdccn,
        nhanvienxuat,
        tu_co_so: CFG.fromBranch || "",
        den_co_so: CFG.toBranch || "",
        tong_so_mat_hang: thongTinTong.tong_so_mat_hang,
        tong_so_luong_xuat: thongTinTong.tong_so_luong_xuat,
        tong_so_luong_nhan: thongTinTong.tong_so_luong_nhan,
        so_ma_lech: thongTinTong.so_ma_lech,
        tong_sl_lech_thieu: thongTinTong.tong_sl_lech_thieu,
        tong_sl_lech_thua: thongTinTong.tong_sl_lech_thua,
        ket_qua_chung: thongTinTong.ket_qua_chung,
        ghi_chu
      };

      const { data: insertedTong, error: errTong } = await window.supabase
        .from("kiem_nhap_kho")
        .insert([rowTong])
        .select()
        .single();

      if (errTong) {
        console.error("[kiem_nhap_kho] insert tong error:", errTong);
        alert("Lỗi khi lưu bảng kiem_nhap_kho: " + (errTong.message || ""));
        return;
      }

      if (thongTinTong.chiTietLech.length > 0) {
        const rowsLech = thongTinTong.chiTietLech.map((row) => ({
          kiem_nhap_id: insertedTong.id,
          so_hd_kiemnhap,
          sohdccn,
          masp: row.masp,
          tenhang: "",
          size: row.size,
          trangthai_nhan: row.trangthai_nhan,
          sl_xuat: row.sl_xuat,
          sl_nhan: row.sl_nhan,
          sl_lech: row.sl_lech,
          chi_tiet: row.chi_tiet,
          ghi_chu: null
        }));

        const { error: errLech } = await window.supabase
          .from("kiem_nhap_kho_chitiet_lech")
          .insert(rowsLech);

        if (errLech) {
          console.error("[kiem_nhap_kho_chitiet_lech] insert error:", errLech);
          alert("Đã lưu bảng tổng nhưng lỗi khi lưu chi tiết lệch: " + (errLech.message || ""));
          return;
        }
      }

      if (hdStateEl) {
        hdStateEl.value = "xem";
        hdStateEl.setAttribute("data-state", "xem");
      }

      alert(`Đã lưu phiếu kiểm nhập: ${so_hd_kiemnhap}`);
    } catch (err) {
      console.error("[luuPhieuKiemNhapKho] exception:", err);
      alert("Có lỗi khi lưu dữ liệu kiểm nhập kho.");
    } finally {
      window.dangLuuKiemNhapKho = false;
    }
  }

  function bindButtons() {
    const btnThem = byId("them");
    if (btnThem) {
      btnThem.addEventListener("click", (e) => {
        e.preventDefault();
        resetPhieu();
      });
    }

    const btnNap1 = byId("btnNapHoaDonCCN");
    const btnNap2 = byId("btnNapHoaDonCCN_footer");
    [btnNap1, btnNap2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        napHoaDonNguonPlaceholder();
      });
    });

    const btnKiem1 = byId("btnKiemTraPhieu");
    const btnKiem2 = byId("btnKiemTraPhieu_footer");
    [btnKiem1, btnKiem2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        kiemTraPhieu();
      });
    });

    const btnLuu = byId("btn-luu");
    if (btnLuu) {
      btnLuu.addEventListener("click", async (e) => {
        e.preventDefault();
        await luuPhieuKiemNhapKho();
      });
    }
  }

  // =========================
  // API công khai
  // =========================
  window.NhapKiemKho = {
    resetPhieu,
    renderBangKetQua,
    kiemTraPhieu,
    themDongNhapBenTrai,
    getState,
    
    setXuatData(dataMap) {
  const state = getState();
  state.xuat = dataMap || {};
  state.ketQua = {}; // xóa kết quả kiểm cũ để kiểm tra lại từ đầu
  renderBangKetQua();
}
  };

  // =========================
  // INIT
  // =========================
  function init() {
    updateTitle();
    setDefaultBranchInfo();
    bindInputEvents();
    bindButtons();
    resetPhieu();
    console.log("[nhapkiemkho] init OK", CFG);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
