/* scripts/page_guard.js */
(function (global) {
  const CACHE_TTL = 5 * 60 * 1000; // 5 phút
  const PageGuard = {};

  function css(el, s) { for (const k in s) el.style[k] = s[k]; return el; }
  function overlay(html) {
    const wrap = document.createElement('div');
    css(wrap, {
      position: 'fixed', inset: '0', background: '#fff', zIndex: '999999',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui,Segoe UI,Roboto'
    });
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    return wrap;
  }
  function pagePath() {
    const meta = document.querySelector('meta[name="app:page_path"]');
    const p = meta ? meta.content : (location.pathname.split('/').pop() || '');
    return String(p).toLowerCase();
  }

  function getClient(cfg) {
    // CẦN include UMD: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
    if (!global.supabase || !global.supabase.createClient) {
      throw new Error('Thiếu Supabase UMD trên trang.');
    }
    return global.supabase.createClient(cfg.url, cfg.key);
  }

  async function ensureIdentity(sb) {
    let manv = localStorage.getItem('manv');
    let tennv = localStorage.getItem('tennv') || '';
    if (manv) return { manv, tennv };

    // Modal đăng nhập mã NV + mật khẩu (RPC nv_login)
    const ui = overlay(`
      <div style="text-align:center;max-width:420px">
        <h2 style="margin:0 0 6px">Đăng nhập nhân viên</h2>
        <p style="color:#666;margin:0 0 10px">Nhập <b>Mã nhân viên</b> và <b>Mật khẩu</b> để tiếp tục</p>
        <div style="display:grid;gap:8px">
          <input id="pg-manv" placeholder="Mã nhân viên" style="padding:10px;border:1px solid #ddd;border-radius:10px">
          <input id="pg-pass" placeholder="Mật khẩu" type="password" style="padding:10px;border:1px solid #ddd;border-radius:10px">
          <button id="pg-ok" style="padding:10px;border-radius:10px;background:#0b84ff;color:#fff;border:0">Đăng nhập</button>
          <div id="pg-msg" style="color:#d33;font-size:13px;height:18px"></div>
        </div>
      </div>
    `);
    const $ = (sel) => ui.querySelector(sel);
    return new Promise((resolve) => {
      $('#pg-ok').onclick = async () => {
        const m = $('#pg-manv').value.trim();
        const p = $('#pg-pass').value.trim();
        $('#pg-msg').textContent = 'Đang kiểm tra...';
        try {
          const { data, error } = await sb.rpc('nv_login', { p_manv: m, p_password: p });
          if (error) throw error;
          const row = (data && data[0]) || {};
          if (!row.ok) { $('#pg-msg').textContent = 'Sai mã NV hoặc mật khẩu'; return; }
          localStorage.setItem('manv', row.manv);
          if (row.tennv) localStorage.setItem('tennv', row.tennv);
          ui.remove();
          resolve({ manv: row.manv, tennv: row.tennv || '' });
        } catch (e) {
          $('#pg-msg').textContent = e.message || 'Không đăng nhập được';
        }
      };
    });
  }

  function block(what) {
    const w = overlay(`
      <div style="text-align:center;max-width:520px">
        <h2 style="margin:0 0 6px">Không có quyền truy cập</h2>
        <p style="color:#666">Tài khoản hiện tại không được phép mở <b>${what}</b>.</p>
        <button id="pg-back" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px">Quay lại</button>
        <button id="pg-logout" style="padding:8px 12px;border:1px solid #d33;color:#d33;border-radius:8px;margin-left:8px">Đăng xuất</button>
      </div>
    `);
    w.querySelector('#pg-back').onclick = () => history.back();
    w.querySelector('#pg-logout').onclick = () => { localStorage.clear(); sessionStorage.clear(); location.reload(); };
  }

  PageGuard.enforce = async function enforce(cfg) {
    const sb = getClient(cfg);
    const who = await ensureIdentity(sb);

    // Cache quyền theo NV
    const cacheKey = `allowed_pages_${who.manv}`;
    let allowed = null;
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      if (c.ts && Date.now() - c.ts < CACHE_TTL && Array.isArray(c.items)) allowed = c.items;
    } catch { /* ignore */ }

    if (!allowed) {
      const { data, error } = await sb.rpc('get_pages_for_manv', { p_manv: who.manv });
      if (error) { block('Không kiểm tra được quyền: ' + error.message); return false; }
      allowed = (data || []).filter(r => r.checked).map(r => String(r.path || '').toLowerCase());
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: allowed }));
    }

    const p = (cfg.pagePath || pagePath()).toLowerCase();
    if (!allowed.includes(p)) { block(p); return false; }
    return true;
  };

  global.PageGuard = PageGuard;
})(window);
