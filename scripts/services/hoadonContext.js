import { getBangKetQua } from '../hoadon.js';

export async function buildContext() {
  const bangKetQua = getBangKetQua();

  const sohdEl = document.getElementById("sohd");
  const sohd = sohdEl?.value?.trim();
  const ngay = document.getElementById("ngay")?.value;
  const diadiem = document.getElementById("diadiem")?.value;
  const state = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  const isEdit =
    state === "xem" ||
    window.HD_CTX?.mode === "EDIT";

  const isSpecialByTMT = hinhthuctt === "tmt";
  const isSpecialByMod3 = sohdEl?.getAttribute("data-mod3") === "yes";

  const loaiSohd = (sohd || "").split("_")[0].toLowerCase();
  const isBanCs1 = loaiSohd === "bancs1";
  const isBanCs2 = loaiSohd === "bancs2";

  // ✅ TẠM NGỪNG luồng hóa đơn đặc biệt của CS1
  // - CS1: luôn không lưu 2 bản
  // - CS2: vẫn giữ logic cũ
  // - Hóa đơn sửa: vẫn không lưu 2 bản như cũ
  const save2Ban =
    !isEdit &&
    isBanCs2 &&
    (isSpecialByTMT || isSpecialByMod3);

  return {
    bangKetQua,
    sohd,
    ngay,
    diadiem,
    hinhthuctt,

    isEdit,
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
