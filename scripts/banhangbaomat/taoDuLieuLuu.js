// scripts/banhangbaomat/taoDuLieuLuu.js

import { getBangKetQua } from "../hoadon.js";

function taoRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;

      return v.toString(16);
    }
  );
}

function getInput(id) {
  return document.getElementById(id);
}

function getText(id) {
  return String(
    getInput(id)?.value ?? ""
  ).trim();
}

function getIntValue(id) {
  return (
    parseInt(
      String(getInput(id)?.value || "")
        .replace(/[^\d-]/g, "") || "0",
      10
    ) || 0
  );
}

function getMakhSafe() {
  return (
    getText("makh") ||
    getText("maKhach") ||
    getText("ma_khach") ||
    document
      .querySelector('input[placeholder="mã khách"]')
      ?.value
      ?.trim?.() ||
    ""
  );
}

function tinhTongThanhTien(bangKetQua) {
  let tong = 0;

  Object.values(bangKetQua || {}).forEach((item) => {
    const gia = Number(item.gia || 0);
    const km = Number(item.km || 0);

    (item.sizes || []).forEach((size, index) => {
      const soluong = Number(
        item.soluongs?.[index] || 0
      );

      if (!soluong) return;

      tong += (gia - km) * soluong;
    });
  });

  return tong;
}

function taoChiTiet(bangKetQua) {
  const rows = [];

  Object.values(bangKetQua || {}).forEach((item) => {
    (item.sizes || []).forEach((size, index) => {
      const soluong = Number(
        item.soluongs?.[index] || 0
      );

      if (!soluong) return;

      const gia = Number(item.gia || 0);
      const km = Number(item.km || 0);

      rows.push({
        masp: String(item.masp || "").trim(),
        tensp: String(item.tensp || "").trim(),

        size: String(size ?? "").trim(),

        soluong,

        gia,
        km,

        thanhtien: (gia - km) * soluong,

        dvt: String(item.dvt || "").trim()
      });
    });
  });

  return rows;
}

function xacDinhLoaiHoaDon(sohd) {
  return String(sohd || "")
    .trim()
    .toLowerCase()
    .split("_")[0] || "";
}

export function taoDuLieuLuuBaoMat() {
  const requestId = taoRequestId();

  const bangKetQua = getBangKetQua() || {};

  const sohd = getText("sohd");

  const hdState = (
    getText("hd_state") || "moi"
  ).toLowerCase();

  const hinhthuctt = getText("hinhthuctt");

  const sohdEl = getInput("sohd");

  const isEdit =
    hdState === "sua" ||
    hdState === "xem" ||
    window.HD_CTX?.mode === "EDIT";

  const isSpecialByTMT =
    hinhthuctt === "tmt";

  const isSpecialByMod3 =
    sohdEl?.getAttribute("data-mod3") === "yes";

  const save2Ban =
    !isEdit &&
    (
      isSpecialByTMT ||
      isSpecialByMod3
    );

  const tongThanhTien =
    tinhTongThanhTien(bangKetQua);

  const chietKhau =
    getIntValue("chietkhau");

  const tienDoiDiem =
    getIntValue("tien_doi_diem");

  const thanhToan = Math.max(
    0,
    tongThanhTien -
      chietKhau -
      tienDoiDiem
  );

  const details =
    taoChiTiet(bangKetQua);

  return {
    request_id: requestId,

    source_page:
      window.location.pathname,

    client_mode:
      "SECURE_SHADOW_V1",

    action:
      isEdit ? "EDIT" : "NEW",

    invoice: {
      sohd,

      ngay: getText("ngay"),

      diadiem: getText("diadiem"),

      manv: getText("manv"),

      tennv: getText("tennv"),

      khachhang:
        getText("khachhang"),

      makh:
        getMakhSafe() || null,

      tongsl:
        getIntValue("tongsl"),

      tongthanhtien:
        tongThanhTien,

      tongkm:
        getIntValue("tongkm"),

      chietkhau:
        chietKhau,

      diem_tru:
        Number(
          getInput("diem_tru")?.value || 0
        ) || 0,

      tien_doi_diem:
        tienDoiDiem,

      thanhtoan:
        thanhToan,

      hinhthuctt,

      ghichu:
        getText("ghichu"),

      loai:
        xacDinhLoaiHoaDon(sohd)
    },

    details,

    flags: {
      is_edit:
        isEdit,

      is_special_tmt:
        isSpecialByTMT,

      is_special_mod3:
        isSpecialByMod3,

      save_2_ban:
        save2Ban
    },

    test_info: {
      created_at_client:
        new Date().toISOString(),

      detail_count:
        details.length
    }
  };
}
