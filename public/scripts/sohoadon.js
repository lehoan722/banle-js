// sohoadon.js
import { supabase } from './supabaseClient.js';

/**
 * Sinh số hóa đơn từ bảng sochungtu (dùng cho hóa đơn gốc: hoadon_banle)
 */
export async function capNhatSoHoaDonTuDong() {
  const diadiem = document.getElementById("diadiem")?.value || "cs1";
  const loai = diadiem === "cs1" ? "bancs1" : "bancs2";

  const { data, error } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loai)
    .single();

  if (error || !data) {
    alert("Không thể lấy số hóa đơn từ bảng sochungtu");
    return;
  }

  const soMoi = data.so_hientai + 1;
  const sohd = `${loai}_${String(soMoi).padStart(5, "0")}`;

  // Cập nhật lại so_hientai
  await supabase
    .from("sochungtu")
    .update({ so_hientai: soMoi })
    .eq("loai", loai);

  document.getElementById("sohd").value = sohd;
}

/**
 * Sinh số hóa đơn từ bảng sochungtu (dùng cho hóa đơn tạm: hoadon_banleT)
 */
export async function phatSinhSoHDTMoi() {
  const now = new Date();
  const prefix = "blt" + now.toISOString().slice(2, 10).replace(/-/g, "").slice(0, 6); // vd: blt2506
  const loai = `${prefix}`;

  const { data, error } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loai)
    .single();

  let soMoi = 1;
  if (!error && data) {
    soMoi = data.so_hientai + 1;
    await supabase
      .from("sochungtu")
      .update({ so_hientai: soMoi })
      .eq("loai", loai);
  } else {
    // Chưa có thì insert mới
    await supabase
      .from("sochungtu")
      .insert([{ loai, so_hientai: 1 }]);
  }

  const sohd = `${prefix}_${String(soMoi).padStart(3, "0")}`;
  return sohd;
}
