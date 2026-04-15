// scripts/services/hoadonCcn.js

import { supabase } from '../supabaseClient.js';
import { getBangKetQua, resetBangKetQua } from '../hoadon.js';
import { capNhatThongTinTong } from '../utils.js';
import { capNhatSoHoaDonTuDong } from '../sohoadon.js';

import {
  refreshSessionIfNeeded,
  ensureCatalogsReady,
  hoaDonDaTonTaiAny
} from '../luuhoadon/api.js';

import { buildCCNCtxFromPathname } from '../luuhoadon/builders.js';
import {
  normalizeBangKetQua,
  calcTongThanhTienFromBangKetQua
} from '../luuhoadon/pricing.js';

import { requireManagedAtBranch } from '../luuhoadon/validators.js';
import { luuHoaDonccn1v2 } from '../luuhoadon.js';

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

function getCCNCtxSafe() {
  const ctx = buildCCNCtxFromPathname();
  if (!ctx?.isCCN) {
    throw new Error("❌ Trang hiện tại không phải trang CCN.");
  }
  return ctx;
}

function normalizeBangKetQuaForCCN(bangKetQua) {
  normalizeBangKetQua(bangKetQua);

  for (const k of Object.keys(bangKetQua || {})) {
    const item = bangKetQua[k];
    if (!item) continue;

    if (!Array.isArray(item.sizes)) item.sizes = [];
    if (!Array.isArray(item.soluongs)) item.soluongs = [];

    item.sizes = item.sizes.map(sz => {
      const s = String(sz ?? "").trim();
      return s === "" ? "0" : s;
    });

    item.soluongs = item.soluongs.map(sl => Number(sl || 0));
  }

  return bangKetQua;
}

function validateBeforeSaveCCN(ctx, ccnCtx) {
  capNhatThongTinTong(getBangKetQua());

  const maspChuaNhap = getText("masp");
  if (maspChuaNhap && !/\(\d+\)\s*$/.test(maspChuaNhap)) {
    alert("❌ Bạn còn mã sản phẩm chưa thêm vào bảng!");
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
    alert("❌ Bạn chưa nhập tên nhân viên.");
    return false;
  }

  const manv = getText("manv") || localStorage.getItem("manv") || "";
  if (!manv || manv.toUpperCase() === "ADMIN") {
    alert("❌ Lỗi xác định nhân viên (manv). Vui lòng đăng nhập lại.");
    return false;
  }

  const prefix = sohd.split("_")[0] || "";
  if (prefix !== ccnCtx.loaihdGoc) {
    alert(`🚫 Số chứng từ không khớp trang. Trang này yêu cầu prefix "${ccnCtx.loaihdGoc}_*".`);
    return false;
  }

  const bangKetQua = ctx?.bangKetQua || getBangKetQua();
  if (!bangKetQua || Object.keys(bangKetQua).length === 0) {
    alert("❌ Không có dữ liệu để lưu.");
    return false;
  }

  return true;
}

function buildCCNMeta(ctx, ccnCtx, bangKetQua) {
  const sohd = getText("sohd");
  const sohdDoiUng = sohd.replace(ccnCtx.loaihdGoc, ccnCtx.loaihdDoiUng);

  return {
    page: window.location.pathname || "",
    isEdit: !!ctx?.isEdit,
    isNew: !!ctx?.isNew,
    sohd,
    sohdDoiUng,
    loaihdGoc: ccnCtx.loaihdGoc,
    loaihdDoiUng: ccnCtx.loaihdDoiUng,
    src: ccnCtx.src,
    dst: ccnCtx.dst,
    diadiemSrc: String(ccnCtx.src || "").toLowerCase(),
    diadiemDst: String(ccnCtx.dst || "").toLowerCase(),
    ngay: getText("ngay"),
    manv: getText("manv"),
    tennv: getText("tennv"),
    khachhang: getText("khachhang"),
    hinhthuctt: getInput("hinhthuctt")?.value || "",
    ghichu: getText("ghichu"),
    tongsl: getIntValue("tongsl"),
    tongkm: getIntValue("tongkm"),
    chietkhau: getIntValue("chietkhau"),
    thanhtoan: getIntValue("phaithanhtoan"),
    tongthanhtien: calcTongThanhTienFromBangKetQua(bangKetQua),
    rowCount: Object.keys(bangKetQua || {}).length
  };
}

