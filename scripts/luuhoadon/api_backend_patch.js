/**
 * Patch gợi ý cho scripts/luuhoadon/api.js
 * 
 * Ý tưởng ít rủi ro:
 * - Giữ nguyên toàn bộ logic hiện tại (save trực tiếp Supabase) để rollback nhanh.
 * - Thêm 1 cờ dùng Backend: localStorage.USE_API_HOADON='1'
 * - Khi bật cờ, thay vì supabase.from(...).insert/update, ta gọi fetch('/api/hoadon-save').
 * 
 * Bạn chỉ cần:
 * 1) Tìm nơi trong api.js hiện tại đang gọi Supabase để lưu header+lines.
 * 2) Bọc nó bằng if (useBackend) { return saveViaBackend(...) } else { ...cũ... }
 */

export function useBackendSave() {
  return localStorage.getItem('USE_API_HOADON') === '1';
}

export async function saveViaBackend({ mode, loaihd, diadiem, header, lines, counterpart }) {
  // Lấy access token từ session supabase hiện tại
  // (Tùy dự án của bạn: bạn đang có startSessionKeeper / authModule, nên chỗ lấy session có thể khác)
  // Nếu bạn có sẵn biến global currentSessionAccessToken thì dùng luôn.

  let accessToken = null;
  try {
    // Trường hợp bạn đã export supabase client
    const { supabase } = await import('../supabaseClient.js');
    const { data } = await supabase.auth.getSession();
    accessToken = data?.session?.access_token || null;
  } catch (e) {
    // fallback: nếu bạn đang tự lưu token
    accessToken = localStorage.getItem('sb-access-token') || null;
  }

  const resp = await fetch('/api/hoadon-save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ mode, loaihd, diadiem, header, lines, counterpart }),
  });

  const out = await resp.json().catch(() => ({}));
  if (!resp.ok || out?.ok === false) {
    const msg = out?.error || `Lưu thất bại (HTTP ${resp.status})`;
    const err = new Error(msg);
    err.details = out;
    throw err;
  }

  return out; // {ok:true, sohd, created_at, ...}
}
