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
import { emitInventoryChangedByBangKetQua } from "../services/inventoryEvents.js";
import { capNhatUsedTuVanSauKhiLuuCT } from "../luuhoadon/api.js";

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

  const hdState2 = (getText("hd_state") || "moi").toLowerCase();
  const isEditInvoice =
    hdState2 === "sua" ||
    window.HD_CTX?.mode === "EDIT" ||
    window.__xacNhanSuaBaoMat_OK === true;

  const isTmt = getText("hinhthuctt").toLowerCase() === "tmt";
  const isToDo = getInput("sohd")?.getAttribute("data-mod3") === "yes";

  if (!isEditInvoice && (isTmt || isToDo)) {
    const ok = confirm("Bạn có chắc chắn muốn lưu hóa đơn này?\nHóa đơn này có thể được gửi hóa đơn điện tử.");
    if (!ok) return false;
  }
  return true;
}

function layLoaiHoaDonSauLuu(ketQuaDaXuLy, payload) {
  const sohd = String(
    ketQuaDaXuLy?.sohd ||
    payload?.sohd ||
    ""
  ).trim().toLowerCase();

  return sohd.split("_")[0] || "";
}

function layDiaDiemSauLuu(loai, payload) {
  return (
    payload?.diadiem ||
    (String(loai).includes("cs2") ? "cs2" : "cs1")
  );
}

function layChiTietSauLuu(payload) {
  if (Array.isArray(payload?.chitiet)) {
    return payload.chitiet;
  }

  if (Array.isArray(payload?.chi_tiet)) {
    return payload.chi_tiet;
  }

  if (Array.isArray(payload?.details)) {
    return payload.details;
  }

  return [];
}

function laTrangNhapXuatKiem(loai, sohd) {
  const path = String(window.location.pathname || "").toLowerCase();
  const l = String(loai || "").toLowerCase();
  const s = String(sohd || "").toLowerCase();

  return (
    path.includes("nhapkiemcs1") ||
    path.includes("nhapkiemcs2") ||
    path.includes("xuatkiemcs1") ||
    path.includes("xuatkiemcs2") ||

    l.startsWith("nhapkiemcs1") ||
    l.startsWith("nhapkiemcs2") ||
    l.startsWith("xuatkiemcs1") ||
    l.startsWith("xuatkiemcs2") ||

    s.startsWith("nhapkiemcs1_") ||
    s.startsWith("nhapkiemcs2_") ||
    s.startsWith("xuatkiemcs1_") ||
    s.startsWith("xuatkiemcs2_")
  );
}

