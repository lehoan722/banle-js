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

  if (!makh) return null;

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

async function laySnapshotDiemHoaDonCu(sohd) {
  if (!sohd) {
    return {
      isEditPointInvoice: false,
      oldThanhtoan: 0,
      oldMakh: ""
    };
  }

  const { data: hd, error: hdErr } = await supabase
    .from("hoadon_banle")
    .select("sohd, makh, thanhtoan, diem_cong, diem_tru, tien_doi_diem")
    .eq("sohd", sohd)
    .maybeSingle();

  if (hdErr) {
    console.error("❌ Lỗi đọc snapshot điểm hóa đơn cũ:", hdErr);
  }

  const { data: logs, error: logErr } = await supabase
    .from("kh_lichsu_diem")
    .select("id, loai")
    .eq("sohd", sohd)
    .in("loai", ["CONG", "TRU"])
    .limit(1);

  if (logErr) {
    console.error("❌ Lỗi kiểm tra lịch sử điểm cũ:", logErr);
  }

  return {
    isEditPointInvoice: !!(logs && logs.length > 0),
    oldThanhtoan: Number(hd?.thanhtoan || 0),
    oldMakh: hd?.makh || ""
  };
}

export async function xuLyDiemKhachHangSauLuu(
  sohd,
  thanhtoanOverride = null,
  options = {}
) {
  const payload = buildKhachHangPointPayload(sohd, thanhtoanOverride);

  if (!payload) {
    console.log("ℹ️ Hóa đơn không có khách hàng, bỏ qua tích điểm.");
    return { ok: true, skipped: true };
  }

  const isEdit = options.isEdit === true;

  let snapshot = options.oldPointSnapshot || null;

  if (isEdit && !snapshot) {
    snapshot = await laySnapshotDiemHoaDonCu(sohd);
  }

  const isEditPointInvoice = isEdit && snapshot?.isEditPointInvoice;

  const rpcName = isEditPointInvoice
    ? "rpc_reprocess_diem_khachhang"
    : "rpc_xuly_diem_khachhang";

  const rpcPayload = isEditPointInvoice
    ? {
        ...payload,
        p_thanhtoan_cu: Number(snapshot.oldThanhtoan || 0)
      }
    : payload;

  console.log("🧾 Xử lý điểm khách hàng:", {
    sohd,
    isEdit,
    isEditPointInvoice,
    rpcName,
    rpcPayload
  });

  const { data, error } = await supabase.rpc(rpcName, rpcPayload);

  const result = data?.new_process || data;

  if (data?.skipped || result?.skipped) {
    console.warn("⚠️ RPC bỏ qua xử lý điểm:", data);
    alert(
      "⚠️ Hóa đơn đã lưu nhưng KHÔNG được xử lý điểm:\n" +
        (data?.message || result?.message || "Không rõ lý do.")
    );
    return data;
  }

  if (error || !data?.ok) {
    console.error("❌ Lỗi xử lý điểm khách hàng:", {
      error,
      data,
      rpcName,
      rpcPayload
    });

    alert(
      "⚠️ Hóa đơn đã lưu nhưng xử lý điểm khách hàng bị lỗi: " +
        (error?.message || data?.message || result?.message || "")
    );

    return { ok: false, error, data };
  }

  const diemEl = getInput("diem_hientai");
  const hangEl = getInput("hang_khach");

  if (diemEl) diemEl.value = result?.diem_sau ?? data?.diem_sau ?? "";
  if (hangEl) hangEl.value = result?.hang_khach ?? data?.hang_khach ?? "";

  console.log(
    isEditPointInvoice
      ? "✅ Đã hoàn tác và xử lý lại điểm hóa đơn sửa:"
      : "✅ Đã xử lý điểm hóa đơn mới:",
    data
  );

  return data;
}

function setVal(id, val) {
  const el = getInput(id);
  if (el) el.value = val ?? "";
}

function khoiPhucTienSauLoiDiem() {
  const tongHang =
    Number(String(getInput("thanhtien")?.value || "0").replace(/\D/g, "")) || 0;

  const chietKhau = getMoney("chietkhau");
  const tongBang = Number(window.__tongPhaiTraGoc || 0);

  const tongDung = tongBang > 0 ? tongBang : Math.max(0, tongHang - chietKhau);

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

export async function kiemTraDiemKhachHangTruocKhiLuu(
  thanhtoanOverride = null
) {
  const sohd = getText("sohd") || "CHECK_ONLY";
  const payload = buildKhachHangPointPayload(sohd, thanhtoanOverride);

  if (!payload) {
    return { ok: true, skipped: true };
  }

  const { data, error } = await supabase.rpc(
    "rpc_check_diem_khachhang",
    payload
  );

  if (error || !data?.ok) {
    console.error("❌ Điểm khách hàng không hợp lệ trước khi lưu:", {
      error,
      data,
      payload
    });

    alert(
      "❌ Không thể lưu hóa đơn vì điểm khách hàng không hợp lệ:\n" +
        (error?.message || data?.message || "")
    );

    khoiPhucTienSauLoiDiem();

    return { ok: false, error, data };
  }

  return { ok: true, data };
}

export async function layThongTinDiemHoaDonCu(sohd) {
  return await laySnapshotDiemHoaDonCu(sohd);
}
