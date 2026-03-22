import {
  byId,
  getState,
  getBranchInfoFromPath
} from "./kiem_nhapkho.core.js";

import {
  bindInputEvents,
  bindRowSelection,
  copyDuLieuNhap,
  pasteDuLieuNhap,
  xoaDongDangChon,
  renderBangKetQua
} from "./kiem_nhapkho.ui.js";

import {
  resetPhieu,
  kiemTraPhieu,
  luuPhieuKiemNhapKho,
  moLaiPhieuKiemNhapCu,
  napHoaDonNguonPlaceholder,
  napHoaDonNguonTheoMasp,
  moTrangCCN1V2TuHangThieu,
  moTrangCCN2V1TuHangThua
} from "./kiem_nhapkho.data.js";

function updateTitle() {
  const state = getState();
  const titleEl = byId("page_title");
  if (titleEl && state.branchInfo?.title) {
    titleEl.textContent = state.branchInfo.title;
  }
}

function setDefaultBranchInfo() {
  const state = getState();
  state.branchInfo = getBranchInfoFromPath(location.pathname);
}

function bindButtons() {
  byId("btn_themmoi")?.addEventListener("click", () => {
    resetPhieu();
  });

  byId("btn_luu")?.addEventListener("click", async () => {
    await luuPhieuKiemNhapKho();
  });

  byId("btn_copy")?.addEventListener("click", async () => {
    await copyDuLieuNhap();
  });

  byId("btn_dan")?.addEventListener("click", async () => {
    await pasteDuLieuNhap();
  });

  byId("btn_sua")?.addEventListener("click", () => {
    xoaDongDangChon();
  });

  byId("btn_mophieucu")?.addEventListener("click", async () => {
    await moLaiPhieuKiemNhapCu();
  });

  byId("btn_napccn_theomasp")?.addEventListener("click", async () => {
    await napHoaDonNguonTheoMasp();
  });

  byId("btn_kiemtra")?.addEventListener("click", () => {
    kiemTraPhieu();
  });

  byId("btn_thua_ccn2v1")?.addEventListener("click", () => {
    moTrangCCN2V1TuHangThua();
  });

  byId("btn_thieu_ccn1v2")?.addEventListener("click", () => {
    moTrangCCN1V2TuHangThieu();
  });

  byId("btn_naphdccn")?.addEventListener("click", async () => {
    await napHoaDonNguonPlaceholder();
  });
}

function bindKeyboardShortcuts() {
  document.addEventListener("keydown", async (e) => {
    if (e.key === "F1") {
      e.preventDefault();
      resetPhieu();
      return;
    }

    if (e.key === "F2") {
      e.preventDefault();
      await luuPhieuKiemNhapKho();
      return;
    }

    if (e.key === "F3") {
      e.preventDefault();
      xoaDongDangChon();
      return;
    }

    if (e.key === "F5") {
      e.preventDefault();
      const slEl = byId("soluong");
      if (slEl) {
        slEl.focus();
        try { slEl.select(); } catch {}
      }
      return;
    }

    if (e.key === "F6") {
      e.preventDefault();
      const sizeEl = byId("size");
      if (sizeEl) {
        sizeEl.focus();
        try { sizeEl.select(); } catch {}
      }
      return;
    }

    if (e.key === "F11") {
      e.preventDefault();
      await moLaiPhieuKiemNhapCu();
    }
  });
}

async function init() {
  setDefaultBranchInfo();
  updateTitle();
  bindButtons();
  bindInputEvents();
  bindRowSelection();
  bindKeyboardShortcuts();
  resetPhieu();
  renderBangKetQua();

  try {
    await napHoaDonNguonPlaceholder();
  } catch (err) {
    console.error("init napHoaDonNguonPlaceholder error:", err);
  }
}

init();

window.NhapKiemKho = {
  resetPhieu,
  kiemTraPhieu,
  luuPhieuKiemNhapKho,
  moLaiPhieuKiemNhapCu,
  napHoaDonNguonTheoMasp,
  moTrangCCN1V2TuHangThieu,
  moTrangCCN2V1TuHangThua
};
