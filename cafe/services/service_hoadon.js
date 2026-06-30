import { supabase } from "../scripts/cafe_supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

function taoSoHoaDonCafe() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = String(now.getTime()).slice(-6);
  return `CF${ymd}-${time}`;
}

async function syncChiTietHoaDonCafe(hoaDonId, orderItems) {
  const { data: oldItems, error: oldError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .select("id, hoadon_id, hanghoa_id, so_luong, don_gia, thanh_tien, ghi_chu")
    .eq("hoadon_id", hoaDonId);

  if (oldError) throw oldError;

  const oldMap = new Map(
    (oldItems || []).map((item) => [String(item.hanghoa_id), item])
  );

  const newIds = new Set(orderItems.map((item) => String(item.id)));

  const itemsToDelete = (oldItems || []).filter(
    (oldItem) => !newIds.has(String(oldItem.hanghoa_id))
  );

  for (const oldItem of itemsToDelete) {
    const { error } = await supabase
      .schema(CAFE_SCHEMA)
      .from(CAFE_TABLES.HOADON_CT)
      .delete()
      .eq("id", oldItem.id);

    if (error) throw error;
  }

  for (const item of orderItems) {
    const oldItem = oldMap.get(String(item.id));

    const payload = {
      hoadon_id: hoaDonId,
      hanghoa_id: item.id,
      ma_hang: item.ma_hang,
      ten_hang: item.ten_hang,
      so_luong: item.so_luong,
      don_gia: item.don_gia,
      thanh_tien: item.thanh_tien,
      ghi_chu: item.ghi_chu || null,
      trang_thai: "binh_thuong",
      updated_at: new Date().toISOString(),
    };

    if (oldItem) {
      const { error } = await supabase
        .schema(CAFE_SCHEMA)
        .from(CAFE_TABLES.HOADON_CT)
        .update(payload)
        .eq("id", oldItem.id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .schema(CAFE_SCHEMA)
        .from(CAFE_TABLES.HOADON_CT)
        .insert(payload);

      if (error) throw error;
    }
  }
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

  await syncChiTietHoaDonCafe(hoaDon.id, orderItems);

  return hoaDon;
}

export async function thanhToanHoaDonCafe(hoaDonId) {
  if (!hoaDonId) throw new Error("Thiếu ID hóa đơn.");

  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON)
    .update({
      trang_thai: "da_thanh_toan",
      gio_thanh_toan: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", hoaDonId)
    .select("id, so_hoadon")
    .single();

  if (error) throw error;

  return data;
}

export async function loadHoaDonDangMo() {
  const { data: hoaDons, error: hdError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON)
    .select("id, so_hoadon, ban_id, khuvuc_id, loai_don, trang_thai, gio_vao")
    .eq("trang_thai", "dang_mo");

  if (hdError) throw hdError;

  const ids = (hoaDons || []).map((x) => x.id);
  if (!ids.length) return [];

  const { data: chiTiet, error: ctError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .select("id, hoadon_id, hanghoa_id, ma_hang, ten_hang, so_luong, don_gia, thanh_tien, ghi_chu")
    .in("hoadon_id", ids);

  if (ctError) throw ctError;

  return hoaDons.map((hd) => ({
    ...hd,
    chi_tiet: (chiTiet || []).filter((ct) => ct.hoadon_id === hd.id),
  }));
}
