// scripts/services/hoadonSale.js

import { supabase } from '../supabaseClient.js';
import { getBangKetQua, resetBangKetQua } from '../hoadon.js';
import { capNhatThongTinTong } from '../utils.js';
import { capNhatSoHoaDonTuDong } from '../sohoadon.js';

import {
  refreshSessionIfNeeded,
  hoaDonDaTonTaiAny,
  capNhatUsedTuVanSauKhiLuuCT
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

function getIntValue(id) {
  return parseInt(
    (getInput(id)?.value || "").replace(/[^\d-]/g, "") || "0",
    10
  ) || 0;
}

function isEditMode(ctx) {
  return !!(
    ctx?.isEdit ||
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true
  );
}

function validateBeforeSave() {
  capNhatThongTinTong(getBangKetQua());

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
  if (hdState === "xem") {
    const p = getInput("popupXacThucSua");
    if (p) {
      p.style.display = "block";
      getInput("xacmanv")?.focus();
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

function buildHeader(loai, diadiemTrang, bangKetQua) {
  return {
    ngay: getText("ngay"),
    manv: getText("manv"),
    tennv: getText("tennv"),
    diadiem: diadiemTrang,
    khachhang: getText("khachhang"),
    tongsl: getIntValue("tongsl"),
    tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
    tongkm: getIntValue("tongkm"),
    chietkhau: getIntValue("chietkhau"),
    thanhtoan: getIntValue("phaithanhtoan"),
    hinhthuctt: getInput("hinhthuctt")?.value || "",
    ghichu: getText("ghichu"),
    dvt: "",
    loaihd: loai,
    loai: loai,
    nhacc: ""
  };
}

function buildDetails(sohd, diadiemTrang, bangKetQua) {
  const createdAt = new Date().toISOString();
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
  if (getInput("ngay")) getInput("ngay").value = new Date().toISOString().slice(0, 10);

  window.HD_CTX = { mode: "NEW", version: null };

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
  const header = buildHeader(loai, diadiemTrang, bangKetQua);

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

  normalizeBangKetQua(getBangKetQua());
  bangKetQua = getBangKetQua();

  const chitiet = buildDetails(sohdThucTe, diadiemTrang, bangKetQua);

  const { error: errCT } = await supabase.from("ct_hoadon_banle").insert(chitiet);
  if (errCT) {
    console.error(errCT);
    alert("❌ Lỗi khi lưu chi tiết hóa đơn.");
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdThucTe);
    return;
  }

  await capNhatUsedTuVanSauKhiLuuCT(chitiet, loai, diadiemTrang);

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

export async function saveHoaDonBanLe(ctx) {
  console.log("👉 Service bán lẻ chạy độc lập");

  if (isEditMode(ctx)) {
    alert("⏳ Luồng SỬA bán lẻ thường trong service mới chưa bật. Tạm thời chỉ test luồng THÊM MỚI.");
    return;
  }

  return await saveNewBanLe();
}
