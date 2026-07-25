import { AUDIT_CONFIG } from "./auditConfig.js";
import {
  safeInsertAuditEvent,
  flushAuditQueue,
  upsertAuditSession,
  getAuditSession,
  updateAuditSession
} from "./auditService.js";
import {
  tinhDiemXoa,
  tinhDiemBoHoaDon,
  tinhDiemGiamSau
} from "./auditRisk.js";

let currentSessionId = null;

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 3 | 8);
    return v.toString(16);
  });
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}

function getInput(id) {
  return String(document.getElementById(id)?.value ?? "").trim();
}

export function getAuditContext() {
  return {
    session_id: getCurrentAuditSessionId(),
    sohd_du_kien: getInput("sohd") || null,
    diadiem: (
      globalThis.__BANLE_PAGE_DIADIEM ||
      getInput("diadiem") ||
      localStorage.getItem("diadiem") ||
      "cs1"
    ).toLowerCase(),
    manv: getInput("manv") || localStorage.getItem("manv") || null,
    tennv: getInput("tennv") || localStorage.getItem("tennv") || null,
    source_page: location.pathname
  };
}

export function summarizeBang(bang = {}) {
  let tongSl = 0;
  let tongTien = 0;

  for (const item of Object.values(bang || {})) {
    const slTuMang = Array.isArray(item?.soluongs)
      ? item.soluongs.reduce(
          (sum, value) => sum + Number(value || 0),
          0
        )
      : 0;

    // Ưu tiên số lượng thực tế trong mảng soluongs.
    // Chỉ dùng item.tong làm dự phòng vì nhiều luồng dựng lại state
    // không bảo đảm thuộc tính tong luôn tồn tại.
    const sl = slTuMang > 0
      ? slTuMang
      : Number(item?.tong || 0);

    const gia = Number(item?.gia || 0);
    const km = Number(item?.km || 0);

    tongSl += sl;
    tongTien += Math.max(0, gia - km) * sl;
  }

  return { tong_sl: tongSl, tong_tien: tongTien };
}

function mucRuiRoTheoDiem(diem) {
  const value = Number(diem || 0);
  if (value >= 40) return "rat_cao";
  if (value >= 20) return "cao";
  if (value >= 8) return "trung_binh";
  return "thap";
}

function isOldInvoiceViewMode() {
  const state = getInput("hd_state").toLowerCase();
  return (
    state === "xem" ||
    globalThis.HD_CTX?.mode === "VIEW" ||
    globalThis.__AUDIT_OLD_INVOICE_ACTIVE === true
  );
}

export function getCurrentAuditSessionId() {
  return currentSessionId ||
    sessionStorage.getItem(AUDIT_CONFIG.sessionKey) ||
    null;
}

export async function batDauAuditSession({ forceNew = false, source = "PAGE_INIT" } = {}) {
  if (forceNew) {
    currentSessionId = null;
    sessionStorage.removeItem(AUDIT_CONFIG.sessionKey);
    globalThis.__AUDIT_OLD_INVOICE_ACTIVE = false;
    globalThis.__AUDIT_OLD_INVOICE_SOHd = null;
    globalThis.__AUDIT_OLD_EDIT_STARTED = false;
  }

  currentSessionId = getCurrentAuditSessionId() || uuid();
  sessionStorage.setItem(AUDIT_CONFIG.sessionKey, currentSessionId);

  const ctx = getAuditContext();

  await upsertAuditSession({
    session_id: currentSessionId,
    sohd_du_kien: ctx.sohd_du_kien,
    diadiem: ctx.diadiem,
    manv: ctx.manv,
    tennv: ctx.tennv,
    trangthai: "dang_ban",
    cap_nhat_cuoi_at: new Date().toISOString(),
    source_page: ctx.source_page
  });

  await ghiAudit("BAT_DAU_PHIEN", { source });
  flushAuditQueue().catch(console.warn);
  return currentSessionId;
}

export async function taoAuditSessionMoi(source = "NEW_INVOICE") {
  return batDauAuditSession({ forceNew: true, source });
}

