// scripts/services/hoadonContext.js

import { getBangKetQua } from './hoadon.js';

export async function buildContext() {
  const bangKetQua = getBangKetQua();

  const sohd = document.getElementById("sohd")?.value?.trim();
  const ngay = document.getElementById("ngay")?.value;
  const diadiem = document.getElementById("diadiem")?.value;
  const state = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  return {
    bangKetQua,
    sohd,
    ngay,
    diadiem,
    hinhthuctt,

    isEdit: state === "sua" || window.HD_CTX?.mode === "EDIT" || window.choPhepSua === true,
    isView: state === "xem",
    isNew: state === "moi",

    isCCN: checkIsCCN(),
    isNhap: checkIsNhap(),

    // ✅ lấy trực tiếp từ UI, không phụ thuộc window.save2Ban nữa
    save2Ban: hinhthuctt === "tmt"
  };
}

function checkIsCCN() {
  const p = location.pathname.toLowerCase();
  return p.includes("ccn");
}

function checkIsNhap() {
  const p = location.pathname.toLowerCase();
  return p.includes("nhap") || p.includes("doitra");
}
