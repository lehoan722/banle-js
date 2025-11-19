// stockQuickPopup.js
// Module dùng chung: popup bán/tồn theo mã SP – lấy dữ liệu từ xnt17_tonban_snapshot
// LƯU Ý: supabase được tạo global trong supabaseClient.js hoặc supabaseClientGlobal.js

(function () {
  if (typeof supabase === "undefined") {
    console.warn("stockQuickPopup: supabase global not found. Hãy chắc chắn đã load supabaseClient trước.");
  }

  // ===== CSS cho popup trên từng card ảnh =====
    const css = `
  .card {
    /* không cần gì đặc biệt nữa, chỉ đánh dấu dòng có popup */
  }

  .sq-stock-popup {
    position: fixed;
    min-width: 260px;              /* rộng hơn chút */
    max-width: 520px;              /* cho font 20 không bị tràn */
    max-height: 480px;             /* cao hơn để chứa cả bảng + ảnh */
    background: rgba(255,255,255,0.98);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    border: 1px solid #e5e7eb;
    padding: 8px 10px;
    font-size: 20px;               /* cỡ chữ bạn muốn */
    line-height: 1.35;
    z-index: 9999;
    display: none;
  }

  .sq-stock-popup.show {
    display: block;
  }

  .sq-stock-popup table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;           /* chia đều cột theo chiều rộng */
  }
  .sq-stock-popup th,
  .sq-stock-popup td {
    padding: 4px 6px;              /* ô cao hơn theo font 20 */
    text-align: center;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;           /* số không bị xuống dòng */
  }
  .sq-stock-popup th {
    background: #f3f4f6;
    font-weight: 600;
  }
  .sq-stock-popup td.num {
    text-align: right;
  }
  .sq-stock-popup tr.sum-row td {
    font-weight: 600;
    border-top: 1px solid #d1d5db;
    background: #f9fafb;
    cursor: pointer;
    text-decoration: underline;
  }
  .sq-stock-popup-header {
    font-weight: 600;
    margin-bottom: 4px;
    text-align: left;
    cursor: move;                  /* kéo popup */
    user-select: none;
    text-decoration: underline;    /* gợi ý click để xem ảnh */
  }

  .sq-close {
    position:absolute;
    top:2px;
    right:4px;
    font-size:20px;
    cursor:pointer;
    opacity:.6;
  }
  .sq-close:hover { opacity:1; }

  .sq-vitri-row td {
    font-weight: 500;
    font-size: 16px;               /* thông tin vị trí nhỏ hơn 1 chút cho gọn */
    text-align: left;
    color: #b91c1c;
    border-bottom: none;
  }

  .sq-img-wrapper {
    margin-top: 4px;
  }
  .sq-img-wrapper img {
    width: 100%;
    height: auto;
    max-height: none;
    object-fit: contain;
    display: block;
  }
  `;


  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  const IMG_BASE =
    'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham/';

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
    // Chuẩn hoá mã sản phẩm giống bên XNT17
    const masp = String(maspRaw || '').trim().toUpperCase();
    if (!masp) {
      return { masp: '', rows: [], vitri_cs1: '', vitri_cs2: '' };
    }

    const denNgay = getDenNgay();
    console.log('[StockQuickPopup] Gọi xnt17_tonban_snapshot', { masp, denNgay });

    let rows = [];
    let vitri_cs1 = '';
    let vitri_cs2 = '';

    if (typeof supabase !== 'undefined') {
      // 1) Snapshot bán/tồn
      const { data, error } = await supabase.rpc('xnt17_tonban_snapshot', {
        p_masps: [masp],
        p_den_ngay: denNgay,
        p_tonghop_size: false
      });

      console.log('[StockQuickPopup] Kết quả RPC', { masp, denNgay, data, error });

      if (!error && data && data.length) {
        rows = data.map(r => ({
          masp: String(r.masp || '').toUpperCase(),
          size: normalizeSize(r.size),
          ton_cs1: Number(r.ton_cs1 || 0),
          ton_cs2: Number(r.ton_cs2 || 0),
          ban_cs1: Number(r.ban_cs1 || 0),
          ban_cs2: Number(r.ban_cs2 || 0)
        }));
      } else if (error) {
        console.warn('xnt17_tonban_snapshot error:', error);
      }

      // 2) Lấy vị trí kho từ dmhanghoa (vitrikho1/vitrikho2)
      try {
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
      } catch (e) {
        console.warn('[StockQuickPopup] Exception đọc vị trí kho:', e);
      }
    }

    return { masp, rows, vitri_cs1, vitri_cs2 };
  }

  // build popup: GIỮ NGUYÊN CÁCH LÀM CỦA POPUP 11
  // (chỉ hiện những size có dữ liệu) + THÊM dòng "Vị trí kho" ở dưới cùng
  function buildTableHtml(masp, payload) {
    const upper = String(masp || '').toUpperCase();
    const rows = (payload && Array.isArray(payload.rows)) ? payload.rows
      : (Array.isArray(payload) ? payload : []);
    const vitri_cs1 = payload && payload.vitri_cs1 ? payload.vitri_cs1 : '';
    const vitri_cs2 = payload && payload.vitri_cs2 ? payload.vitri_cs2 : '';

    // Nếu không có bán/tồn và cũng không có vị trí → như cũ
    if (!rows.length && !vitri_cs1 && !vitri_cs2) {
      return `
        <div class="sq-stock-popup">
          <span class="sq-close">✕</span>
          <div class="sq-stock-popup-header">Mã: ${upper}</div>
          <div>Không có dữ liệu tồn kho.</div>
        </div>`;
    }

    // GOM THÊM DÒNG TỔNG – giữ đúng cách tính cũ
    let sum1 = 0, sum2 = 0, sumBan1 = 0, sumBan2 = 0;

    const body = (rows || []).map(r => {
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

    const sumRow = rows.length ? `
      <tr class="sum-row">
        <td>${upper}</td>
        <td class="num">${sum1 || ''}</td>
        <td class="num">${sum2 || ''}</td>
        <td class="num">${sumBan1 || ''}</td>
        <td class="num">${sumBan2 || ''}</td>
      </tr>` : '';

    // DÒNG VỊ TRÍ KHO THÊM MỚI
    const vitriParts = [];
    if (vitri_cs1) vitriParts.push('CS1: ' + vitri_cs1);
    if (vitri_cs2) vitriParts.push('CS2: ' + vitri_cs2);

    const vitriRow = vitriParts.length ? `
      <tr class="sq-vitri-row">
        <td colspan="5">Vị trí: ${vitriParts.join(' , ')}</td>
      </tr>` : '';

    // Khung ảnh sản phẩm – ẩn mặc định, click dòng tổng sẽ bật/tắt
    const imgUrl = IMG_BASE + upper + '.JPG';
    const imgBlock = `
      <div class="sq-img-wrapper" data-masp="${upper}" style="display:none;">
        <img src="${imgUrl}"
             alt="${upper}"
             onerror="this.parentElement.style.display='none';" />
      </div>`;

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
            ${vitriRow}
          </tbody>
        </table>
        ${imgBlock}
      </div>`;
  }


  function hideAllPopups() {
    document.querySelectorAll('.sq-stock-popup.show').forEach(p => {
      p.classList.remove('show');
    });
  }

    let globalCloseBound = false;

  function bindGlobalCloseHandlers() {
    if (globalCloseBound) return;
    globalCloseBound = true;

    // ESC để đóng popup
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        hideAllPopups();
      }
    });

    // Click ra ngoài để đóng popup
    document.addEventListener('click', (e) => {
      const popup = document.querySelector('.sq-stock-popup.show');
      if (!popup) return;

      // Nếu click bên trong popup thì bỏ qua
      if (e.target.closest('.sq-stock-popup')) return;

      hideAllPopups();
    });
  }

    // ===== Drag support: kéo popup bằng thanh header =====
  function makeDraggable(popup, handle) {
    if (!popup || !handle) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const getPoint = (e) => (e.touches && e.touches[0]) ? e.touches[0] : e;

    const onDown = (e) => {
      const p = getPoint(e);
      dragging = true;
      startX = p.clientX;
      startY = p.clientY;

      const rect = popup.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    };

    const onMove = (e) => {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();

      const p = getPoint(e);
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;

      let left = startLeft + dx;
      let top  = startTop  + dy;

      const vw = window.innerWidth  || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const rect = popup.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Giới hạn trong màn hình
      if (left < 0) left = 0;
      if (top  < 0) top  = 0;
      if (left + w > vw) left = vw - w;
      if (top  + h > vh) top  = vh - h;

      popup.style.left = left + 'px';
      popup.style.top  = top  + 'px';
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }


  let globalHost = null;

  async function ensurePopup(card, masp) {
    if (!card) return;

    // Tạo host global một lần
    if (!globalHost) {
      globalHost = document.createElement('div');
      globalHost.id = 'sq-stock-host';
      document.body.appendChild(globalHost);
    }

    // Lấy rect của dòng/ô để định vị
    const rect = card.getBoundingClientRect();

    // Lấy dữ liệu & dựng HTML
    const payload = await fetchTonBanByMasp(masp);
    globalHost.innerHTML = buildTableHtml(masp, payload);

    const popup = globalHost.querySelector('.sq-stock-popup');
    if (!popup) return;

    // Gắn event nút đóng
    const closeBtn = popup.querySelector('.sq-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        popup.classList.remove('show');
      };
    }

        // Click vào dòng tổng (mã) hoặc header để bật/tắt ảnh sản phẩm
    const sumRowEl  = popup.querySelector('tr.sum-row');
    const headerEl  = popup.querySelector('.sq-stock-popup-header');
    const imgWrapper = popup.querySelector('.sq-img-wrapper');

    const toggleImg = (e) => {
      if (!imgWrapper) return;
      e.stopPropagation();
      const hidden =
        imgWrapper.style.display === '' || imgWrapper.style.display === 'none';
      imgWrapper.style.display = hidden ? 'block' : 'none';
    };

    if (sumRowEl && imgWrapper) {
      sumRowEl.onclick = toggleImg;
    }
    if (headerEl && imgWrapper) {
      headerEl.onclick = toggleImg;
    }

    // Cho phép kéo popup bằng thanh tiêu đề
    if (headerEl && !headerEl.dataset.dragBound) {
      makeDraggable(popup, headerEl);
      headerEl.dataset.dragBound = '1';
    }

    // Tính vị trí hiển thị (xuống dưới dòng, không tràn màn hình)
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    let left = rect.left + scrollX;
    let top = rect.bottom + scrollY + 4;   // bung xuống dưới dòng

    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const approxWidth = 320;
    const approxHeight = 260;

    // Nếu bị tràn phải → đẩy sang trái
    if (left + approxWidth > scrollX + vw - 8) {
      left = scrollX + vw - approxWidth - 8;
    }
    // Nếu gần đáy màn hình → cho popup nhảy lên trên dòng
    if (top + approxHeight > scrollY + vh - 8) {
      top = rect.top + scrollY - approxHeight - 8;
    }

        popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Đảm bảo ESC + click ngoài hoạt động
    bindGlobalCloseHandlers();

    hideAllPopups();
    popup.classList.add('show');
  }



  function attach(card, masp) {
    if (!card || !masp) return;
    const touch = isTouchDevice();

    if (touch) {
      // Điện thoại / tablet: chạm để mở, chạm lại để đóng
      card.addEventListener('click', async (e) => {
        e.stopPropagation();  // tránh click-bên-ngoài đóng ngay
        const current = document.querySelector('.sq-stock-popup.show');
        if (current) {
          current.classList.remove('show');
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
        hideAllPopups();
      });
    }
  }


  // API dùng chung – thêm hàm showFor để nơi khác gọi trực tiếp
  window.StockQuick = {
    attach,
    showFor(card, masp) {
      return ensurePopup(card, masp);
    }
  };
})();

