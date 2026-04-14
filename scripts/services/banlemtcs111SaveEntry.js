import { saveHoaDonService } from "./hoadonService.js";

export async function saveBanLe111(source = "unknown") {
  console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);

  const isEdit =
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true;

  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";

  // ===== LUỒNG SỬA =====
  if (isEdit) {
    console.log("🛠️ ĐANG VÀO LUỒNG SỬA MỚI");

    alert("🛠️ Đã gọi LUỒNG SỬA MỚI (chưa implement)");

    // tạm thời chưa làm thật
    return;
  }

  // ===== LUỒNG 2 BẢN =====
  if (hinhthuctt === "tmt") {
    console.log("📄 ĐANG VÀO LUỒNG LƯU 2 BẢN MỚI");

    alert("📄 Đã gọi LUỒNG LƯU 2 BẢN (chưa implement)");

    return;
  }

  // ===== LUỒNG BÁN LẺ THƯỜNG =====
  console.log("💰 ĐANG VÀO LUỒNG BÁN LẺ THƯỜNG");

  return await saveHoaDonService();
}
