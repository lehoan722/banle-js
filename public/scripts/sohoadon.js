// sohoadon.js
import { supabase } from './supabaseClient.js';

export async function capNhatSoHoaDonTuDong() {
  const diadiem = document.getElementById("diadiem")?.value || "cs1";
  const prefix = diadiem === "cs1" ? "bancs1_" : "bancs2_";

  const { data, error } = await supabase
    .from("hoadon_banle")
    .select("sohd")
    .like("sohd", `${prefix}%`)
    .order("sohd", { ascending: false })
    .limit(1);

  let newSohd = prefix + "00001";
  if (!error && data.length > 0) {
    const last = data[0].sohd;
    const so = parseInt(last.split("_")[1] || "0") + 1;
    newSohd = prefix + so.toString().padStart(5, "0");
  }

  document.getElementById("sohd").value = newSohd;
}
