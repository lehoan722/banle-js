import { saveHoaDonService } from "./hoadonService.js";

export async function saveBanLe111(source = "unknown") {
  console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);

  const isEdit =
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true;

  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  // ===== LUỒNG 2 BẢN =====
  if (hinhthuctt === "tmt") {
    console.log("📄 ĐANG VÀO LUỒNG LƯU 2 BẢN MỚI");
    return await saveHoaDonService();
  }

  // ===== LUỒNG SỬA =====
  if (isEdit) {
    console.log("🛠️ ĐANG VÀO LUỒNG SỬA MỚI");
    return await saveHoaDonService();
  }

  // ===== LUỒNG BÁN LẺ THƯỜNG =====
  console.log("💰 ĐANG VÀO LUỒNG BÁN LẺ THƯỜNG");
  return await saveHoaDonService();
}
