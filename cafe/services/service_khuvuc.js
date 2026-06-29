import { supabase } from "../../scripts/supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

export async function loadKhuVuc() {
  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.KHUVUC)
    .select("id, ten_khuvuc, thu_tu, is_active")
    .eq("is_active", true)
    .order("thu_tu", { ascending: true });

  if (error) {
    console.error("Lỗi load khu vực:", error);
    throw error;
  }

  return data || [];
}
