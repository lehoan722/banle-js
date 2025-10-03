// scripts/nhaptam_mobile_getbang.js
;(() => {
  'use strict';

  // Phiên bản build để kiểm tra đã nạp đúng file
  window.__BKQ_BUILD = '2025-10-03-backflow-print-v3';

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

  // XÓA SẠCH LƯỚI + STATE (chống cộng dồn)
  function __forceClearAllBeforeHydrate() {
    try {
      if (window.MobileKQ?.reset) window.MobileKQ.reset();
      if (window.MobileKQ?.rows) window.MobileKQ.rows.length = 0;
      const tb = document.querySelector('#bangketqua tbody');
      if (tb) tb.innerHTML = '';
      const prev = window.__bkq_assigning_from_mobile;
      window.__bkq_assigning_from_mobile = true;
      try { window.bangKetQua = {}; } finally { window.__bkq_assigning_from_mobile = prev; }
      if (typeof window.capNhatThongTinTong === 'function') window.capNhatThongTinTong();
    } catch (e) {
      console.warn('[forceClear] ', e);
    }
  }

  async function setMobileGridFromBangKetQua(bang) {
    if (!bang || typeof bang !== 'object') return;
    if (!window.MobileKQ || typeof window.MobileKQ.upsertRow !== 'function') return;

    __forceClearAllBeforeHydrate(); // chống cộng dồn
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

  // ========== D) QUAY LẠI (ĐỌC TRỰC TIẾP DB, LÙI DẦN SỐ HĐ) ==========
  // Supabase: đọc từ public.hoadon_banle + public.ct_hoadon_banle
  async function queryInvoiceFromDB(sohdRaw) {
    if (!window.supabase) throw new Error('Supabase client (window.supabase) chưa sẵn sàng');

    const SCHEMA = 'public';
    const HD = 'hoadon_banle';
    const CT = 'ct_hoadon_banle';

    const sohd = String(sohdRaw || '').trim();
    const sohdU = sohd.toUpperCase();
    const sohdL = sohd.toLowerCase();

    // header (tùy – không bắt buộc phải có)
    let hoadon = null;
    try {
      let r = await window.supabase.schema(SCHEMA).from(HD).select('*').eq('sohd', sohd).limit(1).maybeSingle();
      if (r.data) hoadon = r.data;
      else {
        r = await window.supabase.schema(SCHEMA).from(HD).select('*').eq('sohd', sohdU).limit(1).maybeSingle();
        if (r.data) hoadon = r.data;
        else {
          r = await window.supabase.schema(SCHEMA).from(HD).select('*').eq('sohd', sohdL).limit(1).maybeSingle();
          if (r.data) hoadon = r.data;
        }
      }
    } catch (_) { /* 406/RLS: bỏ qua */ }

    // detail (bắt buộc)
    async function fetchCTEq(val) {
      const { data, error } = await window.supabase.schema(SCHEMA).from(CT)
        .select('masp, size, soluong, gia, km, dvt')
        .eq('sohd', val);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }

    let ct = await fetchCTEq(sohd);
    if (!ct.length) ct = await fetchCTEq(sohdU);
    if (!ct.length) ct = await fetchCTEq(sohdL);
    if (!ct.length) {
      const { data: likeCt } = await window.supabase.schema(SCHEMA).from(CT)
        .select('sohd, masp, size, soluong, gia, km, dvt')
        .ilike('sohd', `%${sohd}%`)
        .limit(200);
      if (!likeCt || !likeCt.length) throw new Error('Không thấy chi tiết cho số HĐ: ' + sohd);
      const picked = likeCt.filter(r => {
        const s = String(r.sohd || '');
        return s === sohd || s === sohdU || s === sohdL || s.includes(sohd);
      });
      ct = picked.length ? picked : likeCt;
    }

    const chitiet = ct.map(r => ({
      masp: (r.masp || '').toUpperCase().trim(),
      size: r.size,
      soluong: Number(r.soluong || 0),
      dongia: Number(r.gia || 0),
      khuyenmai: Number(r.km || 0),
      dvt: r.dvt || ''
    }));

    return { hoadon, chitiet };
  }

  // Parse ra số HĐ liền trước
  function __prevSohd(sohd) {
    const m = String(sohd || '').trim().match(/^(.*?_)(\d+)$/);
    if (!m) return null;
    const prefix = m[1], numStr = m[2];
    const n = parseInt(numStr, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const prev = (n - 1).toString().padStart(numStr.length, '0');
    return prefix + prev;
  }

  // Lấy input Số HĐ trên trang
  function __findSohdInput() {
    const cands = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    for (const el of cands) {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const nm = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      if (ph.includes('số hd') || ph.includes('so hd') || nm.includes('sohd') || id.includes('sohd')) return el;
    }
    return document.querySelector('#sohd') || null;
  }

  // Nút "Quay lại" → tự lùi dần HĐ đến khi gặp HĐ có chi tiết
  async function openInvoiceFromDatabase() {
    const sohdInput = __findSohdInput();
    const currSohd = (sohdInput?.value || '').trim();
    if (!currSohd) { alert('Vui lòng nhập Số HĐ.'); return; }

    // luôn bắt đầu từ số HĐ liền trước, rồi tiếp tục lùi
    const toTry = [];
    let p = __prevSohd(currSohd);
    for (let i = 0; i < 50 && p; i++) { toTry.push(p); p = __prevSohd(p); }

    const loadingId = '__quaylai_loading__';
    const showLoading = (flag) => {
      let el = document.getElementById(loadingId);
      if (flag) {
        if (!el) {
          el = document.createElement('div');
          el.id = loadingId;
          el.style.cssText = 'position:fixed;right:20px;bottom:20px;padding:8px 12px;background:#222;color:#fff;border-radius:6px;z-index:99999;font-size:12px';
          el.textContent = 'Đang nạp hóa đơn...';
          document.body.appendChild(el);
        }
      } else if (el) el.remove();
    };

    showLoading(true);
    try {
      let found = null, foundSohd = null;
      for (const s of toTry) {
        try {
          const inv = await queryInvoiceFromDB(s);
          if (inv && Array.isArray(inv.chitiet) && inv.chitiet.length) {
            found = inv; foundSohd = s; break;
          }
        } catch (e) {
          if (!/Không thấy chi tiết/.test(String(e?.message || ''))) {
            console.debug('[quaylai] lỗi khi thử', s, e);
          }
        }
      }

      if (!found) {
        alert('Không tìm thấy hóa đơn cũ nào có dữ liệu (đã thử lùi 50 số).');
        return;
      }

      const bang = __mapInvoiceToBangKetQua(found);
      __forceClearAllBeforeHydrate();
      await window.setMobileGridFromBangKetQua(bang);
      if (sohdInput) sohdInput.value = foundSohd;
      if (typeof window.capNhatThongTinTong === 'function') window.capNhatThongTinTong();

    } finally {
      showLoading(false);
    }
  }

  // Map {hoadon,chitiet[]} → bangKetQua (1 mã = 1 dòng)
  function __mapInvoiceToBangKetQua(inv) {
    const out = {};
    const rows = Array.isArray(inv?.chitiet) ? inv.chitiet : [];
    const grouped = new Map();

    for (const r of rows) {
      const masp = String(r?.masp || '').trim().toUpperCase();
      if (!masp) continue;
      const size = Number.isFinite(parseInt(r?.size,10)) ? parseInt(r.size,10) : 0;
      const sl = parseInt(r?.soluong ?? r?.sl ?? 0, 10) || 0;
      if (!sl) continue;

      if (!grouped.has(masp)) grouped.set(masp, { masp, qty: {}, gia: r?.dongia || 0, km: r?.khuyenmai || 0, dvt: r?.dvt || '' });
      const g = grouped.get(masp);
      g.qty[size] = (g.qty[size] || 0) + sl;
    }

    for (const [masp, g] of grouped.entries()) {
      const sizes = Object.keys(g.qty).map(s => String(parseInt(s,10))).filter(Boolean);
      const soluongs = sizes.map(s => g.qty[parseInt(s,10)] || 0);
      out[masp] = { masp, sizes, soluongs, gia: g.gia || 0, km: g.km || 0, dvt: g.dvt || '' };
    }
    return out;
  }

  // Gắn nút "Quay lại" – CHẶN luồng cũ
  ;(() => {
    const btn = document.getElementById('quaylai');
    if (!btn) return;
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      await openInvoiceFromDatabase();
      return false;
    }, true);
  })();

  // ========== E) CHUẨN HÓA DỮ LIỆU CHO TRANG IN (LẤY TRỰC TIẾP TỪ LƯỚI) ==========
  function __itemsFromMobileGrid() {
    const out = [];
    if (!window.MobileKQ?.getAll) return out;
    const rows = window.MobileKQ.getAll(); // [{masp, qty:{}, ...}]
    for (const r of rows) {
      const masp = String(r.masp||'').toUpperCase().trim();
      if (!masp) continue;
      const sp = (window.sanPhamData && window.sanPhamData[masp]) || {};
      const tensp = sp.tensp || sp.ten || '';
      const dvt   = sp.dvt || '';
      const gia   = Number(sp.gia ?? sp.giaban ?? 0) || 0;

      const qty = r.qty || {};
      const keys = Object.keys(qty);
      if (!keys.length) continue;

      for (const k of keys) {
        const sz = String(parseInt(k,10));
        const sl = Number(qty[k]||0) || 0;
        if (sl > 0) out.push({ masp, tensp, dvt, size: sz, sl, gia });
      }
    }
    return out;
  }

  function __publishPrintItems(items) {
    window.printPayload = { items };
    window.bangTem = items;
    window.temItems = items;
    try {
      const s = JSON.stringify(items);
      localStorage.setItem('IN_TEM_ITEMS', s);
      localStorage.setItem('PRINT_ITEMS', s);
      localStorage.setItem('TEM_ITEMS', s);
    } catch(e) { console.warn('[print] ls error', e); }
  }

  ;(() => {
    const btn = document.getElementById('inmavach')
          || document.querySelector('button[data-action="inmavach"], .btn-inmavach, .inmavach');
    if (!btn) return;

    btn.addEventListener('click', (ev) => {
      try {
        if (typeof window.getBangKetQua === 'function') window.getBangKetQua();
        const items = __itemsFromMobileGrid();
        if (!items.length) {
          ev.preventDefault(); ev.stopImmediatePropagation();
          alert('Không có dòng nào để in tem.');
          return false;
        }
        __publishPrintItems(items);
        const a = ev.currentTarget.closest('a');
        if (a && a.href && !/source=mobile/.test(a.href))
          a.href = a.href + (a.href.includes('?') ? '&' : '?') + 'source=mobile';
      } catch (e) {
        console.error('[print hook]', e);
      }
    }, true);
  })();

})();
