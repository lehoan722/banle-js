// scripts/services/hoadonSale.js

import { supabase } from '../supabaseClient.js';
import { getBangKetQua, resetBangKetQua } from '../hoadon.js';
import { capNhatThongTinTong } from '../utils.js';
import { capNhatSoHoaDonTuDong } from '../sohoadon.js';
import {
  xuLyDiemKhachHangSauLuu,
  kiemTraDiemKhachHangTruocKhiLuu
} from "./khachhangDiemService.js";

import {
  refreshSessionIfNeeded,
  hoaDonDaTonTaiAny,
  capNhatUsedTuVanSauKhiLuuCT,
  getServerNowISO,
  getServerTodayVN
} from '../luuhoadon/api.js';

import {
  getLoaiFromSoHDInput,
  handleSpecialSoHoaDon
} from '../luuhoadon/builders.js';

import {
  normalizeBangKetQua,
  calcTongThanhTienFromBangKetQua
} from '../luuhoadon/pricing.js';

function getInput(id) {
  return document.getElementById(id);
}

function getText(id) {
  return getInput(id)?.value?.trim?.() || "";
}

function getMakhSafe() {
  return (
    getText("makh") ||
    getText("maKhach") ||
    getText("ma_khach") ||
    document.querySelector('input[placeholder="mã khách"]')?.value?.trim?.() ||
    ""
  );
}

function getIntValue(id) {
  return parseInt(
    (getInput(id)?.value || "").replace(/[^\d-]/g, "") || "0",
    10
  ) || 0;
}

function apDungGiamDiemVaoThanhToan() {
  const tongHang = calcTongThanhTienFromBangKetQua(getBangKetQua());
  const chietKhau = getIntValue("chietkhau");
  const tienDoiDiem = getIntValue("tien_doi_diem");

  const phaiTra = Math.max(0, tongHang - chietKhau - tienDoiDiem);

  if (getInput("phaithanhtoan")) {
    getInput("phaithanhtoan").value = phaiTra.toLocaleString("vi-VN");
  }

  if (getInput("khachtra")) {
    getInput("khachtra").value = phaiTra.toLocaleString("vi-VN");
  }

  if (getInput("conlai")) {
    getInput("conlai").value = "0";
  }

  return phaiTra;
}

async function snapshotInvoiceBeforeEditLocal(sohd) {
  const { data, error } = await supabase.rpc("rpc_snapshot_invoice_version", {
    p_sohd: sohd
  });

  if (error) throw error;
  return data;
}

function isEditMode(ctx) {
  return !!ctx?.isEdit;
}

function validateBeforeSave() {
  capNhatThongTinTong(getBangKetQua());
  apDungGiamDiemVaoThanhToan();

  const maspChuaNhap = getText("masp");
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
    getInput("masp")?.focus();
    return false;
  }

  const sohd = getText("sohd");
  if (!sohd) {
    alert("❌ Chưa có số hóa đơn.");
    return false;
  }

  const tennv = getText("tennv");
  if (!tennv) {
    alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");
    return false;
  }

  const manvGuard = getText("manv") || localStorage.getItem("manv") || "";
  if (!manvGuard || manvGuard.toUpperCase() === "ADMIN") {
    alert("❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.");
    console.error("GUARD BLOCKED SAVE – manv =", manvGuard);
    return false;
  }

  const hdState = (getInput("hd_state")?.value || "moi").trim().toLowerCase();
  const isEditReal =
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true;

  if (hdState === "xem" && !isEditReal) {
    if (typeof window.moPopupXacThucSua === "function") {
      window.moPopupXacThucSua();
    } else {
      alert("❌ Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.");
    }
    return false;
  }

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("❌ Không có dữ liệu để lưu.");
    return false;
  }

  return true;
}

async function buildHeader(loai, diadiemTrang, bangKetQua) {
  const nowIso = await getServerNowISO();

  return {
    ngay: getText("ngay"),
    manv: getText("manv"),
    tennv: getText("tennv"),
    diadiem: diadiemTrang,
    khachhang: getText("khachhang"),
    makh: getMakhSafe() || null,
    tongsl: getIntValue("tongsl"),
    tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
    tongkm: getIntValue("tongkm"),
    chietkhau: getIntValue("chietkhau"),

    diem_tru: Number(getInput("diem_tru")?.value || 0) || 0,
    tien_doi_diem: getIntValue("tien_doi_diem"),

    thanhtoan: apDungGiamDiemVaoThanhToan(),
    hinhthuctt: getInput("hinhthuctt")?.value || "",
    ghichu: getText("ghichu"),
    dvt: "",
    loaihd: loai,
    loai: loai,
    nhacc: "",
    updated_at: nowIso
  };
}