function buildPreviewRowsForCCN(meta, bangKetQua) {
  const rows = [];

  Object.values(bangKetQua || {}).forEach(item => {
    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const soluongs = Array.isArray(item?.soluongs) ? item.soluongs : [];

    sizes.forEach((sz, i) => {
      const sl = Number(soluongs[i] || 0);
      if (!sl) return;

      rows.push({
        sohd: meta.sohd,
        sohd_doi_ung: meta.sohdDoiUng,
        masp: item?.masp || "",
        tensp: item?.tensp || "",
        size: String(sz ?? "").trim() || "0",
        soluong: sl,
        gia: Number(item?.gia || 0),
        km: Number(item?.km || 0),
        thanhtien: (Number(item?.gia || 0) - Number(item?.km || 0)) * sl,
        dvt: item?.dvt || ""
      });
    });
  });

  return rows;
}

function buildHeaderForSave(meta, sohd, loaihd, diadiem, createdAt) {
  return {
    sohd,
    ngay: meta.ngay,
    manv: meta.manv,
    tennv: meta.tennv,
    diadiem,
    khachhang: meta.khachhang,
    tongsl: meta.tongsl,
    tongthanhtien: meta.tongthanhtien,
    tongkm: meta.tongkm,
    chietkhau: meta.chietkhau,
    thanhtoan: meta.thanhtoan,
    hinhthuctt: meta.hinhthuctt,
    ghichu: meta.ghichu,
    created_at: createdAt,
    loai: "",
    dvt: "",
    loaihd,
    nhacc: ""
  };
}

function buildDetailRowsForSave(meta, bangKetQua) {
  const createdAtGoc = new Date().toISOString();
  const createdAtDoiUng = new Date().toISOString();

  const chitietGoc = [];
  const chitietDoiUng = [];

  Object.values(bangKetQua || {}).forEach(item => {
    const masp = String(item?.masp || "").trim().toUpperCase();
    const tensp = item?.tensp || "";
    const dvt = item?.dvt || "";
    const gia = Number(item?.gia || 0);
    const km = Number(item?.km || 0);

    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const soluongs = Array.isArray(item?.soluongs) ? item.soluongs : [];

    sizes.forEach((sz, i) => {
      const size = String(sz ?? "").trim() || "0";
      const sl = Number(soluongs[i] || 0);
      if (!sl) return;

      const sizeDst = requireManagedAtBranch(masp, meta.dst) ? size : "0";

      chitietGoc.push({
        sohd: meta.sohd,
        masp,
        tensp,
        size,
        soluong: sl,
        gia,
        km,
        thanhtien: (gia - km) * sl,
        dvt,
        diadiem: meta.diadiemSrc,
        created_at: createdAtGoc,
        ngay: meta.ngay
      });

      chitietDoiUng.push({
        sohd: meta.sohdDoiUng,
        masp,
        tensp,
        size: sizeDst,
        soluong: sl,
        gia,
        km,
        thanhtien: (gia - km) * sl,
        dvt,
        diadiem: meta.diadiemDst,
        created_at: createdAtDoiUng,
        ngay: meta.ngay
      });
    });
  });

  return { chitietGoc, chitietDoiUng, createdAtGoc, createdAtDoiUng };
}

async function upsertSoChungTu(loai, soMoi) {
  const { data: curr } = await supabase
    .from("sochungtu")
    .select("so_hientai")
    .eq("loai", loai)
    .maybeSingle();

  if (!curr || Number(soMoi) > Number(curr.so_hientai || 0)) {
    await supabase
      .from("sochungtu")
      .update({ so_hientai: Number(soMoi) })
      .eq("loai", loai);
  }
}

