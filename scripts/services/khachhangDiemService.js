import { supabase } from "../supabaseClient.js";

function getInput(id) {
  return document.getElementById(id);
}

function getText(id) {
  return getInput(id)?.value?.trim?.() || "";
}

function getMoney(id) {
  return Number(String(getInput(id)?.value || "0").replace(/\D/g, "")) || 0;
}

function getNumber(id) {
  return Number(getInput(id)?.value || 0) || 0;
}

export function buildKhachHangPointPayload(sohd, thanhtoanOverride = null) {
  const makh = getText("makh");

  if (!makh) {
    return null;
  }

  return {
    p_sohd: sohd,
    p_makh: makh,
    p_thanhtoan: thanhtoanOverride ?? getMoney("phaithanhtoan"),
    p_diem_tru: getNumber("diem_tru"),
    p_manv: getText("manv"),
    p_tennv: getText("tennv"),
    p_diadiem: getText("diadiem")
  };
}

export async function xuLyDiemKhachHangSauLuu(sohd, thanhtoanOverride = null) {
  const payload = buildKhachHangPointPayload(sohd, thanhtoanOverride);

  if (!payload) {
    console.log("ℹ️ Hóa đơn không có khách hàng, bỏ qua tích điểm.");
    return { ok: true, skipped: true };
  }

  const { data, error } = await supabase.rpc("rpc_xuly_diem_khachhang", payload);

  if (error || !data?.ok) {
    console.error("❌ Lỗi xử lý điểm khách hàng:", { error, data, payload });
    alert("⚠️ Hóa đơn đã lưu nhưng xử lý điểm khách hàng bị lỗi: " + (error?.message || data?.message || ""));
    return { ok: false, error, data };
  }

  const diemEl = getInput("diem_hientai");
  const hangEl = getInput("hang_khach");

  if (diemEl) diemEl.value = data.diem_sau ?? "";
  if (hangEl) hangEl.value = data.hang_khach ?? "";

  console.log("✅ Đã xử lý điểm khách hàng:", data);
  return data;
}
