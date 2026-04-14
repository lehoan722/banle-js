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

function getIntValue(id) {
  return parseInt(
    (document.getElementById(id)?.value || "").replace(/[.,]/g, "") || "0",
    10
  );
}

function getInputValue(id) {
  return document.getElementById(id)?.value?.trim?.() || "";
}

function getRealEditMode(ctx) {
  return !!(
    ctx?.isEdit ||
    window.HD_CTX?.mode === "EDIT" ||
    window.choPhepSua === true
  );
}

function getLegacySaleSaveFn() {
  return (
    window.__LUU_HOADON_BANLE_CU__ ||
    window.luuHoaDonQuaAPI_CU ||
    null
  );
}

function printInvoice(hoadon, chitiet, forceSpecial = false) {
  const data = { hoadon, chitiet };
  localStorage.setItem("data_hoadon_in", JSON.stringify(data));

  const isHoaDonDacBiet =
    forceSpecial || (document.getElementById("sohd")?.getAttribute("data-mod3") === "yes");

  const url = isHoaDonDacBiet ? "/in-hoadon-db.html" : "/in-hoadon.html";

  if (typeof window.openPrintOverlay === "function") {
    const fast1 = document.getElementById("inNhanh")?.checked;
    const fast2 = document.getElementById("chk_innhanh")?.checked;
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
  const diadiemVal = document.getElementById("diadiem")?.value || "";
  const manvVal = document.getElementById("manv")?.value || "";
  const tennvVal = document.getElementById("tennv")?.value || "";

  document.querySelectorAll("input").forEach(input => {
    if (!["diadiem", "manv", "tennv", "hd_state"].includes(input.id)) {
      input.value = "";
    }
  });

  resetBangKetQua();
  capNhatThongTinTong(getBangKetQua());

  if (document.getElementById("diadiem")) {
    document.getElementById("diadiem").value = diadiemVal;
  }
  if (document.getElementById("manv")) {
    document.getElementById("manv").value = manvVal;
  }
  if (document.getElementById("tennv")) {
    document.getElementById("tennv").value = tennvVal;
  }
  if (document.getElementById("ngay")) {
    document.getElementById("ngay").value = new Date().toISOString().slice(0, 10);
  }

  window.HD_CTX = { mode: "NEW", version: null };

  await capNhatSoHoaDonTuDong();

  const st = document.getElementById("hd_state");
  if (st) st.value = "moi";

  document.getElementById("masp")?.focus();
}

function buildHeader(loai, diadiemTrang, bangKetQua) {
  return {
    ngay: getInputValue("ngay"),
    manv: getInputValue("manv"),
    tennv: getInputValue("tennv"),
    diadiem: diadiemTrang,
    khachhang: getInputValue("khachhang"),
    tongsl: getIntValue("tongsl"),
    tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
    tongkm: getIntValue("tongkm"),
    chietkhau: getIntValue("chietkhau"),
    thanhtoan: getIntValue("phaithanhtoan"),
    hinhthuctt: document.getElementById("hinhthuctt")?.value || "",
    ghichu: getInputValue("ghichu"),
    dvt: "",
    loaihd: loai,
    loai: loai,
    nhacc: ""
  };
}

function buildChiTiet(sohdThucTe, diadiemTrang, bangKetQua) {
  const createdAt = new Date().toISOString();
  const ngay = getInputValue("ngay");
  const chitiet = [];

  Object.values(bangKetQua || {}).forEach(item => {
    (item.sizes || []).forEach((sz, i) => {
      const sl = item.soluongs?.[i];
      chitiet.push({
        sohd: sohdThucTe,
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

  return chitiet;
}

async function saveNewBanLe(ctx) {
  capNhatThongTinTong(getBangKetQua());

  const maspChuaNhap = getInputValue("masp");
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng! Hãy kiểm tra lại trước khi lưu hóa đơn.");
    document.getElementById("masp")?.focus();
    return;
  }

  let bangKetQua = ctx?.bangKetQua || getBangKetQua();
  const sohd = getInputValue("sohd");
  const tennv = getInputValue("tennv");

  if (!sohd) {
    alert("❌ Chưa có số hóa đơn.");
    return;
  }
  if (!tennv) {
    alert("❌ Bạn chưa nhập tên nhân viên bán hàng.");
    return;
  }

  const manvGuard = getInputValue("manv") || localStorage.getItem("manv") || "";
  if (!manvGuard || manvGuard.toUpperCase() === "ADMIN") {
    alert("❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.");
    console.error("GUARD BLOCKED SAVE – manv =", manvGuard);
    return;
  }

  const hdState = (document.getElementById("hd_state")?.value || "moi").trim().toLowerCase();
  if (hdState === "xem") {
    const p = document.getElementById("popupXacThucSua");
    if (p) {
      p.style.display = "block";
      document.getElementById("xacmanv")?.focus();
    } else {
      alert("❌ Bạn đang xem hóa đơn cũ. Vui lòng bấm SỬA để xác thực trước khi lưu.");
    }
    return;
  }

  const existed = await hoaDonDaTonTaiAny(sohd);
  if (!existed && await handleSpecialSoHoaDon(supabase, sohd)) {
    return;
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
  document.getElementById("sohd").value = sohdThucTe;

  normalizeBangKetQua(getBangKetQua());
  bangKetQua = getBangKetQua();

  const chitiet = buildChiTiet(sohdThucTe, diadiemTrang, bangKetQua);

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
  const isEditReal = getRealEditMode(ctx);

  if (isEditReal) {
    const legacyFn = getLegacySaleSaveFn();
    if (typeof legacyFn !== "function") {
      throw new Error("❌ Chưa nối được luồng EDIT cũ cho bán lẻ.");
    }
    return await legacyFn();
  }

  return await saveNewBanLe(ctx);
}