async function buildDetails(sohd, diadiemTrang, bangKetQua) {
  const createdAt = await getServerNowISO();
  const ngay = getText("ngay");
  const rows = [];

  Object.values(bangKetQua || {}).forEach(item => {
    (item.sizes || []).forEach((sz, i) => {
      const sl = Number(item.soluongs?.[i] || 0);
      if (!sl) return;

      rows.push({
        sohd,
        masp: item.masp,
        tensp: item.tensp,
        size: sz,
        soluong: sl,
        gia: item.gia,
        km: item.km,
        thanhtien: (item.gia - item.km) * sl,
        dvt: item.dvt || '',
        diadiem: diadiemTrang,
        created_at: createdAt,
        ngay
      });
    });
  });

  return rows;
}

function printInvoice(hoadon, chitiet, forceSpecial = false) {
  const data = { hoadon, chitiet };
  localStorage.setItem("data_hoadon_in", JSON.stringify(data));

  const isHoaDonDacBiet =
    forceSpecial || (getInput("sohd")?.getAttribute("data-mod3") === "yes");

  const url = isHoaDonDacBiet ? "/in-hoadon-db.html" : "/in-hoadon.html";

  if (typeof window.openPrintOverlay === "function") {
    const fast1 = getInput("inNhanh")?.checked;
    const fast2 = getInput("chk_innhanh")?.checked;
    const fast = !!(fast1 || fast2);

    if (fast && typeof window.quickPrint === "function") {
      window.quickPrint(url);
    } else {
      window.openPrintOverlay(url, { autoPrint: false });
    }
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Không thể gọi print() từ iframe:", e);
      } finally {
        iframe.remove();
      }
    }, 500);
  };
}

async function resetAfterSave() {
  const diadiemVal = getInput("diadiem")?.value || "";
  const manvVal = getInput("manv")?.value || "";
  const tennvVal = getInput("tennv")?.value || "";

  document.querySelectorAll("input").forEach(input => {
    if (!["diadiem", "manv", "tennv", "hd_state"].includes(input.id)) {
      input.value = "";
    }
  });

  resetBangKetQua();
  capNhatThongTinTong(getBangKetQua());

  if (getInput("diadiem")) getInput("diadiem").value = diadiemVal;
  if (getInput("manv")) getInput("manv").value = manvVal;
  if (getInput("tennv")) getInput("tennv").value = tennvVal;
  if (getInput("ngay")) getInput("ngay").value = await getServerTodayVN();

  window.HD_CTX = { mode: "NEW", version: null };
  window.dangSuaHoaDon = false;
  window.choPhepSua = false;

  await capNhatSoHoaDonTuDong();

  if (getInput("hd_state")) getInput("hd_state").value = "moi";
  getInput("masp")?.focus();
}

async function saveNewBanLe() {
  if (!validateBeforeSave()) return;

  const sohdNhap = getText("sohd");
  const existed = await hoaDonDaTonTaiAny(sohdNhap);

  if (!existed && await handleSpecialSoHoaDon(supabase, sohdNhap)) {
    return { ok: true, mode: "SPECIAL" };
  }

  let loai = getLoaiFromSoHDInput();
  if (!loai) {
    await capNhatSoHoaDonTuDong();
    loai = getLoaiFromSoHDInput();
    if (!loai) {
      alert("❗Chưa xác định được loại chứng từ từ số hóa đơn.");
      return;
    }
  }

  const diadiemTrang = loai.includes("cs2") ? "cs2" : "cs1";

  let bangKetQua = getBangKetQua();
  const header = await buildHeader(loai, diadiemTrang, bangKetQua);
  const checkDiem = await kiemTraDiemKhachHangTruocKhiLuu(header.thanhtoan);
  if (!checkDiem?.ok) {
    return { ok: false, reason: "INVALID_CUSTOMER_POINTS" };
  }

  await refreshSessionIfNeeded();

  const { data: rpcRes, error: rpcErr } = await supabase.rpc("save_new_header_v2", {
    p_loai: loai,
    p_diadiem: diadiemTrang,
    p_header: header
  });

  if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
    console.error(rpcErr);
    alert("❌ Lưu hóa đơn thất bại (cấp số).");
    return;
  }

  const sohdThucTe = rpcRes[0].sohd;
  if (getInput("sohd")) getInput("sohd").value = sohdThucTe;

  // ✅ ÉP CẬP NHẬT LẠI HEADER SAU RPC
  // Phòng trường hợp RPC chưa ghi đủ cột điểm/thanhtoan
  const { error: errUpdateHeader } = await supabase
    .from("hoadon_banle")
    .update({
      makh: getMakhSafe() || header.makh || null,
      khachhang: header.khachhang,
      diem_tru: header.diem_tru,
      tien_doi_diem: header.tien_doi_diem,
      thanhtoan: header.thanhtoan,
      tongthanhtien: header.tongthanhtien,
      tongkm: header.tongkm,
      chietkhau: header.chietkhau
    })
    .eq("sohd", sohdThucTe);

  if (errUpdateHeader) {
    console.error("❌ Lỗi cập nhật lại header sau RPC:", errUpdateHeader);
    alert("❌ Đã cấp số hóa đơn nhưng chưa cập nhật được tiền giảm điểm.");
    return;
  }

  normalizeBangKetQua(getBangKetQua());
  bangKetQua = getBangKetQua();

  const chitiet = await buildDetails(sohdThucTe, diadiemTrang, bangKetQua);

  const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);
  if (errCT) {
    console.error(errCT);
    alert("❌ Lỗi khi lưu chi tiết hóa đơn.");
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdThucTe);
    return;
  }

  await capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang);

  // ✅ Xử lý điểm khách hàng sau khi hóa đơn đã lưu thành công
  // 🔥 CHỈ tích điểm cho hóa đơn bán tại quầy (bancs)
  if (loai === "bancs1" || loai === "bancs2") {
    await xuLyDiemKhachHangSauLuu(sohdThucTe, header.thanhtoan);
  } else {
    console.log("🚫 Không tích điểm cho loại hóa đơn:", loai);
  }

  const hoadonIn = { ...header, sohd: sohdThucTe };
  printInvoice(hoadonIn, chitiet);
  await resetAfterSave();

  return {
    ok: true,
    mode: "NEW",
    sohd: sohdThucTe,
    hoadon: hoadonIn,
    chitiet
  };
}

