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
    state === "sua" ||
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true;

  const isSpecialByTMT = hinhthuctt === "tmt";
  const isSpecialByMod3 = sohdEl?.getAttribute("data-mod3") === "yes";

  // ✅ Chỉ hóa đơn MỚI mới được lưu 2 bản
  // ✅ Hóa đơn đang SỬA thì dù là TMT hay data-mod3=yes cũng KHÔNG lưu 2 bản
  const save2Ban = !isEdit && (isSpecialByTMT || isSpecialByMod3);

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
