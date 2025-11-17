// stockQuickPopup.js
// Module dùng chung: popup bán/tồn theo mã SP – lấy dữ liệu từ xnt17_tonban_snapshot
// LƯU Ý: supabase được tạo global trong supabaseClient.js

(function () {
  if (typeof supabase === "undefined") {
    console.warn("stockQuickPopup: supabase global not found. Hãy chắc chắn đã load supabaseClient.js trước.");
  }

  // ===== CSS cho popup trên từng card ảnh =====
  const css = `
  .card {
    position: relative; /* để popup bám theo card */
  }
  .sq-stock-popup {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 6px;
    background: rgba(255,255,255,0.97);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.25);
    border: 1px solid #e5e7eb;
    padding: 6px 8px;
    font-size: 11px;
    line-height: 1.3;
    display: none;
    max-height: 220px;
    overflow: auto;
    z-index: 5;
  }
  .sq-stock-popup.show { display: block; }
  .sq-stock-popup table {
    width: 100%;
    border-collapse: collapse;
  }
  .sq-stock-popup th,
  .sq-stock-popup td {
    padding: 2px 4px;
    text-align: center;
    border-bottom: 1px solid #e5e7eb;
  }
  .sq-stock-popup th {
    background: #f3f4f6;
    font-weight: 600;
  }
  .sq-stock-popup td.num { text-align: right; }
  .sq-stock-popup tr.sum-row td {
    font-weight: 600;
    border-top: 1px solid #d1d5db;
  }
  .sq-stock-popup-header {
    font-weight: 600;
    margin-bottom: 4px;
    text-align: left;
  }
  .sq-close {
    position:absolute;
    top:2px;
    right:4px;
    font-size:13px;
    cursor:pointer;
    opacity:.6;
  }
  .sq-close:hover { opacity:1; }
  `;

  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  // ===== Helpers =====
  function normalizeSize(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return '';
    if (/^\d+$/.test(s)) return 'size ' + s;
    if (s.startsWith('size ')) return s;
    return 'size ' + s.replace(/^size\s*/, '').trim();
  }

  function displaySizeLabel(size) {
    const s = String(size || '').toLowerCase();
    const m = s.match(/(\d{1,2})/);
    return m ? m[1] : size;
  }

  function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  // Lấy den_ngay từ filter XNT14 nếu có, không thì dùng hôm nay
  function getDenNgay() {
    try {
      const raw = sessionStorage.getItem('XNT14_FILTERS');
      if (raw) {
        const f = JSON.parse(raw);
        if (f.den_ngay) return f.den_ngay;
      }
    } catch (e) { }
    return new Date().toISOString().slice(0, 10);
  }

  // ===== Gọi RPC xnt17_tonban_snapshot cho 1 mã =====
  // ===== Gọi RPC xnt17_tonban_snapshot cho 1 mã =====
  async function fetchTonBanByMasp(maspRaw) {
    // Chuẩn hoá mã sản phẩm giống bên XNT17
    const masp = String(maspRaw || '').trim().toUpperCase();
    if (!masp) return [];

    const denNgay = getDenNgay();
    console.log('[StockQuickPopup] Gọi xnt17_tonban_snapshot', { masp, denNgay });

    const { data, error } = await supabase.rpc('xnt17_tonban_snapshot', {
      p_masps: [masp],
      p_den_ngay: denNgay,
      p_tonghop_size: false
    });

    console.log('[StockQuickPopup] Kết quả RPC', { masp, denNgay, data, error });

    if (error) {
      console.warn('xnt17_tonban_snapshot error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // map giống bên baocaoxnt17_chuyenkho.js
    const rows = data.map(r => ({
      masp: String(r.masp || '').toUpperCase(),
      size: normalizeSize(r.size),
      ton_cs1: Number(r.ton_cs1 || 0),
      ton_cs2: Number(r.ton_cs2 || 0),
      ban_cs1: Number(r.ban_cs1 || 0),
      ban_cs2: Number(r.ban_cs2 || 0)
    }));

    // 👉 TRẢ VỀ MẢNG rows THUẦN
    return rows;
  }

  function buildTableHtml(masp, rows) {
    if (!rows.length) {
      return `
        <div class="sq-stock-popup">
          <span class="sq-close">✕</span>
          <div class="sq-stock-popup-header">Mã: ${masp}</div>
          <div>Không có dữ liệu tồn kho.</div>
        </div>`;
    }

    const upper = String(masp || '').toUpperCase();

    // gom thêm dòng Tổng
    let sum1 = 0, sum2 = 0, sumBan1 = 0, sumBan2 = 0;

    const body = rows.map(r => {
      const sizeLabel = displaySizeLabel(r.size);
      sum1 += r.ton_cs1;
      sum2 += r.ton_cs2;
      sumBan1 += r.ban_cs1;
      sumBan2 += r.ban_cs2;

      return `
        <tr>
          <td>${sizeLabel}</td>
          <td class="num">${r.ton_cs1 || ''}</td>
          <td class="num">${r.ton_cs2 || ''}</td>
          <td class="num">${r.ban_cs1 || ''}</td>
          <td class="num">${r.ban_cs2 || ''}</td>
        </tr>`;
    }).join('');

    const sumRow = `
      <tr class="sum-row">
        <td>${upper}</td>
        <td class="num">${sum1 || ''}</td>
        <td class="num">${sum2 || ''}</td>
        <td class="num">${sumBan1 || ''}</td>
        <td class="num">${sumBan2 || ''}</td>
      </tr>`;

    return `
      <div class="sq-stock-popup">
        <span class="sq-close">✕</span>
        <div class="sq-stock-popup-header">Mã: ${upper} – bán/tồn đến ${getDenNgay()}</div>
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
            ${body}
            ${sumRow}
          </tbody>
        </table>
      </div>`;
  }

  function hideAllPopups() {
    document.querySelectorAll('.sq-stock-popup.show').forEach(p => {
      p.classList.remove('show');
    });
  }

  async function ensurePopup(card, masp) {
    if (!card) return;
    let popup = card.querySelector('.sq-stock-popup');
    if (!popup) {
      // lần đầu: fetch dữ liệu rồi dựng popup
      const rows = await fetchTonBanByMasp(masp);
      card.insertAdjacentHTML('beforeend', buildTableHtml(masp, rows));
      popup = card.querySelector('.sq-stock-popup');
      const closeBtn = popup.querySelector('.sq-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.classList.remove('show');
        });
      }
    }
    hideAllPopups();
    popup.classList.add('show');
  }

  function attach(card, masp) {
    if (!card || !masp) return;
    const touch = isTouchDevice();

    if (touch) {
      // Điện thoại / tablet: chạm để mở, chạm lại để đóng
      card.addEventListener('click', async () => {
        const popup = card.querySelector('.sq-stock-popup');
        const isOpen = popup && popup.classList.contains('show');
        if (isOpen) {
          popup.classList.remove('show');
        } else {
          await ensurePopup(card, masp);
        }
      });
    } else {
      // PC: hover để xem, rời chuột để ẩn
      card.addEventListener('mouseenter', () => {
        ensurePopup(card, masp);
      });
      card.addEventListener('mouseleave', () => {
        const popup = card.querySelector('.sq-stock-popup');
        if (popup) popup.classList.remove('show');
      });
    }
  }

  // API dùng chung
  window.StockQuick = {
    attach
  };
})();
