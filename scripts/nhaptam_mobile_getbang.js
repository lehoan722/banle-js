// scripts/nhaptam_mobile_getbang.js
;(() => {
  'use strict';

  /**
   * ==========================================================
   *  A) ADAPTER CHIỀU THUẬN: MobileKQ → window.bangKetQua
   *     (giữ nguyên API getBangKetQua() bạn đang dùng)
   * ==========================================================
   */

  /**
   * Lấy nhanh thông tin SP từ cache hiện có (KHÔNG gọi DB).
   * Ưu tiên:
   *  - sanPhamData (object map)
   *  - __spIndex__ (Map được build khi store là mảng)
   *  - quét mảng dmhanghoa/dssp nếu có
   */
  function getSPFast(code) {
    const masp = String(code || '').trim().toUpperCase();
    if (!masp) return null;

    // 1) Map chuẩn
    if (window.sanPhamData && typeof window.sanPhamData === 'object') {
      const m = window.sanPhamData;
      const k = m[masp] || m[masp.replace(/\s+/g, '')] || m[code] || null;
      if (k) return k;
    }

    // 2) Index đã build sẵn (khi store là mảng)
    if (window.__spIndex__ instanceof Map) {
      const v = window.__spIndex__.get(masp) || window.__spIndex__.get(masp.replace(/\s+/g,'')) || null;
      if (v) return v;
    }

    // 3) Quét mảng nếu có (chi phí thấp vì chỉ dùng khi cần)
    const arr = window.dmhanghoa || window.dssp || window.dsSanPham;
    if (Array.isArray(arr)) {
      // thử các tên cột hay gặp trước
      const likely = ['masp','MA','ma','ma_sp','mahang','ma_hang','mavattu','mavt','code','sku','mahh'];
      for (const rec of arr) {
        for (const k of likely) {
          if (rec[k] != null && String(rec[k]).trim().toUpperCase() === masp) return rec;
        }
      }
      // cuối cùng: quét mọi thuộc tính chuỗi ngắn
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

  /**
   * Đọc dữ liệu từ lưới MobileKQ → chuẩn hoá về window.bangKetQua
   * Chỉ đưa những size có SL > 0.
   */
  function fromMobileGrid() {
    if (!window.MobileKQ || typeof window.MobileKQ.getAll !== 'function') return {};
    const all = window.MobileKQ.getAll();      // [{masp, qty:{}, vitri,t1,t2, qls}, ...]
    const kq = {};

    all.forEach(r => {
      const sizes = [];
      const soluongs = [];
      for (const k of Object.keys(r.qty||{})) {
        const sz = parseInt(k, 10);
        const sl = parseInt(r.qty[k] || 0, 10) || 0;
        if (sl > 0) { sizes.push(String(sz)); soluongs.push(sl); }
      }
      if (sizes.length === 0) return; // bỏ dòng trống

      // thông tin SP (tên/DVT/giá) từ cache sẵn có
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

    // Đồng bộ cho luồng cũ
    // MỚI: đặt cờ để setter không tự kích lại
window.__bkq_assigning_from_mobile = true;
window.bangKetQua = kq;
window.__bkq_assigning_from_mobile = false;

    return kq;
  }

  // API công khai để các module khác gọi (GIỮ NGUYÊN)
  Object.defineProperty(window, 'getBangKetQua', {
    value: () => fromMobileGrid(),
    writable: false,
    configurable: false
  });

  // Cho phép gọi trực tiếp nếu cần debug
  window._fromMobileGrid = fromMobileGrid;


  /**
   * ==========================================================
   *  B) ADAPTER CHIỀU NGƯỢC: dữ liệu cũ/HĐ cũ → MobileKQ
   *     (mới thêm, để nút "Quay lại" đổ đúng vào lưới)
   * ==========================================================
   */

  // Chuẩn hoá 1 item bangKetQua → { masp, qty:{0..45}, vitri,t1,t2 }
  function _bkqItemToRow(item) {
    const masp = String(item?.masp || '').trim().toUpperCase();
    const row = { masp, qty: {}, vitri: item?.vitri || '', t1: item?.toncs1 || 0, t2: item?.toncs2 || 0 };

    // Ưu tiên cặp sizes/soluongs
    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
    const sls   = Array.isArray(item?.soluongs) ? item.soluongs : [];

    if (sizes.length && sizes.length === sls.length) {
      sizes.forEach((s, i) => {
        const sz = parseInt(s, 10);
        const sl = parseInt(sls[i] || 0, 10) || 0;
        if (!Number.isNaN(sz) && sl > 0) row.qty[sz] = sl;
      });
    } else {
      // Fallback: nếu chỉ có "soluong" tổng, đổ về size 0
      const sl = parseInt(item?.soluong ?? item?.sl ?? 0, 10) || 0;
      if (sl > 0) row.qty[0] = sl;
    }
    return row;
  }

  // Xoá dữ liệu hiện có trong lưới (tuỳ API MobileKQ)
  function _clearMobileGrid() {
    if (window.MobileKQ?.clear) return window.MobileKQ.clear();
    // fallback: bấm "Thêm mới" → reset rows, rồi dọn tbody
    const btnThem = document.getElementById('them');
    if (btnThem) btnThem.click();
    const tbl = document.querySelector('#bangketqua tbody');
    if (tbl) tbl.innerHTML = '';
  }

  /**
   * (B1) Đổ từ bangKetQua (object hoặc array item) → MobileKQ
   */
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
      // có thể set thêm vitri/tồn nếu muốn show ngay
      if (row.vitri) {
        const r = window.MobileKQ.find?.(row.masp);
        if (r) { r.vitri = row.vitri; r.t1 = row.t1 || 0; r.t2 = row.t2 || 0; }
      }
    }

    // render + nạp vị trí/tồn như lúc nhập mới
    window.MobileKQ.render?.();

    if (typeof window.MobileKQ.ensureVitriTonBatch === 'function') {
      const masps = entries.map(x => (x?.masp || '').toUpperCase()).filter(Boolean);
      // không cần await: có thể chạy nền
      window.MobileKQ.ensureVitriTonBatch(masps);
    }

    // Đồng bộ lại cho các nút Lưu/In (dùng chung bangKetQua)
    window.getBangKetQua?.();
    window.capNhatThongTinTong?.();
  }

  /**
   * (B2) Đổ từ chi tiết hoá đơn → MobileKQ
   * hoadon: header (không bắt buộc), chitiet: array các dòng {masp, size/kichco, soluong}
   */
  async function setMobileGridFromHoaDon(hoadon, chitiet) {
    if (!Array.isArray(chitiet)) return setMobileGridFromBangKetQua({});

    // Gom theo masp → qty theo size
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

    // chuyển sang format bangKetQua rồi dùng (B1)
    const bang = {};
    for (const [masp, g] of grouped.entries()) {
      const sizes = Object.keys(g.qty).map(s => String(parseInt(s,10))).filter(Boolean);
      const soluongs = sizes.map(s => g.qty[parseInt(s,10)] || 0);
      bang[masp] = { masp, sizes, soluongs };
    }
    await setMobileGridFromBangKetQua(bang);
  }

  // Bridge: khi luồng cũ gán window.bangKetQua → tự hydrate sang MobileKQ
if (!window.__bkq_defined__) {
  let __bkq_store = {};
  Object.defineProperty(window, 'bangKetQua', {
    configurable: true,
    get() { return __bkq_store; },
    set(v) {
      __bkq_store = v || {};
      // Nếu dữ liệu đến từ luồng cũ (không phải fromMobileGrid)
      if (!window.__bkq_assigning_from_mobile
          && v && typeof window.setMobileGridFromBangKetQua === 'function') {
        // Đợi 1 nhịp cho code cũ render xong rồi mình "ghi đè" lưới mới
        setTimeout(() => {
          try {
            window.setMobileGridFromBangKetQua(__bkq_store);
            // Đồng bộ lại tổng số
            window.capNhatThongTinTong?.();
          } catch (e) {
            console.error('[BKQ setter] hydrate lỗi:', e);
          }
        }, 0);
      }
    }
  });
  window.__bkq_defined__ = true;
}

  // Expose API chiều ngược
  Object.defineProperty(window, 'setMobileGridFromBangKetQua', {
    value: setMobileGridFromBangKetQua, writable: false, configurable: false
  });
  Object.defineProperty(window, 'setMobileGridFromHoaDon', {
    value: setMobileGridFromHoaDon, writable: false, configurable: false
  });

  /**
   * (B3) Bridge "Quay lại" — 1 hàm nhận nhiều dạng payload
   *  - payload = { bangKetQua: {...} }    → dùng thẳng
   *  - payload = { hoadon, chitiet: [] }  → gom & đổ
   *  - payload = {...} (object bangKetQua) → dùng thẳng
   */
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

  // Tuỳ chọn: hỗ trợ event để luồng cũ chỉ việc dispatch
  window.addEventListener('hydrate-mobile-from-bangketqua', e => {
    const bang = e?.detail?.bang || e?.detail;
    setMobileGridFromBangKetQua(bang);
  });
  window.addEventListener('hydrate-mobile-from-hoadon', e => {
    const hoadon = e?.detail?.hoadon, chitiet = e?.detail?.chitiet || e?.detail;
    setMobileGridFromHoaDon(hoadon, chitiet);
  });

})();
