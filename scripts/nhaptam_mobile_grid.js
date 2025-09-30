// scripts/nhaptam_mobile_grid.js
; (() => {
  'use strict';

  // Cấu hình cột size
  const SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  // Tham chiếu bảng
  const tbl = document.querySelector('#bangketqua');
  const tbody = tbl?.querySelector('tbody');

  // Bộ nhớ lưới
  const rows = [];            // [{ masp, qty:{0..45}, vitri, t1, t2, qls }]
  let activeMas = null;

  // API public cho adapter/HTML
  window.MobileKQ = {
    upsertRow, setQty, getAll, render,
    focusFirstSizeFor, moveRowToTopByMa, ensureVitriTonBatch
  };

  /* ===========================
   *  Helpers nhận diện chi nhánh
   * =========================== */
  function currentBranchUpper() {
    try {
      const w = String(window.diadiem || '').toUpperCase();
      if (w === 'CS1' || w === 'CS2') return w;
    } catch (_) { }
    try {
      const v = String(localStorage.getItem('diadiem') || '').toUpperCase();
      if (v === 'CS1' || v === 'CS2') return v;
    } catch (_) { }
    return 'CS1';
  }

  
  // Lấy “kho” danh mục sản phẩm từ nhiều biến global phổ biến
  function pickSanPhamStore() {
    const cands = [
      'sanPhamData', 'sanphamData', 'dsSanPham',
      'dmhanghoa', 'hanghoa', 'hangHoaData', 'dssp'
    ];
    for (const k of cands) {
      const v = window[k];
      if (Array.isArray(v) && v.length) return v;     // mảng
      if (v && typeof v === 'object') return v;      // object-map
    }
    return null;
  }

  // Chuẩn hóa mã để so sánh
  function normCode(s) {
    return String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  // Build index 1 lần nếu store là mảng
  function ensureIndexForArrayStore(arr) {
    if (window.__spIndex__) return window.__spIndex__;
    const idx = new Map();

    // ưu tiên các tên cột thường gặp
    const likelyKeys = ['masp', 'MA', 'ma', 'ma_sp', 'mahang', 'ma_hang', 'mavattu', 'mavt', 'code', 'sku', 'mahh'];
    const lkSet = new Set(likelyKeys.map(x => x.toLowerCase()));

    for (const sp of arr) {
      // 1) ưu tiên cột “quen thuộc”
      for (const k of Object.keys(sp)) {
        if (!lkSet.has(k.toLowerCase())) continue;
        const val = sp[k];
        if (typeof val === 'string' || typeof val === 'number') {
          const n = normCode(val);
          if (n) { idx.set(n, sp); }
        }
      }
      // 2) fallback: duyệt mọi thuộc tính chuỗi ngắn
      for (const [k, v] of Object.entries(sp)) {
        if (typeof v !== 'string' && typeof v !== 'number') continue;
        const n = normCode(v);
        // tránh lạm phát: chuỗi quá dài/bất thường bỏ qua
        if (!n || n.length > 32) continue;
        // lưu nhưng không đè key đã có (ưu tiên cột quen thuộc)
        if (!idx.has(n)) idx.set(n, sp);
      }
    }
    window.__spIndex__ = idx;
    return idx;
  }

  // Tra sản phẩm theo mã (store có thể là object-map hoặc mảng record)
  function getSanPhamByMa(code) {
    const store = pickSanPhamStore();
    if (!store) return null;

    const keyU = normCode(code);
    if (!keyU) return null;

    // object-map
    if (!Array.isArray(store)) {
      // thử nhiều biến thể key
      const direct = store[keyU] || store[code] || store[keyU.replace(/-/g, '')] || null;
      if (direct) return direct;
      // thử không phân biệt hoa/thường/space
      // duyệt keys 1 lần rồi cache map
      if (!window.__spKeyMap__) {
        const m = new Map();
        for (const k of Object.keys(store)) m.set(normCode(k), k);
        window.__spKeyMap__ = m;
      }
      const realKey = window.__spKeyMap__.get(keyU);
      return realKey ? store[realKey] : null;
    }

    // array
    const idx = ensureIndexForArrayStore(store);
    return idx.get(keyU) || idx.get(keyU.replace(/-/g, '')) || null;
  }

  // Expose để debug
  window.pickSanPhamStore = pickSanPhamStore;
  window.getSanPhamByMa = getSanPhamByMa;


  async function isQuanLySize(masp) {
    const sp = getSanPhamByMa(masp);
    if (!sp) return false; // mã không tồn tại → coi như không QLS

    const isGD = String(sp.chungloai || '').trim().toLowerCase() === 'gd';
    const giaSP = Number(sp.giale) || 0;

    // cờ UI hiện tại
    const size45On = !!document.getElementById('size45')?.checked;              // "QL SIZE"
    const qlTheoNhomOn = !!document.getElementById('quanlysizetheonhom')?.checked;  // QL theo nhóm
    const qlTheoGiaOn = !!document.getElementById('quanlysizetheogia')?.checked;   // QL theo giá

    // 1) Theo nhóm
    let groupRequires = false;
    if (qlTheoNhomOn && sp.nhomhang && window.danhMucNhom instanceof Map) {
      const nhom = window.danhMucNhom.get(String(sp.nhomhang).toUpperCase());
      if (nhom && nhom.quanlysize) {
        const here = currentBranchUpper(); // 'CS1' | 'CS2'
        groupRequires = (String(nhom.diadiem || '').toUpperCase() === 'ALL' || String(nhom.diadiem || '').toUpperCase() === here);
      }
    }

    // 2) Theo giá/giày
    const managedByGia = qlTheoGiaOn && (isGD || giaSP >= 170000);

    // 3) Theo cờ "QL SIZE" (size45) – chỉ siết với giày
    const managedByFlag = size45On && isGD;

    return groupRequires || managedByGia || managedByFlag;
  }

  /* ===========================
   *  Lưới: thêm/kéo dòng theo mã
   * =========================== */
  function getRowIdx(masp) {
    return rows.findIndex(r => r.masp === masp);
  }

  function makeEmptyRow(masp, qls = true) {
    const qty = {};
    SIZES.forEach(s => qty[s] = 0);
    return { masp, qty, vitri: '', t1: 0, t2: 0, qls };
  }

  async function upsertRow(masp, { moveTop = true } = {}) {

    // nếu danh mục chưa nạp xong thì nhắc
    if (!pickSanPhamStore()) {
      alert('⏳ Danh mục sản phẩm chưa tải xong, vui lòng thử lại sau giây lát.');
      return;
    }

    masp = String(masp || '').trim().toUpperCase();
    if (!masp || !tbody) return;

    // ❌ Mã không tồn tại trong danh mục → không cho thêm
    if (!getSanPhamByMa(masp)) {
      alert('❌ Mã sản phẩm không hợp lệ hoặc không tồn tại trong danh mục.');
      const inp = document.getElementById('masp'); if (inp) { inp.focus(); inp.select(); }
      return;
    }


    let i = getRowIdx(masp);
    if (i === -1) {
      const qls = await isQuanLySize(masp);
      rows.unshift(makeEmptyRow(masp, qls));     // mã mới → dòng trống ở đầu
      activeMas = masp;
    } else {
      if (moveTop && i !== 0) {
        const r = rows.splice(i, 1)[0];
        rows.unshift(r);                          // mã cũ → kéo lên đầu
      }
      activeMas = masp;
      if (rows[0].qls === undefined) rows[0].qls = await isQuanLySize(masp);
      // ⚠️ KHÔNG reset số lượng – phải giữ nguyên dữ liệu đã nhập
    }

    render();
    focusFirstSizeFor(masp);
    ensureVitriTonBatch([masp]);                  // nạp vị trí + tồn

    // Xóa ô #masp để nhập mã kế tiếp
    const mas = document.getElementById('masp');
    if (mas) mas.value = '';
  }

  /* ===========================
   *  Sửa số lượng + repaint
   * =========================== */
  function setQty(masp, size, val) {
    const i = getRowIdx(masp); if (i < 0) return;
    const v = Math.max(0, parseInt(val || 0, 10) || 0);
    rows[i].qty[size] = v;
    paintCell(i, size);
    paintTotal(i);
  }

  function getAll() {
    // Trả mảng bản sao nông để adapter đọc
    return rows.map(r => ({ masp: r.masp, qty: { ...r.qty }, vitri: r.vitri, t1: r.t1, t2: r.t2, qls: !!r.qls }));
  }

  /* ===========================
   *  Render bảng
   * =========================== */
  function render() {
    if (!tbody) return;
    tbody.innerHTML = rows.map((r, ri) => rowHtml(r, ri)).join('');

    // Gắn events và khóa/mở theo qls
    rows.forEach((r, ri) => {
      SIZES.forEach(sz => {
        const sel = `tr[data-ri="${ri}"] input[data-sz="${sz}"]`;
        const inp = tbody.querySelector(sel);
        if (!inp) return;

        inp.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/[^\d]/g, '');
          setQty(r.masp, sz, e.target.value);
        });

        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); goNextCell(ri, sz); }
        });

        // qls: true -> chỉ mở 38..45 ; false -> chỉ mở size 0
        if (r.qls) { inp.disabled = (sz === 0); } else { inp.disabled = (sz !== 0); }
      });
    });
  }

  function rowHtml(r, ri) {
    const t = sumSizes(r.qty);
    const cells = SIZES.map(sz =>
      `<td class="td-sz"><input data-sz="${sz}" value="${r.qty[sz] || ''}" inputmode="numeric"></td>`
    ).join('');

    return `<tr data-ri="${ri}" data-masp="${r.masp}">
      <td class="td-masp">${r.masp}</td>${cells}
      <td class="td-total" data-total>${t}</td>
      <td class="td-vitri">${r.vitri || ''}</td>
      <td class="td-t1">${r.t1 || 0}</td>
      <td class="td-t2">${r.t2 || 0}</td>
    </tr>`;
  }

  function sumSizes(q) { return SIZES.reduce((s, k) => s + (parseInt(q[k] || 0, 10) || 0), 0); }
  function paintCell(ri, sz) { const inp = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${sz}"]`); if (inp) inp.value = rows[ri].qty[sz] || ''; }
  function paintTotal(ri) { const td = tbody.querySelector(`tr[data-ri="${ri}"] [data-total]`); if (td) td.textContent = sumSizes(rows[ri].qty); }

  /* ===========================
   *  Điều hướng ô nhập
   * =========================== */
  function focusFirstSizeFor(masp) {
    const i = getRowIdx(masp); if (i < 0) return;
    const first = rows[i].qls ? 38 : 0;
    const el = tbody.querySelector(`tr[data-ri="${i}"] input[data-sz="${first}"]`);
    if (el) { el.focus(); el.select(); }
  }

  function goNextCell(ri, sz) {
    const r = rows[ri];
    const open = r.qls ? [38, 39, 40, 41, 42, 43, 44, 45] : [0];
    const p = open.indexOf(sz);
    if (p < open.length - 1) {
      const next = open[p + 1];
      const el = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${next}"]`);
      if (el) { el.focus(); el.select(); }
    } else {
      const mas = document.getElementById('masp');
      mas?.focus(); mas?.select();
    }
  }

  function moveRowToTopByMa(masp) {
    const i = getRowIdx(masp); if (i <= 0) return;
    const r = rows.splice(i, 1)[0];
    rows.unshift(r);
    render();
  }

  /* ===========================
   *  Nạp vị trí + tồn theo batch
   * =========================== */
  async function ensureVitriTonBatch(listMas) {
    try {
      const fn = window.AppAPI?.getVitriTonBatch || window.getVitriTonBatch;
      if (!fn) return;
      const cs = (localStorage.getItem('diadiem') || 'cs1').toLowerCase();
      const data = await fn(listMas, cs);
      if (!Array.isArray(data)) return;

      data.forEach(d => {
        const i = getRowIdx(String(d.masp || '').toUpperCase());
        if (i >= 0) {
          rows[i].vitri = d.vitri || '';
          rows[i].t1 = d.ton1 || 0;
          rows[i].t2 = d.ton2 || 0;
        }
      });

      // repaint 3 cột thông tin
      rows.forEach((_, ri) => {
        const tr = tbody.querySelector(`tr[data-ri="${ri}"]`);
        if (!tr) return;
        tr.querySelector('.td-vitri')?.replaceChildren(document.createTextNode(rows[ri].vitri || ''));
        tr.querySelector('.td-t1')?.replaceChildren(document.createTextNode(rows[ri].t1 || 0));
        tr.querySelector('.td-t2')?.replaceChildren(document.createTextNode(rows[ri].t2 || 0));
      });
    } catch (e) { }
  }

  /* ===========================
   *  Sự kiện nhập mã (#masp) & Thêm mới
   * =========================== */
  const maspInp = document.getElementById('masp');
  maspInp?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ma = maspInp.value.trim();
    if (!ma) return;
    await upsertRow(ma, { moveTop: true });
  });

  document.getElementById('them')?.addEventListener('click', () => {
    // Xóa sạch lưới
    rows.length = 0;
    render();
    // Xóa bộ nhớ cho luồng cũ
    window.bangKetQua = {};
    // Xóa các input nhanh phía trên
    ['masp', 'soluong', 'dvt', 'size', 'gia', 'khuyenmai', 'thanhtien', 'vitri'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('masp')?.focus();
  });

})();

// Vô hiệu hóa #size của luồng cũ – nếu lỡ focus thì kéo về size đầu của dòng
(function () {
  const size = document.getElementById('size');
  if (!size) return;
  size.readOnly = true;
  size.tabIndex = -1;
  size.addEventListener('focus', (e) => {
    e.preventDefault();
    const ma = (document.getElementById('masp')?.value || '').trim().toUpperCase();
    if (ma) { MobileKQ.focusFirstSizeFor(ma); }
  });
})();
