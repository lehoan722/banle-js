// scripts/services/validateKhachHangTichDiem.js

import { supabase } from "../supabaseClient.js";

function getInput(id) {
  return document.getElementById(id);
}

function getMoney(id) {
  return parseInt(
    String(getInput(id)?.value || "")
      .replace(/[^\d]/g, ""),
    10
  ) || 0;
}

function getText(id) {
  return String(getInput(id)?.value || "").trim();
}

export async function validateKhachHangBatBuoc() {

  const tongThanhToan =
    getMoney("phaithanhtoan") ||
    getMoney("khachtra") ||
    0;

  // dưới 200k => bỏ qua
  if (tongThanhToan < 200000) {
    return true;
  }

  const makh = getText("makh");

  if (!makh) {
    alert(
      "❌ Hóa đơn từ 200.000đ trở lên cần nhập khách hàng để tích điểm.\n\n" +
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
