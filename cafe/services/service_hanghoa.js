import { supabase } from "../../scripts/supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

export async function loadHangHoa() {
  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HANGHOA)
    .select(`
      id,
      ma_hang,
      ten_hang,
      nhom_id,
      gia_ban,
      hinh_anh_url,
      dang_kinh_doanh,
      cho_phep_ban,
      thu_tu
    `)
    .eq("dang_kinh_doanh", true)
    .eq("cho_phep_ban", true)
    .order("thu_tu", { ascending: true });

  if (error) {
    console.error("Lỗi load hàng hóa:", error);
    throw error;
  }

  return data || [];
}
