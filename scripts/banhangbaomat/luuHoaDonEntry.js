// scripts/banhangbaomat/luuHoaDonEntry.js

import { taoDuLieuLuuBaoMat } from "./taoDuLieuLuu.js";
import { guiDuLieuLuuBaoMat } from "./dichVuLuuHoaDon.js";
import { xuLyKetQuaLuuBaoMat } from "./xuLyKetQuaLuu.js";
import { inHoaDonBaoMat } from "./inHoaDonBaoMat.js";

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

    if (ketQuaDaXuLy?.ok && ketQuaDaXuLy?.mode === "SAVE_REAL_V1") {
      inHoaDonBaoMat(ketQuaDaXuLy, payload);

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