export async function ghiAudit(hanhdong, details = {}) {
  if (!getCurrentAuditSessionId()) {
    await batDauAuditSession({ source: "AUTO_START" });
  }

  const ctx = getAuditContext();
  return safeInsertAuditEvent({
    event_id: uuid(),
    session_id: getCurrentAuditSessionId(),
    sohd_du_kien: ctx.sohd_du_kien,
    sohd_da_luu: details.sohd_da_luu || null,
    diadiem: ctx.diadiem,
    manv: ctx.manv,
    tennv: ctx.tennv,
    hanhdong,
    masp: details.masp || null,
    tensp: details.tensp || null,
    size: details.size != null ? String(details.size) : null,
    soluong_truoc: details.soluong_truoc ?? null,
    soluong_sau: details.soluong_sau ?? null,
    gia: details.gia ?? null,
    km: details.km ?? null,
    thanhtien_truoc: details.thanhtien_truoc ?? null,
    thanhtien_sau: details.thanhtien_sau ?? null,
    tong_sl_truoc: details.tong_sl_truoc ?? null,
    tong_sl_sau: details.tong_sl_sau ?? null,
    tong_tien_truoc: details.tong_tien_truoc ?? null,
    tong_tien_sau: details.tong_tien_sau ?? null,
    diem_rui_ro_phat_sinh: Number(details.diem_rui_ro_phat_sinh || 0),
    lydo: details.lydo || null,
    source: details.source || location.pathname,
    snapshot_truoc: clone(details.snapshot_truoc),
    snapshot_sau: clone(details.snapshot_sau),
    client_created_at: new Date().toISOString()
  });
}

export async function capNhatDinhAudit(bang) {
  const sessionId = getCurrentAuditSessionId();
  if (!sessionId) return;

  const summary = summarizeBang(bang);
  const current = await getAuditSession(sessionId);

  await updateAuditSession(sessionId, {
    sohd_du_kien: getInput("sohd") || null,
    cap_nhat_cuoi_at: new Date().toISOString(),
    tong_sl_cao_nhat: Math.max(
      Number(current?.tong_sl_cao_nhat || 0),
      summary.tong_sl
    ),
    tong_tien_cao_nhat: Math.max(
      Number(current?.tong_tien_cao_nhat || 0),
      summary.tong_tien
    ),
    snapshot_cuoi: clone(bang)
  });
}

function qtyOf(item, size) {
  if (!item) return 0;
  const idx = (item.sizes || []).findIndex(
    s => String(s).trim() === String(size).trim()
  );
  return idx >= 0 ? Number(item.soluongs?.[idx] || 0) : 0;
}

export async function ghiThemSanPham({
  beforeBang,
  afterBang,
  masp,
  size,
  item
}) {
  const before = summarizeBang(beforeBang);
  const after = summarizeBang(afterBang);
  const beforeQty = qtyOf(beforeBang?.[masp], size);
  const afterQty = qtyOf(afterBang?.[masp], size);

  await ghiAudit(beforeQty > 0 ? "TANG_SO_LUONG" : "THEM", {
    masp,
    tensp: item?.tensp,
    size,
    soluong_truoc: beforeQty,
    soluong_sau: afterQty,
    gia: Number(item?.gia || 0),
    km: Number(item?.km || 0),
    tong_sl_truoc: before.tong_sl,
    tong_sl_sau: after.tong_sl,
    tong_tien_truoc: before.tong_tien,
    tong_tien_sau: after.tong_tien,
    snapshot_truoc: beforeBang,
    snapshot_sau: afterBang,
    source: "HOADON_ADD"
  });

  await capNhatDinhAudit(afterBang);
}

export async function ghiXoaSanPham({
  beforeBang,
  afterBang,
  masp,
  size = null,
  item,
  soluongXoa = 0,
  lydo = ""
}) {
  const sessionId = getCurrentAuditSessionId();
  const before = summarizeBang(beforeBang);
  const after = summarizeBang(afterBang);
  const gia = Number(item?.gia || 0);
  const km = Number(item?.km || 0);
  const removedValue = Math.max(0, gia - km) * Number(soluongXoa || 0);

  const current = await getAuditSession(sessionId);
  const soLanXoaSau = Number(current?.so_lan_xoa || 0) + 1;
  const riskAdd =
    tinhDiemXoa(removedValue, soLanXoaSau) +
    tinhDiemGiamSau(before.tong_tien, after.tong_tien);

  await ghiAudit(size != null ? "XOA_SIZE" : "XOA_MA", {
    masp,
    tensp: item?.tensp,
    size,
    soluong_truoc: Number(soluongXoa || item?.tong || 0),
    soluong_sau: 0,
    gia,
    km,
    thanhtien_truoc: removedValue,
    thanhtien_sau: 0,
    tong_sl_truoc: before.tong_sl,
    tong_sl_sau: after.tong_sl,
    tong_tien_truoc: before.tong_tien,
    tong_tien_sau: after.tong_tien,
    diem_rui_ro_phat_sinh: riskAdd,
    lydo,
    snapshot_truoc: beforeBang,
    snapshot_sau: afterBang,
    source: "HOADON_DELETE"
  });

  await updateAuditSession(sessionId, {
    co_xoa_san_pham: true,
    co_giam_tong_tien: after.tong_tien < before.tong_tien,
    so_lan_xoa: soLanXoaSau,
    gia_tri_da_loai: Number(current?.gia_tri_da_loai || 0) + removedValue,
    diem_rui_ro: Number(current?.diem_rui_ro || 0) + riskAdd,
    cap_nhat_cuoi_at: new Date().toISOString(),
    snapshot_cuoi: clone(afterBang)
  });
}

