// scripts/adapter_mobile_getbang.js
;(() => {
  'use strict';

  // Map MobileKQ → cấu trúc getBangKetQua cũ
  function fromMobileGrid(){
    if (!window.MobileKQ) return {};
    const all = window.MobileKQ.getAll();  // [{masp, qty:{}, vitri,t1,t2, qls}]
    const kq = {};
    all.forEach(r=>{
      const sizes = [];
      const soluongs = [];
      Object.keys(r.qty).forEach(k=>{
        const sz = parseInt(k,10); const sl = parseInt(r.qty[k]||0,10)||0;
        if (sl>0){ sizes.push(String(sz)); soluongs.push(sl); }
      });
      // nếu chưa nhập số nào vẫn tạo node để lưu sau
      kq[r.masp] = {
        masp: r.masp,
        tensp: (window.sanPhamData?.[r.masp]?.ten) || '',
        dvt:   (window.sanPhamData?.[r.masp]?.dvt) || '',
        gia:   (window.sanPhamData?.[r.masp]?.gianhap) || 0,
        km:    0,
        sizes,          // mảng size (string) >0
        soluongs,       // mảng sl tương ứng
        vitri: r.vitri || '',
        toncs1: r.t1 || 0,
        toncs2: r.t2 || 0
      };
    });
    return kq;
  }

  // Expose hàm thay cho getBangKetQua() của trang cũ
  window.getBangKetQua = fromMobileGrid;

  // Nếu trang có nút “thêm mới”, gọi MobileKQ.render() cho chắc
  document.addEventListener('DOMContentLoaded', ()=> {
    window.MobileKQ?.render?.();
  });

})();