function extractSoCtYeuCauFromGhiChu(ghichu) {
  const s = String(ghichu || "").trim();

  // Ưu tiên mẫu có chữ "yêu cầu"
  let m =
    s.match(/(?:so[_\s-]*ct|số[_\s-]*ct)\s*(?:yêu\s*cầu\s*chuyển\s*kho)?\s*[:\-]?\s*([A-Za-z0-9_./-]+)/i) ||
    s.match(/yêu\s*cầu\s*chuyển\s*kho\s*[:\-]?\s*([A-Za-z0-9_./-]+)/i) ||
    s.match(/yeucau[^\s|;,]*/i);

  if (!m) return "";

  if (m[1]) return String(m[1] || "").trim();
  return String(m[0] || "").trim();
}

function buildYeuCauChuyenKhoRowsFromBangKetQua(bangKetQua) {
  const rows = [];

  Object.values(bangKetQua || {}).forEach(item => {
    const masp = String(item?.masp || "").trim().toUpperCase();
    if (!masp) return;

    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const soluongs = Array.isArray(item?.soluongs) ? item.soluongs : [];

    sizes.forEach((sz, i) => {
      const size = String(sz ?? "").trim() || "0";
      const sl_thuc = Number(soluongs[i] || 0);
      if (sl_thuc <= 0) return;

      rows.push({
        masp,
        size,
        sl_thuc
      });
    });
  });

  return rows;
}

async function capNhatYeuCauChuyenKhoCt(meta, bangKetQua) {
  try {
    const ghichu = String(meta.ghichu || "").trim();
    const soCtYeuCau = extractSoCtYeuCauFromGhiChu(ghichu);

    if (!soCtYeuCau) {
      console.log("ℹ️ Không phát hiện phiếu yêu cầu chuyển kho trong ghi chú, bỏ qua cập nhật yeucau_chuyenkho_ct.");
      return;
    }

    const manvPhuTrach = String(meta.manv || "").trim();
    const tennvPhuTrach = String(meta.tennv || "").trim();

    const dsDongCapNhat = buildYeuCauChuyenKhoRowsFromBangKetQua(bangKetQua);

    console.log("🟣 Bắt đầu cập nhật yeucau_chuyenkho_ct:", {
      soCtYeuCau,
      manvPhuTrach,
      tennvPhuTrach,
      soDong: dsDongCapNhat.length,
      dsDongCapNhat
    });

    let tongSoDongDaCapNhat = 0;

    for (const row of dsDongCapNhat) {
      const nowIso = new Date().toISOString();

      const payloadUpdate = {
        trang_thai_dong: "da_chuyen",
        manv_phutrach: manvPhuTrach || null,
        tennv_phutrach: tennvPhuTrach || null,
        done: true,
        done_at: nowIso,
        done_by: manvPhuTrach || null,
        done_by_name: tennvPhuTrach || null,
        updated_at: nowIso
      };

      const { data, error } = await supabase
        .from("yeucau_chuyenkho_ct")
        .update(payloadUpdate)
        .eq("so_ct", soCtYeuCau)
        .eq("masp", row.masp)
        .eq("size", row.size)
        .eq("sl_thuc", row.sl_thuc)
        .eq("trang_thai_dong", "dang_chuyen")
        .select("id, so_ct, masp, size, sl_thuc, trang_thai_dong");

      if (error) {
        console.error("❌ Lỗi cập nhật yeucau_chuyenkho_ct:", {
          soCtYeuCau,
          row,
          error
        });
        continue;
      }

      const updatedCount = Array.isArray(data) ? data.length : 0;
      tongSoDongDaCapNhat += updatedCount;

      console.log("✅ Đã cập nhật yeucau_chuyenkho_ct:", {
        soCtYeuCau,
        row,
        updatedCount,
        data
      });
    }

    console.log("🟪 Hoàn tất cập nhật yeucau_chuyenkho_ct:", {
      soCtYeuCau,
      tongSoDongDaCapNhat
    });
  } catch (e) {
    console.error("❌ Lỗi khối cập nhật trạng thái phiếu yêu cầu chuyển kho:", e);
  }
}

