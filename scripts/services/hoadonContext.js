// scripts/services/hoadonContext.js

import { getBangKetQua } from '../hoadon.js';

export async function buildContext() {
  const bangKetQua = getBangKetQua();

  const sohd = document.getElementById("sohd")?.value?.trim();
  const ngay = document.getElementById("ngay")?.value;
  const diadiem = document.getElementById("diadiem")?.value;

  const state = document.getElementById("hd_state")?.value || "moi";

  return {
    bangKetQua,
    sohd,
    ngay,
    diadiem,

    isEdit: state === "sua",
    isView: state === "xem",
    isNew: state === "moi",

    isCCN: checkIsCCN(),
    isNhap: checkIsNhap(),

    save2Ban: window.save2Ban === true
  };
}

// ===== helper =====

function checkIsCCN() {
  const p = location.pathname.toLowerCase();
  return p.includes("ccn");
}

function checkIsNhap() {
  const p = location.pathname.toLowerCase();
  return p.includes("nhap") || p.includes("doitra");
}