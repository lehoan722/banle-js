// scripts/ccnBangKetQuaAdapterV2.js
// HOAN TUYET - CCN V2
// Chỉ dành cho trang chuyển chi nhánh (CCN1V2 / CCN2V1).
// Nguyên tắc:
//   1) window.bangKetQua luôn giữ dữ liệu chuẩn theo từng size.
//   2) DOM chỉ là lớp hiển thị: 1 mã / 1 dòng, cột Size hiển thị size/sl.
//   3) Khi cần đọc ngược DOM, parse chính xác từng token size/sl; không cho chuỗi ghép
//      như "39/1/1" đi vào state.
//   4) Không dùng adapter này cho Bán / Nhập tạm / Nhập mới.

(function () {
  'use strict';

  const PATH = String(window.location.pathname || '').toLowerCase();
  const IS_CCN = PATH.includes('ccn1v2') || PATH.includes('ccn2v1');
  if (!IS_CCN) return;

  const VERSION = 'CCN-BKQ-V2.1.0';
  let originalGenericSync = null;
  let syncing = false;
  let rendering = false;

  function text(v) {
    return String(v == null ? '' : v).trim();
  }

  function upper(v) {
    return text(v).toUpperCase();
  }

  function parseMoney(v) {
    const s = text(v).replace(/[^0-9-]/g, '');
    if (!s || s === '-') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function getProduct(masp) {
    const code = upper(masp);
    return (
      window.sanPhamData?.[code] ||
      window.sanPhamData?.[masp] ||
      null
    );
  }

  function getVitriTheoKho(masp) {
    const sp = getProduct(masp);
    if (!sp) return '';

    const cs = text(
      document.getElementById('diadiem')?.value ||
      localStorage.getItem('diadiem')
    ).toLowerCase();

    if (cs === 'cs1') return text(sp.vitrikho1);
    if (cs === 'cs2') return text(sp.vitrikho2);
    if (cs === 'cs3') return text(sp.vitrikho3);
    return text(sp.vitrikho1 || sp.vitrikho2 || sp.vitrikho3);
  }

  function sizeOrder(size) {
    const raw = upper(size);
    if (!raw) return 999999;

    const ds = Array.isArray(window.danhMucSize) ? window.danhMucSize : [];
    if (ds.length) {
      const idx = ds.map(upper).indexOf(raw);
      if (idx >= 0) return idx;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

    const common = ['XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', '4XL', '5XL', '6XL'];
    const commonIdx = common.indexOf(raw);
    if (commonIdx >= 0) return 10000 + commonIdx;

    return 99999;
  }

  function isCanonicalSize(size) {
    const s = text(size);
    if (!s) return false;
    // Dấu / là ký hiệu phân cách size/sl của lớp hiển thị CCN, không được nằm trong size thật.
    if (s.includes('/')) return false;
    // Chặn control chars/tab/newline làm vỡ format copy/paste.
    if (/[\t\r\n]/.test(s)) return false;
    return true;
  }

  function normalizeEntries(item) {
    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const counts = Array.isArray(item?.soluongs) ? item.soluongs : [];
    const map = new Map();

    sizes.forEach((sz, i) => {
      const size = text(sz);
      const sl = Number(counts[i] || 0);
      if (!isCanonicalSize(size) || !Number.isFinite(sl) || sl <= 0) return;
      map.set(size, (map.get(size) || 0) + sl);
    });

    return [...map.entries()]
      .map(([size, sl]) => ({ size, sl }))
      .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));
  }

  // Gom TOÀN BỘ state theo MASP thật.
  //
  // bangketqua.js mới có thể tạo LINE MODEL với nhiều key khác nhau
  // (LN_xxx...) nhưng item.masp lại giống nhau. Nếu render trực tiếp theo key,
  // cùng một mã sẽ bị tách thành nhiều dòng.
  //
  // CCN cần:
  //   1 mã = 1 dòng visual
  // nhưng dữ liệu vẫn giữ từng size/sl riêng trong arrays.
  function groupStateByMasp(rawBang) {
    const grouped = {};

    Object.entries(rawBang || {}).forEach(([key, item]) => {
      if (!item) return;

      const masp = upper(item.masp || key);
      if (!masp) return;

      const sp = getProduct(masp) || {};

      if (!grouped[masp]) {
        grouped[masp] = {
          ...item,
          masp,
          tensp: text(item.tensp || sp.tensp || sp.tenhang || ''),
          dvt: text(item.dvt || sp.dvt || ''),
          gia: Number(item.gia || 0) || 0,
          km: Number(item.km || 0) || 0,
          sizes: [],
          soluongs: [],
          tong: 0
        };
      }

      const g = grouped[masp];

      // Ưu tiên thông tin có dữ liệu nếu dòng đầu đang trống.
      if (!g.tensp && item.tensp) g.tensp = text(item.tensp);
      if (!g.dvt && item.dvt) g.dvt = text(item.dvt);
      if (!g.gia && Number(item.gia || 0)) g.gia = Number(item.gia);
      if (!g.km && Number(item.km || 0)) g.km = Number(item.km);

      const entries = normalizeEntries(item);

      entries.forEach(({ size, sl }) => {
        const idx = g.sizes.findIndex(s => text(s) === size);
        if (idx >= 0) {
          g.soluongs[idx] = Number(g.soluongs[idx] || 0) + Number(sl || 0);
        } else {
          g.sizes.push(size);
          g.soluongs.push(Number(sl || 0));
        }
      });
    });

    // Chuẩn hóa thứ tự size và tổng SL.
    Object.values(grouped).forEach(g => {
      const pairs = g.sizes.map((size, i) => ({
        size: text(size),
        sl: Number(g.soluongs[i] || 0)
      }))
      .filter(x => isCanonicalSize(x.size) && x.sl > 0)
      .sort((a, b) => sizeOrder(a.size) - sizeOrder(b.size));

      g.sizes = pairs.map(x => x.size);
      g.soluongs = pairs.map(x => x.sl);
      g.tong = pairs.reduce((sum, x) => sum + x.sl, 0);
    });

    return grouped;
  }

  function orderedMasps(bang) {
    const keys = Object.keys(bang || {}).filter(Boolean);
    if (!keys.length) return [];

    const order = Array.isArray(window.groupOrder)
      ? window.groupOrder.map(upper)
      : [];

    const out = [];
    order.forEach(m => {
      const hit = keys.find(k => upper(k) === m);
      if (hit && !out.includes(hit)) out.push(hit);
    });
    keys.forEach(k => { if (!out.includes(k)) out.push(k); });
    return out;
  }

  function renderGroupedTable(bangKetQua) {
    if (rendering) return;
    rendering = true;
    try {
      const tbody = document.querySelector('#bangketqua tbody');
      if (!tbody) return;

      // V2.1: luôn gom state theo MASP trước khi render.
      // Dù đầu vào là LINE MODEL nhiều key, CCN vẫn chỉ hiện 1 mã / 1 dòng.
      const groupedState = groupStateByMasp(bangKetQua || window.bangKetQua || {});

      // Đồng thời biến groupedState thành nguồn dữ liệu chuẩn để Save/Xem/Sửa
      // đều dùng cùng một cấu trúc.
      window.bangKetQua = groupedState;
      try { window.hoadonSyncFromWindow?.(); } catch (_) {}

      tbody.innerHTML = '';

      for (const key of orderedMasps(groupedState)) {
        const item = groupedState[key];
        if (!item) continue;

        const masp = upper(item.masp || key);
        if (!masp) continue;

        const entries = normalizeEntries(item);
        if (!entries.length) continue;

        const tongSL = entries.reduce((s, x) => s + Number(x.sl || 0), 0);
        const gia = Number(item.gia || 0) || 0;
        const kmDonVi = Number(item.km || 0) || 0;
        const kmTong = kmDonVi * tongSL;
        const thanhtien = Math.max(0, (gia * tongSL) - kmTong);
        const sp = getProduct(masp);
        const tensp = text(item.tensp || sp?.tensp || sp?.tenhang || '');
        const dvt = text(item.dvt || sp?.dvt || '');
        const vitri = getVitriTheoKho(masp);

        const tr = document.createElement('tr');
        tr.dataset.ccnGrouped = '1';
        tr.dataset.masp = masp;

        const sizeHtml = entries
          .map(x => `<div class="ccn-size-token" data-size="${escapeHtml(x.size)}" data-sl="${x.sl}">${escapeHtml(x.size)}/${x.sl}</div>`)
          .join('');

        tr.innerHTML = `
          <td>${escapeHtml(masp)}</td>
          <td>${escapeHtml(tensp)}</td>
          <td class="ccn-size-list">${sizeHtml}</td>
          <td>${tongSL}</td>
          <td>${escapeHtml(dvt)}</td>
          <td>${formatNumber(gia)}</td>
          <td>${formatNumber(kmTong)}</td>
          <td>${formatNumber(thanhtien)}</td>
          <td>${escapeHtml(vitri)}</td>
          <td data-col="ton_cs1"></td>
          <td data-col="ton_cs2"></td>
        `;

        tr.addEventListener('click', () => {
          if (typeof window.setMaspspDangChon === 'function') {
            window.setMaspspDangChon({ masp, size: null });
          }
          document.querySelectorAll('#bangketqua tbody tr').forEach(r => {
            r.style.backgroundColor = r === tr ? '#e6f3ff' : '';
          });
        });

        tbody.appendChild(tr);
      }

      console.debug(`[${VERSION}] render`, Object.keys(groupedState || {}).length, 'mã');
    } finally {
      rendering = false;
    }
  }

  function escapeHtml(v) {
    return text(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(n) {
    const v = Number(n || 0);
    return Number.isFinite(v) ? v.toLocaleString('vi-VN') : '0';
  }

  function parseSizeCell(cell, fallbackSl) {
    if (!cell) return [];

    // Ưu tiên dữ liệu có cấu trúc do V2 tự render.
    const structured = [...cell.querySelectorAll?.('.ccn-size-token') || []]
      .map(el => ({
        size: text(el.dataset.size),
        sl: Number(el.dataset.sl || 0)
      }))
      .filter(x => isCanonicalSize(x.size) && Number.isFinite(x.sl) && x.sl > 0);

    if (structured.length) return structured;

    // Tương thích clipboard / bản cũ: "39/1 40/2 41/1".
    const raw = text(cell.innerText || cell.textContent);
    if (!raw) return [];

    const tokens = raw.split(/\s+/).filter(Boolean);
    const parsed = [];
    const invalid = [];

    for (const tok of tokens) {
      // Chính xác một dấu /: phần trước là size, phần sau là số lượng.
      const slashCount = (tok.match(/\//g) || []).length;
      if (slashCount === 1) {
        const idx = tok.lastIndexOf('/');
        const size = text(tok.slice(0, idx));
        const sl = Number(text(tok.slice(idx + 1)));
        if (isCanonicalSize(size) && Number.isFinite(sl) && sl > 0) {
          parsed.push({ size, sl });
        } else {
          invalid.push(tok);
        }
      } else {
        invalid.push(tok);
      }
    }

    if (parsed.length && invalid.length === 0) return parsed;

    // Dạng dọc cũ: cột size chỉ là "39", SL nằm cột 4.
    if (tokens.length === 1 && isCanonicalSize(raw) && !raw.includes('/')) {
      const sl = Number(fallbackSl || 0);
      if (Number.isFinite(sl) && sl > 0) return [{ size: raw, sl }];
    }

    // Không đoán dữ liệu hỏng. Giữ an toàn để không sinh 39/1/1 vào DB.
    if (invalid.length || raw.includes('/')) {
      console.error(`[${VERSION}] Size CCN không hợp lệ, bỏ qua dòng:`, raw);
    }
    return [];
  }

  function syncFromDOM() {
    if (syncing) return window.bangKetQua || {};
    syncing = true;
    try {
      const tbody = document.querySelector('#bangketqua tbody');
      if (!tbody) return window.bangKetQua || {};

      const oldState = window.bangKetQua && typeof window.bangKetQua === 'object'
        ? window.bangKetQua
        : {};
      const bang = {};
      const rejected = [];

      [...tbody.rows].forEach((row, rowIndex) => {
        const masp = upper(row.cells[0]?.innerText);
        if (!masp) return;

        const tensp = text(row.cells[1]?.innerText);
        const fallbackSl = Number(text(row.cells[3]?.innerText).replace(/[^0-9.-]/g, '')) || 0;
        const entries = parseSizeCell(row.cells[2], fallbackSl);

        if (!entries.length) {
          rejected.push({ row: rowIndex + 1, masp, sizeText: text(row.cells[2]?.innerText) });
          return;
        }

        const old = oldState[masp] || oldState[Object.keys(oldState).find(k => upper(k) === masp)] || {};
        const sp = getProduct(masp) || {};
        const gia = parseMoney(row.cells[5]?.innerText) || Number(old.gia || 0) || 0;
        const tongSL = entries.reduce((s, x) => s + x.sl, 0);
        const kmTong = parseMoney(row.cells[6]?.innerText);
        const km = tongSL > 0 ? Math.round(kmTong / tongSL) : Number(old.km || 0) || 0;
        const dvt = text(row.cells[4]?.innerText || old.dvt || sp.dvt || '');

        if (!bang[masp]) {
          bang[masp] = {
            ...old,
            masp,
            tensp: tensp || text(old.tensp || sp.tensp || sp.tenhang || ''),
            dvt,
            gia,
            km,
            sizes: [],
            soluongs: [],
            tong: 0
          };
        }

        // Cùng mã có thể xuất hiện nhiều dòng từ clipboard cũ: vẫn gom về model chuẩn.
        for (const e of entries) {
          const idx = bang[masp].sizes.findIndex(s => text(s) === e.size);
          if (idx >= 0) {
            bang[masp].soluongs[idx] = Number(bang[masp].soluongs[idx] || 0) + e.sl;
          } else {
            bang[masp].sizes.push(e.size);
            bang[masp].soluongs.push(e.sl);
          }
          bang[masp].tong += e.sl;
        }
      });

      if (rejected.length) {
        console.warn(`[${VERSION}] Có dòng CCN không đọc được, không ghi vào state:`, rejected);
      }

      window.bangKetQua = bang;

      // Đồng bộ vào biến module private của hoadon.js nếu module đã nạp.
      try { window.hoadonSyncFromWindow?.(); } catch (e) {
        console.warn(`[${VERSION}] hoadonSyncFromWindow lỗi:`, e);
      }

      console.debug(`[${VERSION}] sync DOM -> state`, bang);
      return bang;
    } finally {
      syncing = false;
    }
  }

  function installSyncOverride() {
    // Trên CCN, mọi lời gọi window.capNhatBangKetQuaTuDOM phải đi qua parser CCN V2.
    // Dùng accessor để bangketqua.js nạp sau đó cũng không ghi đè được.
    try {
      const d = Object.getOwnPropertyDescriptor(window, 'capNhatBangKetQuaTuDOM');
      if (d && d.get && d.get.__ccnV2Getter) return;

      if (typeof window.capNhatBangKetQuaTuDOM === 'function' && window.capNhatBangKetQuaTuDOM !== syncFromDOM) {
        originalGenericSync = window.capNhatBangKetQuaTuDOM;
      }

      const getter = function () { return syncFromDOM; };
      getter.__ccnV2Getter = true;

      Object.defineProperty(window, 'capNhatBangKetQuaTuDOM', {
        configurable: true,
        enumerable: true,
        get: getter,
        set(fn) {
          if (typeof fn === 'function' && fn !== syncFromDOM) {
            originalGenericSync = fn;
          }
        }
      });
    } catch (e) {
      // Fallback nếu môi trường không cho defineProperty.
      window.capNhatBangKetQuaTuDOM = syncFromDOM;
      console.warn(`[${VERSION}] Không khóa được global sync, dùng fallback:`, e);
    }

    window.capNhatBangKetQuaCCNTuDOM = syncFromDOM;
  }

  function afterRender({ bangKetQua }) {
    const grouped = groupStateByMasp(bangKetQua || window.bangKetQua || {});
    window.bangKetQua = grouped;
    try { window.hoadonSyncFromWindow?.(); } catch (_) {}
    renderGroupedTable(grouped);
  }

  window.initCCNAdapter = function initCCNAdapterV2() {
    installSyncOverride();
    window.ccnAfterRenderAdapter = afterRender;
    window.CCNBangKetQuaV2 = {
      version: VERSION,
      syncFromDOM,
      render: renderGroupedTable,
      groupStateByMasp,
      getOriginalGenericSync: () => originalGenericSync
    };

    // Nếu main/hoadon đã có state trước khi init (kể cả hóa đơn cũ
    // đang có nhiều dòng chi tiết cùng MASP), gom lại ngay trước khi vẽ.
    if (window.bangKetQua && Object.keys(window.bangKetQua).length) {
      const grouped = groupStateByMasp(window.bangKetQua);
      window.bangKetQua = grouped;
      try { window.hoadonSyncFromWindow?.(); } catch (_) {}
      renderGroupedTable(grouped);
    }

    console.log(`✅ [${VERSION}] Đã bật adapter CCN độc lập.`);
  };
})();