async function ghiTaoHdCcnChoKiemNhap(meta, bangKetQua) {
  try {
    const ghichu = String(meta.ghichu || "").trim();
    const match = ghichu.match(/kiemnhap[^\s|]+/i);
    const kiemnhap_id = match ? String(match[0] || "").trim() : "";

    if (!kiemnhap_id) {
      console.warn("⚠ Không tìm thấy kiemnhap_id trong ghi chú:", ghichu);
      return;
    }

    for (const item of Object.values(bangKetQua || {})) {
      const masp = String(item?.masp || "").trim().toUpperCase();
      if (!masp) continue;

      const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
      const soluongs = Array.isArray(item?.soluongs) ? item.soluongs : [];

      const sizeText = sizes
        .map((sz, i) => {
          const size = String(sz || "").trim();
          const sl = Number(soluongs[i] || 0);
          if (!size || sl <= 0) return "";
          return `${size}/${sl}`;
        })
        .filter(Boolean)
        .join(" ");

      if (!sizeText) continue;

      const noidung = `${meta.sohd}, ${masp}, ${sizeText}`;

      console.log("🟢 Ghi taohdccn:", {
        kiemnhap_id,
        masp,
        noidung
      });

      const { error } = await supabase.rpc("rpc_capnhat_taohdccn_kiemnhap", {
        p_kiemnhap_id: kiemnhap_id,
        p_masp: masp,
        p_noidung: noidung
      });

      if (error) {
        console.error("❌ RPC taohdccn lỗi:", {
          kiemnhap_id,
          masp,
          noidung,
          error
        });
      } else {
        console.log("✅ Đã ghi taohdccn:", {
          kiemnhap_id,
          masp,
          noidung
        });
      }
    }
  } catch (e) {
    console.error("❌ Lỗi ghi taohdccn:", e);
  }
}

async function danhDauKiemNhapChoCaHaiPhieu(meta) {
  try {
    const ghichu = String(meta.ghichu || "").trim();
    const match = ghichu.match(/\b(kiemnhap[^\s|;,]+)/i);
    const sohdKiemNhap = match ? String(match[1] || "").trim() : "";

    if (!sohdKiemNhap) {
      console.log("ℹ️ Không phát hiện số phiếu kiểm nhập trong ghi chú, bỏ qua đánh dấu DK.", {
        ghichu
      });
      return;
    }

    const dsSoHdCanDanhDau = [meta.sohd, meta.sohdDoiUng].filter(Boolean);
    const manv = String(meta.manv || "").trim();
    const ngay = new Date().toISOString().slice(0, 10);

    console.log("🔵 Đánh dấu DK chuẩn mới:", {
      page: meta.page || "",
      loaihdGoc: meta.loaihdGoc || "",
      loaihdDoiUng: meta.loaihdDoiUng || "",
      sohdKiemNhap,
      dsSoHdCanDanhDau,
      manv,
      ngay
    });

    const { data, error } = await supabase.rpc(
      "rpc_danh_dau_kiem_nhapkho_hoa_don",
      {
        p_ds_sohd: dsSoHdCanDanhDau,
        p_so_hd_kiemnhap: sohdKiemNhap,
        p_ngay_kiem: ngay,
        p_nhanvienkiem: manv
      }
    );

    if (error) {
      console.error("❌ RPC đánh dấu kiểm nhập lỗi:", error, {
        sohdKiemNhap,
        dsSoHdCanDanhDau
      });
    } else {
      console.log("🟦 Kết quả RPC đánh dấu kiểm nhập:", data);
    }
  } catch (e) {
    console.error("❌ Lỗi đánh dấu kiểm nhập chuẩn mới:", e);
  }
}

