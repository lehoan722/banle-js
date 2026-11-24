// scripts/banhangbaomat/luuHoaDonEntry.js

import { taoDuLieuLuuBaoMat } from "./taoDuLieuLuu.js";
import { guiDuLieuLuuBaoMat } from "./dichVuLuuHoaDon.js";
import { xuLyKetQuaLuuBaoMat } from "./xuLyKetQuaLuu.js";
import { inHoaDonBaoMat } from "./inHoaDonBaoMat.js";
import { guiHoaDonViettel } from "../viettelInvoice.js";
import { getBangKetQua } from "../hoadon.js";
import { capNhatThongTinTong } from "../utils.js";
import { getLoaiFromSoHDInput } from "../luuhoadon/builders.js";
import { calcTongThanhTienFromBangKetQua } from "../luuhoadon/pricing.js";
import { validateKhachHangBatBuoc } from "../services/validateKhachHangTichDiem.js";
import { emitInventoryChangedByBangKetQua } from "../services/inventoryEvents.js";

let dangLuuBaoMat = false;

function getInput(id) {
  return document.getElementById(id);
}

function getText(id) {
  return getInput(id)?.value?.trim?.() || "";
}

function getIntValue(id) {
  return parseInt((getInput(id)?.value || "").replace(/[^\d-]/g, "") || "0", 10) || 0;
}

function chuanHoaKhongDau(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function laKhachLeHienTai() {
  const maKh = chuanHoaKhongDau(
    getText("makh") || getText("ma_khach_hang") || getText("makhInput")
  );
  const tenKh = chuanHoaKhongDau(
    getText("khachhang") || getText("tenkh") || getText("tenkhachhang")
  );

  return !maKh || maKh === "KL" || tenKh === "KHACH LE";
}

function xoaDuLieuDiemNeuLaKhachLe() {
  if (!laKhachLeHienTai()) return false;

  // KL không được cộng điểm, trừ điểm hoặc đổi điểm dưới bất kỳ hình thức nào.
  ["diem_tru", "tien_doi_diem"].forEach((id) => {
    const el = getInput(id);
    if (el) el.value = "0";
  });

  return true;
}

function apDungGiamDiemVaoThanhToan() {
  const tongHang = calcTongThanhTienFromBangKetQua(getBangKetQua());
  const chietKhau = getIntValue("chietkhau");
  const tienDoiDiem = getIntValue("tien_doi_diem");
  const phaiTra = Math.max(0, tongHang - chietKhau - tienDoiDiem);

  if (getInput("phaithanhtoan")) getInput("phaithanhtoan").value = phaiTra.toLocaleString("vi-VN");
  if (getInput("khachtra")) getInput("khachtra").value = phaiTra.toLocaleString("vi-VN");
  if (getInput("conlai")) getInput("conlai").value = "0";

  return phaiTra;
}

async function validateBeforeSecureSave() {
  capNhatThongTinTong(getBangKetQua());

  // Phải xóa dữ liệu điểm trước khi tính lại thanh toán và trước khi tạo payload.
  xoaDuLieuDiemNeuLaKhachLe();
  apDungGiamDiemVaoThanhToan();

  const maspChuaNhap = getText("masp");
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
    getInput("masp")?.focus();
    return false;
  }

  if (!getText("sohd")) {
    alert("❌ Chưa có số hóa đơn.");
    return false;
  }

  if (!getText("tennv")) {
    alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");
    return false;
  }

  const manvGuard = (getText("manv") || localStorage.getItem("manv") || "").trim();
  const isAdminLogin = localStorage.getItem("is_admin") === "true";

  if (!manvGuard) {
    alert("❌ Lỗi xác định nhân viên. Vui lòng đăng nhập lại.");
    return false;
  }

  if (manvGuard.toUpperCase() === "ADMIN" && !isAdminLogin) {
    alert("❌ Tài khoản ADMIN chưa xác thực đúng quyền.");
    return false;
  }

  const hdState = (getText("hd_state") || "moi").toLowerCase();
  const isEditReal = window.HD_CTX?.mode === "EDIT" || window.choPhepSua === true;

  if (hdState === "xem" && !isEditReal) {
    if (typeof window.moPopupXacThucSua === "function") {
      window.moPopupXacThucSua();
    } else {
      alert("❌ Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.");
    }
    return false;
  }

  const loai = getLoaiFromSoHDInput() || getText("sohd").toLowerCase().split("_")[0] || "";
  const okKh = await validateKhachHangBatBuoc(loai);
  if (!okKh) return false;

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("❌ Không có dữ liệu để lưu.");
    return false;
  }

  const hdState2 = (getText("hd_state") || "moi").toLowerCase();
  const isEditInvoice =
    hdState2 === "sua" ||
    window.HD_CTX?.mode === "EDIT" ||
    window.__xacNhanSuaBaoMat_OK === true;

  const isTmt = getText("hinhthuctt").toLowerCase() === "tmt";
  const isToDo = getInput("sohd")?.getAttribute("data-mod3") === "yes";

  if (!isEditInvoice && (isTmt || isToDo)) {
    const ok = confirm("Bạn có chắc chắn muốn lưu hóa đơn này?\n.");
    if (!ok) return false;
  }
  return true;
}

