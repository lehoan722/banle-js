// scripts/nhaptam_mobile_getbang.js
; (() => {
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
      const v = window.__spIndex__.get(masp) || window.__spIndex__.get(masp.replace(/\s+/g, '')) || null;
      if (v) return v;
    }
    const arr = window.dmhanghoa || window.dssp || window.dsSanPham;
    if (Array.isArray(arr)) {
      const likely = ['masp', 'MA', 'ma', 'ma_sp', 'mahang', 'ma_hang', 'mavattu', 'mavt', 'code', 'sku', 'mahh'];
      for (const rec of arr) for (const k of likely) {
        if (rec[k] != null && String(rec[k]).trim().toUpperCase() === masp) return rec;
      }
      for (const rec of arr) for (const [k, v] of Object.entries(rec)) {
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
      const dvt = sp.dvt || sp.donvitinh || sp.don_vi_tinh || '';
      const gia = Number(sp.gia ?? sp.giaban ?? sp.gianhap ?? sp.giamua ?? sp.giale ?? 0) || 0;

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
    const sls = Array.isArray(item?.soluongs) ? item.soluongs : [];
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
      try { window.MobileKQ.ensureVitriTonBatch(masps); } catch (_) { }
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
      const sizes = Object.keys(g.qty).map(s => String(parseInt(s, 10))).filter(Boolean);
      const soluongs = sizes.map(s => g.qty[parseInt(s, 10)] || 0);
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
            const hash = (() => { try { return JSON.stringify(__bkq_store).length + ''; } catch { return Date.now() + ''; } })();
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
  function _safeLen(o) { try { return Object.keys(o || {}).length; } catch { return 0; } }

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
// ĐỌC HÓA ĐƠN TỪ public.hoadon_banle + public.ct_hoadon_banle
// Trả về { hoadon, chitiet[] } – hoadon có thể null nếu không có header
// ĐỌC HÓA ĐƠN TỪ public.hoadon_banle + public.ct_hoadon_banle
// Chịu khác biệt hoa/thường & ký tự thừa trong sohd
async function queryInvoiceFromDB(sohdRaw) {
  if (!window.supabase) throw new Error('Supabase client (window.supabase) chưa sẵn sàng');

  const SCHEMA = 'public';
  const HD = 'hoadon_banle';
  const CT = 'ct_hoadon_banle';

  const sohd = String(sohdRaw || '').trim();
  const sohdU = sohd.toUpperCase();
  const sohdL = sohd.toLowerCase();

  // 1) Header (tùy – có cũng được, không có vẫn hydrate từ chi tiết)
  let hoadon = null;
  try {
    // thử eq 3 biến thể
    let q = window.supabase.schema(SCHEMA).from(HD).select('*').limit(1);
    let r = await q.eq('sohd', sohd).maybeSingle();
    if (r.data) hoadon = r.data;
    else {
      r = await window.supabase.schema(SCHEMA).from(HD).select('*').eq('sohd', sohdU).limit(1).maybeSingle();
      if (r.data) hoadon = r.data;
      else {
        r = await window.supabase.schema(SCHEMA).from(HD).select('*').eq('sohd', sohdL).limit(1).maybeSingle();
        if (r.data) hoadon = r.data;
        else {
          // last try: tìm gần giống để debug (không bắt buộc phải có)
          const like = await window.supabase.schema(SCHEMA).from(HD)
            .select('sohd, ngay, diadiem').ilike('sohd', `%${sohd}%`).limit(5);
          if (like.data && like.data.length) {
            console.debug('[quaylai][gợi ý header gần giống]', like.data);
          }
        }
      }
    }
  } catch (err) {
    // 406 hoặc RLS: bỏ qua, không critical
    console.debug('[quaylai] header err (bỏ qua)', err);
  }

  // 2) Chi tiết: bắt buộc có ít nhất 1 dòng
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
    // like cuối cùng để “vớt” trường hợp có ký tự lạ
    const { data: likeCt, error: eLike } = await window.supabase.schema(SCHEMA).from(CT)
      .select('sohd, masp, size, soluong, gia, km, dvt')
      .ilike('sohd', `%${sohd}%`)
      .limit(200);
    if (eLike) throw eLike;
    if (!likeCt || !likeCt.length) {
      // log một vài sohd để bạn đối chiếu trực tiếp
      const { data: peek } = await window.supabase.schema(SCHEMA).from(CT)
        .select('sohd').order('sohd', { ascending: false }).limit(10);
      console.debug('[quaylai] không thấy chi tiết; vài sohd gần đây:', peek || []);
      throw new Error('Không thấy chi tiết cho số HĐ: ' + sohd);
    }
    // lọc đúng hóa đơn mong muốn nếu mảng lớn
    const picked = likeCt.filter(r => {
      const s = String(r.sohd || '');
      return s === sohd || s === sohdU || s === sohdL || s.includes(sohd);
    });
    ct = picked.length ? picked : likeCt;
    console.debug('[quaylai] dùng ilike cho chi tiết, match dòng:', ct.length);
  }

  // Chuẩn hoá → trả về
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

// 3) Ánh xạ từ {hoadon, chitiet[]} → object bangKetQua (1 mã = 1 dòng, có mảng sizes/soluongs)
function __mapInvoiceToBangKetQua(inv) {
  const out = {};
  const rows = Array.isArray(inv?.chitiet) ? inv.chitiet : [];

  const grouped = new Map(); // masp -> { masp, qty:{size:sl}, gia?, km? (theo tuỳ ý) }
  for (const r of rows) {
    const masp = String(r?.masp || r?.ma || '').trim().toUpperCase();
    if (!masp) continue;
    const size = Number.isFinite(parseInt(r?.size, 10)) ? parseInt(r.size, 10) : 0;
    const sl = parseInt(r?.soluong ?? r?.sl ?? 0, 10) || 0;
    if (!sl) continue;

    if (!grouped.has(masp)) grouped.set(masp, { masp, qty: {}, gia: r?.dongia || 0, km: r?.km ?? r?.khuyenmai ?? 0 });
    const g = grouped.get(masp);
    g.qty[size] = (g.qty[size] || 0) + sl;
    // có thể cập nhật đơn giá/khuyến mãi nếu dòng khác nhau – lấy theo dòng đầu
  }

  for (const [masp, g] of grouped.entries()) {
    const sizes = Object.keys(g.qty).map(s => String(parseInt(s, 10))).filter(Boolean);
    const soluongs = sizes.map(s => g.qty[parseInt(s, 10)] || 0);
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
// 5) Chạy luồng “Quay lại mới” – tự lùi sang số HĐ có dữ liệu gần nhất
async function openInvoiceFromDatabase() {
  function parsePrev(sohd) {
    // dạng: prefix_number  (ví dụ: nhaptamcs1_00033)
    const m = String(sohd || '').trim().match(/^(.*?_)(\d+)$/);
    if (!m) return null;
    const prefix = m[1], numStr = m[2];
    const n = parseInt(numStr, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    const prev = (n - 1).toString().padStart(numStr.length, '0');
    return prefix + prev;
  }

  // lấy số HĐ từ trang
  const sohdInput = (() => {
    const cands = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
    for (const el of cands) {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      const nm = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      if (ph.includes('số hd') || ph.includes('so hd') || nm.includes('sohd') || id.includes('sohd')) return el;
    }
    return document.querySelector('#sohd') || null;
  })();
  const currSohd = (sohdInput?.value || '').trim();
  if (!currSohd) { alert('Vui lòng nhập Số HĐ.'); return; }

  // luôn bắt đầu từ số HĐ liền trước, rồi tiếp tục lùi
  const toTry = [];
  let p = parsePrev(currSohd);
  for (let i = 0; i < 50 && p; i++) {  // tăng biên tìm tối đa 50 số nếu muốn
    toTry.push(p);
    p = parsePrev(p);
  }


  // loading nho nhỏ
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
        // bỏ qua nếu “không thấy chi tiết”, thử tiếp số trước đó
        if (!/Không thấy chi tiết/.test(String(e?.message || ''))) {
          console.debug('[quaylai] lỗi khi thử', s, e);
        }
      }
    }

    if (!found) {
      alert('Không tìm thấy hóa đơn cũ nào có dữ liệu (đã thử lùi 20 số).');
      return;
    }

    // map → bangKetQua và đổ vào lưới MobileKQ
    const bang = __mapInvoiceToBangKetQua(found);
    await (window.setMobileGridFromBangKetQua
      ? window.setMobileGridFromBangKetQua(bang)
      : window.setMobileGridFromHoaDon(found.hoadon, found.chitiet));

    // cập nhật ô Số HĐ thành số tìm được
    if (sohdInput) sohdInput.value = foundSohd;

    // cập nhật tổng
    if (typeof window.capNhatThongTinTong === 'function') window.capNhatThongTinTong();
  } finally {
    showLoading(false);
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

