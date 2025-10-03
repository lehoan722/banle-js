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
  function observeUntilQuietAndHydrate(quietMs = 500, maxWaitMs = 5000) {
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

// ========== E) QUAY LẠI (LUỒNG MỚI, KHÔNG DÍNH MODULE CŨ) ==========

// 1) Helper: cố gắng lấy số HĐ từ ô đang có trên trang
function __getSoHDOnPage() {
  // ưu tiên input có placeholder "Số HĐ" hoặc name chứa "sohd"
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
  for (const el of inputs) {
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    const nm = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ttl = (el.title || '').toLowerCase();
    if (ph.includes('số hd') || ph.includes('so hd') || ph.includes('số hóa đơn') || ph.includes('so hoa don')
        || nm.includes('sohd') || id.includes('sohd') || ttl.includes('sohd')) {
      const v = (el.value || '').trim();
      if (v) return v;
    }
  }
  // nếu không tìm thấy, thử ô text lớn dưới "Mã SP"
  const maybe = document.querySelector('input[type="text"][maxlength], .sohd, #sohd');
  return (maybe && maybe.value || '').trim();
}

// 2) BẠN ĐIỀN TRUY VẤN Ở ĐÂY
// Trả về { hoadon: {...}, chitiet: [{masp, size, soluong, dongia?, km?}, ...] }
// Trả về { hoadon, chitiet } bằng cách tự suy luận bảng từ Số HĐ
async function queryInvoiceFromDB(sohd) {
  if (!window.supabase) throw new Error('Supabase client (window.supabase) chưa sẵn sàng');

  // 1) Tách tiền tố trước dấu "_" của số HĐ, ví dụ: "nhaptamcs1_00032" → "nhaptamcs1"
  const prefix = String(sohd).split('_')[0].toLowerCase().trim();

  // 2) Danh sách cặp bảng có thể có (header, detail) — sắp xếp theo độ ưu tiên
  const tablePairs = [
    // Ưu tiên theo tiền tố số HĐ
    [`${prefix}_hd`, `${prefix}_ct`],
    // Một số tên tổng quát có thể dùng
    ['hoadon_banle', 'ct_hoadon_banle'],
    ['hoadon_banle', 'ct_hoadon_banle'],
    // (tuỳ hệ thống bạn có thể thêm: ['hoadon', 'hoadonct'], ['banle_hd','banle_ct'], ... )
  ];

  // 3) Schema có thể dùng
  const schemas = ['public', 'banle']; // thêm schema khác của bạn nếu cần

  // 4) Helper: thử đọc 1 cặp bảng (theo schema) — bỏ qua nếu bảng không tồn tại (42P01)
  async function tryReadPair(schema, hdTable, ctTable) {
    try {
      const hdQ = window.supabase.schema(schema).from(hdTable).select('*').eq('sohd', sohd).limit(1);
      const { data: hd, error: e1 } = await hdQ.maybeSingle();
      if (e1) {
        // nếu lỗi "relation does not exist" thì ném cho caller xử lý thử cặp khác
        if (String(e1?.code) === '42P01') throw e1;
        // lỗi khác: coi như fail cặp này
        console.debug('[quaylai] lỗi đọc header', schema, hdTable, e1);
        return null;
      }
      if (!hd) return null;

      const { data: ct, error: e2 } = await window.supabase
        .schema(schema)
        .from(ctTable)
        .select('masp, size, soluong, dongia, khuyenmai')
        .eq('sohd', sohd);

      if (e2) {
        if (String(e2?.code) === '42P01') throw e2; // bảng chi tiết không tồn tại → để caller thử cặp khác
        console.debug('[quaylai] lỗi đọc chi tiết', schema, ctTable, e2);
        return null;
      }

      console.debug('[quaylai] dùng bảng', { schema, hdTable, ctTable });
      return { hoadon: hd, chitiet: ct || [] };
    } catch (err) {
      if (String(err?.code) === '42P01') {
        // bảng không tồn tại → thử cặp khác
        return null;
      }
      // lỗi khác → ném ra ngoài
      throw err;
    }
  }

  // 5) Vòng thử: duyệt theo schema → theo cặp bảng
  for (const schema of schemas) {
    for (const [hdTable, ctTable] of tablePairs) {
      const res = await tryReadPair(schema, hdTable, ctTable);
      if (res && Array.isArray(res.chitiet) && res.chitiet.length) return res;
    }
  }

  // Nếu vẫn không tìm được, báo lỗi kèm danh sách đã thử
  const tried = schemas.flatMap(s => tablePairs.map(([h,c]) => `${s}.${h}/${c}`)).join(', ');
  throw new Error('Không tìm thấy bảng chứa hóa đơn. Đã thử: ' + tried);
}


// 3) Ánh xạ từ {hoadon, chitiet[]} → object bangKetQua (1 mã = 1 dòng, có mảng sizes/soluongs)
function __mapInvoiceToBangKetQua(inv) {
  const out = {};
  const rows = Array.isArray(inv?.chitiet) ? inv.chitiet : [];

  const grouped = new Map(); // masp -> { masp, qty:{size:sl}, gia?, km? (theo tuỳ ý) }
  for (const r of rows) {
    const masp = String(r?.masp || r?.ma || '').trim().toUpperCase();
    if (!masp) continue;
    const size = Number.isFinite(parseInt(r?.size,10)) ? parseInt(r.size,10) : 0;
    const sl = parseInt(r?.soluong ?? r?.sl ?? 0, 10) || 0;
    if (!sl) continue;

    if (!grouped.has(masp)) grouped.set(masp, { masp, qty: {}, gia: r?.dongia || 0, km: r?.km ?? r?.khuyenmai ?? 0 });
    const g = grouped.get(masp);
    g.qty[size] = (g.qty[size] || 0) + sl;
    // có thể cập nhật đơn giá/khuyến mãi nếu dòng khác nhau – lấy theo dòng đầu
  }

  for (const [masp, g] of grouped.entries()) {
    const sizes = Object.keys(g.qty).map(s => String(parseInt(s,10))).filter(Boolean);
    const soluongs = sizes.map(s => g.qty[parseInt(s,10)] || 0);
    out[masp] = {
      masp,
      sizes,
      soluongs,
      gia: g.gia || 0,
      km: g.km || 0
    };
  }
  return out;
}

// 4) UI: hiển thị loading ngắn (tuỳ chọn)
function __showLoading(flag) {
  const id = '__quaylai_loading__';
  let el = document.getElementById(id);
  if (flag) {
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;right:20px;bottom:20px;padding:8px 12px;background:#222;color:#fff;border-radius:6px;z-index:99999;font-size:12px';
      el.textContent = 'Đang nạp hóa đơn...';
      document.body.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

// 5) Chạy luồng “Quay lại mới” hoàn chỉnh
async function openInvoiceFromDatabase() {
  const sohd = __getSoHDOnPage();
  if (!sohd) { alert('Vui lòng nhập Số HĐ trước khi bấm Quay lại.'); return; }

  __showLoading(true);
  try {
    const inv = await queryInvoiceFromDB(sohd);
    if (!inv || !Array.isArray(inv?.chitiet) || inv.chitiet.length === 0) {
      alert('Không tìm thấy chi tiết hóa đơn: ' + sohd);
      return;
    }

    const bang = __mapInvoiceToBangKetQua(inv);

    // Đổ vào lưới mới
    await (window.setMobileGridFromBangKetQua
      ? window.setMobileGridFromBangKetQua(bang)
      : window.setMobileGridFromHoaDon(inv.hoadon, inv.chitiet));

    // Cập nhật tổng/khuyến mãi nếu bạn muốn
    if (typeof window.capNhatThongTinTong === 'function') {
      window.capNhatThongTinTong();
    }

  } catch (err) {
    console.error('[Quay lại (DB)]', err);
    alert('Lỗi đọc dữ liệu hóa đơn từ CSDL.');
  } finally {
    __showLoading(false);
  }
}

// 6) Gắn nút “Quay lại” – chặn hẳn luồng cũ
(function attachBackButtonDBFlow() {
  const btn = document.getElementById('quaylai');
  if (!btn) return;

  // Gắn ở capture phase để chặn mọi handler cũ
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    await openInvoiceFromDatabase();
    return false;
  }, true);
})();

