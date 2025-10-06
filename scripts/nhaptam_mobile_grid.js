// scripts/nhaptam_mobile_grid.js
; (() => {
  'use strict';

  /* =========================================================
   * 1) Cấu hình & state
   * ======================================================= */
  const SIZES = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  const tbl = document.querySelector('#bangketqua');
  const tbody = tbl?.querySelector('tbody');

  const rows = [];               // [{ masp, qty:{0..45}, vitri, t1, t2, qls }]
  let activeMas = null;

  // API public cho adapter/HTML
  window.MobileKQ = {
    upsertRow, setQty, getAll, render,
    focusFirstSizeFor, moveRowToTopByMa, ensureVitriTonBatch
  };

  /* =========================================================
   * 2) Helpers: đồng bộ cache SP & nạp từ Supabase (giống hoadon.js)
   * ======================================================= */

  function normCode(s) { return String(s || '').trim().toUpperCase(); }

  // Tìm kho danh mục có sẵn (map hoặc array) – chỉ để biết đã nạp chưa
  function pickSanPhamStore() {
    const cands = ['sanPhamData', 'sanphamData', 'dsSanPham', 'dmhanghoa', 'hanghoa', 'hangHoaData', 'dssp'];
    for (const k of cands) {
      const v = window[k];
      if (Array.isArray(v) && v.length) return v;
      if (v && typeof v === 'object') return v;
    }
    return null;
  }

  function ensureSanPhamMap() {
    if (!window.sanPhamData || typeof window.sanPhamData !== 'object') {
      window.sanPhamData = {};
    }
    return window.sanPhamData;
  }

  // tìm trong cache hiện có (map/array)
  function findSanPhamInStore(code) {
    const key = normCode(code);
    const store = pickSanPhamStore();
    if (!store) return null;

    // object-map
    if (!Array.isArray(store)) {
      const direct = store[key] || store[code] || store[key.replace(/\s+/g, '')] || null;
      if (direct) return direct;
      if (!window.__spKeyMap__) {
        const m = new Map();
        Object.keys(store).forEach(k => m.set(normCode(k), k));
        window.__spKeyMap__ = m;
      }
      const real = window.__spKeyMap__.get(key);
      return real ? store[real] : null;
    }

    // array
    const likely = ['masp', 'MA', 'ma', 'ma_sp', 'mahang', 'ma_hang', 'mavattu', 'mavt', 'code', 'sku', 'mahh'];
    for (const rec of store) {
      for (const k of likely) {
        if (rec[k] != null && normCode(rec[k]) === key) return rec;
      }
    }
    for (const rec of store) {
      for (const [k, v] of Object.entries(rec)) {
        if ((typeof v === 'string' || typeof v === 'number')
          && normCode(v) === key && String(v).length <= 32) return rec;
      }
    }
    return null;
  }

  // Nếu chưa có trong cache, hỏi Supabase giống hoadon.js rồi cache lại
  async function ensureSanPhamLoaded(code) {
    const key = normCode(code);
    if (!key) return null;

    const map = ensureSanPhamMap();
    const cached = findSanPhamInStore(key) || map[key];
    if (cached) return cached;

    if (window.supabase && typeof window.supabase.from === 'function') {
      try {
        const { data, error } = await window.supabase
          .from('dmhanghoa')
          .select('*')
          .eq('masp', key)
          .single();
        if (data && !error) {
          map[key] = data; // cache theo key chuẩn
          return data;
        }
      } catch (_) { }
    }
    return null;
  }

  // Expose helpers để debug trong Console nếu cần
  window.pickSanPhamStore = pickSanPhamStore;
  window.getSanPhamByMa = async (code) => await ensureSanPhamLoaded(code);

  /* =========================================================
   * 3) Nhận diện có quản size? (theo nhóm/giá/giày + cờ UI)
   * ======================================================= */
  function currentBranchUpper() {
    try { const w = String(window.diadiem || '').toUpperCase(); if (w === 'CS1' || w === 'CS2') return w; } catch (_) { }
    try { const v = String(localStorage.getItem('diadiem') || '').toUpperCase(); if (v === 'CS1' || v === 'CS2') return v; } catch (_) { }
    return 'CS1';
  }

  async function isQuanLySize(masp) {
    const sp = await ensureSanPhamLoaded(masp);
    if (!sp) return false;

    const isGD = String(sp.chungloai || '').trim().toUpperCase() === 'GD';
    const isQL = sp.quanlykichco === true;               // ✅ thêm cờ quanlykichco
    const giaSP = Number(sp.giale) || 0;

    const size45On = !!document.getElementById('size45')?.checked;
    const qlTheoNhomOn = !!document.getElementById('quanlysizetheonhom')?.checked;
    const qlTheoGiaOn = !!document.getElementById('quanlysizetheogia')?.checked;

    // Giữ logic nhóm như cũ
    let groupRequires = false;
    if (qlTheoNhomOn && sp.nhomhang && window.danhMucNhom instanceof Map) {
      const nhom = window.danhMucNhom.get(String(sp.nhomhang).toUpperCase());
      if (nhom && nhom.quanlysize) {
        const here = currentBranchUpper();
        groupRequires = (String(nhom.diadiem || 'ALL').toUpperCase() === 'ALL'
          || String(nhom.diadiem).toUpperCase() === here);
      }
    }

    // ✅ “Cửa cờ” size45: trước đây chỉ ép GD, giờ ép cả GD || quanlykichco
    const managedByFlag = size45On && (isGD || isQL);

    // ✅ “Cửa theo giá”: coi quanlykichco giống GD
    const managedByGia = qlTheoGiaOn && (isGD || isQL || giaSP >= 170000);

    // Bất kỳ cửa nào đúng → dòng đó là “quản size” (mở ô 38..45, khoá size 0)
    return groupRequires || managedByGia || managedByFlag;
  }

  /* =========================================================
   * 4) Lưới: thêm/kéo dòng, render, nhập liệu
   * ======================================================= */
  function getRowIdx(masp) { return rows.findIndex(r => r.masp === masp); }

  function makeEmptyRow(masp, qls = true) {
    const qty = {}; SIZES.forEach(s => qty[s] = 0);
    return { masp, qty, vitri: '', t1: 0, t2: 0, qls };
  }

  async function upsertRow(masp, { moveTop = true } = {}) {
    masp = String(masp || '').trim().toUpperCase();
    if (!masp || !tbody) return;

    // kho chưa sẵn + không có supabase → chặn sớm
    if (!pickSanPhamStore() && !(window.supabase && typeof window.supabase.from === 'function')) {
      alert('⏳ Danh mục sản phẩm chưa tải xong. Vui lòng thử lại sau một lát.');
      return;
    }

    // Xác thực mã (cache hoặc DB)
    const sp = await ensureSanPhamLoaded(masp);
    if (!sp) {
      alert('❌ Mã sản phẩm không hợp lệ hoặc không tồn tại trong danh mục.');
      const inp = document.getElementById('masp'); if (inp) { inp.focus(); inp.select(); }
      return;
    }

    let i = getRowIdx(masp);
    if (i === -1) {
      const qls = await isQuanLySize(masp);
      rows.unshift(makeEmptyRow(masp, qls));
      activeMas = masp;
    } else {
      if (moveTop && i !== 0) {
        const r = rows.splice(i, 1)[0];
        rows.unshift(r);
      }
      activeMas = masp;
      if (rows[0].qls === undefined) rows[0].qls = await isQuanLySize(masp);
      // KHÔNG reset số lượng – giữ nguyên dữ liệu đã nhập
    }

    render();
    focusFirstSizeFor(masp);
    ensureVitriTonBatch([masp]);

    const mas = document.getElementById('masp'); if (mas) mas.value = '';
  }

  function setQty(masp, size, val) {
    const i = getRowIdx(masp); if (i < 0) return;
    const v = Math.max(0, parseInt(val || 0, 10) || 0);
    rows[i].qty[size] = v;
    paintCell(i, size); paintTotal(i);
  }

  function getAll() {
    return rows.map(r => ({ masp: r.masp, qty: { ...r.qty }, vitri: r.vitri, t1: r.t1, t2: r.t2, qls: !!r.qls }));
  }

  function render() {
    if (!tbody) return;
    tbody.innerHTML = rows.map((r, ri) => rowHtml(r, ri)).join('');
    rows.forEach((r, ri) => {
      SIZES.forEach(sz => {
        const inp = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${sz}"]`);
        if (!inp) return;
        inp.addEventListener('input', e => {
          e.target.value = e.target.value.replace(/[^\d]/g, '');
          setQty(r.masp, sz, e.target.value);
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); goNextCell(ri, sz); }
        });
        // QLS: true → chỉ mở 38..45 ; false → chỉ mở size 0
        if (r.qls) { inp.disabled = (sz === 0); } else { inp.disabled = (sz !== 0); }
      });
    });
  }

  function rowHtml(r, ri) {
    const t = sumSizes(r.qty);

    // Keypad/Enter: dùng type="text" để luôn có phím Enter
    const cells = SIZES.map(sz => `
    <td class="td-sz">
      <input type="text" inputmode="text" enterkeyhint="next"
             data-sz="${sz}" value="${r.qty[sz] || ''}">
    </td>
  `).join('');

    // CHỈ hiện Vị trí/T1/T2 trên màn hình rộng (>= 992px)
    const isDesktop = window.matchMedia('(min-width: 992px)').matches;

    let tail = `
    <td class="td-total" data-total>${t}</td>
  `;
    if (isDesktop) {
      tail += `
      <td class="td-vitri">${r.vitri || ''}</td>
      <td class="td-t1">${r.t1 || 0}</td>
      <td class="td-t2">${r.t2 || 0}</td>
    `;
    }

    return `
    <tr data-ri="${ri}" data-masp="${r.masp}">
      <td class="td-masp">${r.masp}</td>
      ${cells}
      ${tail}
    </tr>
  `;
  }

  function sumSizes(q) { return SIZES.reduce((s, k) => s + (parseInt(q[k] || 0, 10) || 0), 0); }
  function paintCell(ri, sz) { const inp = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${sz}"]`); if (inp) inp.value = rows[ri].qty[sz] || ''; }
  function paintTotal(ri) { const td = tbody.querySelector(`tr[data-ri="${ri}"] [data-total]`); if (td) td.textContent = sumSizes(rows[ri].qty); }

  function focusFirstSizeFor(masp) {
    const i = getRowIdx(masp); if (i < 0) return;
    const first = rows[i].qls ? 38 : 0;
    const el = tbody.querySelector(`tr[data-ri="${i}"] input[data-sz="${first}"]`);
    if (el) { el.focus(); el.select(); }
  }

  function goNextCell(ri, sz) {
    const r = rows[ri]; const open = r.qls ? [38, 39, 40, 41, 42, 43, 44, 45] : [0];
    const p = open.indexOf(sz);
    if (p < open.length - 1) {
      const next = open[p + 1];
      const el = tbody.querySelector(`tr[data-ri="${ri}"] input[data-sz="${next}"]`);
      if (el) { el.focus(); el.select(); }
    } else {
      const mas = document.getElementById('masp'); mas?.focus(); mas?.select();
    }
  }

  function moveRowToTopByMa(masp) {
    const i = getRowIdx(masp); if (i <= 0) return;
    const r = rows.splice(i, 1)[0]; rows.unshift(r); render();
  }

  /* =========================================================
   * 5) Nạp vị trí + tồn theo batch (nếu có API)
   * ======================================================= */
  async function ensureVitriTonBatch(listMas) {
    try {
      const fn = window.AppAPI?.getVitriTonBatch || window.getVitriTonBatch;
      if (!fn) return;
      const cs = (localStorage.getItem('diadiem') || 'cs1').toLowerCase();
      const data = await fn(listMas, cs);
      if (!Array.isArray(data)) return;
      data.forEach(d => {
        const i = getRowIdx(String(d.masp || '').toUpperCase());
        if (i >= 0) { rows[i].vitri = d.vitri || ''; rows[i].t1 = d.ton1 || 0; rows[i].t2 = d.ton2 || 0; }
      });
      rows.forEach((_, ri) => {
        const tr = tbody.querySelector(`tr[data-ri="${ri}"]`);
        if (!tr) return;
        tr.querySelector('.td-vitri')?.replaceChildren(document.createTextNode(rows[ri].vitri || ''));
        tr.querySelector('.td-t1')?.replaceChildren(document.createTextNode(rows[ri].t1 || 0));
        tr.querySelector('.td-t2')?.replaceChildren(document.createTextNode(rows[ri].t2 || 0));
      });
    } catch (e) { }
  }

  /* =========================================================
   * 6) Sự kiện ô nhập mã & nút "Thêm mới"
   * ======================================================= */
  const maspInp = document.getElementById('masp');
  maspInp?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopImmediatePropagation();
    const ma = maspInp.value.trim(); if (!ma) return;
    await upsertRow(ma, { moveTop: true });
  });

  document.getElementById('them')?.addEventListener('click', () => {
    rows.length = 0; render();
    window.bangKetQua = {};
    ['masp', 'soluong', 'dvt', 'size', 'gia', 'khuyenmai', 'thanhtien', 'vitri'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('masp')?.focus();
  });

})();

