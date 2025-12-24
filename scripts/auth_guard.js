// scripts/auth_guard.js
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

function currentPath() {
  const meta = document.querySelector('meta[name="app:page_path"]')?.content;
  const p = meta || location.pathname.split('/').pop() || '';
  return String(p).toLowerCase();
}

function block(msg) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;z-index:999999';
  div.innerHTML = `<div style="font:16px system-ui;text-align:center;max-width:520px">
    <h2 style="margin:0 0 8px">Không có quyền truy cập</h2>
    <p style="color:#666">${msg}</p>
    <button id="ag-back" style="padding:8px 12px;border:1px solid #ddd;border-radius:8px">Quay lại</button>
    <button id="ag-logout" style="padding:8px 12px;border:1px solid #d33;border-radius:8px;color:#d33;margin-left:8px">Đăng xuất</button>
  </div>`;
  document.body.appendChild(div);
  div.querySelector('#ag-back').onclick = () => history.back();
  div.querySelector('#ag-logout').onclick = () => { localStorage.clear(); sessionStorage.clear(); location.reload(); };
}

export async function ensureAccess({ supabase, manv }) {
  // 1) bắt buộc có mã NV (đã đăng nhập trước đó)
  if (!manv) { block('Chưa đăng nhập.'); return false; }

  // 2) cache theo NV
  const cacheKey = `allowed_pages_${manv}`;
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  let allowed = Array.isArray(cache.items) && (Date.now() - (cache.ts||0) < CACHE_TTL) ? cache.items : null;

  if (!allowed) {
    const { data, error } = await supabase.rpc('get_pages_for_manv', { p_manv: manv });
    if (error) { block('Không kiểm tra được quyền: ' + error.message); return false; }
    allowed = (data || []).filter(r => r.checked).map(r => String(r.path || '').toLowerCase());
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items: allowed }));
  }

  // 3) so path
  const path = currentPath();
  const ok = allowed.includes(path);
  if (!ok) { block(`Tài khoản ${manv} không được mở "${path}".`); }
  return ok;
}
