// scripts/adapter_mobile_getbang.js
;(() => {
  'use strict';

  /**
   * Lấy nhanh thông tin SP từ cache hiện có (KHÔNG gọi DB).
   * Ưu tiên:
   *  - sanPhamData (object map)
   *  - __spIndex__ (Map được build khi store là mảng)
   *  - quét mảng dmhanghoa/dssp nếu có
   */
  function getSPFast(code) {
    const masp = String(code || '').trim().toUpperCase();
    if (!masp) return null;

    // 1) Map chuẩn
    if (window.sanPhamData && typeof window.sanPhamData === 'object') {
      const m = window.sanPhamData;
      const k = m[masp] || m[masp.replace(/\s+/g, '')] || m[code] || null;
      if (k) return k;
    }

    // 2) Index đã build sẵn (khi store là mảng)
    if (window.__spIndex__ instanceof Map) {
      const v = window.__spIndex__.get(masp) || window.__spIndex__.get(masp.replace(/\s+/g,'')) || null;
      if (v) return v;
    }

    // 3) Quét mảng nếu có (chi phí thấp vì chỉ dùng khi cần)
    const arr = window.dmhanghoa || window.dssp || window.dsSanPham;
    if (Array.isArray(arr)) {
      // thử các tên cột hay gặp trước
      const likely = ['masp','MA','ma','ma_sp','mahang','ma_hang','mavattu','mavt','code','sku','mahh'];
      for (const rec of arr) {
        for (const k of likely) {
          if (rec[k] != null && String(rec[k]).trim().toUpperCase() === masp) return rec;
        }
      }
      // cuối cùng: quét mọi thuộc tính chuỗi ngắn
      for (const rec of arr) {
        for (const [k,v] of Object.entries(rec)) {
          if ((typeof v === 'string' || typeof v === 'number')
              && String(v).trim().toUpperCase() === masp
              && String(v).length <= 32) return rec;
        }
      }
    }

    return null;
  }

  /**
   * Đọc dữ liệu từ lưới MobileKQ → chuẩn hoá về window.bangKetQua
   * Chỉ đưa những size có SL > 0.
   */
  function fromMobileGrid() {
    if (!window.MobileKQ || typeof window.MobileKQ.getAll !== 'function') return {};
    const all = window.MobileKQ.getAll();      // [{masp, qty:{}, vitri,t1,t2, qls}, ...]
    const kq = {};

    all.forEach(r => {
      const sizes = [];
      const soluongs = [];
      for (const k of Object.keys(r.qty||{})) {
        const sz = parseInt(k, 10);
        const sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      }
      if (sizes.length === 0) return; // bỏ dòng trống

      // thông tin SP (tên/DVT/giá) từ cache sẵn có
      const sp = getSPFast(r.masp) || {};
      const tensp = sp.ten || sp.tensp || sp.tensanpham || sp.tenhang || sp.ten_hang || '';
      const dvt   = sp.dvt || sp.donvitinh || sp.don_vi_tinh || '';
      const gia   = Number(sp.gia ?? sp.giaban ?? sp.gianhap ?? sp.giamua ?? sp.giale ?? 0) || 0;

      kq[r.masp] = {
        masp: r.masp,
        tensp, dvt, gia,
        km: 0,
        sizes, soluongs,
        vitri: r.vitri || '',
        toncs1: r.t1 || 0,
        toncs2: r.t2 || 0
      };
    });

    // Đồng bộ cho luồng cũ
    window.bangKetQua = kq;
    return kq;
  }

  // API công khai duy nhất để các module khác gọi
  Object.defineProperty(window, 'getBangKetQua', {
    value: () => fromMobileGrid(),
    writable: false,
    configurable: false
  });

  // Cho phép gọi trực tiếp nếu cần debug
  window._fromMobileGrid = fromMobileGrid;

})();

// scripts/adapter_mobile_getbang.js
// Adapter cung cấp các hàm cũ (nếu nơi khác còn gọi) dựa trên MobileKQ mới

(function () {
  if (!window.MobileKQ) return;

  const SIZE_ORDER = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  // Hàm cũ “getBangKetQua” – trả về object dạng { masp: { s0, s38... } }
  window.getBangKetQua = function () {
    const rows = MobileKQ.getAll();
    const obj = {};
    rows.forEach(r => {
      const o = { masp: r.masp };
      SIZE_ORDER.forEach(s => o['s' + s] = r['s' + s] || 0);
      o.tong = r.tong || 0;
      obj[r.masp] = o;
    });
    // Gán để chỗ khác sử dụng nếu cần
    window.bangKetQua = obj;
    return obj;
  };

  // Một vài “alias” để tương thích ngược ở nơi khác (nếu có)
  window.KQ_addOrSelectRow = function (masp) {
    return MobileKQ.upsertRow(masp);
  };
  window.KQ_setQty = function (masp, size, qty) {
    return MobileKQ.setQty(masp, size, qty);
  };
  window.KQ_render = function () {
    return MobileKQ.render();
  };
})();