/* nhaptam_mobile_grid.js
 * Lưới nhập tạm “1 mã / 1 dòng, nhiều size” cho trang nhaptamcs1.html
 * - Không dùng spinner (input type="text", inputmode="numeric")
 * - Focus: select() toàn bộ để gõ đè
 * - Enter: 0 → 38 → ... → 45; hết dòng nhảy xuống dòng kế tiếp, bắt đầu lại từ 0
 * - Ô rỗng được hiểu là 0; hiển thị rỗng nếu giá trị 0
 * - API giữ nguyên: upsertRow, setQty, render, getAll, focusFirstSizeFor, moveRowToTopByMa, ensureVitriTonBatch
 * - Bổ sung: addRow(row), setTongNhap(masp, val) (giữ để tương thích)
 */

(function () {
  const SIZE_ORDER = [0, 38, 39, 40, 41, 42, 43, 44, 45];

  // DOM
  const table = document.getElementById('bangketqua');
  const tbody = table?.querySelector('tbody');

  // ===== Helpers =====
  const U = (s) => (s || '').toString().trim().toUpperCase();

  // Từ size → index cột trong bảng
  // cột 0: Mã hàng; 1..9: size; 10: Tổng; 11: Vị trí; 12: T1; 13: T2
  function colIndexBySize(size) {
    const k = SIZE_ORDER.indexOf(Number(size));
    return k === -1 ? -1 : (1 + k);
  }

  function findRowByMasp(masp) {
    if (!tbody) return null;
    const target = U(masp);
    for (const tr of tbody.rows) {
      const maspCell = (tr.cells[0]?.innerText || tr.cells[0]?.textContent || '').trim().toUpperCase();
      if (maspCell === target) return tr;
    }
    return null;
  }

  function sanitizeDigits(str) {
    return (str || '').toString().replace(/[^\d]/g, '');
  }

  function showValueInInput(inp, n) {
    // Hiển thị rỗng nếu n==0; nơi tính tổng sẽ coi rỗng là 0
    inp.value = (n && n > 0) ? String(n) : '';
  }

  function recalcRowTotal(tr) {
    let sum = 0;
    for (let c = 1; c <= 9; c++) {
      const inp = tr.cells[c]?.querySelector('input');
      if (!inp) continue;
      const v = parseInt(inp.value || '0', 10) || 0;
      sum += v;
    }
    if (tr.cells[10]) tr.cells[10].textContent = String(sum);
  }

  function focusAndSelect(inp) {
    requestAnimationFrame(() => {
      inp.focus({ preventScroll: false });
      inp.select();
    });
  }

  function nextCellPosition(tr, col) {
    // Trong 1 dòng: size cột 1..9
    if (col >= 1 && col < 9) {
      return { tr, col: col + 1 };
    }
    // col == 9 -> nhảy xuống dòng tiếp theo, cột 1 (size 0)
    const nextTr = tr.nextElementSibling;
    if (nextTr) return { tr: nextTr, col: 1 };
    // Không có dòng tiếp theo -> giữ nguyên
    return { tr, col };
  }

  function gotoCell(tr, col) {
    const inp = tr?.cells?.[col]?.querySelector('input');
    if (inp) focusAndSelect(inp);
  }

  // ===== Tạo dòng mới =====
  function createRow(masp) {
    const tr = document.createElement('tr');

    // 0: Mã hàng
    const tdMasp = document.createElement('td');
    tdMasp.className = 'td-masp';
    tdMasp.textContent = U(masp);
    tr.appendChild(tdMasp);

    // 1..9: input size
    for (let i = 0; i < SIZE_ORDER.length; i++) {
      const size = SIZE_ORDER[i];
      const td = document.createElement('td');
      td.className = `td-sz td-sz-${size}`;

      const inp = document.createElement('input');
      // Văn bản để bỏ spinner, nhưng vẫn gợi ý bàn phím số
      inp.type = 'text';
      inp.inputMode = 'numeric';
      inp.setAttribute('enterkeyhint', 'next');
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.value = '';

      // input: chỉ nhận số, tính tổng
      inp.addEventListener('input', () => {
        const raw = sanitizeDigits(inp.value);
        // không tự ép 0 -> rỗng ngay trong input (tránh chớp tắt khi đang gõ)
        inp.value = raw;
        recalcRowTotal(tr);
      });

      // focus: bôi đen
      inp.addEventListener('focus', () => {
        focusAndSelect(inp);
      });

      // blur: nếu 0 hoặc rỗng -> hiển thị rỗng
      inp.addEventListener('blur', () => {
        const v = parseInt(inp.value || '0', 10) || 0;
        showValueInInput(inp, v);
        recalcRowTotal(tr);
      });

      // Enter: nhảy ô kế tiếp theo thứ tự 0→38→…→45; hết dòng nhảy xuống dòng dưới
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          // xác định vị trí hiện tại
          const col = td.cellIndex; // chỉ số cột đang đứng
          const pos = nextCellPosition(tr, col);
          gotoCell(pos.tr, pos.col);
        }
      });

      td.appendChild(inp);
      tr.appendChild(td);
    }

    // 10: Tổng
    const tdTotal = document.createElement('td');
    tdTotal.className = 'td-total';
    tdTotal.textContent = '0';
    tr.appendChild(tdTotal);

    // 11: Vị trí
    const tdVitri = document.createElement('td');
    tdVitri.className = 'td-vitri';
    tdVitri.textContent = '';
    tr.appendChild(tdVitri);

    // 12: T1
    const tdT1 = document.createElement('td');
    tdT1.className = 'td-t1';
    tdT1.textContent = '0';
    tr.appendChild(tdT1);

    // 13: T2
    const tdT2 = document.createElement('td');
    tdT2.className = 'td-t2';
    tdT2.textContent = '0';
    tr.appendChild(tdT2);

    tbody.appendChild(tr);
    return tr;
  }

  // ===== API =====
  window.MobileKQ = {
    // Thêm/đảm bảo có dòng theo mã
    upsertRow(masp, opts = {}) {
      if (!tbody) return null;
      let tr = findRowByMasp(masp);
      if (!tr) tr = createRow(masp);

      if (opts.vitri != null && tr.cells[11]) tr.cells[11].textContent = String(opts.vitri || '');
      if (opts.t1 != null && tr.cells[12]) tr.cells[12].textContent = String(parseInt(opts.t1, 10) || 0);
      if (opts.t2 != null && tr.cells[13]) tr.cells[13].textContent = String(parseInt(opts.t2, 10) || 0);
      return tr;
    },

    // Ghi số lượng theo size (size = 0,38..45). Hiển thị rỗng nếu 0.
    setQty(masp, size, qty) {
      const tr = findRowByMasp(masp) || this.upsertRow(masp);
      if (!tr) return;
      const col = colIndexBySize(size);
      if (col === -1) return;

      const inp = tr.cells[col]?.querySelector('input');
      if (!inp) return;

      const v = Math.max(0, parseInt(qty, 10) || 0);
      showValueInInput(inp, v);
      recalcRowTotal(tr);
    },

    // Thêm dòng từ object đầy đủ: { masp, s0..s45, vitri?, t1?, t2?, tong_nhap? }
    addRow(row) {
      if (!row || !row.masp) return;
      const tr = this.upsertRow(row.masp, row);
      for (const s of SIZE_ORDER) {
        const v = parseInt(row['s' + s] ?? 0, 10) || 0;
        const col = colIndexBySize(s);
        const inp = tr.cells[col]?.querySelector('input');
        if (inp) showValueInInput(inp, v);
      }
      recalcRowTotal(tr);
    },

    // (giữ để tương thích – không dùng ở bản mới)
    setTongNhap(/* masp, val */) { /* no-op */ },

    // Vẽ lại: tính tổng cho toàn bộ các dòng
    render() {
      if (!tbody) return;
      for (const tr of tbody.rows) recalcRowTotal(tr);
    },

    // Lấy toàn bộ dữ liệu từ DOM; rỗng => 0
    getAll() {
      const arr = [];
      if (!tbody) return arr;
      for (const tr of tbody.rows) {
        const masp = (tr.cells[0]?.innerText || '').trim().toUpperCase();
        if (!masp) continue;
        const item = { masp };
        SIZE_ORDER.forEach((s, i) => {
          const inp = tr.cells[1 + i]?.querySelector('input');
          item['s' + s] = parseInt(inp?.value || '0', 10) || 0;
        });
        item.tong = parseInt(tr.cells[10]?.textContent || '0', 10) || 0;
        item.vitri = (tr.cells[11]?.textContent || '').trim();
        item.t1 = parseInt(tr.cells[12]?.textContent || '0', 10) || 0;
        item.t2 = parseInt(tr.cells[13]?.textContent || '0', 10) || 0;
        arr.push(item);
      }
      return arr;
    },

    // Tiện ích giữ tương thích
    focusFirstSizeFor(masp) {
      const tr = findRowByMasp(masp);
      if (!tr) return;
      gotoCell(tr, 1);
    },

    moveRowToTopByMa(masp) {
      const tr = findRowByMasp(masp);
      if (!tr || !tbody) return;
      tbody.insertBefore(tr, tbody.firstChild);
    },

    ensureVitriTonBatch() {
      // stub – tùy hệ thống bạn, để nguyên cho tương thích
    }
  };
})();
