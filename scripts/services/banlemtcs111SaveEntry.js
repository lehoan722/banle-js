import { saveHoaDonService } from "./hoadonService.js";

export async function saveBanLe111(source = "unknown") {
  console.log(`🚀 BANLE111 SAVE ENTRY: ${source}`);

  const hdState = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  const isEdit = hdState === "sua" || hdState === "xem";

  const hinhthuctt = document.getElementById("hinhthuctt")?.value || "";
  const sohdEl = document.getElementById("sohd");

  const isSpecialByTMT = hinhthuctt === "tmt";
  const isSpecialByMod3 = sohdEl?.getAttribute("data-mod3") === "yes";
  const isSpecialInvoice = isSpecialByTMT || isSpecialByMod3;

  // ✅ Ưu tiên luồng sửa trước
  // Nếu đang sửa hóa đơn thì dù là TMT hay data-mod3=yes
  // cũng chỉ lưu sửa như thông thường, không lưu 2 bản nữa
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
}
