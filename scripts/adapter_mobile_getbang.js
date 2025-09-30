// scripts/adapter_mobile_getbang.js
; (() => {
  'use strict';

  // Map MobileKQ → cấu trúc getBangKetQua cũ
  function fromMobileGrid() {
    if (!window.MobileKQ) return {};
    const all = window.MobileKQ.getAll();
    const kq = {};
    all.forEach(r => {
      const sizes = [], soluongs = [];
      Object.keys(r.qty).forEach(k => {
        const sz = parseInt(k, 10), sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      });

      // lấy sản phẩm
      const sp = window.sanPhamData?.[r.masp] || {};
      const tensp = sp.ten || sp.tensp || sp.tensanpham || "";
      const dvt = sp.dvt || sp.donvitinh || "";
      const gia = Number(
        sp.gia ?? sp.giaban ?? sp.gianhap ?? sp.giamua ?? 0
      ) || 0;

      if (sizes.length > 0) {
        kq[r.masp] = {
          masp: r.masp,
          tensp, dvt, gia,
          km: 0,
          sizes, soluongs,
          vitri: r.vitri || "",
          toncs1: r.t1 || 0,
          toncs2: r.t2 || 0
        };
      }
    });
    window.bangKetQua = kq;   // để getBangKetQua() của luồng cũ nhìn thấy
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

console.log("getBangKetQua hiện tại =", window.getBangKetQua);

// Ép cố định không cho file khác ghi đè nữa
Object.defineProperty(window, "getBangKetQua", {
  value: () => fromMobileGrid(),
  writable: false,
  configurable: false
});


