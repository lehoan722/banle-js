 // scripts/ctx.js 

(() => {
  // ----- Helpers -----
  const freeze = (o) => Object.freeze(o);
  const PATH = (location.pathname || '').toLowerCase();
  const FILE = PATH.split('/').pop() || '';
  const TITLE = (document.title || '').toLowerCase();

  // Lấy pageName (không đuôi .html)
  const pageName = FILE.replace(/\.html?$/,'');
  // Bắt cs1|cs2 từ pathname hoặc title
  const getBranchFromString = (s) => {
    const m = s.match(/cs(1|2)\b/);
    return m ? `cs${m[1]}` : null;
  };

  // Phân loại trang
  const detectPageKind = (name) => {
    if (/^ccn(1v2|2v1)/.test(name)) return 'ccn';
    if (/banle/i.test(name)) return 'banle';
    if (/nhap|nhaptam|nhapmua/i.test(name)) return 'nhap';
    if (/inmavach|mavach|barcode/i.test(name)) return 'inmavach';
    return 'other';
  };

  // Parse CCN chiều đi
  const parseCCN = (name) => {
    // ccn1v2 => src cs1, dst cs2 | ccn2v1 => src cs2, dst cs1
    if (/^ccn1v2/.test(name)) return { src: 'cs1', dst: 'cs2', loaihdGoc: 'xcncs1', loaihdDoiUng: 'ncncs2' };
    if (/^ccn2v1/.test(name)) return { src: 'cs2', dst: 'cs1', loaihdGoc: 'xcncs2', loaihdDoiUng: 'ncncs1' };
    return null;
  };

  // 1) Ưu tiên suy từ pathname
  let diadiem = getBranchFromString(pageName);
  // 2) Nếu không có, thử document.title
  if (!diadiem) diadiem = getBranchFromString(TITLE);
  // 3) Nếu vẫn không có, cho phép force (trang đặc biệt hiếm dùng)
  if (!diadiem && typeof window.__FORCE_DIADIEM === 'string') {
    const v = String(window.__FORCE_DIADIEM).toLowerCase();
    if (v === 'cs1' || v === 'cs2') diadiem = v;
  }
  // 4) Fallback tạm thời để tương thích ngược (có thể xoá sau khi chuyển xong)
  if (!diadiem) {
    try {
      const ls = (localStorage.getItem('diadiem') || '').toLowerCase();
      if (ls === 'cs1' || ls === 'cs2') diadiem = ls;
    } catch(_) {}
  }
  if (!diadiem) diadiem = 'cs1'; // chốt mặc định rất an toàn

  const pageKind = detectPageKind(pageName);
  const ccn = pageKind === 'ccn' ? parseCCN(pageName) : null;

  const APP_CTX = freeze({
    diadiem,           // 'cs1' | 'cs2'
    pageKind,          // 'banle' | 'nhap' | 'ccn' | 'inmavach' | 'other'
    pageName,          // ví dụ 'banlemtcs1'
    pathname: PATH     // pathname đầy đủ
  });

  const CCN_CTX = ccn ? freeze({
    ...ccn,            // {src, dst, loaihdGoc, loaihdDoiUng}
    isCCN: true
  }) : freeze({ isCCN: false });

  // Expose dạng global (không bắt buộc dùng ES module) để không phá cấu trúc cũ
  window.getAppCtx = () => APP_CTX;
  window.isCCN = () => CCN_CTX.isCCN;
  window.getCCNCtx = () => CCN_CTX;

  // (Tuỳ chọn) Ghi ngay #diadiem nếu tồn tại
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.querySelector('#diadiem');
    if (inp) {
      try { inp.value = APP_CTX.diadiem; inp.setAttribute('disabled','disabled'); } catch(_) {}
    }
  });
})();

