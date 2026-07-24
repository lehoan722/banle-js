import { AUDIT_CONFIG } from "./auditConfig.js";

export function tinhDiemXoa(giaTriXoa, soLanXoaSau) {
  const { risk, thresholds } = AUDIT_CONFIG;
  let diem = risk.xoaNho;

  if (giaTriXoa >= thresholds.xoaRatLon) diem = risk.xoaRatLon;
  else if (giaTriXoa >= thresholds.xoaLon) diem = risk.xoaLon;

  if (soLanXoaSau >= thresholds.xoaNhieuLan) {
    diem += risk.xoaNhieuLan;
  }
  return diem;
}

export function tinhDiemBoHoaDon(tongTien) {
  const { risk, thresholds } = AUDIT_CONFIG;
  if (tongTien >= thresholds.boHoaDonRatLon) return risk.boHoaDonRatLon;
  if (tongTien >= thresholds.boHoaDonLon) return risk.boHoaDonLon;
  return risk.boHoaDon;
}

export function tinhDiemGiamSau(tongTruoc, tongSau) {
  if (!tongTruoc || tongTruoc <= 0) return 0;
  const tyLeGiam = (tongTruoc - tongSau) / tongTruoc;
  return tyLeGiam >= AUDIT_CONFIG.thresholds.giamSauTyLe
    ? AUDIT_CONFIG.risk.giamSau
    : 0;
}

export function xepMucRuiRo(diem) {
  if (diem >= 40) return "rat_cao";
  if (diem >= 20) return "cao";
  if (diem >= 8) return "trung_binh";
  return "thap";
}