export async function ghiBatDauSua({ bang, masp, size, item }) {
  const sessionId = getCurrentAuditSessionId();
  if (!sessionId) return;

  const summary = summarizeBang(bang);
  const current = await getAuditSession(sessionId);
  const soLanSuaSau = Number(current?.so_lan_sua || 0) + 1;

  // Mỗi lần sửa +3 điểm; từ lần thứ hai cộng thêm 4 điểm.
  const riskAdd = 3 + (soLanSuaSau === 2 ? 4 : 0);
  const diemMoi = Number(current?.diem_rui_ro || 0) + riskAdd;

  await ghiAudit("SUA_BAT_DAU", {
    masp,
    tensp: item?.tensp,
    size,
    gia: Number(item?.gia || 0),
    km: Number(item?.km || 0),
    tong_sl_truoc: summary.tong_sl,
    tong_tien_truoc: summary.tong_tien,
    diem_rui_ro_phat_sinh: riskAdd,
    snapshot_truoc: bang,
    source: isOldInvoiceViewMode()
      ? "OLD_INVOICE_F3_EDIT"
      : "F3_EDIT"
  });

  await updateAuditSession(sessionId, {
    co_sua_san_pham: true,
    so_lan_sua: soLanSuaSau,
    diem_rui_ro: diemMoi,
    muc_rui_ro: mucRuiRoTheoDiem(diemMoi),
    cap_nhat_cuoi_at: new Date().toISOString(),
    snapshot_cuoi: clone(bang)
  });
}

export async function batDauPhienXemHoaDonCu({
  sohd,
  bang = {},
  source = "DUYET_HOA_DON"
} = {}) {
  const sohdGoc = String(sohd || "").trim();
  if (!sohdGoc) return null;

  await taoAuditSessionMoi("VIEW_OLD_INVOICE");

  const sessionId = getCurrentAuditSessionId();
  const summary = summarizeBang(bang);
  const current = await getAuditSession(sessionId);
  const soLanXemSau = Number(current?.so_lan_xem_lai || 0) + 1;

  globalThis.__AUDIT_OLD_INVOICE_ACTIVE = true;
  globalThis.__AUDIT_OLD_INVOICE_SOHd = sohdGoc;
  globalThis.__AUDIT_OLD_EDIT_STARTED = false;

  await ghiAudit("XEM_HOA_DON_CU", {
    sohd_da_luu: sohdGoc,
    tong_sl_sau: summary.tong_sl,
    tong_tien_sau: summary.tong_tien,
    snapshot_sau: bang,
    source
  });

  await updateAuditSession(sessionId, {
    sohd_du_kien: sohdGoc,
    sohd_goc: sohdGoc,
    loai_phien: "xem_hoa_don_cu",
    co_xem_hoa_don_cu: true,
    so_lan_xem_lai: soLanXemSau,
    cap_nhat_cuoi_at: new Date().toISOString(),
    snapshot_cuoi: clone(bang)
  });

  return sessionId;
}

export async function ghiBatDauSuaHoaDonCu({
  bang = {},
  source = "OLD_INVOICE_EDIT"
} = {}) {
  if (!globalThis.__AUDIT_OLD_INVOICE_ACTIVE) return false;
  if (globalThis.__AUDIT_OLD_EDIT_STARTED) return true;

  const sessionId = getCurrentAuditSessionId();
  if (!sessionId) return false;

  const current = await getAuditSession(sessionId);
  const summary = summarizeBang(bang);
  const riskAdd = 8;
  const diemMoi = Number(current?.diem_rui_ro || 0) + riskAdd;

  globalThis.__AUDIT_OLD_EDIT_STARTED = true;

  await ghiAudit("BAT_DAU_SUA_HOA_DON_CU", {
    sohd_da_luu: globalThis.__AUDIT_OLD_INVOICE_SOHd || getInput("sohd"),
    tong_sl_truoc: summary.tong_sl,
    tong_tien_truoc: summary.tong_tien,
    diem_rui_ro_phat_sinh: riskAdd,
    snapshot_truoc: bang,
    source
  });

  await updateAuditSession(sessionId, {
    loai_phien: "sua_hoa_don_cu",
    co_sua_san_pham: true,
    co_thao_tac_sau_luu: true,
    so_lan_sua: Number(current?.so_lan_sua || 0) + 1,
    diem_rui_ro: diemMoi,
    muc_rui_ro: mucRuiRoTheoDiem(diemMoi),
    cap_nhat_cuoi_at: new Date().toISOString(),
    snapshot_cuoi: clone(bang)
  });

  return true;
}

