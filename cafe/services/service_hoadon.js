import { supabase } from "../scripts/cafe_supabaseClient.js";
import { CAFE_SCHEMA, CAFE_TABLES } from "../scripts/cafe_config.js";

function taoSoHoaDonCafe() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replaceAll("-", "");
  const time = String(now.getTime()).slice(-6);
  return `CF${ymd}-${time}`;
}

async function ghiLogHoaDonCafe(payload) {
  const { error } = await supabase
    .schema(CAFE_SCHEMA)
    .from("cafe_hoadon_log")
    .insert(payload);

  if (error) throw error;
}

async function syncChiTietHoaDonCafe(hoaDonId, orderItems, { manv = null, tennv = null } = {}) {
  const { data: oldItems, error: oldError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .select("id, hoadon_id, hanghoa_id, ma_hang, ten_hang, so_luong, don_gia, thanh_tien, ghi_chu, trang_thai, thu_tu")
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
    if (oldItem.trang_thai === "da_huy") continue;

    const { error } = await supabase
      .schema(CAFE_SCHEMA)
      .from(CAFE_TABLES.HOADON_CT)
      .update({
        trang_thai: "da_huy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", oldItem.id);

    if (error) throw error;

    await ghiLogHoaDonCafe({
      hoadon_id: hoaDonId,
      hoadon_ct_id: oldItem.id,
      hanh_dong: "xoa_mem_mon",
      ma_hang: oldItem.ma_hang,
      ten_hang: oldItem.ten_hang,
      so_luong_cu: oldItem.so_luong,
      so_luong_moi: 0,
      don_gia: oldItem.don_gia,
      thanh_tien_cu: oldItem.thanh_tien,
      thanh_tien_moi: 0,
      trang_thai_cu: oldItem.trang_thai,
      trang_thai_moi: "da_huy",
      manv,
      tennv,
      ghi_chu: "Bớt/xóa món khỏi hóa đơn đang mở",
    });
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
      thu_tu: item.thu_tu || 0,
      updated_at: new Date().toISOString(),
    };

    if (oldItem) {
      const coThayDoi =
        Number(oldItem.so_luong) !== Number(item.so_luong) ||
        Number(oldItem.don_gia) !== Number(item.don_gia) ||
        Number(oldItem.thanh_tien) !== Number(item.thanh_tien) ||
        oldItem.trang_thai !== "binh_thuong";

      const { error } = await supabase
        .schema(CAFE_SCHEMA)
        .from(CAFE_TABLES.HOADON_CT)
        .update(payload)
        .eq("id", oldItem.id);

      if (error) throw error;

      if (coThayDoi) {
        await ghiLogHoaDonCafe({
          hoadon_id: hoaDonId,
          hoadon_ct_id: oldItem.id,
          hanh_dong: oldItem.trang_thai === "da_huy" ? "khoi_phuc_mon" : "cap_nhat_mon",
          ma_hang: item.ma_hang,
          ten_hang: item.ten_hang,
          so_luong_cu: oldItem.so_luong,
          so_luong_moi: item.so_luong,
          don_gia: item.don_gia,
          thanh_tien_cu: oldItem.thanh_tien,
          thanh_tien_moi: item.thanh_tien,
          trang_thai_cu: oldItem.trang_thai,
          trang_thai_moi: "binh_thuong",
          manv,
          tennv,
        });
      }
    } else {
      const { data: inserted, error } = await supabase
        .schema(CAFE_SCHEMA)
        .from(CAFE_TABLES.HOADON_CT)
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      await ghiLogHoaDonCafe({
        hoadon_id: hoaDonId,
        hoadon_ct_id: inserted.id,
        hanh_dong: "them_mon",
        ma_hang: item.ma_hang,
        ten_hang: item.ten_hang,
        so_luong_moi: item.so_luong,
        don_gia: item.don_gia,
        thanh_tien_moi: item.thanh_tien,
        trang_thai_moi: "binh_thuong",
        manv,
        tennv,
      });
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

  await syncChiTietHoaDonCafe(hoaDon.id, orderItems, { manv, tennv });

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

export async function huyHoaDonCafe(hoaDonId, { lyDo = "", manv = null, tennv = null } = {}) {
  if (!hoaDonId) throw new Error("Thiếu ID hóa đơn.");

  const nowIso = new Date().toISOString();

  const { data: oldItems, error: oldItemsError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .select("id, ma_hang, ten_hang, so_luong, don_gia, thanh_tien, trang_thai")
    .eq("hoadon_id", hoaDonId);

  if (oldItemsError) throw oldItemsError;

  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON)
    .update({
      trang_thai: "da_huy",
      ghi_chu: lyDo ? `Hủy đơn: ${lyDo}` : "Hủy đơn",
      tong_tien: 0,
      thanh_toan: 0,
      updated_at: nowIso,
    })
    .eq("id", hoaDonId)
    .eq("trang_thai", "dang_mo")
    .select("id, so_hoadon")
    .single();

  if (error) throw error;

  const { error: ctError } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON_CT)
    .update({
      trang_thai: "da_huy",
      updated_at: nowIso,
    })
    .eq("hoadon_id", hoaDonId)
    .neq("trang_thai", "da_huy");

  if (ctError) throw ctError;

  await ghiLogHoaDonCafe({
    hoadon_id: hoaDonId,
    hanh_dong: "huy_hoa_don",
    trang_thai_cu: "dang_mo",
    trang_thai_moi: "da_huy",
    manv,
    tennv,
    ghi_chu: lyDo || "Hủy hóa đơn",
  });

  for (const item of oldItems || []) {
    if (item.trang_thai === "da_huy") continue;

    await ghiLogHoaDonCafe({
      hoadon_id: hoaDonId,
      hoadon_ct_id: item.id,
      hanh_dong: "huy_mon_theo_hoa_don",
      ma_hang: item.ma_hang,
      ten_hang: item.ten_hang,
      so_luong_cu: item.so_luong,
      so_luong_moi: 0,
      don_gia: item.don_gia,
      thanh_tien_cu: item.thanh_tien,
      thanh_tien_moi: 0,
      trang_thai_cu: item.trang_thai,
      trang_thai_moi: "da_huy",
      manv,
      tennv,
      ghi_chu: lyDo || "Hủy hóa đơn",
    });
  }

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
    .select("id, hoadon_id, hanghoa_id, ma_hang, ten_hang, so_luong, don_gia, thanh_tien, ghi_chu, trang_thai, thu_tu")
    .in("hoadon_id", ids)
    .eq("trang_thai", "binh_thuong")
    .order("thu_tu", { ascending: true })
    .order("id", { ascending: true });

  if (ctError) throw ctError;

  return hoaDons.map((hd) => ({
    ...hd,
    chi_tiet: (chiTiet || []).filter((ct) => ct.hoadon_id === hd.id),
  }));
}

export async function guiBepHoaDonCafe(hoaDonId) {
  if (!hoaDonId) throw new Error("Thiếu ID hóa đơn.");

  const { data, error } = await supabase
    .schema(CAFE_SCHEMA)
    .from(CAFE_TABLES.HOADON)
    .update({
      kitchen_status: "sent",
      kitchen_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", hoaDonId)
    .select("id, so_hoadon, kitchen_status, kitchen_sent_at")
    .single();

  if (error) throw error;

  return data;
}
