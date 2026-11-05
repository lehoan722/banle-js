// HOAN TUYET - XAC NHAN ANH BAN LE V3 (CS1/CS2)
// Chi thay module popup cu tai hai trang ban le; giao dien va hoadon.js khong doi.
(() => {
  'use strict';

  const PAGES = new Set(['banlemtcs1.html', 'banlemtcs2.html']);
  const BASE = 'https://rddjrmbyftlcvrgzlyby.supabase.co/storage/v1/object/public/anhsanpham';
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  if (!PAGES.has(page.endsWith('.html') ? page : `${page}.html`)) return;

  let resolver = null;
  let activeCode = '';
  let ready = false;
  let frame = 0;
  let image = null;
  let lastApprovedAt = 0;
  let allowNoImageConfirm = false;
  let scanSerial = 0;
  const shieldIds = ['top', 'bottom', 'left', 'right'];

  function isAdmin() {
    return ['localStorage', 'sessionStorage'].some(name => {
      try { return /^(true|1)$/i.test(String(window[name].getItem('is_admin') || '')); }
      catch (_) { return false; }
    });
  }

  function bypass() {
    return isAdmin() && document.getElementById('xacnhananhsp-boqua')?.checked === true;
  }

  function adminUI() {
    const old = document.getElementById('xacnhananhsp-admin-wrap');
    if (!isAdmin()) { old?.remove(); return; }
    if (old) return;
    const t = document.getElementById('tongsl');
    const anchor = t?.closest('label') || t?.parentElement;
    if (!anchor) return;
    const el = document.createElement('label');
    el.id = 'xacnhananhsp-admin-wrap';
    el.title = 'Chỉ Admin. Mỗi lần tải trang đều mặc định bắt buộc kiểm ảnh.';
    el.innerHTML = '<input id="xacnhananhsp-boqua" type="checkbox"> Bỏ kiểm ảnh';
    anchor.insertAdjacentElement('afterend', el);
    el.querySelector('input').checked = false;
  }

  function initialize() {
    if (document.getElementById('xna-banle-mask')) { adminUI(); return; }
    const css = document.createElement('style');
    css.id = 'xna-banle-style';
    css.textContent = `
      #xacnhananhsp-admin-wrap{display:inline-flex;align-items:center;gap:5px;margin-left:8px;white-space:nowrap;font-size:13px;font-weight:700;color:#8b0000;vertical-align:middle}
      #xacnhananhsp-admin-wrap input{width:auto!important;height:auto!important;margin:0}
      #xna-banle-mask{position:fixed;inset:0;z-index:2147483000;display:none;pointer-events:none;font-family:Arial,Helvetica,sans-serif}
      #xna-banle-mask.xna-show{display:block}
      .xna-banle-shield{position:fixed;background:transparent;pointer-events:auto;cursor:not-allowed;touch-action:none}
      #xna-banle-notice{position:fixed;box-sizing:border-box;max-width:calc(100vw - 20px);padding:14px 18px;background:#f1f1f1;color:#f13530;font-size:24px;font-weight:800;line-height:1.25;text-align:center;white-space:normal;pointer-events:auto;user-select:none;box-shadow:0 1px 2px #0001}
      #xna-banle-notice.xna-error{color:#a00000;background:#fff1f1;font-size:20px}
      body.xna-banle-locked .banle-right .product-image{cursor:pointer!important;outline:3px solid #16a34a;outline-offset:-3px}
      @media(max-width:950px){#xna-banle-notice{font-size:clamp(15px,2.2vw,24px);padding:10px 12px}}
    `;
    document.head.appendChild(css);
    const root = document.createElement('div');
    root.id = 'xna-banle-mask';
    root.setAttribute('aria-hidden', 'true');
    for (const side of shieldIds) {
      const s = document.createElement('div');
      s.className = 'xna-banle-shield';
      s.dataset.side = side;
      s.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      root.appendChild(s);
    }
    const notice = document.createElement('div');
    notice.id = 'xna-banle-notice';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'KIỂM TRA VÀ KÍCH VÀO ẢNH SẢN PHẨM NẾU ĐÚNG';
    root.appendChild(notice);
    document.body.appendChild(root);
    adminUI();
    // Capture-phase blocker: prevents shortcut keys, synthetic page actions, and
    // handlers on other page elements while the requested image is being verified.
    const events = ['pointerdown','pointerup','mousedown','mouseup','click','dblclick',
      'touchstart','touchend','contextmenu','keydown','keyup','keypress','wheel',
      'submit','beforeinput','input','change','focusin'];
    for (const type of events) document.addEventListener(type, guard, true);
    window.addEventListener('resize', updateGeometry, true);
    window.addEventListener('scroll', updateGeometry, true);
  }

  function blocked(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function guard(e) {
    // Existing pages open invoice view on image dblclick: suppress stray second click.
    if (!resolver) {
      if (Date.now() - lastApprovedAt < 1000 && e.type === 'dblclick' &&
          e.target === document.querySelector('.banle-right .product-image')) blocked(e);
      return;
    }
    // The mask covers the barcode field. Clicking its position must cancel
    // the pending confirmation and focus the barcode field for a NEW scan.
    // No other location can cancel or confirm.
    const codeInput = document.getElementById('masp');
    if (e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'touchstart') {
      const r = codeInput?.getBoundingClientRect();
      const point = e.touches?.[0] || e;
      if (r && Number.isFinite(point.clientX) && point.clientX >= r.left &&
          point.clientX <= r.right && point.clientY >= r.top && point.clientY <= r.bottom) {
        blocked(e);
        finish(false);
        // hoadon.js also selects it on rejection; avoid clearing the typed code.
        setTimeout(() => { codeInput.focus(); codeInput.select?.(); }, 0);
        return;
      }
    }
    const onImage = e.target === image;
    if (onImage && e.type === 'click') {
      blocked(e);
      // Each scan has its own independent probe. For no-image scans the
      // placeholder area is explicitly allowed, even if the fallback is cached.
      if (ready && (allowNoImageConfirm ||
          (image.complete && image.naturalWidth > 0 && imageMatchesCode()))) finish(true);
      return;
    }
    // Permit no other action; the backdrop remains visible on clicks outside the image.
    // Pointer events on the image are swallowed too, avoiding existing dblclick handlers.
    blocked(e);
  }

  function imageMatchesCode() {
    if (!image) return false;
    const expected = `${BASE}/${activeCode}.JPG`;
    try { return new URL(image.currentSrc || image.src, location.href).href === expected; }
    catch (_) { return false; }
  }

  function setRect(el, x, y, w, h) {
    if (!el) return;
    Object.assign(el.style, {
      left: `${Math.max(0,x)}px`, top: `${Math.max(0,y)}px`,
      width: `${Math.max(0,w)}px`, height: `${Math.max(0,h)}px`
    });
  }

  function updateGeometry() {
    if (!resolver) return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      const root = document.getElementById('xna-banle-mask');
      if (!root || !image) return;
      const W = window.innerWidth, H = window.innerHeight;
      const r = image.getBoundingClientRect();
      const L = Math.min(W, Math.max(0, r.left));
      const R = Math.min(W, Math.max(L, r.right));
      const T = Math.min(H, Math.max(0, r.top));
      const B = Math.min(H, Math.max(T, r.bottom));
      const shields = Object.fromEntries([...root.querySelectorAll('.xna-banle-shield')].map(e => [e.dataset.side,e]));
      setRect(shields.top, 0, 0, W, T);
      setRect(shields.bottom, 0, B, W, H-B);
      setRect(shields.left, 0, T, L, B-T);
      setRect(shields.right, R, T, W-R, B-T);
      const notice = document.getElementById('xna-banle-notice');
      const leftPane = document.querySelector('.banle-right')?.getBoundingClientRect().left ?? L;
      const availableWidth = Math.max(200, Math.min(W-20, leftPane-30));
      notice.style.width = 'max-content';
      notice.style.maxWidth = `${Math.max(200,availableWidth-20)}px`;
      notice.style.left = `${Math.max(10, (Math.min(W,leftPane) - notice.getBoundingClientRect().width)/2)}px`;
      notice.style.top = `${Math.max(120, (H - notice.getBoundingClientRect().height)/2)}px`;
    });
  }

  function finish(ok) {
    if (!resolver) return;
    const done = resolver;
    resolver = null;
    activeCode = '';
    ready = false;
    allowNoImageConfirm = false;
    scanSerial++;
    image = null;
    if (ok) lastApprovedAt = Date.now();
    document.getElementById('xna-banle-mask')?.classList.remove('xna-show');
    document.getElementById('xna-banle-mask')?.setAttribute('aria-hidden','true');
    document.body.classList.remove('xna-banle-locked');
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    done(Boolean(ok));
  }

  function verify({masp} = {}) {
    if (bypass()) return Promise.resolve(true);
    initialize();
    if (resolver) finish(false);
    const code = String(masp || '').trim().toUpperCase();
    const photo = document.querySelector('.banle-right .product-image');
    if (!code || !photo) return Promise.resolve(false); // fail closed
    image = photo;
    activeCode = code;
    ready = false;
    allowNoImageConfirm = false;
    const notice = document.getElementById('xna-banle-notice');
    notice.classList.remove('xna-error');
    notice.textContent = 'KIỂM TRA VÀ KÍCH VÀO ẢNH SẢN PHẨM NẾU ĐÚNG';
    const gate = new Promise(resolve => { resolver = resolve; });
    document.body.classList.add('xna-banle-locked');
    const mask = document.getElementById('xna-banle-mask');
    mask.classList.add('xna-show');
    mask.setAttribute('aria-hidden','false');

    // IMPORTANT: validate with an independent Image on EVERY scan, including
    // repeated scans of a missing product. The live <img> may already display
    // cached NO-IMAGE.JPG, so relying on its onerror/onload can deadlock.
    const serial = ++scanSerial;
    const expected = `${BASE}/${code}.JPG`;
    const placeholder = `${BASE}/NO-IMAGE.JPG`;
    const current = () => Boolean(resolver && serial === scanSerial && activeCode === code);
    const showMissing = () => {
      if (!current()) return;
      allowNoImageConfirm = true;
      ready = true; // allow click inside the no-image area even if placeholder fails
      notice.classList.add('xna-error');
      notice.textContent = `SẢN PHẨM ${code} KHÔNG CÓ ẢNH. YÊU CẦU KIỂM TRA MÃ SẢN PHẨM VÀ GIÁ SẢN PHẨM, SAU ĐÓ KÍCH VÀO VÙNG ẢNH ĐỂ XÁC NHẬN.`;
      // Only the current scan may update this image. Detach old handlers so
      // late fallback events from a prior scan cannot modify this state.
      image.onload = null;
      image.onerror = null;
      if (image.getAttribute('src') !== placeholder) image.src = placeholder;
    };
    // Suppress any inherited handlers while the probe determines the state.
    image.onload = null;
    image.onerror = null;
    const probe = new Image();
    probe.onload = () => {
      if (!current()) return;
      if (!probe.naturalWidth) { showMissing(); return; }
      allowNoImageConfirm = false;
      image.onerror = () => { if (current()) showMissing(); };
      image.onload = () => {
        if (current()) ready = imageMatchesCode() && image.naturalWidth > 0;
      };
      if (image.getAttribute('src') !== expected) image.src = expected;
      ready = image.complete && image.naturalWidth > 0 && imageMatchesCode();
    };
    probe.onerror = showMissing;
    probe.src = expected;
    updateGeometry();
    return gate;
  }

  function deferSize() { return !bypass(); }
  function openSize() {
    const size = document.getElementById('size');
    if (!size) return;
    try {
      size.focus();
      size.select?.();
      window.openCurrentMenuSizeDropdown?.();
    } catch (err) { console.warn('[xacnhananh_banle] Popup size:', err); }
  }

  window.XacNhanAnhSP = Object.freeze({
    xacNhanAnhSanPham: verify,
    khoiTao: initialize,
    refreshAdminUI: adminUI,
    laTrangApDung: () => true,
    laAdmin: isAdmin,
    coDuocBoQua: bypass,
    nenTriHoanPopupSize: deferSize,
    moPopupSizeSauXacNhan: openSize
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => setTimeout(initialize, 0), {once:true});
  else setTimeout(initialize, 0);
})();
