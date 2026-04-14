import { saveHoaDonService } from "./hoadonService.js";

export async function saveBanLe111(source = "unknown") {
  console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);

  const hdState = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  const isEdit = hdState === "xem" || hdState === "moi";
  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  if (hinhthuctt === "tmt") {
    console.log("📄 ĐANG VÀO LUỒNG LƯU 2 BẢN MỚI");
    return await saveHoaDonService();
  }

  if (isEdit) {
    console.log("🛠️ ĐANG VÀO LUỒNG SỬA MỚI");
    return await saveHoaDonService();
  }

  console.log("💰 ĐANG VÀO LUỒNG BÁN LẺ THƯỜNG");
  return await saveHoaDonService();
}
