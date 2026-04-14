import { getBangKetQua } from '../hoadon.js';

export async function buildContext() {
  const bangKetQua = getBangKetQua();

  const sohdEl = document.getElementById("sohd");
  const sohd = sohdEl?.value?.trim();
  const ngay = document.getElementById("ngay")?.value;
  const diadiem = document.getElementById("diadiem")?.value;
  const state = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  const isSpecialByTMT = hinhthuctt === "tmt";
  const isSpecialByMod3 = sohdEl?.getAttribute("data-mod3") === "yes";
  const save2Ban = isSpecialByTMT || isSpecialByMod3;

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

    isSpecialByTMT,
    isSpecialByMod3,
    save2Ban
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
