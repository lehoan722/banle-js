export const AUDIT_CONFIG = Object.freeze({
  sessionKey: "SUPERPOS_AUDIT_V2_SESSION",
  queueKey: "SUPERPOS_AUDIT_V2_QUEUE",
  maxQueueItems: 1000,

  risk: {
    xoaNho: 2,
    xoaLon: 5,
    xoaRatLon: 10,
    boHoaDon: 10,
    boHoaDonLon: 15,
    boHoaDonRatLon: 25,
    giamSau: 8,
    xoaNhieuLan: 6
  },

  thresholds: {
    xoaLon: 500000,
    xoaRatLon: 1500000,
    boHoaDonLon: 500000,
    boHoaDonRatLon: 2000000,
    giamSauTyLe: 0.5,
    xoaNhieuLan: 3
  }
});