function printInvoice(hoadon, chitiet) {
  const data = { hoadon, chitiet };
  localStorage.setItem("data_hoadon_in", JSON.stringify(data));

  const url = "/in-hoadon.html";

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

  const tbody = document.querySelector("#bangketqua tbody");
  if (tbody) tbody.innerHTML = "";

  if (getInput("diadiem")) getInput("diadiem").value = diadiemVal;
  if (getInput("manv")) getInput("manv").value = manvVal;
  if (getInput("tennv")) getInput("tennv").value = tennvVal;
  if (getInput("hd_state")) getInput("hd_state").value = "moi";

  if (typeof window.capNhatThongTinTong === "function") {
    window.capNhatThongTinTong({});
  } else {
    capNhatThongTinTong({});
  }

  try {
    await capNhatSoHoaDonTuDong();
  } catch (e) {
    console.warn("Không cập nhật được số hóa đơn tự động sau khi lưu:", e);
  }

  window.choPhepSua = false;
  if (window.HD_CTX) {
    window.HD_CTX = { ...(window.HD_CTX || {}), mode: "NEW", fromConfirm: false, edit_at: null };
  }

  const masp = getInput("masp");
  if (masp) {
    masp.removeAttribute("readonly");
    masp.style.background = "";
    masp.style.cursor = "";
    masp.placeholder = "CCN1V2";
    masp.focus();
  }
}

async function preflightCCN(ctx) {
  const ccnCtx = getCCNCtxSafe();

  await refreshSessionIfNeeded();
  await ensureCatalogsReady();

  const bangKetQua = normalizeBangKetQuaForCCN(ctx?.bangKetQua || getBangKetQua());

  if (!validateBeforeSaveCCN(ctx, ccnCtx)) {
    return null;
  }

  const meta = buildCCNMeta(ctx, ccnCtx, bangKetQua);
  const rows = buildPreviewRowsForCCN(meta, bangKetQua);

  console.log("🟦 CCN preflight OK", {
    page: meta.page,
    isEdit: meta.isEdit,
    isNew: meta.isNew,
    sohd: meta.sohd,
    sohdDoiUng: meta.sohdDoiUng,
    loaihdGoc: meta.loaihdGoc,
    loaihdDoiUng: meta.loaihdDoiUng,
    src: meta.src,
    dst: meta.dst,
    rowCount: rows.length,
    tongsl: meta.tongsl,
    tongthanhtien: meta.tongthanhtien
  });

  return { ccnCtx, bangKetQua, meta, rows };
}

