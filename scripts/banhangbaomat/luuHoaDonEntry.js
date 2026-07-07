// scripts/banhangbaomat/luuHoaDonEntry.js

import { taoDuLieuLuuBaoMat } from "./taoDuLieuLuu.js";
import { guiDuLieuLuuBaoMat } from "./dichVuLuuHoaDon.js";
import { xuLyKetQuaLuuBaoMat } from "./xuLyKetQuaLuu.js";
import { inHoaDonBaoMat } from "./inHoaDonBaoMat.js";
import { guiHoaDonViettel } from "../viettelInvoice.js";
import { getBangKetQua } from "../hoadon.js";
import { capNhatThongTinTong } from "../utils.js";
import { getLoaiFromSoHDInput } from "../luuhoadon/builders.js";
import { calcTongThanhTienFromBangKetQua } from "../luuhoadon/pricing.js";
import { validateKhachHangBatBuoc } from "../services/validateKhachHangTichDiem.js";

let dangLuuBaoMat = false;

function getInput(id) {
  return document.getElementById(id);
}

function getText(id) {
  return getInput(id)?.value?.trim?.() || "";
}

function getIntValue(id) {
  return parseInt((getInput(id)?.value || "").replace(/[^\d-]/g, "") || "0", 10) || 0;
}

function apDungGiamDiemVaoThanhToan() {
  const tongHang = calcTongThanhTienFromBangKetQua(getBangKetQua());
  const chietKhau = getIntValue("chietkhau");
  const tienDoiDiem = getIntValue("tien_doi_diem");
  const phaiTra = Math.max(0, tongHang - chietKhau - tienDoiDiem);

  if (getInput("phaithanhtoan")) getInput("phaithanhtoan").value = phaiTra.toLocaleString("vi-VN");
  if (getInput("khachtra")) getInput("khachtra").value = phaiTra.toLocaleString("vi-VN");
  if (getInput("conlai")) getInput("conlai").value = "0";

  return phaiTra;
}

async function validateBeforeSecureSave() {
  capNhatThongTinTong(getBangKetQua());
  apDungGiamDiemVaoThanhToan();

  const maspChuaNhap = getText("masp");
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
    getInput("masp")?.focus();
    return false;
  }

  if (!getText("sohd")) {
    alert("❌ Chưa có số hóa đơn.");
    return false;
  }

  if (!getText("tennv")) {
    alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");
    return false;
  }

  const manvGuard = (getText("manv") || localStorage.getItem("manv") || "").trim();
  const isAdminLogin = localStorage.getItem("is_admin") === "true";

  if (!manvGuard) {
    alert("❌ Lỗi xác định nhân viên. Vui lòng đăng nhập lại.");
    return false;
  }

  if (manvGuard.toUpperCase() === "ADMIN" && !isAdminLogin) {
    alert("❌ Tài khoản ADMIN chưa xác thực đúng quyền.");
    return false;
  }

  const hdState = (getText("hd_state") || "moi").toLowerCase();
  const isEditReal = window.HD_CTX?.mode === "EDIT" || window.choPhepSua === true;

  if (hdState === "xem" && !isEditReal) {
    if (typeof window.moPopupXacThucSua === "function") {
      window.moPopupXacThucSua();
    } else {
      alert("❌ Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.");
    }
    return false;
  }

  const loai = getLoaiFromSoHDInput() || getText("sohd").toLowerCase().split("_")[0] || "";
  const okKh = await validateKhachHangBatBuoc(loai);
  if (!okKh) return false;

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("❌ Không có dữ liệu để lưu.");
    return false;
  }

  const isTmt = getText("hinhthuctt").toLowerCase() === "tmt";
  const isToDo = getInput("sohd")?.getAttribute("data-mod3") === "yes";

  if (isTmt || isToDo) {
    const ok = confirm("Bạn có chắc chắn muốn lưu hóa đơn này?\nHóa đơn này có thể được gửi hóa đơn điện tử.");
    if (!ok) return false;
  }

  return true;
}

export async function luuHoaDonBaoMat() {
  if (dangLuuBaoMat) {
    console.warn("[BAO MAT] Đang có yêu cầu lưu.");
    return;
  }

  dangLuuBaoMat = true;

  const okValidate = await validateBeforeSecureSave();
  if (!okValidate) {
    dangLuuBaoMat = false;
    return { ok: false, reason: "VALIDATE_BEFORE_SAVE_FAILED" };
  }

  try {
    console.log("[BAO MAT] BAT DAU TEST");

    const payload = taoDuLieuLuuBaoMat();

    console.log("[BAO MAT] PAYLOAD:", payload);

    const result = await guiDuLieuLuuBaoMat(payload);

    const ketQuaDaXuLy = xuLyKetQuaLuuBaoMat(result);

    if (
      ketQuaDaXuLy?.ok &&
      (
        ketQuaDaXuLy?.mode === "SAVE_REAL_V1" ||
        ketQuaDaXuLy?.mode === "EDIT_REAL_V1"
      )
    ) {
      inHoaDonBaoMat(ketQuaDaXuLy, payload);

      if (
        ketQuaDaXuLy?.external_send === true &&
        ketQuaDaXuLy?.sohd
      ) {
        try {
          const sendResult = await guiHoaDonViettel(ketQuaDaXuLy.sohd);

          await window.supabase.rpc("rpc_mark_external_send_result", {
            p_sohd: ketQuaDaXuLy.sohd,
            p_ok: true,
            p_message: "sent",
            p_invoice_no: sendResult?.invoiceNo || sendResult?.invoice_no || null
          });

        } catch (e) {
          console.error("[BAO MAT] Gửi tác vụ ngoài thất bại:", e);

          await window.supabase.rpc("rpc_mark_external_send_result", {
            p_sohd: ketQuaDaXuLy.sohd,
            p_ok: false,
            p_message: String(e?.message || e || "send_error"),
            p_invoice_no: null
          });

          alert("⚠️ Đã lưu hóa đơn nhưng gửi hóa đơn điện tử thất bại. Có thể gửi lại sau.");
        }
      }

      setTimeout(() => {
        document.getElementById("them")?.click();
      }, 500);
    }

    console.log("[BAO MAT] TEST HOAN TAT");

    return ketQuaDaXuLy;
  } catch (error) {
    console.error("[BAO MAT] TEST THAT BAI:", error);

    alert(
      "TEST BẢO MẬT THẤT BẠI\n\n" +
      String(error?.message || error)
    );
  } finally {
    dangLuuBaoMat = false;
  }
}

window.luuHoaDonBaoMat = luuHoaDonBaoMat;
window.testLuuHoaDonBaoMat = luuHoaDonBaoMat;