function layLoaiHoaDonSauLuu(ketQuaDaXuLy, payload) {
  const sohd = String(
    ketQuaDaXuLy?.sohd ||
    payload?.sohd ||
    ""
  ).trim().toLowerCase();

  return sohd.split("_")[0] || "";
}

function layDiaDiemSauLuu(loai, payload) {
  return (
    payload?.diadiem ||
    (String(loai).includes("cs2") ? "cs2" : "cs1")
  );
}

function layChiTietSauLuu(payload) {
  if (Array.isArray(payload?.chitiet)) {
    return payload.chitiet;
  }

  if (Array.isArray(payload?.chi_tiet)) {
    return payload.chi_tiet;
  }

  if (Array.isArray(payload?.details)) {
    return payload.details;
  }

  return [];
}

function laTrangNhapXuatKiem(loai, sohd) {
  const path = String(window.location.pathname || "").toLowerCase();
  const l = String(loai || "").toLowerCase();
  const s = String(sohd || "").toLowerCase();

  return (
    path.includes("nhapkiemcs1") ||
    path.includes("nhapkiemcs2") ||
    path.includes("xuatkiemcs1") ||
    path.includes("xuatkiemcs2") ||

    l.startsWith("nhapkiemcs1") ||
    l.startsWith("nhapkiemcs2") ||
    l.startsWith("xuatkiemcs1") ||
    l.startsWith("xuatkiemcs2") ||

    s.startsWith("nhapkiemcs1_") ||
    s.startsWith("nhapkiemcs2_") ||
    s.startsWith("xuatkiemcs1_") ||
    s.startsWith("xuatkiemcs2_")
  );
}

