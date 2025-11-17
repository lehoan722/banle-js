// stockQuickPopup.js
// Phiên bản kết hợp:
// - Giao diện & cách bám card giống popup11 (PC: hover, mobile: click).
// - Dữ liệu: lấy từ xnt17_tonban_snapshot, hiển thị đủ size 0,38..45.
// - Thêm dòng "Vị trí: CS1..., CS2..." lấy từ bảng dmhanghoa (vitrikho1, vitrikho2).
// YÊU CẦU: supabase đã là biến global (từ supabaseClient.js hoặc supabaseClientGlobal.js).

(function () {
  if (typeof supabase === "undefined") {
    console.warn("stockQuickPopup: supabase global not found. Hãy chắc chắn đã load supabaseClient trước.");
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
    padding: 6px 8px 6px;
    font-size: 11px;
    line-height: 1.3;
    display: none;
    max-height: 230px;
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
    white-space: nowrap;
  }
  .sq-stock-popup th {
    background: #f3f4f6;
    font-weight: 600;
  }
  .sq-stock-popup td.num { text-align: right; }
  .sq-stock-popup tr.sum-row td {
    font-weight: 600;
    border-top: 1px solid #d1d5db;
    background: #f9fafb;
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
  .sq-vitri-row td {
    font-weight: 500;
    font-size: 10px;
    text-align: left;
    color: #b91c1c;
    border-bottom: none;
  }
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

  // ===== Gọi RPC xnt17_tonban_snapshot + lấy vị trí kho cho 1 mã =====
  async function fetchTonBanByMasp(maspRaw) {
    const masp = String(maspRaw || '').trim().toUpperCase();
    if (!masp) {
      return { masp: '', rows: [], vitri_cs1: '', vitri_cs2: '' };
    }

    const denNgay = getDenNgay();
    console.log('[StockQuickPopup] Gọi xnt17_tonban_snapshot', { masp, denNgay });

    let rows = [];
    let vitri_cs1 = '';
    let vitri_cs2 = '';

    // 1) Snapshot bán/tồn
    if (typeof supabase !== 'undefined') {
      const { data, error } = await supabase.rpc('xnt17_tonban_snapshot', {
        p_masps: [masp],
        p_den_ngay: denNgay,
        p_tonghop_size: false
      });

      if (error) {
        console.warn('xnt17_tonban_snapshot error:', error);
      } else if (data && data.length) {
        rows = data.map(r => ({
          masp: String(r.masp || '').toUpperCase(),
          size: normalizeSize(r.size),
          ton_cs1: Number(r.ton_cs1 || 0),
          ton_cs2: Number(r.ton_cs2 || 0),
          ban_cs1: Number(r.ban_cs1 || 0),
          ban_cs2: Number(r.ban_cs2 || 0)
        }));
      }
    }

    // 2) Vị trí kho từ dmhanghoa (vitrikho1/vitrikho2)
    try {
      if (typeof supabase !== 'undefined') {
        const { data: vitriData, error: vitriErr } = await supabase
          .from('dmhanghoa')
          .select('vitrikho1, vitrikho2')
          .eq('masp', masp);

        if (vitriErr) {
          console.warn('[StockQuickPopup] Lỗi đọc vị trí kho:', vitriErr);
        } else if (Array.isArray(vitriData) && vitriData.length > 0) {
          vitri_cs1 = vitriData[0].vitrikho1 || '';
          vitri_cs2 = vitriData[0].vitrikho2 || '';
        }
      }
    } catch (e) {
      console.warn('[StockQuickPopup] Exception đọc vị trí kho:', e);
    }

    console.log('[StockQuickPopup] Kết quả RPC', { masp, denNgay, rows, vitri_cs1, vitri_cs2 });
    return { masp, rows, vitri_cs1, vitri_cs2 };
  }

  // ===== Build HTML popup: full size 0,38..45 + dòng vị trí =====
  function buildTableHtml(masp, payload) {
    const upper = String(masp || '').toUpperCase();
    const rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
    const vitri_cs1 = payload && payload.vitri_cs1 ? payload.vitri_cs1 : '';
    const vitri_cs2 = payload && payload.vitri_cs2 ? payload.vitri_cs2 : '';

    const SIZE_ORDER = ['0', '38', '39', '40', '41', '42', '43', '44', '45'];

    // Map sizeLabel -> record
    const mapBySize = new Map();
    rows.forEach(r => {
      const lbl = displaySizeLabel(r.size);
      if (!lbl) return;
      mapBySize.set(lbl, r);
    });

    let sum1 = 0, sum2 = 0, sumBan1 = 0, sumBan2 = 0;

    const body = SIZE_ORDER.map(lbl => {
      const r = mapBySize.get(lbl);
      if (r) {
        sum1 += r.ton_cs1;
        sum2 += r.ton_cs2;
        sumBan1 += r.ban_cs1;
        sumBan2 += r.ban_cs2;
      }
      return `
        <tr>
          <td>${lbl}</td>
          <td class="num">${r && r.ton_cs1 ? r.ton_cs1 : ''}</td>
          <td class="num">${r && r.ton_cs2 ? r.ton_cs2 : ''}</td>
          <td class="num">${r && r.ban_cs1 ? r.ban_cs1 : ''}</td>
          <td class="num">${r && r.ban_cs2 ? r.ban_cs2 : ''}</td>
        </tr>`;
    }).join('');

    const hasAnyData = rows && rows.length > 0;

    const sumRow = hasAnyData ? `
      <tr class="sum-row">
        <td>${upper}</td>
        <td class="num">${sum1 || ''}</td>
        <td class="num">${sum2 || ''}</td>
        <td class="num">${sumBan1 || ''}</td>
        <td class="num">${sumBan2 || ''}</td>
      </tr>` : '';

    const vitriParts = [];
    if (vitri_cs1) vitriParts.push('CS1: ' + vitri_cs1);
    if (vitri_cs2) vitriParts.push('CS2: ' + vitri_cs2);
    const vitriRow = vitriParts.length ? `
      <tr class="sq-vitri-row">
        <td colspan="5">Vị trí: ${vitriParts.join(' , ')}</td>
      </tr>` : '';

    if (!hasAnyData && !vitriParts.length) {
      // Trường hợp hoàn toàn không có dữ liệu
      return `
        <div class="sq-stock-popup">
          <span class="sq-close">✕</span>
          <div class="sq-stock-popup-header">Mã: ${upper}</div>
          <div>Không có dữ liệu tồn kho.</div>
        </div>`;
    }

    return `
      <div class="sq-stock-popup">
        <span class="sq-close">✕</span>
        <div class="sq-stock-popup-header">
          Mã: ${upper} – ${hasAnyData ? 'bán/tồn đến ' + getDenNgay() : 'không có dữ liệu tồn kho'}
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
            ${body}
            ${sumRow}
            ${vitriRow}
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
      const payload = await fetchTonBanByMasp(masp);
      card.insertAdjacentHTML('beforeend', buildTableHtml(masp, payload));
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
      card.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
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

  // API dùng chung – giữ đúng tên như popup11
  window.StockQuick = {
    attach
  };
})();
