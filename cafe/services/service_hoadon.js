import { supabase } from "../../scripts/supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

function taoSoHoaDonCafe() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = String(now.getTime()).slice(-6);
  return `CF${ymd}-${time}`;
}

export async function luuHoaDonCafe({ hoaDonId = null, ban, orderItems, manv = null, tennv = null }) {
  if (!ban) throw new Error("Chưa chọn bàn.");
  if (!orderItems?.length) throw new Error("Chưa có món trong đơn.");

  const tongTien = orderItems.reduce((sum, item) => sum + Number(item.thanh_tien || 0), 0);

  let hoaDon;

  if (hoaDonId) {
    const { data, error } = await supabase
      .schema(CAFE_SCHEMA)
      .from(CAFE_TABLES.HOADON)
      .update({
        tong_tien: tongTien,
        thanh_toan: tongTien,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hoaDonId)
      .select("id, so_hoadon")
      .single();

    if (error) throw error;
    hoaDon = data;

    const { error: deleteError } = await supabase
      .schema(CAFE_SCHEMA)
      .from(CAFE_TABLES.HOADON_CT)
      .delete()
      .eq("hoadon_id", hoaDonId);

    if (deleteError) throw deleteError;
  } else {
    const hoaDonPayload = {
      so_hoadon: taoSoHoaDonCafe(),
      ban_id: ban.id === "takeaway" ? null : ban.id,
      khuvuc_id: ban.id === "takeaway" ? null : ban.khuvuc_id,
      loai_don: ban.id === "takeaway" ? "mang_ve" : "tai_ban",
      trang_thai: "dang_mo",
      tong_tien: tongTien,
      giam_gia: 0,
      thanh_toan: tongTien,
      ghi_chu: null,
      manv,
      tennv,
    };

    const { data, error } = await supabase
      .schema(CAFE_SCHEMA)
      .from(CAFE_TABLES.HOADON)
      .insert(hoaDonPayload)
      .select("id, so_hoadon")
      .single();

    if (error) throw error;
    hoaDon = data;
  }

  const ctPayload = orderItems.map((item) => ({
    hoadon_id: hoaDon.id,
    hanghoa_id: item.id,
    ma_hang: item.ma_hang,
    ten_hang: item.ten_hang,
    so_luong: item.so_luong,
    don_gia: item.don_gia,
    thanh_tien: item.thanh_tien,
    ghi_chu: item.ghi_chu || null,
    trang_thai: "binh_thuong",
  }));

  const { error: ctError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .insert(ctPayload);

  if (ctError) throw ctError;

  return hoaDon;
}