async function markKiemTonLoiThoiSauNhapXuat(
  sohd,
  loai,
  diadiem,
  bangKetQua
) {
  try {
    if (!laTrangNhapXuatKiem(loai, sohd)) return;

    const dsMasp = Array.from(
      new Set(
        Object.values(bangKetQua || {})
          .map(x => String(x.masp || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (!dsMasp.length) return;

    const { data, error } = await window.supabase.rpc(
      "rpc_mark_ct_kiem_ton_loi_thoi_by_masp",
      {
        p_diadiem: diadiem,
        p_ds_masp: dsMasp,
        p_nguon: sohd
      }
    );

    if (error) {
      console.error("[BAO MAT] mark kiểm tồn lỗi:", error);
    } else {
      console.log("[BAO MAT] Đã đánh dấu kiểm tồn lỗi thời:", data);
    }
  } catch (e) {
    console.error("[BAO MAT] lỗi mark kiểm tồn:", e);
  }
}

async function xuLyNghiepVuSauLuuBaoMat(
  ketQuaDaXuLy,
  payload
) {
  const sohd = ketQuaDaXuLy?.sohd;

  if (!sohd) {
    console.warn("[BAO MAT] Không có sohd để chạy nghiệp vụ sau lưu.");
    return;
  }

  const loai = layLoaiHoaDonSauLuu(
    ketQuaDaXuLy,
    payload
  );

  const diadiem = layDiaDiemSauLuu(
    loai,
    payload
  );

  const bangKetQua = getBangKetQua();

  const chitiet = layChiTietSauLuu(payload);

  console.log("[BAO MAT] BẮT ĐẦU NGHIỆP VỤ SAU LƯU", {
    sohd,
    loai,
    diadiem,
    soDongChiTiet: chitiet.length
  });

  // V2: rpc_save_invoice_secure tự claim đúng tu_van_ct_id trong CÙNG transaction.
  // Không gọi cơ chế cũ capNhatUsedTuVanSauKhiLuuCT vì cơ chế cũ có thể đánh dấu
  // nhiều dòng tư vấn cùng mã là used_for_mt=true.

  await markKiemTonLoiThoiSauNhapXuat(
    sohd,
    loai,
    diadiem,
    bangKetQua
  );

  try {
    emitInventoryChangedByBangKetQua(
      bangKetQua,
      {
        source: "hoadon_secure_save",
        sohd,
        loai,
        diadiem,
        manv:
          payload?.manv ||
          document.getElementById("manv")?.value ||
          ""
      }
    );
  } catch (e) {
    console.error(
      "[BAO MAT] emit tồn kho lỗi:",
      e
    );
  }

  console.log(
    "[BAO MAT] HOÀN TẤT NGHIỆP VỤ SAU LƯU"
  );
}

// HOANTUYET SECURE SAVE V2 - client state machine.
// Ban sao payload bat bien chi nam trong RAM (khong luu du lieu KH vao web storage).
const HT_PENDING_KEY = "ht_secure_save_v2_pending_" + location.pathname;
let htPendingPayload = null;
let htCommitted = null;
const htReadId = () => { try { return sessionStorage.getItem(HT_PENDING_KEY); } catch { return null; } };
const htWriteId = id => { try { sessionStorage.setItem(HT_PENDING_KEY,id); } catch {} };
function htResetInvoiceRequest() {
  try { sessionStorage.removeItem(HT_PENDING_KEY); } catch {}
  htPendingPayload = null;
  htCommitted = null;
}
// CHI "Them moi" moi xoa phien; KHONG tu xoa sau khi luu.
window.__htSecureSaveV2NewInvoice = function () {
  if (dangLuuBaoMat) return false;
  const id = htReadId();
  if (id && !htCommitted?.ok) return false;
  htResetInvoiceRequest();
  return true;
};
function htError(e,id) {
  console.error("[HOANTUYET SAVE V2]",{request_id:id,
    code:e?.code||"SAVE_ERROR",message:e?.message||"",
    details:e?.details||"",hint:e?.hint||"",time:new Date().toISOString()});
}
async function htLookup(id) {
  const {supabase} = await import("../supabaseClient.js");
  const {data,error} = await supabase.rpc("rpc_secure_save_status_v2",{p_request_id:id});
  if(error) { const e=new Error(error.message||"STATUS_LOOKUP_FAILED"); e.code=error.code; throw e; }
  return data;
}
function htUncertain(id,code="SAVE_UNCONFIRMED",message="Khong xac dinh duoc trang thai luu. Bao quan ly kiem tra, khong tao hoa don moi.") {
  return {ok:false,code,message,request_id:id};
}
async function htFinishCommitted(result,payload,fromRecovery=false) {
  htCommitted=result;
  const sohd=result?.sohd||"(chua co sohd)";
  if(fromRecovery || !payload) {
    // V2.1: Already committed; caller will safely reset the sale form.
    // Do not block the cashier with an alert.
    return result;
  }
  const warnings=[];
  try { await xuLyNghiepVuSauLuuBaoMat(result,payload); }
  catch(e) { console.error("[POST SAVE WORK]",e); warnings.push("dong bo sau luu"); }
  try {
    const pr=result?.point_result?.new_process||result?.point_result;
    if(pr?.ok) {
      const diemEl=document.getElementById("diem_hientai");
      const hangEl=document.getElementById("hang_khach");
      if(diemEl && pr.diem_sau!=null) diemEl.value=pr.diem_sau;
      if(hangEl && pr.hang_khach!=null) hangEl.value=pr.hang_khach;
    }
  } catch(e) { console.error("[POST SAVE POINT UI]",e); warnings.push("hien thi diem"); }
  try { inHoaDonBaoMat(result,payload); }
  catch(e) { console.error("[POST SAVE PRINT]",e); warnings.push("in hoa don"); }
  // Gui Viettel chi lan dau; replay KHONG gui tiep de tranh gui trung.
  if(result?.mode==="SAVE_REAL_V1" && result?.external_send===true && result?.sohdT && !result?.idempotent_replay) {
    try { const r=await guiHoaDonViettel(result.sohdT); if(!r?.ok) warnings.push("gui hoa don dien tu"); }
    catch(e) { console.error("[POST SAVE VIETTEL]",e); warnings.push("gui hoa don dien tu"); }
  }
  // V2.1: Success is silent. Only post-commit warnings need attention.
  // The invoice is committed regardless of print/UI failures.
  if(warnings.length) {
    console.warn("[FAST CHECKOUT] Hoa don da luu, tac vu sau luu loi", {sohd,warnings});
    try {
      if(typeof window.showToast === "function") {
        window.showToast("Da luu HD " + sohd + "; can kiem tra: " + warnings.join(", "));
      }
    } catch(e) { console.warn("[FAST CHECKOUT] Toast unavailable",e); }
  }
  return {...result, post_save_warnings:warnings};
}
export async function luuHoaDonBaoMat() {
  if(dangLuuBaoMat) return {ok:false,code:"SAVE_IN_PROGRESS",silent:true};
  if(htCommitted?.ok) {
    // Duplicate click while the previous invoice is already committed:
    // replay the same result, never create a new invoice.
    return {...htCommitted,idempotent_local:true};
  }
  dangLuuBaoMat=true;
  let id=htReadId(), payload=htPendingPayload;
  try {
    if(id && !payload) {
      let st;
      try { st=await htLookup(id); } catch(e) { htError(e,id); return htUncertain(id); }
      if(st?.found && ["save_ok","edit_ok"].includes(st.status) && st.result?.ok) {
        return await htFinishCommitted(st.result,null,true);
      }
      if(st?.found && st.status === "validate_failed") {
        // The server has a terminal failure for this exact request.
        // Never save the currently displayed basket automatically on recovery.
        htResetInvoiceRequest();
        return {ok:false,code:"PREVIOUS_SAVE_REJECTED",
          message:"Yêu cầu lưu trước đã bị từ chối. Bạn có thể kiểm tra dữ liệu, bấm Lưu lại hoặc Thêm mới."};
      }
      // After reload, cannot safely reconstruct original immutable payload.
      // Even if no audit row, the previous network request may still be in-flight.
      return htUncertain(id,"UNRESOLVED_PREVIOUS_REQUEST");
    }
    if(!payload) {
      const valid=await validateBeforeSecureSave();
      if(!valid) return {ok:false,code:"VALIDATE_BEFORE_SAVE_FAILED",silent:true};
      payload=taoDuLieuLuuBaoMat();
      id=payload.request_id;
      htPendingPayload=payload;
      htWriteId(id); // before network request
    }
    let result;
    try {
      result=xuLyKetQuaLuuBaoMat(await guiDuLieuLuuBaoMat(payload));
    } catch(e) {
      htError(e,id);
      let st;
      try { st=await htLookup(id); } catch(checkError) { htError(checkError,id); }
      if(st?.found && ["save_ok","edit_ok"].includes(st.status) && st.result?.ok) {
        result={...st.result,idempotent_replay:true};
      } else if(st?.found && st.status==="validate_failed") {
        // Core guarantees no invoice committed for a validation failure.
        // Caller can correct data and create a fresh request.
        htResetInvoiceRequest();
        return {ok:false,code:e?.code||"VALIDATION_FAILED",
          message:(e?.message||"Dữ liệu không hợp lệ") +
            "\nHóa đơn chưa được lưu bởi yêu cầu này. Có thể sửa và bấm Lưu lại hoặc Thêm mới."};
      } else if(!st?.found && e?.code==="40P01") {
        // PostgreSQL cancelled the transaction; same immutable payload may retry.
        return {ok:false,code:"40P01",request_id:id,
          message:"Xung dot giao dich (deadlock). Bam Luu de thu lai CUNG yeu cau."};
      }
      if(!result) return htUncertain(id,e?.code||"SAVE_UNCONFIRMED");
    }
    if(!result?.ok) {
      // Do NOT treat a business rejection as committed.
      return {ok:false,code:result?.code||"SAVE_REJECTED",
        message:result?.message||"Yeu cau bi tu choi",request_id:id};
    }
    if(!["SAVE_REAL_V1","EDIT_REAL_V1"].includes(result?.mode) || !result?.sohd) {
      return htUncertain(id,"UNEXPECTED_SAVE_RESULT","RPC tra ket qua khong ro; bao quan ly kiem tra.");
    }
    return await htFinishCommitted(result,payload);
  } catch(e) {
    htError(e,id);
    return htUncertain(id,e?.code||"SAVE_FAILED");
  } finally { dangLuuBaoMat=false; }
}

window.luuHoaDonBaoMat = luuHoaDonBaoMat;
window.testLuuHoaDonBaoMat = luuHoaDonBaoMat;
