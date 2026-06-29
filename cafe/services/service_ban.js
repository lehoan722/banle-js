import { supabase } from "../../scripts/supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

export async function loadBan() {
  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.BAN)
    .select("id, ten_ban, khuvuc_id, trang_thai, thu_tu, is_active")
    .eq("is_active", true)
    .order("thu_tu", { ascending: true });

  if (error) {
    console.error("Lỗi load bàn:", error);
    throw error;
  }

  return data || [];
}
