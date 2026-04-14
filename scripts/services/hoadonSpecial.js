// scripts/services/hoadonSpecial.js

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
  getLoaiFromSoHDInput
} from '../luuhoadon/builders.js';

import {
  normalizeBangKetQua,
  calcTongThanhTienFromBangKetQua
} from '../luuhoadon/pricing.js';

import { guiHoaDonViettel } from '../viettelInvoice.js';


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

function ensureSpecialSaveConfirmDialog() {
  if (document.getElementById("special-save-confirm")) return;

  const style = document.createElement("style");
  style.id = "special-save-confirm-style";
  style.textContent = `
    .ssc-mask{
      position:fixed; inset:0; background:rgba(0,0,0,.35);
      z-index:99998;
    }
    .ssc-box{
      position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
      width:480px; max-width:92vw;
      background:#fff; border-radius:18px;
      box-shadow:0 14px 40px rgba(0,0,0,.2);
      z-index:99999; font-family:Arial,sans-serif;
      overflow:hidden;
    }
    .ssc-head{
      padding:18px 20px 8px;
      font-size:16px; font-weight:700; color:#222;
    }
    .ssc-body{
      padding:0 20px 16px;
      font-size:14px; line-height:1.55; color:#333;
      white-space:pre-line;
    }
    .ssc-actions{
      display:flex; justify-content:flex-end; gap:12px;
      padding:0 20px 20px;
    }
    .ssc-btn{
      min-width:76px; height:42px; border:none; border-radius:999px;
      font-size:15px; font-weight:700; cursor:pointer;
    }
    .ssc-btn.ok{
      background:#2e7d32; color:#fff;
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.65);
    }
    .ssc-btn.cancel{
      background:#b9ef9f; color:#234d20;
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.id = "special-save-confirm";
  wrap.style.display = "none";
  wrap.innerHTML = `
    <div class="ssc-mask"></div>
    <div class="ssc-box" role="dialog" aria-modal="true">
      <div class="ssc-head">banle-js.vercel.app cho biết</div>
      <div class="ssc-body" id="ssc-message"></div>
      <div class="ssc-actions">
        <button class="ssc-btn ok" id="ssc-ok">OK</button>
        <button class="ssc-btn cancel" id="ssc-cancel">Hủy</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
}

function askConfirmSpecialSave() {
  ensureSpecialSaveConfirmDialog();

  const wrap = document.getElementById("special-save-confirm");
  const msg = document.getElementById("ssc-message");
  const okBtn = document.getElementById("ssc-ok");
  const cancelBtn = document.getElementById("ssc-cancel");
  const mask = wrap.querySelector(".ssc-mask");

  msg.textContent =
    "Bạn có chắc chắn muốn lưu hóa đơn nàyy ?\nNhấn OK để lưu, Hủy để quay về giao diện hóa đơn.";

  wrap.style.display = "block";

  return new Promise((resolve) => {
    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      mask.removeEventListener("click", onCancel);
      wrap.style.display = "none";
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    mask.addEventListener("click", onCancel);
  });
}

function validateBeforeSave2Ban() {
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
    console.error("GUARD BLOCKED SAVE 2 BAN – manv =", manvGuard);
    return false;
  }

  const bangKetQua = getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("❌ Không có dữ liệu để lưu.");
    return false;
  }

  return true;
}

