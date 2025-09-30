// scripts/adapter_mobile_getbang.js
;(() => {
  'use strict';

  // Map MobileKQ → cấu trúc getBangKetQua cũ
  function fromMobileGrid() {
    if (!window.MobileKQ) return {};
    const all = window.MobileKQ.getAll();
    const kq = {};
    all.forEach(r => {
      const sizes = [], soluongs = [];
      Object.keys(r.qty).forEach(k => {
        const sz = parseInt(k, 10);
        const sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      });

      // lấy thông tin sp từ cache
      
      const sp   = (window.getSanPhamByMa ? window.getSanPhamByMa(r.masp) : null) || {};
      const tensp= sp.ten || sp.tensp || sp.tensanpham || '';
      const dvt  = sp.dvt || sp.donvitinh || '';
      const gia  = Number(sp.gia ?? sp.giaban ?? sp.gianhap ?? sp.giamua ?? 0) || 0;

      if (sizes.length > 0) {
        kq[r.masp] = {
          masp: r.masp,
          tensp, dvt, gia,
          km: 0,
          sizes, soluongs,
          vitri: r.vitri || '',
          toncs1: r.t1 || 0,
          toncs2: r.t2 || 0
        };
      }
    });
    // Đồng bộ cho luồng cũ
    window.bangKetQua = kq;
    return kq;
  }

  // CẤP RA API DUY NHẤT cho bên ngoài gọi
  Object.defineProperty(window, 'getBangKetQua', {
    value: () => fromMobileGrid(),
    writable: false,
    configurable: false
  });

  // (tùy chọn) render lại nếu có nút thêm mới
  document.addEventListener('DOMContentLoaded', () => {
    window.MobileKQ?.render?.();
  });

  // KHÔNG gắn click nút Lưu ở đây nữa – để trang HTML điều phối tập trung
})();
