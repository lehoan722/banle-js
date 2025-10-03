// scripts/nhaptam_mobile_getbang.js
;(() => {
  'use strict';

  // dấu hiệu kiểm tra đã nạp đúng bản
  window.__BKQ_BUILD = '2025-10-03-quiet-300';

  // ================= STATE CHỐNG LOOP =================
  const BKQ = (window.__BKQ_BRIDGE = window.__BKQ_BRIDGE || {
    hydrating: false,
    timer: null,
    lastHash: '',
  });

  // ========== A) CHIỀU THUẬN: MobileKQ → window.bangKetQua ==========
  function getSPFast(code) {
    const masp = String(code || '').trim().toUpperCase();
    if (!masp) return null;

    if (window.sanPhamData && typeof window.sanPhamData === 'object') {
      const m = window.sanPhamData;
      const k = m[masp] || m[masp.replace(/\s+/g, '')] || m[code] || null;
      if (k) return k;
    }
    if (window.__spIndex__ instanceof Map) {
      const v = window.__spIndex__.get(masp) || window.__spIndex__.get(masp.replace(/\s+/g,'')) || null;
      if (v) return v;
    }
    const arr = window.dmhanghoa || window.dssp || window.dsSanPham;
    if (Array.isArray(arr)) {
      const likely = ['masp','MA','ma','ma_sp','mahang','ma_hang','mavattu','mavt','code','sku','mahh'];
      for (const rec of arr) for (const k of likely) {
        if (rec[k] != null && String(rec[k]).trim().toUpperCase() === masp) return rec;
      }
      for (const rec of arr) for (const [k,v] of Object.entries(rec)) {
        if ((typeof v === 'string' || typeof v === 'number')
            && String(v).trim().toUpperCase() === masp
            && String(v).length <= 32) return rec;
      }
    }
    return null;
  }

  function fromMobileGrid() {
    if (!window.MobileKQ || typeof window.MobileKQ.getAll !== 'function') return {};
    const all = window.MobileKQ.getAll();
    const kq = {};

    all.forEach(r => {
      const sizes = [], soluongs = [];
      for (const k of Object.keys(r.qty || {})) {
        const sz = parseInt(k, 10);
        const sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      }
      if (sizes.length === 0) return;

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

    // gán an toàn (không kích loop)
    window.__bkq_assigning_from_mobile = true;
    try { window.bangKetQua = kq; }
    finally { window.__bkq_assigning_from_mobile = false; }
    return kq;
  }

  Object.defineProperty(window, 'getBangKetQua', {
    value: () => fromMobileGrid(),
    writable: false, configurable: false
  });
  window._fromMobileGrid = fromMobileGrid;

  // ========== B) CHIỀU NGƯỢC: HĐ cũ → MobileKQ ==========
  function _bkqItemToRow(item) {
    const masp = String(item?.masp || '').trim().toUpperCase();
    const row = { masp, qty: {}, vitri: item?.vitri || '', t1: item?.toncs1 || 0, t2: item?.toncs2 || 0 };

    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const sls   = Array.isArray(item?.soluongs) ? item.soluongs : [];
    if (sizes.length && sizes.length === sls.length) {
      sizes.forEach((s, i) => {
        const sz = parseInt(s, 10);
        const sl = parseInt(sls[i] || 0, 10) || 0;
        if (!Number.isNaN(sz) && sl > 0) row.qty[sz] = sl;
      });
    } else {
      const sl = parseInt(item?.soluong ?? item?.sl ?? 0, 10) || 0;
      if (sl > 0) row.qty[0] = sl;
    }
    return row;
  }

  function _clearMobileGrid() {
    try {
      if (window.MobileKQ?.clear) {
        window.MobileKQ.clear();
      } else {
        if (window.MobileKQ?.rows) window.MobileKQ.rows.length = 0;
        const tbody = document.querySelector('#bangketqua tbody');
        if (tbody) tbody.innerHTML = '';
      }
    } catch (e) {
      const tbody = document.querySelector('#bangketqua tbody');
      if (tbody) tbody.innerHTML = '';
    }
  }

  async function setMobileGridFromBangKetQua(bang) {
    if (!bang || typeof bang !== 'object') return;
    if (!window.MobileKQ || typeof window.MobileKQ.upsertRow !== 'function') return;

    _clearMobileGrid();

    const entries = Array.isArray(bang) ? bang : Object.values(bang);
    for (const it of entries) {
      const row = _bkqItemToRow(it);
      if (!row.masp) continue;

      await window.MobileKQ.upsertRow(row.masp, { moveTop: false });
      for (const [sz, sl] of Object.entries(row.qty)) {
        window.MobileKQ.setQty(row.masp, parseInt(sz, 10), sl);
      }
      if (row.vitri) {
        const r = typeof window.MobileKQ.find === 'function' ? window.MobileKQ.find(row.masp) : null;
        if (r) { r.vitri = row.vitri; r.t1 = row.t1 || 0; r.t2 = row.t2 || 0; }
      }
    }

    window.MobileKQ.render?.();

    if (typeof window.MobileKQ.ensureVitriTonBatch === 'function') {
      const masps = entries.map(x => (x?.masp || '').toUpperCase()).filter(Boolean);
      try { window.MobileKQ.ensureVitriTonBatch(masps); } catch (_) {}
    }

    const prev = window.__bkq_assigning_from_mobile;
    window.__bkq_assigning_from_mobile = true;
    try { window.getBangKetQua?.(); } finally { window.__bkq_assigning_from_mobile = prev; }
    window.capNhatThongTinTong?.();
  }

  async function setMobileGridFromHoaDon(hoadon, chitiet) {
    if (!Array.isArray(chitiet)) return setMobileGridFromBangKetQua({});
    const grouped = new Map();

    for (const r of chitiet) {
      const masp = String(r?.masp || r?.ma || '').trim().toUpperCase();
      if (!masp) continue;
      const sizeRaw = r?.size ?? r?.kichco ?? r?.kc ?? 0;
      const size = parseInt(sizeRaw, 10);
      const sl = parseInt(r?.soluong ?? r?.sl ?? r?.qty ?? 0, 10) || 0;

      if (!grouped.has(masp)) grouped.set(masp, { masp, qty: {} });
      const g = grouped.get(masp);
      const k = Number.isFinite(size) ? size : 0;
      g.qty[k] = (g.qty[k] || 0) + sl;
    }

    const bang = {};
    for (const [masp, g] of grouped.entries()) {
      const sizes = Object.keys(g.qty).map(s => String(parseInt(s,10))).filter(Boolean);
      const soluongs = sizes.map(s => g.qty[parseInt(s,10)] || 0);
      bang[masp] = { masp, sizes, soluongs };
    }
    await setMobileGridFromBangKetQua(bang);
  }

  Object.defineProperty(window, 'setMobileGridFromBangKetQua', {
    value: setMobileGridFromBangKetQua, writable: false, configurable: false
  });
  Object.defineProperty(window, 'setMobileGridFromHoaDon', {
    value: setMobileGridFromHoaDon, writable: false, configurable: false
  });

  async function applyOldInvoiceData(payload) {
    try {
      if (payload?.bangKetQua && typeof payload.bangKetQua === 'object') {
        return await setMobileGridFromBangKetQua(payload.bangKetQua);
      }
      if (Array.isArray(payload?.chitiet)) {
        return await setMobileGridFromHoaDon(payload.hoadon, payload.chitiet);
      }
      if (payload && typeof payload === 'object') {
        return await setMobileGridFromBangKetQua(payload);
      }
      alert('Không nhận diện được dữ liệu hóa đơn cũ để nạp vào lưới.');
    } catch (err) {
      console.error('[Quay lại] Lỗi hydrate:', err);
      alert('Lỗi khi phục hồi dữ liệu vào lưới.');
    }
  }
  Object.defineProperty(window, 'applyOldInvoiceData', {
    value: applyOldInvoiceData, writable: false, configurable: false
  });

  window.addEventListener('hydrate-mobile-from-bangketqua', e => {
    const bang = e?.detail?.bang || e?.detail;
    setMobileGridFromBangKetQua(bang);
  });
  window.addEventListener('hydrate-mobile-from-hoadon', e => {
    const hoadon = e?.detail?.hoadon, chitiet = e?.detail?.chitiet || e?.detail;
    setMobileGridFromHoaDon(hoadon, chitiet);
  });

  // ========== C) SETTER bangKetQua: tự hydrate (debounce, chống loop) ==========
  if (!window.__bkq_defined__) {
    let __bkq_store = {};
    Object.defineProperty(window, 'bangKetQua', {
      configurable: true,
      get() { return __bkq_store; },
      set(v) {
        __bkq_store = v || {};
        if (BKQ.hydrating) return;
        if (window.__bkq_assigning_from_mobile) return;
        if (!__bkq_store || !Object.keys(__bkq_store).length) return;

        if (BKQ.timer) clearTimeout(BKQ.timer);
        BKQ.timer = setTimeout(() => {
          try {
            const hash = (() => { try { return JSON.stringify(__bkq_store).length + ''; } catch { return Date.now()+''; }})();
            if (hash === BKQ.lastHash) return;
            BKQ.lastHash = hash;

            BKQ.hydrating = true;
            window.setMobileGridFromBangKetQua?.(__bkq_store);

            const prev = window.__bkq_assigning_from_mobile;
            window.__bkq_assigning_from_mobile = true;
            try { window.getBangKetQua?.(); } finally { window.__bkq_assigning_from_mobile = prev; }
            window.capNhatThongTinTong?.();
          } catch (e) {
            console.error('[BKQ setter] hydrate lỗi:', e);
          } finally {
            BKQ.hydrating = false;
          }
        }, 100);
      }
    });
    window.__bkq_defined__ = true;
  }

  // ========== D) LATE-HOOK QUAY LẠI: chờ DOM “yên” rồi mới hydrate ==========
  function _safeLen(o){ try { return Object.keys(o||{}).length; } catch { return 0; } }

  function tryHydrateFromBKQorDOM() {
    let src = window.bangKetQua;
    if (!_safeLen(src) && typeof window.capNhatBangKetQuaTuDOM === 'function') {
      const prev = window.__bkq_assigning_from_mobile;
      window.__bkq_assigning_from_mobile = true;
      try { src = window.capNhatBangKetQuaTuDOM() || {}; }
      catch (e) { console.warn('[hydrate fallback DOM] ', e); }
      finally { window.__bkq_assigning_from_mobile = prev; }
    }
    if (_safeLen(src)) {
      const prev2 = window.__bkq_assigning_from_mobile;
      window.__bkq_assigning_from_mobile = true;
      try { setMobileGridFromBangKetQua(src); }
      finally { window.__bkq_assigning_from_mobile = prev2; }
      return true;
    }
    return false;
  }

  // Quan sát tbody cho đến khi “yên” quietMs (reset timer mỗi biến động), hoặc quá maxWaitMs
  function observeUntilQuietAndHydrate(quietMs = 300, maxWaitMs = 3000) {
    const tbody = document.querySelector('#bangketqua tbody');
    if (!tbody) return;

    let tQuiet = null;
    let tMax = null;
    const cleanup = (mo) => {
      if (tQuiet) clearTimeout(tQuiet);
      if (tMax) clearTimeout(tMax);
      mo && mo.disconnect();
    };

    const mo = new MutationObserver(() => {
      if (BKQ.hydrating) return; // bỏ thay đổi do chính mình gây ra
      if (tQuiet) clearTimeout(tQuiet);
      tQuiet = setTimeout(() => {    // không có thay đổi mới trong quietMs
        cleanup(mo);
        tryHydrateFromBKQorDOM();
      }, quietMs);
    });

    // Bắt đầu quan sát & cài maxWait
    mo.observe(tbody, { childList: true, subtree: true, attributes: false, characterData: false });
    tMax = setTimeout(() => { cleanup(mo); tryHydrateFromBKQorDOM(); }, maxWaitMs);
  }

  function attachQuayLaiHook() {
    const btn = document.getElementById('quaylai');
    if (!btn) return;

    btn.addEventListener('click', () => {
      // Cho luồng cũ chạy tự do, mình chờ DOM “yên” rồi mới hydrate
      setTimeout(() => {
        observeUntilQuietAndHydrate(300, 3000);
      }, 50);
    }, { capture: false });
  }

  // chạy khi file load
  attachQuayLaiHook();

})();