export async function huyPhienChuaLuu(bang, lydo, source = "NEW_INVOICE") {
  if (!bang || Object.keys(bang).length === 0) return false;

  const sessionId = getCurrentAuditSessionId();
  const summary = summarizeBang(bang);
  const current = await getAuditSession(sessionId);
  const riskAdd = tinhDiemBoHoaDon(summary.tong_tien);

  await ghiAudit("TAO_MOI_KHI_CHUA_LUU", {
    tong_sl_truoc: summary.tong_sl,
    tong_sl_sau: 0,
    tong_tien_truoc: summary.tong_tien,
    tong_tien_sau: 0,
    diem_rui_ro_phat_sinh: riskAdd,
    lydo,
    snapshot_truoc: bang,
    snapshot_sau: {},
    source
  });

  await updateAuditSession(sessionId, {
    trangthai: "bo_huy",
    ket_thuc_at: new Date().toISOString(),
    cap_nhat_cuoi_at: new Date().toISOString(),
    co_bo_hoa_don: true,
    co_giam_tong_tien: true,
    gia_tri_da_loai: Math.max(
      Number(current?.gia_tri_da_loai || 0),
      summary.tong_tien
    ),
    diem_rui_ro: Number(current?.diem_rui_ro || 0) + riskAdd,
    lydo_ket_thuc: lydo,
    snapshot_cuoi: clone(bang)
  });

  return true;
}

export async function chotPhienDaLuu({
  sohd,
  bang,
  tongTien = null,
  source = "SAVE_SUCCESS"
}) {
  const sessionId = getCurrentAuditSessionId();
  if (!sessionId) return;

  const summary = summarizeBang(bang);
  const finalMoney =
    tongTien == null ? summary.tong_tien : Number(tongTien || 0);

  const current = await getAuditSession(sessionId);
  const peakMoney = Math.max(
    Number(current?.tong_tien_cao_nhat || 0),
    summary.tong_tien,
    finalMoney
  );

  const giamTuDinh = Math.max(0, peakMoney - finalMoney);
  const reductionRisk = tinhDiemGiamSau(peakMoney, finalMoney);
  const oldEditRisk = globalThis.__AUDIT_OLD_EDIT_STARTED ? 10 : 0;
  const riskAdd = reductionRisk + oldEditRisk;
  const diemMoi = Number(current?.diem_rui_ro || 0) + riskAdd;

  const saveAction = globalThis.__AUDIT_OLD_EDIT_STARTED
    ? "LUU_SUA_HOA_DON_CU"
    : "LUU_HOA_DON";

  await ghiAudit(saveAction, {
    sohd_da_luu: sohd,
    tong_sl_sau: summary.tong_sl,
    tong_tien_sau: finalMoney,
    diem_rui_ro_phat_sinh: riskAdd,
    snapshot_sau: bang,
    source
  });

  await updateAuditSession(sessionId, {
    sohd_da_luu: sohd,
    sohd_goc: globalThis.__AUDIT_OLD_INVOICE_SOHd || current?.sohd_goc || null,
    trangthai: "da_luu",
    ket_thuc_at: new Date().toISOString(),
    cap_nhat_cuoi_at: new Date().toISOString(),
    tong_sl_cao_nhat: Math.max(
      Number(current?.tong_sl_cao_nhat || 0),
      summary.tong_sl
    ),
    tong_tien_cao_nhat: peakMoney,
    tong_sl_da_luu: summary.tong_sl,
    tong_tien_da_luu: finalMoney,
    co_giam_tong_tien: giamTuDinh > 0,
    gia_tri_da_loai: Math.max(
      Number(current?.gia_tri_da_loai || 0),
      giamTuDinh
    ),
    co_thao_tac_sau_luu:
      Boolean(current?.co_thao_tac_sau_luu) ||
      globalThis.__AUDIT_OLD_EDIT_STARTED === true,
    diem_rui_ro: diemMoi,
    muc_rui_ro: mucRuiRoTheoDiem(diemMoi),
    snapshot_cuoi: clone(bang)
  });

  globalThis.__AUDIT_OLD_INVOICE_ACTIVE = false;
  globalThis.__AUDIT_OLD_INVOICE_SOHd = null;
  globalThis.__AUDIT_OLD_EDIT_STARTED = false;
}

export async function ketThucPhienKhac({
  trangthai,
  bang,
  lydo,
  hanhdong
}) {
  const sessionId = getCurrentAuditSessionId();
  if (!sessionId) return;
  const summary = summarizeBang(bang);

  await ghiAudit(hanhdong, {
    tong_sl_truoc: summary.tong_sl,
    tong_tien_truoc: summary.tong_tien,
    lydo,
    snapshot_truoc: bang
  });

  await updateAuditSession(sessionId, {
    trangthai,
    ket_thuc_at: new Date().toISOString(),
    cap_nhat_cuoi_at: new Date().toISOString(),
    lydo_ket_thuc: lydo,
    snapshot_cuoi: clone(bang)
  });
}