function buildHeaderMain(loai, diadiemTrang, bangKetQua, sohd) {
  return {
    sohd,
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

function buildHeaderT(loaiT, diadiemTrang, bangKetQua, sohdT) {
  return {
    sohd: sohdT,
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
    loaihd: loaiT,
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
  window.dangSuaHoaDon = false;
  window.choPhepSua = false;

  await capNhatSoHoaDonTuDong();

  if (getInput("hd_state")) getInput("hd_state").value = "moi";
  getInput("masp")?.focus();
}

export async function saveHoaDonSpecial(ctx) {
  console.log("📄 Service lưu 2 bản chạy độc lập");

  if (!validateBeforeSave2Ban()) return;

  const sohdNhap = getText("sohd");
  if (!sohdNhap) {
    alert("❌ Chưa có số hóa đơn.");
    return;
  }

  const existedAny = await hoaDonDaTonTaiAny(sohdNhap);
  if (existedAny) {
    alert("❌ Số hóa đơn này đã tồn tại ở bảng chính hoặc bảng T. Không thể lưu 2 bản.");
    return;
  }

  const okConfirm = await askConfirmSpecialSave();
  if (!okConfirm) {
    return {
      ok: false,
      reason: "USER_CANCEL_SPECIAL_SAVE"
    };
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

  if (loai !== "bancs1" && loai !== "bancs2") {
    alert("❌ Lưu 2 bản chỉ áp dụng cho bancs1 / bancs2.");
    return;
  }

  const diadiemTrang = loai.includes("cs2") ? "cs2" : "cs1";

  await refreshSessionIfNeeded();

  let bangKetQua = getBangKetQua();
  normalizeBangKetQua(bangKetQua);
  bangKetQua = getBangKetQua();

  const headerChinhKhongSo = {
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

  // 1) Cấp số + lưu HEADER CHÍNH bằng RPC chuẩn
  const { data: rpcRes, error: rpcErr } = await supabase.rpc("save_new_header_v2", {
    p_loai: loai,
    p_diadiem: diadiemTrang,
    p_header: headerChinhKhongSo
  });

  if (rpcErr || !rpcRes || !rpcRes[0]?.sohd) {
    console.error(rpcErr);
    alert("❌ Lưu 2 bản thất bại ở bước cấp số header chính.");
    return;
  }

  const sohdChinh = rpcRes[0].sohd;

  const loaiT = loai + "T";
  const { data: sohdT, error: sohdTErr } = await supabase.rpc("next_sohd_only", {
    p_loai: loaiT
  });

  if (sohdTErr || !sohdT) {
    console.error(sohdTErr);
    alert("❌ Không cấp được số hóa đơn T.");
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdChinh);
    return;
  }

  if (getInput("sohd")) getInput("sohd").value = sohdChinh;

  const hoadonChinh = buildHeaderMain(loai, diadiemTrang, bangKetQua, sohdChinh);
  const chitietChinh = buildDetails(sohdChinh, diadiemTrang, bangKetQua);


  const hoadonPhu = buildHeaderT(loaiT, diadiemTrang, bangKetQua, sohdT);
  const chitietPhu = buildDetails(sohdT, diadiemTrang, bangKetQua);

  // 2) Lưu CHI TIẾT CHÍNH
  const { error: errCTChinh } = await supabase
    .from("ct_hoadon_banle")
    .insert(chitietChinh);

  if (errCTChinh) {
    console.error(errCTChinh);
    alert("❌ Lỗi lưu chi tiết hóa đơn chính.");
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdChinh);
    return;
  }

  // 3) Lưu HEADER PHỤ (T)
  console.log("📄 hoadonPhu trước khi insert:", hoadonPhu);

  const { error: errHDT } = await supabase
    .from("hoadon_banleT")
    .insert([hoadonPhu]);

  if (errHDT) {
    console.error(errHDT);
    alert("❌ Lỗi lưu header hóa đơn T.");
    await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohdChinh);
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdChinh);
    return;
  }

  // 4) Lưu CHI TIẾT PHỤ (T)
  const { error: errCTT } = await supabase
    .from("ct_hoadon_banleT")
    .insert(chitietPhu);

  if (errCTT) {
    console.error(errCTT);
    alert("❌ Lỗi lưu chi tiết hóa đơn T.");
    await supabase.from("hoadon_banleT").delete().eq("sohd", sohdT);
    await supabase.from("ct_hoadon_banle").delete().eq("sohd", sohdChinh);
    await supabase.from("hoadon_banle").delete().eq("sohd", sohdChinh);
    return;
  }

  // 5) Update used_for_mt cho bản chính
  await capNhatUsedTuVanSauKhiLuuCT(chitietChinh, loai, diadiemTrang);

  // 6) In bản chính
  printInvoice(hoadonChinh, chitietChinh, true);

  // 7) Gửi Viettel cho bản T
  try {
    await guiHoaDonViettel(sohdT);
  } catch (e) {
    console.error("guiHoaDonViettel lỗi:", e);
    alert("⚠️ Đã lưu xong 2 bản nhưng gửi Viettel thất bại. Bạn có thể gửi lại sau ở trang xem hóa đơn T.");
  }

  await resetAfterSave();

  return {
    ok: true,
    mode: "SPECIAL",
    sohd: sohdChinh,
    sohdT,
    hoadon: hoadonChinh,
    chitiet: chitietChinh
  };
}