async function saveNewCCNByModern(ctx, prep) {
  const { meta, bangKetQua } = prep;

  const existedGoc = await hoaDonDaTonTaiAny(meta.sohd);
  if (existedGoc) {
    alert(`❌ Số hóa đơn gốc đã tồn tại: ${meta.sohd}`);
    return;
  }

  const existedDoiUng = await hoaDonDaTonTaiAny(meta.sohdDoiUng);
  if (existedDoiUng) {
    alert(`❌ Số hóa đơn đối ứng đã tồn tại: ${meta.sohdDoiUng}`);
    return;
  }

  const soMoi = Number(String(meta.sohd).split("_")[1] || 0);
  if (!soMoi) {
    alert("❌ Không đọc được số thứ tự của hóa đơn CCN.");
    return;
  }

  const { chitietGoc, chitietDoiUng, createdAtGoc, createdAtDoiUng } =
    buildDetailRowsForSave(meta, bangKetQua);

  if (!chitietGoc.length) {
    alert("❌ Không có chi tiết hóa đơn để lưu.");
    return;
  }

  const hoadonGoc = buildHeaderForSave(
    meta,
    meta.sohd,
    meta.loaihdGoc,
    meta.diadiemSrc,
    createdAtGoc
  );

  const hoadonDoiUng = buildHeaderForSave(
    meta,
    meta.sohdDoiUng,
    meta.loaihdDoiUng,
    meta.diadiemDst,
    createdAtDoiUng
  );

  // 1) Lưu header gốc
  const { error: errHD1 } = await supabase
    .from("hoadon_banle")
    .insert([hoadonGoc]);

  if (errHD1) {
    console.error("❌ Lỗi lưu header gốc:", errHD1);
    alert("❌ Không lưu được header hóa đơn gốc.");
    return;
  }

  // 2) Lưu chi tiết gốc
  const { error: errCT1 } = await supabase
    .from("ct_hoadon_banle")
    .insert(chitietGoc);

  if (errCT1) {
    console.error("❌ Lỗi lưu chi tiết gốc:", errCT1);
    await supabase.from("hoadon_banle").delete().eq("sohd", meta.sohd);
    alert("❌ Không lưu được chi tiết hóa đơn gốc.");
    return;
  }

  // 3) Lưu header đối ứng
  const { error: errHD2 } = await supabase
    .from("hoadon_banle")
    .insert([hoadonDoiUng]);

  if (errHD2) {
    console.error("❌ Lỗi lưu header đối ứng:", errHD2);
    await supabase.from("ct_hoadon_banle").delete().eq("sohd", meta.sohd);
    await supabase.from("hoadon_banle").delete().eq("sohd", meta.sohd);
    alert("❗Không tạo được hóa đơn đối ứng. Đã huỷ hóa đơn vừa lưu.");
    return;
  }

  // 4) Lưu chi tiết đối ứng
  const { error: errCT2 } = await supabase
    .from("ct_hoadon_banle")
    .insert(chitietDoiUng);

  if (errCT2) {
    console.error("❌ Lỗi lưu chi tiết đối ứng:", errCT2);
    await supabase.from("ct_hoadon_banle").delete().eq("sohd", meta.sohd);
    await supabase.from("hoadon_banle").delete().eq("sohd", meta.sohd);
    await supabase.from("hoadon_banle").delete().eq("sohd", meta.sohdDoiUng);
    alert("❗Không tạo được chi tiết hóa đơn đối ứng. Đã huỷ hóa đơn vừa lưu.");
    return;
  }

    // 5) Cập nhật số chứng từ cho cả gốc + đối ứng
  await upsertSoChungTu(meta.loaihdGoc, soMoi);
  await upsertSoChungTu(meta.loaihdDoiUng, soMoi);

  // 6) Hook yêu cầu chuyển kho
  await capNhatYeuCauChuyenKhoCt(meta, bangKetQua);

  // 7) Hook kiểm nhập
  await ghiTaoHdCcnChoKiemNhap(meta, bangKetQua);
  await danhDauKiemNhapChoCaHaiPhieu(meta);

  console.log("✅ CCN NEW kiểu mới đã lưu xong:", {
    sohd: meta.sohd,
    sohdDoiUng: meta.sohdDoiUng,
    soMoi
  });

  alert("✅ Đã lưu hóa đơn CCN (cả gốc và đối ứng)!");
  printInvoice(hoadonGoc, chitietGoc);
  await resetAfterSave();
}

async function saveEditCCNByLegacy(ctx, prep) {
  console.log("🛠️ saveEditCCNByLegacy", {
    sohd: prep.meta.sohd,
    sohdDoiUng: prep.meta.sohdDoiUng,
    rowCount: prep.rows.length
  });

  return await luuHoaDonccn1v2();
}

export async function saveHoaDonCCN(ctx = {}) {
  const prep = await preflightCCN(ctx);
  if (!prep) return;

  if (prep.meta.isEdit) {
    return await saveEditCCNByLegacy(ctx, prep);
  }

  return await saveNewCCNByModern(ctx, prep);
}

window.saveHoaDonCCN = saveHoaDonCCN;
