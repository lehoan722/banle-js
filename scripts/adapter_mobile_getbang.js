// scripts/adapter_mobile_getbang.js
; (() => {
  'use strict';

  // Map MobileKQ → cấu trúc getBangKetQua cũ
  function fromMobileGrid() {
    if (!window.MobileKQ) return {};
    const all = window.MobileKQ.getAll();
    console.log("👉 MobileKQ.getAll()", all);
    const kq = {};
    all.forEach(r => {
      const sizes = [], soluongs = [];
      Object.keys(r.qty).forEach(k => {
        const sz = parseInt(k, 10);
        const sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      });
      if (sizes.length > 0) {
        kq[r.masp] = {
          masp: r.masp,
          tensp: (window.sanPhamData?.[r.masp]?.ten) || '',
          dvt: (window.sanPhamData?.[r.masp]?.dvt) || '',
          gia: (window.sanPhamData?.[r.masp]?.gianhap) || 0,
          km: 0,
          sizes,
          soluongs,
          vitri: r.vitri || '',
          toncs1: r.t1 || 0,
          toncs2: r.t2 || 0
        };
      }
    });
    console.log("👉 fromMobileGrid -> kq", kq);
    window.bangKetQua = kq;
    return kq;
  }

  // Expose hàm thay cho getBangKetQua() của trang cũ

  window.getBangKetQua = () => fromMobileGrid();

  // Nếu trang có nút “thêm mới”, gọi MobileKQ.render() cho chắc
  document.addEventListener('DOMContentLoaded', () => {
    window.MobileKQ?.render?.();
  });

  document.getElementById('btn-luu')?.addEventListener('click', () => {
    console.log("🔗 Sync trước khi lưu");
    fromMobileGrid();
  });


})();
