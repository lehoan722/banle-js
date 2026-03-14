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
  function renderBangKetQua() {
    const tbody = document.querySelector("#bangketqua tbody");
    if (!tbody) return;

    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQuaMap = state.ketQua || {};

    const allKeys = Array.from(
      new Set([
        ...Object.keys(nhapMap),
        ...Object.keys(xuatMap),
        ...Object.keys(ketQuaMap)
      ])
    ).sort();

    tbody.innerHTML = "";

    for (const key of allKeys) {
      const nhap = nhapMap[key] || {};
      const xuat = xuatMap[key] || {};
      const kq = ketQuaMap[key] || {};

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(nhap.masp || "")}</td>
        <td contenteditable="true" class="cell-size-nhap" data-key="${escapeHtml(key)}">${escapeHtml(nhap.size || "")}</td>
        <td contenteditable="true" class="cell-sl-nhap" data-key="${escapeHtml(key)}">${nhap.sl ?? ""}</td>

        <td>${escapeHtml(xuat.masp || "")}</td>
        <td>${escapeHtml(xuat.size || "")}</td>
        <td>${xuat.sl ?? ""}</td>

        <td>${escapeHtml(kq.trangthai || "")}</td>
        <td>${escapeHtml(kq.chitiet || "")}</td>
      `;
      tbody.appendChild(tr);
    }
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

    if (sl <= 0) {
      alert("Số lượng phải lớn hơn 0.");
      slEl.focus();
      return;
    }

    const state = getState();

    if (!state.nhap[masp]) {
      state.nhap[masp] = {
        masp,
        size,
        sl
      };
    } else {
      state.nhap[masp].sl = normalizeNumber(state.nhap[masp].sl) + sl;
      if (size) state.nhap[masp].size = size;
    }

    // Nếu đã từng có kết quả kiểm tra cho mã này thì xóa để tránh hiểu nhầm
    delete state.ketQua[masp];

    renderBangKetQua();

    maspEl.value = "";
    if (sizeEl) sizeEl.value = "";
    slEl.value = "1";
    maspEl.focus();
  }

  function bindInputEvents() {
    const maspEl = byId("masp");
    const sizeEl = byId("size");
    const slEl = byId("soluong");

    [maspEl, sizeEl, slEl].forEach((el) => {
      if (!el) return;
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          themDongNhapBenTrai();
        }
      });
    });

    document.addEventListener("input", (e) => {
      const target = e.target;
      if (!target) return;

      const state = getState();

      if (target.classList.contains("cell-size-nhap")) {
        const key = target.dataset.key;
        if (key && state.nhap[key]) {
          state.nhap[key].size = normalizeSize(target.innerText);
        }
      }

      if (target.classList.contains("cell-sl-nhap")) {
        const key = target.dataset.key;
        if (key && state.nhap[key]) {
          state.nhap[key].sl = normalizeNumber(target.innerText);
        }
      }
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
    const state = getState();
    const nhapMap = state.nhap || {};
    const xuatMap = state.xuat || {};
    const ketQua = {};

    const allKeys = Array.from(
      new Set([...Object.keys(nhapMap), ...Object.keys(xuatMap)])
    );

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

    state.ketQua = ketQua;
    renderBangKetQua();
  }

  // =========================
  // NẠP HÓA ĐƠN NGUỒN
  // Bản đầu: chưa query thật, chỉ placeholder
  // =========================
  function napHoaDonNguonPlaceholder() {
    alert("Bước tiếp theo tôi sẽ nối popup chọn hóa đơn CCN và nạp dữ liệu nguồn vào cột XUẤT.");
  }

  // =========================
  // BUTTONS
  // =========================
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
      window.kiemNhapState.xuat = dataMap || {};
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