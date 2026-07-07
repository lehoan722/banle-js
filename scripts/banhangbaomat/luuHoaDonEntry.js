// scripts/banhangbaomat/luuHoaDonEntry.js

import { taoDuLieuLuuBaoMat } from "./taoDuLieuLuu.js";
import { guiDuLieuLuuBaoMat } from "./dichVuLuuHoaDon.js";
import { xuLyKetQuaLuuBaoMat } from "./xuLyKetQuaLuu.js";
import { inHoaDonBaoMat } from "./inHoaDonBaoMat.js";
import { guiHoaDonViettel } from "../viettelInvoice.js";

let dangLuuBaoMat = false;

export async function luuHoaDonBaoMat() {
  if (dangLuuBaoMat) {
    console.warn("[BAO MAT] Đang có yêu cầu lưu.");
    return;
  }

  dangLuuBaoMat = true;

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
        ketQuaDaXuLy?.mode === "EDIT_REAL_V1" ||
        ketQuaDaXuLy?.mode === "SAVE_2_BAN_REAL_V1"
      )
    ) {
      inHoaDonBaoMat(ketQuaDaXuLy, payload);
      if (
        ketQuaDaXuLy?.mode === "SAVE_2_BAN_REAL_V1" &&
        ketQuaDaXuLy?.viettel_should_send === true &&
        ketQuaDaXuLy?.sohd_t
      ) {
        try {
          await guiHoaDonViettel(ketQuaDaXuLy.sohd_t);
        } catch (e) {
          console.error("[BAO MAT] Gửi Viettel thất bại:", e);
          alert("⚠️ Đã lưu hóa đơn 2 bản nhưng gửi Viettel thất bại. Có thể gửi lại sau.");
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
