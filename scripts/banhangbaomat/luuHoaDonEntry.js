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
