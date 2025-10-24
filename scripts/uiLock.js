// uiLock.js — Module khóa/mở khóa trang theo chế độ xem ↔ nhập
// Sử dụng chung cho mọi trang: chỉ cần import { uiLock } from './uiLock.js'
// rồi gọi uiLock.mount({ toggleButtonId: 'btnChuyenBang' });

export const uiLock = (() => {
  let locked = false;
  let overlay, banner, styleEl, toggleBtnId = 'btnChuyenBang', pivotBtnId = 'btnChuyenBang';
  const KEY_GUARD = (ev) => {
    if (!locked) return;
    // Cho phép phím Tab di chuyển đến nút Chuyển; chặn phần còn lại
    const isOnToggleBtn = (ev.target && ev.target.id === toggleBtnId);
    if (!isOnToggleBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    }
  };

  // Khởi tạo các thành phần hiển thị overlay và banner
  function ensureDom(message) {
    // inject CSS 1 lần
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.textContent = `
        body.ui-locked { overflow: hidden; }
        .uiLock__overlay {
          position: fixed; inset: 0; z-index: 9997;
          background: transparent; /* chặn tương tác nhưng ko làm mờ */
          pointer-events: auto;
        }
        .uiLock__banner {
          position: fixed; top: 10px; right: 12px; z-index: 9999;
          padding: 8px 12px; border-radius: 10px;
          background: #222; color: #fff; font-size: 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          user-select: none; display: none;
        }
        .uiLock__fallbackBtn {
          position: fixed; right: 12px; bottom: 12px; z-index: 10000;
          padding: 8px 12px; border-radius: 10px;
          border: none; font-size: 14px;
          background: #ffc107; color: #222; cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,.25);
          display: none;
        }
        /* Làm mờ nhẹ vùng chính khi khóa */
        body.ui-locked .uiLock__dimTarget {
          filter: grayscale(.2) brightness(.96);
          opacity: .85;
        }
      `;
      document.head.appendChild(styleEl);
    }

    // overlay chặn toàn bộ click/phím bên dưới
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'uiLock__overlay';
      overlay.style.display = 'none';
      overlay.addEventListener('wheel', (e) => { if (locked) e.preventDefault(); }, { passive: false });
      overlay.addEventListener('click', (e) => { if (locked) e.preventDefault(); }, true);
      document.body.appendChild(overlay);
    }

    // banner thông báo
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'uiLock__banner';
      banner.id = 'uiLockBanner';
      banner.textContent = message || '🔒 Chế độ xem (đã khóa). Nhấn “Chuyển” để nhập liệu.';
      document.body.appendChild(banner);
    }

    // Nút mở khóa khẩn cấp (sẽ tự chuyển bảng về DỌC)
    if (!window.__uiLockFallbackBtn) {
      const fb = document.createElement('button');
      fb.id = 'uiLockFallback';
      fb.className = 'uiLock__fallbackBtn';
      fb.type = 'button';
      fb.textContent = '🔓 Mở khóa';
      fb.addEventListener('click', () => {
        // Nếu bảng đang ở ngang → gọi pivot về dọc
        const table = document.getElementById('bangketqua');
        const mode = table?.dataset?.mode || 'doc';
        if (mode === 'ngang') {
          const btn = document.getElementById(pivotBtnId);
          if (btn) btn.click(); // pivot code của bạn sẽ phát 'app:view-mode-changed'
        }
        // Đợi pivot xử lý xong rồi mới mở khóa
        setTimeout(() => unlock(), 0);
      });
      document.body.appendChild(fb);
      window.__uiLockFallbackBtn = fb;
    }
  }

  // Hàm mount: cài đặt module cho trang hiện tại
  function mount({ toggleButtonId = 'btnChuyenBang', pivotButtonId = 'btnChuyenBang', message } = {}) {
    toggleBtnId = toggleButtonId;
    pivotBtnId = pivotButtonId;
    ensureDom(message);

    // Cho phép nút chuyển luôn bấm được
    const btn = document.getElementById(toggleButtonId);
    if (btn) {
      btn.style.position = 'relative';
      btn.style.zIndex = '10000';
    }

    // Lắng nghe event toàn cục từ app
    document.addEventListener('app:view-mode-changed', (e) => {
      const mode = (e && e.detail && e.detail.mode) || 'doc';
      mode === 'ngang' ? lock() : unlock();
    });

    // Gắn guard phím (chặn phím tắt khi khóa)
    document.addEventListener('keydown', KEY_GUARD, true);
  }

  function lock() {
    if (locked) return;
    locked = true;
    document.body.classList.add('ui-locked');
    if (overlay) overlay.style.display = 'block';
    if (banner) banner.style.display = 'block';
    if (window.__uiLockFallbackBtn) window.__uiLockFallbackBtn.style.display = 'block';
  }

  function unlock() {
    if (!locked) return;
    locked = false;
    document.body.classList.remove('ui-locked');
    if (overlay) overlay.style.display = 'none';
    if (banner) banner.style.display = 'none';
    if (window.__uiLockFallbackBtn) window.__uiLockFallbackBtn.style.display = 'none';
  }

  function whitelist(ids = []) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.position = 'relative';
        el.style.zIndex = '10000'; // luôn nằm trên overlay
      }
    });
  }

  return {
    mount, lock, unlock, whitelist,
    get locked() { return locked; }
  };
})();
