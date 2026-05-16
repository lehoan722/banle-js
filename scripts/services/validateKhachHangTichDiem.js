// scripts/services/validateKhachHangTichDiem.js

import { supabase } from "../supabaseClient.js";

const LOAI_BAT_BUOC_KHACH_HANG = [
  "bancs1",
  "bancs2",
  "bannvcs1",
  "bannvcs2"
];

function getInput(id) {
  return document.getElementById(id);
}

function getMoney(id) {
  return parseInt(
    String(getInput(id)?.value || "").replace(/[^\d]/g, ""),
    10
  ) || 0;
}

function getText(id) {
  return String(getInput(id)?.value || "").trim();
}

function normalizeLoai(loai) {
  return String(loai || "").trim().toLowerCase();
}

export async function validateKhachHangBatBuoc(loaiHoaDon = "") {
  const loai = normalizeLoai(loaiHoaDon);

  // Chỉ áp dụng cho 4 loại hóa đơn bán hàng cần tích điểm
  if (!LOAI_BAT_BUOC_KHACH_HANG.includes(loai)) {
    return true;
  }

  const tongThanhToan =
    getMoney("phaithanhtoan") ||
    getMoney("khachtra") ||
    0;

  if (tongThanhToan < 700000) {
    return true;
  }

  const makh = getText("makh");

  if (!makh) {
    alert(
      "❌ Hóa đơn từ 700.000đ trở lên cần nhập khách hàng để tích điểm.\n\n" +
      "Vui lòng nhập SĐT / mã khách hàng."
    );

    getInput("makh")?.focus();
    getInput("makh")?.select?.();

    return false;
  }

  const { data, error } = await supabase
    .from("dmkhachhang")
    .select("makh")
    .eq("makh", makh)
    .maybeSingle();

  if (error || !data) {
    alert(
      "❌ Mã khách hàng không tồn tại trong danh mục khách hàng.\n\n" +
      "Vui lòng kiểm tra lại."
    );

    getInput("makh")?.focus();
    getInput("makh")?.select?.();

    return false;
  }

  return true;
}
