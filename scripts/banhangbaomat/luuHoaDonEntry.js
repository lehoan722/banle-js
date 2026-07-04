// scripts/banhangbaomat/luuHoaDonEntry.js

import { taoDuLieuLuuBaoMat } from "./taoDuLieuLuu.js";
import { guiDuLieuLuuBaoMat } from "./dichVuLuuHoaDon.js";
import { xuLyKetQuaLuuBaoMat } from "./xuLyKetQuaLuu.js";

let dangLuuBaoMat = false;

export async function testLuuHoaDonBaoMat() {
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

    xuLyKetQuaLuuBaoMat(result);

    console.log("[BAO MAT] TEST HOAN TAT");
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

window.testLuuHoaDonBaoMat = testLuuHoaDonBaoMat;