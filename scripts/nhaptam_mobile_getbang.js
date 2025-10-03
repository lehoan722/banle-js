// scripts/nhaptam_mobile_getbang.js
;(() => {
  'use strict';

  // ================= CẦU CHÌ CHỐNG LOOP / DEBUG =================
  const BKQ = (window.__BKQ_BRIDGE = window.__BKQ_BRIDGE || {
    hydrating: false,   // đang hydrate MobileKQ từ bangKetQua
    timer: null,        // debounce timer cho setter
    lastHash: '',       // dấu vết lần hydrate gần nhất
    disabled: false     // bật/tắt bridge nhanh khi cần debug: window.__BKQ_BRIDGE.disabled = true
  });

  // ==============================================================
  // A) ADAPTER CHIỀU THUẬN: MobileKQ → window.bangKetQua
  //    (giữ nguyên API getBangKetQua() bạn đang dùng)
  // ==============================================================

  // Tìm nhanh thông tin SP từ cache hiện có (không gọi DB)
  function getSPFast(code) {
    const masp = String(code || '').trim().toUpperCase();
    if (!masp) return null;

    // 1) Map chuẩn
    if (window.sanPhamData && typeof window.sanPhamData === 'object') {
      const m = window.sanPhamData;
      const k = m[masp] || m[masp.replace(/\s+/g, '')] || m[code] || null;
      if (k) return k;
    }

    // 2) Index đã build sẵn (Map)
    if (window.__spIndex__ instanceof Map) {
      const v = window.__spIndex__.get(masp) || window.__spIndex__.get(masp.replace(/\s+/g,'')) || null;
      if (v) return v;
    }

    // 3) Quét mảng (nếu có)
    const arr = window.dmhanghoa || window.dssp || window.dsSanPham;
    if (Array.isArray(arr)) {
      const likely = ['masp','MA','ma','ma_sp','mahang','ma_hang','mavattu','mavt','code','sku','mahh'];
      for (const rec of arr) {
        for (const k of likely) {
          if (rec[k] != null && String(rec[k]).trim().toUpperCase() === masp) return rec;
        }
      }
      for (const rec of arr) {
        for (const [k,v] of Object.entries(rec)) {
          if ((typeof v === 'string' || typeof v === 'number')
              && String(v).trim().toUpperCase() === masp
              && String(v).length <= 32) return rec;
        }
      }
    }
    return null;
  }

  // Đọc dữ liệu từ lưới MobileKQ → chuẩn hoá về window.bangKetQua
  function fromMobileGrid() {
    if (!window.MobileKQ || typeof window.MobileKQ.getAll !== 'function') return {};
    const all = window.MobileKQ.getAll();  // [{masp, qty:{}, vitri,t1,t2, ...}]
    const kq = {};

    all.forEach(r => {
      const sizes = [];
      const soluongs = [];
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

    // Gán an toàn (không kích loop)
    window.__bkq_assigning_from_mobile = true;
    try {
      window.bangKetQua = kq;
    } finally {
      window.__bkq_assigning_from_mobile = false;
    }
    return kq;
  }

  // API công khai (GIỮ NGUYÊN)
  Object.defineProperty(window, 'getBangKetQua', {
    value: () => fromMobileGrid(),
    writable: false,
    configurable: false
  });
  window._fromMobileGrid = fromMobileGrid; // tiện debug


  // ==============================================================
  // B) ADAPTER CHIỀU NGƯỢC: dữ liệu cũ/HĐ cũ → MobileKQ
  // ==============================================================

  // Chuẩn hoá 1 item bangKetQua → { masp, qty:{0..45}, vitri,t1,t2 }
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
      if (sl > 0) row.qty[0] = sl; // fallback size 0
    }
    return row;
  }

  // Clear lưới an toàn (không click "Thêm mới")
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
      console.warn('[clear grid] fallback:', e);
      const tbody = document.querySelector('#bangketqua tbody');
      if (tbody) tbody.innerHTML = '';
    }
  }

  // (B1) Đổ từ bangKetQua (object/array) → MobileKQ
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
      // chạy nền, không await để UI mượt
      try { window.MobileKQ.ensureVitriTonBatch(masps); } catch (_) {}
    }

    // Đồng bộ lại cho Lưu/In mà không gây loop
    const prev = window.__bkq_assigning_from_mobile;
    window.__bkq_assigning_from_mobile = true;
    try { window.getBangKetQua?.(); } finally { window.__bkq_assigning_from_mobile = prev; }
    window.capNhatThongTinTong?.();
  }

  // (B2) Đổ từ chi tiết hoá đơn → MobileKQ
  async function setMobileGridFromHoaDon(hoadon, chitiet) {
    if (!Array.isArray(chitiet)) return setMobileGridFromBangKetQua({});
    const grouped = new Map(); // masp -> { masp, qty:{} }

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

  // Expose API chiều ngược
  Object.defineProperty(window, 'setMobileGridFromBangKetQua', {
    value: setMobileGridFromBangKetQua, writable: false, configurable: false
  });
  Object.defineProperty(window, 'setMobileGridFromHoaDon', {
    value: setMobileGridFromHoaDon, writable: false, configurable: false
  });

  // (B3) Bridge đa dụng cho "Quay lại"
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

  // Hỗ trợ dispatch event nếu luồng cũ phát sự kiện
  window.addEventListener('hydrate-mobile-from-bangketqua', e => {
    const bang = e?.detail?.bang || e?.detail;
    setMobileGridFromBangKetQua(bang);
  });
  window.addEventListener('hydrate-mobile-from-hoadon', e => {
    const hoadon = e?.detail?.hoadon, chitiet = e?.detail?.chitiet || e?.detail;
    setMobileGridFromHoaDon(hoadon, chitiet);
  });


  // ==============================================================
  // C) SETTER bangKetQua: tự hydrate vào MobileKQ (debounce, chống loop)
  // ==============================================================

  if (!window.__bkq_defined__) {
    let __bkq_store = {};
    Object.defineProperty(window, 'bangKetQua', {
      configurable: true,
      get() { return __bkq_store; },
      set(v) {
        __bkq_store = v || {};

        // Các trường hợp KHÔNG hydrate
        if (BKQ.disabled) return;                          // tắt cầu khi debug
        if (BKQ.hydrating) return;                         // đang hydrate → bỏ
        if (window.__bkq_assigning_from_mobile) return;    // do chiều thuận vừa gán → bỏ
        if (!__bkq_store || !Object.keys(__bkq_store).length) return; // rỗng → bỏ

        // Debounce: gom các lần gán liên tiếp
        if (BKQ.timer) clearTimeout(BKQ.timer);
        BKQ.timer = setTimeout(() => {
          try {
            // tránh hydrate lại cùng data
            const hash = (() => { try { return JSON.stringify(__bkq_store).length + ''; } catch { return Date.now()+''; }})();
            if (hash === BKQ.lastHash) return;
            BKQ.lastHash = hash;

            BKQ.hydrating = true;
            window.setMobileGridFromBangKetQua?.(__bkq_store);

            // Cập nhật tổng/nguồn lưu mà không kích lại setter
            const prev = window.__bkq_assigning_from_mobile;
            window.__bkq_assigning_from_mobile = true;
            try { window.getBangKetQua?.(); } finally { window.__bkq_assigning_from_mobile = prev; }
            window.capNhatThongTinTong?.();
          } catch (e) {
            console.error('[BKQ setter] hydrate lỗi:', e);
          } finally {
            BKQ.hydrating = false;
          }
        }, 60); // đợi 60ms cho luồng cũ kết thúc render
      }
    });
    window.__bkq_defined__ = true;
  }

})();