async function saveEditBanLe() {
  if (!validateBeforeSave()) return;

  const sohd = getText("sohd");
  if (!sohd) {
    alert("❌ Không có số hóa đơn để sửa.");
    return;
  }

  const { data: tonTai } = await supabase
    .from("hoadon_banle")
    .select("sohd, created_at")
    .eq("sohd", sohd)
    .maybeSingle();

  if (!tonTai) {
    alert("❌ Không tìm thấy hóa đơn để sửa.");
    return;
  }

  await refreshSessionIfNeeded();

  let oldSnap;
  try {
    oldSnap = await snapshotInvoiceBeforeEditLocal(sohd);
  } catch (e) {
    console.error("snapshotInvoiceBeforeEdit lỗi:", e);
    alert("❌ Không snapshot được hóa đơn trước khi sửa.");
    return;
  }

  let loai = getLoaiFromSoHDInput();
  if (!loai) {
    alert("❌ Không xác định được loại hóa đơn khi sửa.");
    return;
  }

  const diadiemTrang = loai.includes("cs2") ? "cs2" : "cs1";
  let bangKetQua = getBangKetQua();

  const header = await buildHeader(loai, diadiemTrang, bangKetQua);
  const chitiet = await buildDetails(sohd, diadiemTrang, bangKetQua);

  const editNow = await getServerNowISO();
  header.updated_at = editNow;
  delete header.created_at;

  chitiet.forEach(r => {
    delete r.created_at;
    r.updated_at = editNow;
  });

  // ===== LOG SỬA HÓA ĐƠN =====
  const newSnap = {
    header: { ...header, sohd },
    details: chitiet
  };

  try {
    await supabase.rpc("rpc_log_edit_invoice", {
      p_sohd: sohd,
      p_old: oldSnap,
      p_new: newSnap,
      p_source: "banle_edit"
    });
    console.log("🟢 Đã ghi log sửa hóa đơn");
  } catch (e) {
    console.error("❌ Lỗi ghi log sửa hóa đơn:", e);
  }

  const { error: errDelCT } = await supabase
    .from("ct_hoadon_banle")
    .delete()
    .eq("sohd", sohd);

  if (errDelCT) {
    console.error(errDelCT);
    alert("❌ Lỗi xóa chi tiết cũ.");
    return;
  }

  delete header.created_at;

  const { error: errUpdateHD } = await supabase
    .from("hoadon_banle")
    .update({
      ...header,
      updated_at: await getServerNowISO()
    })
    .eq("sohd", sohd);

  if (errUpdateHD) {
    console.error(errUpdateHD);
    alert("❌ Lỗi cập nhật header hóa đơn.");
    return;
  }

  const { error: errInsertCT } = await supabase
    .from("ct_hoadon_banle")
    .insert(chitiet);

  if (errInsertCT) {
    console.error(errInsertCT);
    alert("❌ Lỗi ghi lại chi tiết hóa đơn.");
    return;
  }

  await capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang);

  const hoadonIn = { ...header, sohd };
  printInvoice(hoadonIn, chitiet);
  await resetAfterSave();

  return {
    ok: true,
    mode: "EDIT",
    sohd,
    hoadon: hoadonIn,
    chitiet
  };
}

export async function saveHoaDonBanLe(ctx) {
  console.log("👉 Service bán lẻ chạy độc lập");

  if (isEditMode(ctx)) {
    return await saveEditBanLe();
  }

  return await saveNewBanLe();
}
