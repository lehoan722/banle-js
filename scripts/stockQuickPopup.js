// StockQuickPopup: popup xem bán/tồn nhanh theo mã + size
// Dùng chung cho nhiều trang (xem ảnh XNT14, gợi ý nhập bù, v.v.)
// Yêu cầu: trên trang đã load supabaseClientGlobal.js (tạo biến global `supabase`)

(function () {
  const STYLE_ID = 'stock-quick-popup-style';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
    .sq-stock-popup {
      position: fixed;
      left: 50%;
      bottom: 10px;
      transform: translateX(-50%);
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.25);
      z-index: 99999;
      padding: 8px 10px 10px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-width: 360px;
      max-width: 420px;
    }
    .sq-stock-popup .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }
    .sq-stock-popup .header span {
      margin-right: 16px;
    }
    .sq-close-btn {
      border: none;
      background: transparent;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 0 4px;
      color: #6b7280;
    }
    .sq-close-btn:hover {
      color: #111827;
    }
    .sq-stock-popup table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .sq-stock-popup th,
    .sq-stock-popup td {
      border-bottom: 1px solid #e5e7eb;
      padding: 3px 4px;
      text-align: right;
      white-space: nowrap;
    }
    .sq-stock-popup th:first-child,
    .sq-stock-popup td:first-child {
      text-align: left;
    }
    .sq-stock-popup thead th {
      background: #f3f4f6;
      font-weight: 600;
      border-bottom: 1px solid #d1d5db;
    }
    .sq-stock-popup tbody tr:last-child td {
      border-bottom: none;
    }
    .sq-stock-popup .sum-row td {
      font-weight: 600;
      background: #f9fafb;
    }
    .sq-stock-popup tr.vitri-row td {
      font-weight: 500;
      font-size: 11px;
      text-align: left;
      color: #b91c1c;
      border-bottom: none;
    }
    @media (max-width: 768px) {
      .sq-stock-popup {
        left: 8px;
        right: 8px;
        transform: none;
        bottom: 8px;
        min-width: auto;
        max-width: none;
      }
    }`;
    document.head.appendChild(style);
  }

  function getDenNgay() {
    const input = document.getElementById('denNgay');
    if (!input || !input.value) {
      return new Date().toISOString().slice(0, 10);
    }
    return input.value;
  }

  // chuẩn hóa size từ RPC
  function normalizeSize(sizeRaw) {
    if (sizeRaw === null || sizeRaw === undefined || sizeRaw === '') return '';
    const s = String(sizeRaw).trim();
    if (/^\d+$/.test(s)) {
      return 'size ' + s;
    }
    if (/^size\s*\d+$/i.test(s)) return s.toLowerCase();
    return s.toLowerCase();
  }

  function displaySizeLabel(sizeNorm) {
    if (!sizeNorm) return '';
    const m = /(\d+)$/.exec(sizeNorm);
    return m ? m[1] : sizeNorm;
  }

  // Lấy snapshot tồn + bán theo 1 mã SP
  async function fetchTonBanByMasp(maspRaw) {
    const masp = String(maspRaw || '').toUpperCase();

    if (typeof supabase === 'undefined') {
      console.warn('stockQuickPopup: supabase global not found. Hãy chắc chắn đã load supabaseClientGlobal.js trước.');
      return { masp, rows: [], vitri_cs1: '', vitri_cs2: '' };
    }

    const denNgay = getDenNgay();
    console.log('[StockQuickPopup] Gọi xnt17_tonban_snapshot', { masp, denNgay });

    const { data, error } = await supabase.rpc('xnt17_tonban_snapshot', {
      p_masps: [masp],
      p_den_ngay: denNgay,
      p_tonghop_size: false
    });

    if (error) {
      console.warn('xnt17_tonban_snapshot error:', error);
      return { masp, rows: [], vitri_cs1: '', vitri_cs2: '' };
    }

    const rows = (data || []).map(r => ({
      masp: String(r.masp || '').toUpperCase(),
      size: normalizeSize(r.size),
      ton_cs1: Number(r.ton_cs1 || 0),
      ton_cs2: Number(r.ton_cs2 || 0),
      ban_cs1: Number(r.ban_cs1 || 0),
      ban_cs2: Number(r.ban_cs2 || 0)
    }));

    // Lấy vị trí kho từ dmhanghoa (vitrikho1/vitrikho2)
    let vitri_cs1 = '';
    let vitri_cs2 = '';
    try {
      const { data: vitriData, error: vitriErr } = await supabase
        .from('dmhanghoa')
        .select('vitri_cs1:vitrikho1, vitri_cs2:vitrikho2')
        .eq('masp', masp);

      if (vitriErr) {
        console.warn('[StockQuickPopup] Lỗi đọc vị trí kho:', vitriErr);
      } else if (Array.isArray(vitriData) && vitriData.length > 0) {
        vitri_cs1 = vitriData[0].vitri_cs1 || '';
        vitri_cs2 = vitriData[0].vitri_cs2 || '';
      }
    } catch (e) {
      console.warn('[StockQuickPopup] Exception đọc vị trí kho:', e);
    }

    console.log('[StockQuickPopup] Kết quả RPC', { masp, denNgay, rows, vitri_cs1, vitri_cs2 });

    return { masp, rows, vitri_cs1, vitri_cs2 };
  }

  // Build HTML popup từ dữ liệu snapshot
  function buildTableHtml(masp, payload) {
    const rows = (payload && Array.isArray(payload.rows)) ? payload.rows : (Array.isArray(payload) ? payload : []);
    const vitri_cs1 = payload && payload.vitri_cs1 ? payload.vitri_cs1 : '';
    const vitri_cs2 = payload && payload.vitri_cs2 ? payload.vitri_cs2 : '';

    const SIZE_ORDER = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];

    // Map size -> record
    const mapBySize = new Map();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const lbl = displaySizeLabel(r.size);
        if (!lbl) continue;
        mapBySize.set(lbl, r);
      }
    }

    let sumTon1 = 0, sumTon2 = 0, sumBan1 = 0, sumBan2 = 0;

    const bodyRows = SIZE_ORDER.map(lbl => {
      const r = mapBySize.get(lbl);
      if (r) {
        sumTon1 += r.ton_cs1;
        sumTon2 += r.ton_cs2;
        sumBan1 += r.ban_cs1;
        sumBan2 += r.ban_cs2;
      }
      return `
        <tr>
          <td>${lbl}</td>
          <td>${r && r.ton_cs1 ? r.ton_cs1 : ''}</td>
          <td>${r && r.ton_cs2 ? r.ton_cs2 : ''}</td>
          <td>${r && r.ban_cs1 ? r.ban_cs1 : ''}</td>
          <td>${r && r.ban_cs2 ? r.ban_cs2 : ''}</td>
        </tr>`;
    }).join('');

    const sumRowHtml = `
      <tr class="sum-row">
        <td>${masp}</td>
        <td>${sumTon1 || ''}</td>
        <td>${sumTon2 || ''}</td>
        <td>${sumBan1 || ''}</td>
        <td>${sumBan2 || ''}</td>
      </tr>`;

    const vitriParts = [];
    if (vitri_cs1) vitriParts.push('CS1: ' + vitri_cs1);
    if (vitri_cs2) vitriParts.push('CS2: ' + vitri_cs2);
    const vitriRowHtml = vitriParts.length
      ? `<tr class="vitri-row"><td colspan="5">Vị trí: ${vitriParts.join(' , ')}</td></tr>`
      : '';

    // Nếu hoàn toàn không có dòng nào (không phát sinh), vẫn hiển thị bảng size + dòng vị trí
    const hasAnyData = rows && rows.length > 0;
    const titleSuffix = hasAnyData ? 'bán/tồn đến ' + getDenNgay() : 'không có dữ liệu tồn kho';

    return `
      <div class="sq-stock-popup">
        <div class="header">
          <span>Mã: ${masp} – ${titleSuffix}</span>
          <button class="sq-close-btn" type="button">×</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Size</th>
              <th>CS1</th>
              <th>CS2</th>
              <th>Bán CS1</th>
              <th>Bán CS2</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            ${hasAnyData ? sumRowHtml : ''}
            ${vitriRowHtml}
          </tbody>
        </table>
      </div>`;
  }

  // Tạo / update popup
  async function ensurePopup(masp) {
    injectStyles();

    let card = document.querySelector('.sq-stock-popup');
    if (card && card.parentNode) {
      card.parentNode.removeChild(card);
    }

    card = document.createElement('div');
    document.body.appendChild(card);

    card.innerHTML = `
      <div class="sq-stock-popup">
        <div class="header">
          <span>Đang tải dữ liệu cho mã: ${masp}...</span>
          <button class="sq-close-btn" type="button">×</button>
        </div>
      </div>`;

    const closeBtn = card.querySelector('.sq-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        card.parentNode.removeChild(card);
      });
    }

    try {
      const payload = await fetchTonBanByMasp(masp);
      card.innerHTML = buildTableHtml(masp, payload);
      const closeBtn2 = card.querySelector('.sq-close-btn');
      if (closeBtn2) {
        closeBtn2.addEventListener('click', () => {
          card.parentNode.removeChild(card);
        });
      }
    } catch (e) {
      console.error('ensurePopup error:', e);
      card.innerHTML = `
        <div class="sq-stock-popup">
          <div class="header">
            <span>Lỗi khi tải dữ liệu tồn kho.</span>
            <button class="sq-close-btn" type="button">×</button>
          </div>
          <div style="font-size:12px;color:#b91c1c;">${e.message || e}</div>
        </div>`;
      const closeBtn3 = card.querySelector('.sq-close-btn');
      if (closeBtn3) {
        closeBtn3.addEventListener('click', () => {
          card.parentNode.removeChild(card);
        });
      }
    }
  }

  // Gắn vào ảnh sản phẩm (class .product-card hoặc div chứa ảnh)
  function attachEventsForContainer(container) {
    if (!container) return;

    const selector = '.product-card, .xnt14-card, .anh-san-pham, .card';
    const cards = container.querySelectorAll(selector);

    cards.forEach(card => {
      if (card.dataset.sqBound === '1') return;
      card.dataset.sqBound = '1';

      const masp =
        card.dataset.masp ||
        card.getAttribute('data-masp') ||
        (card.querySelector('[data-masp]') && card.querySelector('[data-masp]').dataset.masp) ||
        (card.querySelector('.masp') && card.querySelector('.masp').textContent.trim().split(' ')[0]);

      if (!masp) return;

      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ensurePopup(masp);
      };

      card.addEventListener('click', handler);
      card.addEventListener('touchend', handler);
    });
  }

   // API mới dùng chung
  window.StockQuickPopup = {
    // Gắn sự kiện cho toàn bộ container (dùng selector .card, .product-card, ...)
    attachTo(container) {
      attachEventsForContainer(container || document);
    },
    // Mở popup trực tiếp cho 1 mã
    openFor(masp) {
      ensurePopup(masp);
    }
  };

  // API cũ để tương thích với các trang đang dùng window.StockQuick.attach(card, masp)
  window.StockQuick = {
    attach(card, masp) {
      if (!card || !masp) return;
      // gắn masp vào data-masp để attachEventsForContainer đọc được
      card.dataset.masp = masp;
      attachEventsForContainer(card);
    }
  };

  // Tự động gắn cho tất cả card khi DOM load xong (phòng khi trang không dùng StockQuick.attach)
  document.addEventListener('DOMContentLoaded', () => {
    attachEventsForContainer(document);
  });
})();
