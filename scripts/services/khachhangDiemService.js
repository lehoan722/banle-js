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
  
  const { data, error } = await supabase.rpc("rpc_check_diem_khachhang", payload);

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

function setVal(id, val) {
  const el = getInput(id);
  if (el) el.value = val ?? "";
}

function khoiPhucTienSauLoiDiem() {
  const tongHang = Number(
    String(getInput("thanhtien")?.value || "0").replace(/\D/g, "")
  ) || 0;

  const chietKhau = getMoney("chietkhau");
  const tongBang = Number(window.__tongPhaiTraGoc || 0);

  const tongDung =
    tongBang > 0
      ? tongBang
      : Math.max(0, tongHang - chietKhau);

  setVal("diem_tru", "");
  setVal("tien_doi_diem", "0");
  setVal("km_diem_hienthi", "0");
  setVal("phaithanhtoan", tongDung.toLocaleString("vi-VN"));
  setVal("khachtra", tongDung.toLocaleString("vi-VN"));
  setVal("conlai", "0");

  setTimeout(() => {
    const el = getInput("diem_tru");
    if (el) {
      el.focus();
      el.select?.();
    }
  }, 50);
}

export async function kiemTraDiemKhachHangTruocKhiLuu(thanhtoanOverride = null) {
  const sohd = getText("sohd") || "CHECK_ONLY";
  const payload = buildKhachHangPointPayload(sohd, thanhtoanOverride);

  if (!payload) {
    return { ok: true, skipped: true };
  }

  if (!payload.p_diem_tru || payload.p_diem_tru <= 0) {
    return { ok: true, skipped: true };
  }

  const { data, error } = await supabase.rpc("rpc_check_diem_khachhang", payload);

  if (error || !data?.ok) {
    console.error("❌ Điểm khách hàng không hợp lệ trước khi lưu:", { error, data, payload });

    alert(
      "❌ Không thể lưu hóa đơn vì điểm khách hàng không hợp lệ:\n" +
      (error?.message || data?.message || "")
    );

    khoiPhucTienSauLoiDiem();

    return { ok: false, error, data };
  }

  return { ok: true, data };
}
