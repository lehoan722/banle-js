// scripts/nhapkiemkho.js
(function () {
  "use strict";

  const CFG = window.KIEM_NHAP_CONFIG || {
    pageId: "kiemnhap_cs1",
    fromBranch: "cs2",
    toBranch: "cs1",

    soPhieuPrefix: "kiemnhap2v1cs1_",

    title: "KIỂM NHẬP KHO"
  };

  // =========================
  // STATE
  // =========================
  window.kiemNhapState = {
    nhap: {},
    xuat: {},
    ketQua: {},
    nhapOrder: [],
    xuatOrder: [],
    dsHoaDonNguon: [],
    dsHoaDonNguonInfo: [],
    selectedMasp: ""
  };

  let dangChonSizeTrongPopup = false;

  // =========================
  // HELPERS
  // =========================
  function byId(id) {
    return document.getElementById(id);
  }

  function focusInputAtEnd(el) {
    if (!el) return;
    el.focus();

    try {
      const len = String(el.value || "").length;
      el.setSelectionRange(len, len);
    } catch (err) { }
  }

  function normalizeMasp(v) {
    let s = String(v || "").trim().toUpperCase();

    // Nếu mã có hậu tố sau dấu "_" như REDLEO-DEN_43
    // thì chỉ lấy phần trước dấu "_"
    const idx = s.indexOf("_");
    if (idx > -1) {
      s = s.slice(0, idx).trim();
    }

    return s;
  }

  function normalizeSize(v) {
    return String(v || "").trim();
  }
  const VALID_SIZES = new Set(["0", "38", "39", "40", "41", "42", "43", "44", "45"]);

  function isValidSize(size) {
    return VALID_SIZES.has(normalizeSize(size));
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
      if (!isValidSize(size)) continue;
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

    if (!isValidSize(sizeVal)) {
      alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
      return;
    }

    const key = makeKey(masp, sizeVal);
    const state = getState();

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = { masp, size: sizeVal, sl };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
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

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size: "0",
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
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
        } catch (err) { }
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

  function formatDateTimeVN(input) {
    if (!input) return "";

    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "";

    const vn = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

    const yyyy = vn.getFullYear();
    const mm = String(vn.getMonth() + 1).padStart(2, "0");
    const dd = String(vn.getDate()).padStart(2, "0");
    const hh = String(vn.getHours()).padStart(2, "0");
    const mi = String(vn.getMinutes()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function getState() {
    return window.kiemNhapState;
  }

  async function layMapHoaDonDaKiem() {
    if (!window.supabase) return new Map();

    const { data, error } = await window.supabase
      .from("kiem_nhap_kho")
      .select("sohdccn, nhanvienkiem, created_at");

    if (error) {
      console.error("[KNK] layMapHoaDonDaKiem error:", error);
      return new Map();
    }

    const map = new Map();

    (data || []).forEach((row) => {
      const raw = String(row.sohdccn || "").trim();
      if (!raw) return;

      raw.split(";").forEach((item) => {
        const sohd = String(item || "").trim();
        if (!sohd) return;

        map.set(sohd, {
          nhanvienkiem: String(row.nhanvienkiem || "").trim(),
          created_at: row.created_at || null
        });
      });
    });

    return map;
  }

  async function taoSoPhieuMoi() {
    const prefix = String(CFG.soPhieuPrefix || "kiemnhap2v1cs1_").trim();

    if (!window.supabase) {
      return `${prefix}00001`;
    }

    const { data, error } = await window.supabase
      .from("kiem_nhap_kho")
      .select("so_hd_kiemnhap")
      .ilike("so_hd_kiemnhap", `${prefix}%`);

    if (error) {
      console.error("[KNK] taoSoPhieuMoi error:", error);
      return `${prefix}00001`;
    }

    let maxSo = 0;

    (data || []).forEach((row) => {
      const so = String(row.so_hd_kiemnhap || "").trim();
      if (!so.startsWith(prefix)) return;

      const tail = so.slice(prefix.length);
      const n = Number(tail);

      if (Number.isFinite(n) && n > maxSo) {
        maxSo = n;
      }
    });

    const next = String(maxSo + 1).padStart(5, "0");
    return `${prefix}${next}`;
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

  function ensureMaspAtTop(orderArr, masp) {
    const m = normalizeMasp(masp);
    if (!m) return Array.isArray(orderArr) ? orderArr : [];

    const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
    arr.unshift(m);
    return arr;
  }

  function ensureMaspAtEnd(orderArr, masp) {
    const m = normalizeMasp(masp);
    if (!m) return Array.isArray(orderArr) ? orderArr : [];

    const arr = Array.isArray(orderArr) ? orderArr.filter(x => normalizeMasp(x) !== m) : [];
    arr.push(m);
    return arr;
  }

  function buildOrderedMasps(nhapGroupMap, xuatGroupMap, state) {
    const nhapOrder = Array.isArray(state.nhapOrder) ? state.nhapOrder.map(normalizeMasp).filter(Boolean) : [];
    const xuatOrder = Array.isArray(state.xuatOrder) ? state.xuatOrder.map(normalizeMasp).filter(Boolean) : [];

    const allSet = new Set([
      ...Object.keys(nhapGroupMap || {}),
      ...Object.keys(xuatGroupMap || {})
    ]);

    const result = [];
    const pushed = new Set();

    const pushOne = (masp) => {
      const m = normalizeMasp(masp);
      if (!m) return;
      if (!allSet.has(m)) return;
      if (pushed.has(m)) return;
      pushed.add(m);
      result.push(m);
    };

    nhapOrder.forEach(pushOne);
    xuatOrder.forEach(pushOne);

    Array.from(allSet).forEach(pushOne);

    return result;
  }

  function getSortWeightByTrangThai(trangthai) {
    const tt = String(trangthai || "").trim().toUpperCase();
    if (tt === "THIEU") return 1;
    if (tt === "THUA") return 2;
    if (tt === "OK") return 3;
    return 4;
  }

  function sapXepLaiThuTuMaspTheoKetQua() {
    const state = getState();
    const nhapGroupMap = groupByMasp(state.nhap || {});
    const xuatGroupMap = groupByMasp(state.xuat || {});
    const ketQuaMap = state.ketQua || {};

    const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

    allMasps.sort((a, b) => {
      const kqA = buildKetQuaTheoMasp(nhapGroupMap[a], xuatGroupMap[a], ketQuaMap);
      const kqB = buildKetQuaTheoMasp(nhapGroupMap[b], xuatGroupMap[b], ketQuaMap);

      const wA = getSortWeightByTrangThai(kqA?.trangthai);
      const wB = getSortWeightByTrangThai(kqB?.trangthai);

      if (wA !== wB) return wA - wB;

      return String(a || "").localeCompare(String(b || ""), "vi");
    });

    state.nhapOrder = [...allMasps];
  }

  function tinhThongKeTheoMap(mapObj) {
    const maspSet = new Set();
    let tongSl = 0;

    Object.values(mapObj || {}).forEach((row) => {
      const masp = normalizeMasp(row?.masp);
      const sl = normalizeNumber(row?.sl || 0);

      if (!masp || sl <= 0) return;

      maspSet.add(masp);
      tongSl += sl;
    });

    return {
      soMa: maspSet.size,
      tongSl
    };
  }

  function capNhatThongKeDauTrang() {
    const el = byId("thongke_dautrang");
    if (!el) return;

    const state = getState();
    const tkNhap = tinhThongKeTheoMap(state.nhap || {});
    const tkXuat = tinhThongKeTheoMap(state.xuat || {});

    el.textContent = `Nhập: ${tkNhap.soMa}/${tkNhap.tongSl} , Xuất: ${tkXuat.soMa}/${tkXuat.tongSl}`;
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
    const masp = normalizeMasp(nhapGroup?.masp || xuatGroup?.masp || "");

    const allSizeKeys = new Set([
      ...((nhapGroup?.items || []).map(x => x.key)),
      ...((xuatGroup?.items || []).map(x => x.key))
    ]);

    const thieuParts = [];
    const thuaParts = [];
    let tongThieu = 0;
    let tongThua = 0;
    let hasOk = false;
    let hasAnyKetQua = false;

    for (const key of allSizeKeys) {
      const kq = ketQuaMap[key];
      if (!kq) continue;

      hasAnyKetQua = true;

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

    // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
    // Fallback cho trường hợp kiểm theo tổng hoặc nhập trống nhưng xuất có dữ liệu
    if (!hasAnyKetQua && masp) {
      const keyTong = makeKey(masp, "0");
      const kqTong = ketQuaMap[keyTong];

      if (kqTong) {
        const diff = normalizeNumber(kqTong.chitiet || 0);
        const tongNhap = tongSoLuong(nhapGroup?.items || []);
        const xuatItems = Array.isArray(xuatGroup?.items) ? xuatGroup.items : [];

        if (kqTong.trangthai === "THIEU") {
          // Nếu bên nhập trống hoàn toàn thì hiện chi tiết đúng theo toàn bộ size/sl của bên xuất
          if (tongNhap <= 0 && xuatItems.length > 0) {
            return {
              trangthai: "THIEU",
              chitiet: xuatItems.map(x => `${x.size}/${x.sl}`).join(" ")
            };
          }

          return {
            trangthai: "THIEU",
            chitiet: diff > 0 ? `0/${diff}` : ""
          };
        }

        if (kqTong.trangthai === "THUA") {
          return {
            trangthai: "THUA",
            chitiet: diff > 0 ? `0/${diff}` : ""
          };
        }

        if (kqTong.trangthai === "OK") {
          return { trangthai: "OK", chitiet: "" };
        }
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

    const allMasps = buildOrderedMasps(nhapGroupMap, xuatGroupMap, state);

    tbody.innerHTML = "";

    for (const masp of allMasps) {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);

      const tr = document.createElement("tr");
      const selectedMasp = normalizeMasp(state.selectedMasp || "");
      tr.dataset.masp = masp;
      if (selectedMasp && selectedMasp === masp) {
        tr.classList.add("row-selected");
      }
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

    capNhatThongKeDauTrang();
  }

  function docLaiNhapTuBangHTML() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const nhapMoi = {};
    const nhapOrderMoi = [];

    rows.forEach((tr) => {
      const tdMasp = tr.children[0];
      const tdSizeSl = tr.querySelector(".cell-nhap-sizesl");
      const tdTongSl = tr.querySelector(".cell-nhap-tongsl");

      const masp = normalizeMasp(tdMasp?.innerText || "");
      if (!masp) return;

      if (!nhapOrderMoi.includes(masp)) {
        nhapOrderMoi.push(masp);
      }

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
    state.nhapOrder = nhapOrderMoi;
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

    if (!isValidSize(size)) {
      alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
      if (sizeEl) sizeEl.focus();
      return;
    }

    if (sl <= 0) {
      alert("Số lượng phải lớn hơn 0.");
      slEl.focus();
      return;
    }

    const key = makeKey(masp, size);
    const state = getState();

    const isNewMasp = !Object.values(state.nhap || {}).some(r => normalizeMasp(r?.masp) === masp);

    if (!state.nhap[key]) {
      state.nhap[key] = {
        masp,
        size,
        sl
      };
    } else {
      state.nhap[key].sl = normalizeNumber(state.nhap[key].sl) + sl;
    }

    if (isNewMasp) {
      state.nhapOrder = ensureMaspAtTop(state.nhapOrder, masp);
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

            sizeEl.addEventListener("blur", () => {
              const v = normalizeSize(sizeEl.value);
              if (!v) return;

              if (!isValidSize(v)) {
                alert("Size không hợp lệ. Chỉ được nhập: 0, 38, 39, 40, 41, 42, 43, 44, 45");
                sizeEl.value = "";
                sizeEl.focus();
                return;
              }

              sizeEl.value = v;
            });
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
  async function resetPhieu() {
    window.kiemNhapState = {
      nhap: {},
      xuat: {},
      ketQua: {},
      nhapOrder: [],
      xuatOrder: [],
      dsHoaDonNguon: [],
      dsHoaDonNguonInfo: [],
      selectedMasp: ""
    };

    dangChonSizeTrongPopup = false;

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");
    const sohdEl = byId("sohd");
    const ghichuEl = byId("ghichu_top");

    if (maspEl) maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";
    if (sohdEl) sohdEl.value = await taoSoPhieuMoi();
    if (ghichuEl) ghichuEl.value = "";

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "moi";
      hdState.setAttribute("data-state", "moi");
    }

    renderBangKetQua();
    capNhatThongKeDauTrang();
    hideSizePopup();
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
    sapXepLaiThuTuMaspTheoKetQua();
    renderBangKetQua();
  }

  // =========================
  // NẠP HÓA ĐƠN NGUỒN
  // Bản đầu: chưa query thật, chỉ placeholder
  // =========================

  async function moPopupChonHoaDonNguon(dsHd, mapDaKiem = new Map()) {
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

      dsHd.forEach((hd) => {
        const sohd = String(hd.sohd || "").trim();
        const diadiem = String(hd.diadiem || "").trim();
        const ngayGio = formatDateTimeVN(hd.created_at || hd.ngay);

        const row = document.createElement("label");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "6px 4px";
        row.style.borderBottom = "1px solid #eee";
        row.style.cursor = "pointer";

        const infoDaKiem = mapDaKiem.get(sohd);
        const daKiem = !!infoDaKiem;
        const tenNguoiKiem = String(infoDaKiem?.nhanvienkiem || "").trim();

        row.innerHTML = `
          <input type="checkbox" class="chk-hd-nguon" value="${escapeHtml(sohd)}">
          <span>
            ${escapeHtml(sohd)} | ${escapeHtml(ngayGio)} | ${escapeHtml(diadiem)}
            ${daKiem ? `<b style="color:red; margin-left:8px;">[ĐÃ KIỂM]</b>` : ""}
            ${daKiem && tenNguoiKiem ? ` | <b style="color:#333;">${escapeHtml(tenNguoiKiem)}</b>` : ""}
          </span>
        `;

        if (daKiem) {
          row.style.background = "#fff3cd";
        }

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

  function layDanhSachMaspDangNhap() {
    const state = getState();
    const ds = Object.values(state.nhap || {})
      .map(r => normalizeMasp(r.masp))
      .filter(Boolean);

    return [...new Set(ds)];
  }

  function batDauNgay(dateObj) {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function truNgay(dateObj, soNgay) {
    const d = new Date(dateObj);
    d.setDate(d.getDate() - soNgay);
    return d;
  }

  function toIsoLocal(dateObj) {
    const d = new Date(dateObj);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  async function layHoaDonNguonUngVienTheoMasp(dsMaspNhap) {
    if (!window.supabase || !Array.isArray(dsMaspNhap) || !dsMaspNhap.length) {
      return { dsHd: [], ctRows: [] };
    }

    const prefixNguon = CFG.fromBranch === "cs2" ? "xcncs2_" : "xcncs1_";

    const now = new Date();
    const start = batDauNgay(truNgay(now, 1));
    const end = now;

    // 1) lấy các hóa đơn nguồn trong khoảng thời gian cho phép
    const { data: dsHd, error: errHd } = await window.supabase
      .from("hoadon_banle")
      .select("sohd, ngay, created_at, diadiem, tennv, manv")
      .ilike("sohd", `${prefixNguon}%`)
      .gte("created_at", toIsoLocal(start))
      .lte("created_at", toIsoLocal(end))
      .order("created_at", { ascending: false })
      .limit(300);

    if (errHd) {
      console.error("[KNK] layHoaDonNguonUngVienTheoMasp - dsHd error:", errHd);
      throw new Error("Lỗi khi lấy danh sách hóa đơn nguồn.");
    }

    if (!dsHd || !dsHd.length) {
      return { dsHd: [], ctRows: [] };
    }

    const dsSoHd = dsHd
      .map(x => String(x.sohd || "").trim())
      .filter(Boolean);

    if (!dsSoHd.length) {
      return { dsHd: [], ctRows: [] };
    }

    // 2) lấy toàn bộ chi tiết của các hóa đơn đó
    const { data: ctRows, error: errCt } = await window.supabase
      .from("ct_hoadon_banle")
      .select("sohd, masp, size, soluong")
      .in("sohd", dsSoHd)
      .order("id", { ascending: true });

    if (errCt) {
      console.error("[KNK] layHoaDonNguonUngVienTheoMasp - ctRows error:", errCt);
      throw new Error("Lỗi khi lấy chi tiết hóa đơn nguồn.");
    }

    return {
      dsHd: dsHd || [],
      ctRows: ctRows || []
    };
  }

  function tinhDeXuatHoaDonTheoMasp(dsHd, ctRows, dsMaspNhap, mapDaKiem = new Map()) {
    const setNhap = new Set((dsMaspNhap || []).map(normalizeMasp).filter(Boolean));
    const nhomCtTheoSoHd = {};

    (ctRows || []).forEach((row) => {
      const sohd = String(row.sohd || "").trim();
      if (!sohd) return;
      if (!nhomCtTheoSoHd[sohd]) nhomCtTheoSoHd[sohd] = [];
      nhomCtTheoSoHd[sohd].push(row);
    });

    const ketQua = [];

    (dsHd || []).forEach((hd) => {
      const sohd = String(hd.sohd || "").trim();
      if (!sohd) return;

      const infoDaKiem = mapDaKiem.get(sohd);
      if (infoDaKiem) return; // bỏ qua hóa đơn đã kiểm

      const rows = nhomCtTheoSoHd[sohd] || [];
      if (!rows.length) return;

      const maspTrongHoaDon = [...new Set(
        rows.map(r => normalizeMasp(r.masp)).filter(Boolean)
      )];

      const dsMaspTrung = maspTrongHoaDon.filter(masp => setNhap.has(masp));
      const soMaTrung = dsMaspTrung.length;
      if (soMaTrung <= 0) return;

      const tongMaNhap = setNhap.size || 1;
      const tongMaHoaDon = maspTrongHoaDon.length || 1;

      const tyLeTheoNhap = soMaTrung / tongMaNhap;
      const tyLeTheoHoaDon = soMaTrung / tongMaHoaDon;

      const createdAt = hd.created_at || hd.ngay || null;
      let diemThoiGian = 0;
      if (createdAt) {
        const t = new Date(createdAt).getTime();
        if (Number.isFinite(t)) {
          const ageHours = Math.max(0, (Date.now() - t) / 3600000);
          diemThoiGian = Math.max(0, 10 - Math.min(10, ageHours / 3));
        }
      }

      const score =
        soMaTrung * 10 +
        tyLeTheoNhap * 40 +
        tyLeTheoHoaDon * 40 +
        diemThoiGian;

      ketQua.push({
        sohd,
        ngay: hd.ngay || null,
        created_at: hd.created_at || null,
        diadiem: String(hd.diadiem || "").trim(),
        manv: String(hd.manv || "").trim(),
        tennv: String(hd.tennv || "").trim(),
        soMaTrung,
        tongMaNhap,
        tongMaHoaDon,
        tyLeTheoNhap,
        tyLeTheoHoaDon,
        score,
        dsMaspTrung,
        autoChecked:
          soMaTrung >= 2 ||
          tyLeTheoNhap >= 0.3 ||
          tyLeTheoHoaDon >= 0.5
      });
    });

    ketQua.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    return ketQua;
  }

  async function moPopupChonHoaDonNguonTheoMasp(dsDeXuat) {
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

      if (!dsDeXuat || !dsDeXuat.length) {
        box.innerHTML = `<div style="padding:10px; color:#b00020; font-weight:bold;">
          Không tìm thấy hóa đơn CCN phù hợp theo các mã sản phẩm đã nhập.
        </div>`;
      } else {
        dsDeXuat.forEach((hd) => {
          const row = document.createElement("label");
          row.style.display = "block";
          row.style.padding = "8px";
          row.style.borderBottom = "1px solid #eee";
          row.style.cursor = "pointer";

          const ngayGio = formatDateTimeVN(hd.created_at || hd.ngay);
          const dsMau = (hd.dsMaspTrung || []).slice(0, 6).join(", ");
          const checked = hd.autoChecked ? "checked" : "";

          row.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <input type="checkbox" class="chk-hd-nguon-theo-masp" value="${escapeHtml(hd.sohd)}" ${checked}>
              <div style="flex:1;">
                <div style="font-weight:bold; color:#003366;">
                  ${escapeHtml(hd.sohd)}
                </div>
                <div style="font-size:13px; color:#333; margin-top:2px;">
                  ${escapeHtml(ngayGio)} | ${escapeHtml(hd.diadiem || "")}
                </div>
                <div style="font-size:13px; margin-top:3px;">
                  Trùng: <b style="color:#c62828;">${hd.soMaTrung}</b> mã
                  | Theo nhập: <b>${Math.round((hd.tyLeTheoNhap || 0) * 100)}%</b>
                  | Theo HĐ: <b>${Math.round((hd.tyLeTheoHoaDon || 0) * 100)}%</b>
                  | Điểm: <b>${Number(hd.score || 0).toFixed(1)}</b>
                </div>
                <div style="font-size:12px; color:#555; margin-top:3px;">
                  Mã trùng: ${escapeHtml(dsMau || "(không có)")}
                </div>
              </div>
            </div>
          `;

          if (hd.autoChecked) {
            row.style.background = "#eef8ee";
          }

          box.appendChild(row);
        });
      }

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
          box.querySelectorAll(".chk-hd-nguon-theo-masp:checked")
        ).map(x => String(x.value || "").trim()).filter(Boolean);

        if (!checked.length) {
          alert("Vui lòng chọn ít nhất 1 hóa đơn.");
          return;
        }

        closePopup(checked);
      };
    });
  }

  async function napHoaDonNguonTheoMasp() {
    try {
      if (!window.supabase) {
        alert("Không tìm thấy kết nối Supabase.");
        return;
      }

      // đảm bảo state.nhap đang là dữ liệu mới nhất trên bảng
      if (typeof docLaiNhapTuBangHTML === "function") {
        docLaiNhapTuBangHTML();
      }

      const dsMaspNhap = layDanhSachMaspDangNhap();

      if (!dsMaspNhap.length) {
        alert("Bạn cần nhập dữ liệu kiểm bên trái trước rồi mới nạp CCN theo mã sản phẩm.");
        return;
      }

      const mapDaKiem = await layMapHoaDonDaKiem();
      const { dsHd, ctRows } = await layHoaDonNguonUngVienTheoMasp(dsMaspNhap);

      if (!dsHd.length || !ctRows.length) {
        alert("Không tìm thấy hóa đơn CCN phù hợp trong hôm qua và hôm nay.");
        return;
      }

      const dsDeXuat = tinhDeXuatHoaDonTheoMasp(dsHd, ctRows, dsMaspNhap, mapDaKiem);

      if (!dsDeXuat.length) {
        alert("Không tìm thấy hóa đơn CCN chưa kiểm nào có mã sản phẩm trùng với phần nhập.");
        return;
      }

      const dsSoHdChon = await moPopupChonHoaDonNguonTheoMasp(dsDeXuat);
      if (!dsSoHdChon || !dsSoHdChon.length) return;

      // lấy toàn bộ hóa đơn đã chọn, không chỉ lấy mã trùng
      const dsHoaDonNguonInfo = dsHd
        .filter(hd => dsSoHdChon.includes(String(hd.sohd || "").trim()))
        .map(hd => ({
          sohd: String(hd.sohd || "").trim(),
          ngay: hd.ngay || null,
          diadiem: hd.diadiem || "",
          manv: String(hd.manv || "").trim(),
          tennv: String(hd.tennv || "").trim()
        }));

      const ctRowsChon = (ctRows || []).filter(row =>
        dsSoHdChon.includes(String(row.sohd || "").trim())
      );

      if (!ctRowsChon.length) {
        alert("Các hóa đơn đã chọn không có chi tiết.");
        return;
      }

      const xuatMap = {};
      const xuatOrder = [];

      for (const row of ctRowsChon) {
        const masp = normalizeMasp(row.masp);
        const size = normalizeSize(row.size);
        const sl = normalizeNumber(row.soluong);

        if (!masp || !size || sl <= 0) continue;

        if (!xuatOrder.includes(masp)) {
          xuatOrder.push(masp);
        }

        const key = makeKey(masp, size);

        if (!xuatMap[key]) {
          xuatMap[key] = { masp, size, sl };
        } else {
          xuatMap[key].sl = normalizeNumber(xuatMap[key].sl) + sl;
        }
      }

      const state = getState();
      state.dsHoaDonNguon = dsSoHdChon;
      state.dsHoaDonNguonInfo = dsHoaDonNguonInfo;

      const ghichuEl = byId("ghichu_top");
      if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

      window.NhapKiemKho.setXuatData(xuatMap, xuatOrder);

      alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn theo mã sản phẩm.`);
    } catch (err) {
      console.error("[nhapkiemkho] napHoaDonNguonTheoMasp exception:", err);
      alert(err?.message || "Có lỗi khi nạp CCN theo mã sản phẩm.");
    }
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
        .select("sohd, ngay, created_at, diadiem, tennv, manv")
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

      const mapDaKiem = await layMapHoaDonDaKiem();
      const dsSoHdChon = await moPopupChonHoaDonNguon(dsHd, mapDaKiem);
      if (!dsSoHdChon || dsSoHdChon.length === 0) return;

      const dsHoaDonNguonInfo = dsHd
        .filter(hd => dsSoHdChon.includes(String(hd.sohd || "").trim()))
        .map(hd => ({
          sohd: String(hd.sohd || "").trim(),
          ngay: hd.ngay || null,
          diadiem: hd.diadiem || "",
          manv: String(hd.manv || "").trim(),
          tennv: String(hd.tennv || "").trim()
        }));

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
      const xuatOrder = [];

      for (const row of ctRows) {
        const masp = normalizeMasp(row.masp);
        const size = normalizeSize(row.size);
        const sl = normalizeNumber(row.soluong);

        if (!masp || !size || sl <= 0) continue;

        if (!xuatOrder.includes(masp)) {
          xuatOrder.push(masp);
        }

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
      state.dsHoaDonNguonInfo = dsHoaDonNguonInfo;

      const ghichuEl = byId("ghichu_top");
      if (ghichuEl) ghichuEl.value = dsSoHdChon.join(" ; ");

      window.NhapKiemKho.setXuatData(xuatMap, xuatOrder);

      alert(`Đã nạp ${dsSoHdChon.length} hóa đơn nguồn.`);
    } catch (err) {
      console.error("[nhapkiemkho] napHoaDonNguonPlaceholder exception:", err);
      alert("Có lỗi khi nạp hóa đơn nguồn.");
    }
  }

  function taoGhiChuPhieuChuyenTuKiemNhap() {
    const state = getState();
    const soHdKiemNhap = String(byId("sohd")?.value || "").trim();
    const dsNguon = (state.dsHoaDonNguon || []).join(" ; ");

    let note = `Phiếu được tạo từ nhập kiểm kho`;
    if (soHdKiemNhap) note += ` - ${soHdKiemNhap}`;
    if (dsNguon) note += ` | HĐ nguồn: ${dsNguon}`;

    return note;
  }

  // =========================
  // TAO PHIEU CCN2V1 TU HANG THUA
  // =========================
  function groupByMaspForTransfer(items) {
    const out = {};

    (items || []).forEach((row) => {
      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size);
      const sl = normalizeNumber(row.sl);

      if (!masp || !size || sl <= 0) return;

      if (!out[masp]) {
        out[masp] = {
          masp,
          items: []
        };
      }

      out[masp].items.push({
        size,
        sl
      });
    });

    return Object.values(out);
  }

  function layDanhSachHangThuaDeTaoCCN2V1() {
    const thongTinTong = xayDungDuLieuTongVaChiTietLech();
    const chiTietLech = thongTinTong?.chiTietLech || [];

    const rowsThua = chiTietLech
      .filter(row => String(row.trangthai_nhan || "").trim().toLowerCase() === "thua")
      .map(row => ({
        masp: normalizeMasp(row.masp),
        size: normalizeSize(row.size || "0"),
        sl: normalizeNumber(row.sl_lech || 0)
      }))
      .filter(row => row.masp && row.size && row.sl > 0);

    return groupByMaspForTransfer(rowsThua);
  }

  function layDanhSachHangThieuDeTaoCCN1V2() {
    const thongTinTong = xayDungDuLieuTongVaChiTietLech();
    const chiTietLech = thongTinTong?.chiTietLech || [];
    const state = getState();
    const xuatMap = state.xuat || {};

    const rowsThieu = [];

    chiTietLech.forEach((row) => {
      const trangthai = String(row.trangthai_nhan || "").trim().toLowerCase();
      if (trangthai !== "thieu") return;

      const masp = normalizeMasp(row.masp);
      const size = normalizeSize(row.size || "0");
      const sl = normalizeNumber(row.sl_lech || 0);

      if (!masp || sl <= 0) return;

      // Nếu đã có size thật thì dùng luôn
      if (size && size !== "0") {
        rowsThieu.push({
          masp,
          size,
          sl
        });
        return;
      }

      // Nếu size = 0, nghĩa là trường hợp nhập trống / kiểm tổng
      // -> bung ra toàn bộ size thật từ dữ liệu xuất nguồn của mã đó
      const xuatRowsTheoMasp = Object.values(xuatMap)
        .filter(r => normalizeMasp(r?.masp) === masp)
        .map(r => ({
          masp,
          size: normalizeSize(r?.size || "0"),
          sl: normalizeNumber(r?.sl || 0)
        }))
        .filter(r => r.masp && r.size && r.size !== "0" && r.sl > 0);

      if (xuatRowsTheoMasp.length > 0) {
        xuatRowsTheoMasp.forEach(r => rowsThieu.push(r));
        return;
      }

      // Nếu vẫn không có size thật thì mới giữ 0 như cũ
      rowsThieu.push({
        masp,
        size,
        sl
      });
    });

    return groupByMaspForTransfer(rowsThieu);
  }

  function taoPayloadCCN1V2TuKiemNhap() {
    const state = getState();
    const items = layDanhSachHangThieuDeTaoCCN1V2();

    if (!items || items.length === 0) return null;

    return {
      dir: "1v2",
      source: "kiem_nhap_kho",
      created_at: new Date().toISOString(),
      so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
      ds_hoa_don_nguon: state.dsHoaDonNguon || [],
      note: taoGhiChuPhieuChuyenTuKiemNhap(),
      items
    };
  }

  function moTrangCCN1V2TuHangThieu() {
    docLaiNhapTuBangHTML();
    kiemTraPhieu();

    const payload = taoPayloadCCN1V2TuKiemNhap();

    if (!payload) {
      alert("Không có mã sản phẩm thiếu để tạo phiếu CCN1V2.");
      return;
    }

    try {
      localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
    } catch (err) {
      console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
      alert("Không lưu được dữ liệu tạm để chuyển sang trang CCN1V2.");
      return;
    }

    const url = "https://banle-js.vercel.app/ccn1v2cs1.html";
    window.open(url, "_blank");

    // alert(`Đã tạo dữ liệu chuyển cho ${payload.items.length} mã hàng thiếu.`);
  }

  function taoPayloadCCN2V1TuKiemNhap() {
    const state = getState();
    const items = layDanhSachHangThuaDeTaoCCN2V1();

    if (!items || items.length === 0) return null;

    return {
      dir: "2v1",
      source: "kiem_nhap_kho",
      created_at: new Date().toISOString(),
      so_hd_kiemnhap: String(byId("sohd")?.value || "").trim(),
      ds_hoa_don_nguon: state.dsHoaDonNguon || [],
      note: taoGhiChuPhieuChuyenTuKiemNhap(),
      items
    };
  }

  function moTrangCCN2V1TuHangThua() {
    docLaiNhapTuBangHTML();
    kiemTraPhieu();

    const payload = taoPayloadCCN2V1TuKiemNhap();
    console.log("[KNK] payload CCN2V1 =", payload);

    if (!payload) {
      alert("Không có mã sản phẩm thừa để tạo phiếu CCN2V1.");
      return;
    }

    try {
      localStorage.setItem("ccn_prefill_payload", JSON.stringify(payload));
    } catch (err) {
      console.error("[KNK] Lỗi lưu ccn_prefill_payload:", err);
      alert("Không lưu được dữ liệu tạm để chuyển sang trang CCN2V1.");
      return;
    }

    const url = "https://banle-js.vercel.app/ccn2v1cs2.html";
    window.open(url, "_blank");

    // alert(`Đã tạo dữ liệu chuyển cho ${payload.items.length} mã hàng thừa.`);
  }

  // =========================
  // CHON DONG / COPY / PASTE / XOA DONG
  // =========================
  function chonDongTheoMasp(masp) {
    const state = getState();
    state.selectedMasp = normalizeMasp(masp);
    renderBangKetQua();
  }

  function bindRowSelection() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody || tbody.dataset.rowSelectBound === "1") return;

    tbody.dataset.rowSelectBound = "1";

    tbody.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;

      const masp = normalizeMasp(tr.dataset.masp || "");
      if (!masp) return;

      chonDongTheoMasp(masp);
    });
  }

  async function copyDuLieuNhap() {
    try {
      docLaiNhapTuBangHTML();

      const tbody = document.querySelector("#bangketqua tbody");
      if (!tbody) {
        alert("Không tìm thấy bảng kết quả.");
        return;
      }

      const rows = Array.from(tbody.querySelectorAll("tr"));
      if (rows.length === 0) {
        alert("Không có dữ liệu để copy.");
        return;
      }

      const lines = rows.map((tr) => {
        const col1 = String(tr.children[0]?.innerText || "").trim();

        // đổi toàn bộ xuống dòng trong ô Size/SL thành khoảng trắng
        const col2 = String(tr.children[1]?.innerText || "")
          .replace(/\r/g, "")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const col3 = String(tr.children[2]?.innerText || "").trim();

        return [col1, col2, col3].join("\t");
      }).filter(Boolean);

      const text = lines.join("\n");
      await navigator.clipboard.writeText(text);

      alert(`Đã copy ${lines.length} dòng dữ liệu phần nhập.`);
    } catch (err) {
      console.error("[KNK] copyDuLieuNhap error:", err);
      alert("Không copy được dữ liệu.");
    }
  }

  function parseClipboardToNhapMap(text) {
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    const nhapMoi = {};

    for (const line of lines) {
      const cols = line.split("\t");

      const masp = normalizeMasp(cols[0] || "");
      const sizeSlText = String(cols[1] || "").trim();
      const tongSlText = String(cols[2] || "").trim();

      if (!masp) continue;

      const items = parseSizeSlText(sizeSlText);
      const tongSl = normalizeNumber(tongSlText);

      if (hasRealSizeItems(items)) {
        items.forEach((item) => {
          const key = makeKey(masp, item.size);
          nhapMoi[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
        continue;
      }

      if (tongSl > 0) {
        const key = makeKey(masp, "0");
        nhapMoi[key] = {
          masp,
          size: "0",
          sl: tongSl
        };
      }
    }

    return nhapMoi;
  }

  async function pasteDuLieuNhap() {
    try {
      const text = await navigator.clipboard.readText();
      if (!String(text || "").trim()) {
        alert("Clipboard đang trống.");
        return;
      }

      const nhapMoi = parseClipboardToNhapMap(text);
      const soDong = Object.keys(nhapMoi).length;

      if (soDong === 0) {
        alert("Dữ liệu dán không hợp lệ.");
        return;
      }

      const ok = confirm("Dán dữ liệu sẽ thay toàn bộ phần nhập hiện tại. Bạn có muốn tiếp tục không?");
      if (!ok) return;

      const state = getState();
      state.nhap = nhapMoi;
      state.ketQua = {};
      state.selectedMasp = "";
      state.nhapOrder = [...new Set(Object.values(nhapMoi).map(x => normalizeMasp(x.masp)))];

      renderBangKetQua();
      alert(`Đã dán ${soDong} dòng dữ liệu nhập.`);
    } catch (err) {
      console.error("[KNK] pasteDuLieuNhap error:", err);
      alert("Không đọc được dữ liệu từ clipboard.");
    }
  }

  function xoaDongDangChon() {
    docLaiNhapTuBangHTML();

    const state = getState();
    const masp = normalizeMasp(state.selectedMasp || "");

    if (!masp) {
      alert("Bạn chưa chọn dòng cần xóa.");
      return;
    }

    // const ok = confirm(`Bạn có chắc muốn xóa dòng mã hàng: ${masp} ?`); 
    // if (!ok) return;

    Object.keys(state.nhap || {}).forEach((key) => {
      const row = state.nhap[key];
      if (normalizeMasp(row?.masp) === masp) {
        delete state.nhap[key];
      }
    });

    Object.keys(state.ketQua || {}).forEach((key) => {
      const info = splitKey(key);
      if (normalizeMasp(info.masp) === masp) {
        delete state.ketQua[key];
      }
    });

    state.selectedMasp = "";
    renderBangKetQua();

    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    if (maspEl) {
      maspEl.value = masp;
      maspEl.focus();

      setTimeout(() => {
        try {
          maspEl.select();
        } catch (err) { }
      }, 0);
    }

    if (sizeEl) sizeEl.value = "";
    if (slEl) slEl.value = "1";

    hideSizePopup();
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

  function buildChiTietHoaDonRows(kiemNhapId, so_hd_kiemnhap, sohdccn, ngay_kiem, nhanvienkiem) {
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

    const rows = [];

    allMasps.forEach((masp, index) => {
      const nhapGroup = nhapGroupMap[masp];
      const xuatGroup = xuatGroupMap[masp];

      const nhapText = formatSizeSl(nhapGroup?.items || []);
      const xuatText = formatSizeSl(xuatGroup?.items || []);

      const kqTong = buildKetQuaTheoMasp(nhapGroup, xuatGroup, ketQuaMap);

      const hasRealSizeNhap = (nhapGroup?.items || []).some(x => {
        const s = normalizeSize(x.size);
        return s && s !== "0";
      });

      rows.push({
        kiem_nhap_id: kiemNhapId,
        so_hd_kiemnhap,
        sohdccn,
        ngay_kiem,
        nhanvienkiem,
        sort_order: index + 1,

        masp_nhap: masp,
        size_sl_nhap: nhapText || "",
        tongsl_nhap: tongSoLuong(nhapGroup?.items || []) || 0,

        masp_xuat: masp,
        size_sl_xuat: xuatText || "",
        tongsl_xuat: tongSoLuong(xuatGroup?.items || []) || 0,

        trangthai: kqTong.trangthai || "",
        chitiet: kqTong.chitiet || "",

        masp_key: masp,
        che_do_kiem: hasRealSizeNhap ? "size" : "tong",
        ghi_chu: null
      });
    });

    return rows;
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

      const dsNhanVienXuat = Array.from(
        new Set(
          (stateSauKiem.dsHoaDonNguonInfo || [])
            .map(x => String(x.tennv || x.manv || "").trim())
            .filter(Boolean)
        )
      );

      const nhanvienxuat = dsNhanVienXuat.join(" ; ");

      const { data: tonTaiCu, error: errCheck } = await window.supabase
        .from("kiem_nhap_kho")
        .select("id, so_hd_kiemnhap")
        .eq("so_hd_kiemnhap", so_hd_kiemnhap)
        .maybeSingle();

      if (errCheck) {
        console.error("[kiem_nhap_kho] check ton tai error:", errCheck);
        alert("Lỗi khi kiểm tra phiếu đã tồn tại.");
        return;
      }

      if (tonTaiCu) {
        alert("Số phiếu kiểm nhập này đã được lưu rồi.");
        return;
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

      const rowsChiTietHoaDon = buildChiTietHoaDonRows(
        insertedTong.id,
        so_hd_kiemnhap,
        sohdccn,
        ngay_kiem,
        nhanvienkiem
      );

      if (rowsChiTietHoaDon.length > 0) {
        const { error: errChiTietHoaDon } = await window.supabase
          .from("kiem_nhap_kho_chi_tiet_hoa_don")
          .insert(rowsChiTietHoaDon);

        if (errChiTietHoaDon) {
          console.error("[kiem_nhap_kho_chi_tiet_hoa_don] insert error:", errChiTietHoaDon);
          alert("Đã lưu bảng tổng nhưng lỗi khi lưu chi tiết hóa đơn: " + (errChiTietHoaDon.message || ""));
          return;
        }
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

      alert(`Đã lưu phiếu kiểm nhập: ${so_hd_kiemnhap}`);
      await resetPhieu();

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
      btnThem.addEventListener("click", async (e) => {
        e.preventDefault();
        await resetPhieu();
      });
    }

    const btnNapTheoMasp1 = byId("btnNapHoaDonCCNTheoMasp");
    const btnNapTheoMasp2 = byId("btnNapHoaDonCCNTheoMasp_footer");
    [btnNapTheoMasp1, btnNapTheoMasp2].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        napHoaDonNguonTheoMasp();
      });
    });

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

    const btnTaoPhieuCCN2V1 = byId("btnTaoPhieuCCN2V1");
    if (btnTaoPhieuCCN2V1) {
      btnTaoPhieuCCN2V1.addEventListener("click", (e) => {
        e.preventDefault();
        moTrangCCN2V1TuHangThua();
      });
    }

    const btnTaoPhieuCCN1V2 = byId("btnTaoPhieuCCN1V2");
    if (btnTaoPhieuCCN1V2) {
      btnTaoPhieuCCN1V2.addEventListener("click", (e) => {
        e.preventDefault();
        moTrangCCN1V2TuHangThieu();
      });
    }

    const btnMoPhieuCu = byId("btnMoPhieuCu");
    if (btnMoPhieuCu) {
      btnMoPhieuCu.addEventListener("click", async () => {
        const sohd = prompt("Nhập số phiếu kiểm nhập cần mở:", byId("sohd")?.value || "");
        if (!sohd) return;
        await moLaiPhieuKiemNhapCu(sohd);
      });
    }

    const btnCopy = byId("btn-copy-nhap");
    if (btnCopy) {
      btnCopy.addEventListener("click", async (e) => {
        e.preventDefault();
        await copyDuLieuNhap();
      });
    }

    const btnPaste = byId("btn-paste-nhap");
    if (btnPaste) {
      btnPaste.addEventListener("click", async (e) => {
        e.preventDefault();
        await pasteDuLieuNhap();
      });
    }

    const btnSua = byId("sua");
    if (btnSua) {
      btnSua.addEventListener("click", (e) => {
        e.preventDefault();
        xoaDongDangChon();
      });
    }

    bindRowSelection();
  }

  async function moLaiPhieuKiemNhapCu(soHdKiemNhap) {
    if (!window.supabase) {
      alert("Không tìm thấy kết nối Supabase.");
      return;
    }

    const sohd = String(soHdKiemNhap || "").trim();
    if (!sohd) {
      alert("Chưa có số phiếu kiểm nhập.");
      return;
    }

    const { data: phieuTong, error: errTong } = await window.supabase
      .from("kiem_nhap_kho")
      .select("*")
      .eq("so_hd_kiemnhap", sohd)
      .maybeSingle();

    if (errTong) {
      console.error(errTong);
      alert("Lỗi khi đọc phiếu kiểm nhập.");
      return;
    }

    if (!phieuTong) {
      alert("Không tìm thấy phiếu kiểm nhập.");
      return;
    }

    const { data: rows, error: errRows } = await window.supabase
      .from("kiem_nhap_kho_chi_tiet_hoa_don")
      .select("*")
      .eq("so_hd_kiemnhap", sohd)
      .order("sort_order", { ascending: true });

    if (errRows) {
      console.error(errRows);
      alert("Lỗi khi đọc chi tiết hóa đơn.");
      return;
    }

    const state = getState();
    state.nhap = {};
    state.xuat = {};
    state.ketQua = {};
    state.nhapOrder = [];
    state.xuatOrder = [];
    state.dsHoaDonNguon = String(phieuTong.sohdccn || "")
      .split(";")
      .map(x => String(x || "").trim())
      .filter(Boolean);

    byId("sohd").value = phieuTong.so_hd_kiemnhap || "";
    byId("ngay").value = phieuTong.ngay_kiem || "";
    byId("ghichu_top").value = phieuTong.sohdccn || "";

    const tennvEl = byId("tennv");
    if (tennvEl) {
      tennvEl.value = phieuTong.nhanvienkiem || "";
    }

    const hdState = byId("hd_state");
    if (hdState) {
      hdState.value = "xem";
      hdState.setAttribute("data-state", "xem");
    }

    (rows || []).forEach((row) => {
      const masp = normalizeMasp(row.masp_key || row.masp_nhap || row.masp_xuat);
      if (masp) {
        if (!state.nhapOrder.includes(masp)) state.nhapOrder.push(masp);
        if (!state.xuatOrder.includes(masp)) state.xuatOrder.push(masp);
      }

      const nhapItems = parseSizeSlText(row.size_sl_nhap || "");
      if (nhapItems.length > 0) {
        nhapItems.forEach(item => {
          const key = makeKey(masp, item.size);
          state.nhap[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
      } else if (normalizeNumber(row.tongsl_nhap) > 0) {
        const key = makeKey(masp, "0");
        state.nhap[key] = {
          masp,
          size: "0",
          sl: normalizeNumber(row.tongsl_nhap)
        };
      }

      const xuatItems = parseSizeSlText(row.size_sl_xuat || "");
      if (xuatItems.length > 0) {
        xuatItems.forEach(item => {
          const key = makeKey(masp, item.size);
          state.xuat[key] = {
            masp,
            size: item.size,
            sl: item.sl
          };
        });
      } else if (normalizeNumber(row.tongsl_xuat) > 0) {
        const key = makeKey(masp, "0");
        state.xuat[key] = {
          masp,
          size: "0",
          sl: normalizeNumber(row.tongsl_xuat)
        };
      }
    });

    renderBangKetQua();
    kiemTraPhieu();
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
    moTrangCCN2V1TuHangThua,

    luuPhieuKiemNhapKho,
    copyDuLieuNhap,
    pasteDuLieuNhap,
    xoaDongDangChon,
    moTrangCCN1V2TuHangThieu,
    moLaiPhieuKiemNhapCu,

    setXuatData(dataMap, orderArr) {
      const state = getState();
      state.xuat = dataMap || {};
      state.xuatOrder = Array.isArray(orderArr) ? orderArr.map(normalizeMasp).filter(Boolean) : [];
      state.ketQua = {};
      renderBangKetQua();
    }
  };

  // =========================
  // INIT
  // =========================
  async function init() {
    updateTitle();
    setDefaultBranchInfo();
    bindInputEvents();
    bindButtons();
    await resetPhieu();
    console.log("[nhapkiemkho] init OK", CFG);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


