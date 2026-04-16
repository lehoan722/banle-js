import { saveHoaDonService } from "./hoadonService.js";

export async function saveBanLe111(source = "unknown") {
  // ✅ Khóa cấp service để chống gọi chồng
  if (window.__SAVE_BANLE111_RUNNING__) {
    console.warn("⛔ saveBanLe111 bị chặn do đang có lượt lưu khác đang chạy");
    return { ok: false, reason: "SAVE_ALREADY_RUNNING" };
  }

  window.__SAVE_BANLE111_RUNNING__ = true;

  try {
    console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);

    const hdState = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
    const isEdit = hdState === "sua" || hdState === "xem";

    const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";
    const sohdEl = document.getElementById("sohd");

    const isSpecialByTMT = hinhthuctt === "tmt";
    const isSpecialByMod3 = sohdEl?.getAttribute("data-mod3") === "yes";
    const isSpecialInvoice = isSpecialByTMT || isSpecialByMod3;

    // ✅ Ưu tiên luồng sửa trước
    if (isEdit) {
      console.log("🛠️ ĐANG VÀO LUỒNG SỬA THƯỜNG - BỎ QUA LƯU 2 BẢN", {
        isSpecialByTMT,
        isSpecialByMod3,
        sohd: sohdEl?.value || ""
      });
      return await saveHoaDonService();
    }

    // ✅ Chỉ hóa đơn MỚI đặc biệt mới vào luồng lưu 2 bản
    if (isSpecialInvoice) {
      console.log("📄 ĐANG VÀO LUỒNG LƯU 2 BẢN MỚI", {
        isSpecialByTMT,
        isSpecialByMod3,
        sohd: sohdEl?.value || ""
      });
      return await saveHoaDonService();
    }

    console.log("💰 ĐANG VÀO LUỒNG BÁN LẺ THƯỜNG");
    return await saveHoaDonService();
  } finally {
    // ✅ Nhả khóa chậm nhẹ để chặn nhấn giữ / kẹt phím
    setTimeout(() => {
      window.__SAVE_BANLE111_RUNNING__ = false;
    }, 800);
  }
}
