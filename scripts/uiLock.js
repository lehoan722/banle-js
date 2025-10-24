// uiLock.js — Khóa/Mở khóa toàn trang bằng overlay, tối thiểu sửa code cũ
// API: uiLock.mount({ toggleButtonId: 'btnChuyenBang', message: '...' })
//      uiLock.lock(), uiLock.unlock(), uiLock.toggle()

export const uiLock = (() => {
    let locked = false;
    let overlay, banner, styleEl, toggleBtnId = 'btnChuyenBang';
    const KEY_GUARD = (ev) => {
        if (!locked) return;

        // Cho phép phím Tab di chuyển tới nút chuyển; chặn còn lại
        const isOnToggleBtn = (ev.target && ev.target.id === toggleBtnId);
        if (!isOnToggleBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            return false;
        }
    };

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
        /* Mờ nhẹ khu nội dung khi khóa (optional) */
        body.ui-locked .uiLock__dimTarget { 
          filter: grayscale(.2) brightness(.96);
          opacity: .85;
        }
      `;
            document.head.appendChild(styleEl);
        }

        // overlay chặn mọi click/phím/scroll bên dưới
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'uiLock__overlay';
            overlay.style.display = 'none';
            // chặn mọi wheel/scroll
            overlay.addEventListener('wheel', (e) => { if (locked) e.preventDefault(); }, { passive: false });
            // chặn click đi qua
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

        // Nút cứu hộ luôn nổi trên cùng để mở khóa khi cần
        if (!window.__uiLockFallbackBtn) {
            const fb = document.createElement('button');
            fb.id = 'uiLockFallback';
            fb.className = 'uiLock__fallbackBtn';
            fb.type = 'button';
            fb.textContent = '🔓 Mở khóa';
            Object.assign(fb.style, {
                position: 'fixed',
                right: '12px',
                bottom: '12px',
                zIndex: '10000',
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                fontSize: '14px',
                background: '#ffc107',
                color: '#222',
                cursor: 'pointer',
                display: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,.25)',
            });
            fb.addEventListener('click', () => unlock());
            document.body.appendChild(fb);
            window.__uiLockFallbackBtn = fb;
        }

    }

    function mount({ toggleButtonId = 'btnChuyenBang', message } = {}) {
        toggleBtnId = toggleButtonId;
        ensureDom(message);

        // Đưa nút Chuyển lên trên overlay để vẫn bấm được
        const btn = document.getElementById(toggleBtnId);
        if (btn) {
            btn.style.position = 'relative';
            btn.style.zIndex = '10000';
            btn.addEventListener('click', () => toggle());
        }

        // Gắn guard phím 1 lần
        document.addEventListener('keydown', KEY_GUARD, true);

        // Gắn class làm mờ vùng bạn muốn (không bắt buộc)
        // thêm class 'uiLock__dimTarget' vào wrapper chính nếu muốn mờ khi khóa.
    }

    function lock() {
        if (locked) return;
        locked = true;
        document.body.classList.add('ui-locked');
        if (overlay) overlay.style.display = 'block';
        if (banner) banner.style.display = 'block';
        if (window.__uiLockFallbackBtn) window.__uiLockFallbackBtn.style.display = 'block';  // 👈
    }

    function unlock() {
        if (!locked) return;
        locked = false;
        document.body.classList.remove('ui-locked');
        if (overlay) overlay.style.display = 'none';
        if (banner) banner.style.display = 'none';
        if (window.__uiLockFallbackBtn) window.__uiLockFallbackBtn.style.display = 'none';   // 👈
    }

    function toggle() {
        locked ? unlock() : lock();
    }

    // Cho phép mở rộng whitelist: ngoài nút chuyển, muốn thêm nút khác vẫn bấm được
    function whitelist(ids = []) {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.position = 'relative';
                el.style.zIndex = '10000'; // nằm trên overlay
            }
        });
    }

    return { mount, lock, unlock, toggle, whitelist, get locked() { return locked; } };
})();