async function markKiemTonLoiThoiSauNhapXuat(
  sohd,
  loai,
  diadiem,
  bangKetQua
) {
  try {
    if (!laTrangNhapXuatKiem(loai, sohd)) return;

    const dsMasp = Array.from(
      new Set(
        Object.values(bangKetQua || {})
          .map(x => String(x.masp || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (!dsMasp.length) return;

    const { data, error } = await window.supabase.rpc(
      "rpc_mark_ct_kiem_ton_loi_thoi_by_masp",
      {
        p_diadiem: diadiem,
        p_ds_masp: dsMasp,
        p_nguon: sohd
      }
    );

    if (error) {
      console.error("[BAO MAT] mark kiểm tồn lỗi:", error);
    } else {
      console.log("[BAO MAT] Đã đánh dấu kiểm tồn lỗi thời:", data);
    }
  } catch (e) {
    console.error("[BAO MAT] lỗi mark kiểm tồn:", e);
  }
}

async function xuLyNghiepVuSauLuuBaoMat(
  ketQuaDaXuLy,
  payload
) {
  const sohd = ketQuaDaXuLy?.sohd;

  if (!sohd) {
    console.warn("[BAO MAT] Không có sohd để chạy nghiệp vụ sau lưu.");
    return;
  }

  const loai = layLoaiHoaDonSauLuu(
    ketQuaDaXuLy,
    payload
  );

  const diadiem = layDiaDiemSauLuu(
    loai,
    payload
  );

  const bangKetQua = getBangKetQua();

  const chitiet = layChiTietSauLuu(payload);

  console.log("[BAO MAT] BẮT ĐẦU NGHIỆP VỤ SAU LƯU", {
    sohd,
    loai,
    diadiem,
    soDongChiTiet: chitiet.length
  });

  try {
    if (chitiet.length) {
      await capNhatUsedTuVanSauKhiLuuCT(
        chitiet,
        loai,
        diadiem
      );
    }
  } catch (e) {
    console.error(
      "[BAO MAT] capNhatUsedTuVanSauKhiLuuCT lỗi:",
      e
    );
  }

  await markKiemTonLoiThoiSauNhapXuat(
    sohd,
    loai,
    diadiem,
    bangKetQua
  );

  try {
    emitInventoryChangedByBangKetQua(
      bangKetQua,
      {
        source: "hoadon_secure_save",
        sohd,
        loai,
        diadiem,
        manv:
          payload?.manv ||
          document.getElementById("manv")?.value ||
          ""
      }
    );
  } catch (e) {
    console.error(
      "[BAO MAT] emit tồn kho lỗi:",
      e
    );
  }

  console.log(
    "[BAO MAT] HOÀN TẤT NGHIỆP VỤ SAU LƯU"
  );
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


    const result = await guiDuLieuLuuBaoMat(payload);

    const ketQuaDaXuLy = xuLyKetQuaLuuBaoMat(result);

    if (
      ketQuaDaXuLy?.ok &&
      (
        ketQuaDaXuLy?.mode === "SAVE_REAL_V1" ||
        ketQuaDaXuLy?.mode === "EDIT_REAL_V1"
      )
    ) {
      await xuLyNghiepVuSauLuuBaoMat(
        ketQuaDaXuLy,
        payload
      );

      const pointResult =
        ketQuaDaXuLy?.point_result?.new_process ||
        ketQuaDaXuLy?.point_result ||
        null;

      if (pointResult?.ok) {
        const diemEl = document.getElementById("diem_hientai");
        const hangEl = document.getElementById("hang_khach");

        if (diemEl && pointResult.diem_sau != null) {
          diemEl.value = pointResult.diem_sau;
        }

        if (hangEl && pointResult.hang_khach != null) {
          hangEl.value = pointResult.hang_khach;
        }

        console.log(
          "[BAO MAT] Điểm khách hàng đã được RPC xử lý:",
          pointResult
        );
      }

      inHoaDonBaoMat(ketQuaDaXuLy, payload);

      if (
        ketQuaDaXuLy?.mode === "SAVE_REAL_V1" &&
        ketQuaDaXuLy?.external_send === true &&
        ketQuaDaXuLy?.sohd
      ) {
        try {
          const sendResult = await guiHoaDonViettel(ketQuaDaXuLy.sohd);

          if (!sendResult?.ok) {
            alert("⚠️ Đã lưu hóa đơn nhưng gửi hóa đơn điện tử chưa thành công. Có thể kiểm tra và gửi lại sau.");
          }

        } catch (e) {
          console.error("[BAO MAT] Gửi tác vụ ngoài thất bại:", e);

          alert("⚠️ Đã lưu hóa đơn nhưng gửi hóa đơn điện tử thất bại. Có thể gửi lại sau.");
        }
      }

      setTimeout(() => {
        document.getElementById("them")?.click();
      }, 500);
    }

    return ketQuaDaXuLy;
  } catch (error) {
    alert(
      "❌ Không thể hoàn tất lưu hóa đơn.\n\n" +
      "Vui lòng thử lại hoặc báo quản lý."
    );

    return {
      ok: false,
      code: "SAVE_FAILED"
    };
  } finally {
    dangLuuBaoMat = false;
  }
}

window.luuHoaDonBaoMat = luuHoaDonBaoMat;
window.testLuuHoaDonBaoMat = luuHoaDonBaoMat;
