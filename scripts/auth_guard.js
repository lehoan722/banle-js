// scripts/auth_guard.js
// Guard quyền truy cập trang theo phân quyền nv_page + app_page
// Cơ chế: gọi RPC has_access_path(p_manv, p_path) => true/false
// - p_path là "tên file" dạng: banlemtcs1.html (lowercase, không dấu /)
// - Admin (localStorage.is_admin === "true") => cho qua tất cả

// Cache TTL (ms) để tránh gọi RPC liên tục khi reload/đi lại trong cùng trang
const CACHE_TTL_MS = 60_000; // 60s

function readJSON(key, fallback = null) {
  try {
    const s = localStorage.getItem(key);
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch { }
}

// Cho phép override path bằng meta nếu anh muốn fix các route đặc biệt
// <meta name="app:page_path" content="banlemtcs1.html">
function getCurrentPagePath() {
  const meta = document.querySelector('meta[name="app:page_path"]');
  const raw = (meta && meta.content ? meta.content : (window.location.pathname || "")).trim();

  // bỏ query/hash, lấy tên file cuối cùng
  const p = raw.split("?")[0].split("#")[0];
  const file = (p.split("/").pop() || p).trim();

  return file.replace(/^\//, "").toLowerCase();
}

function isPublicPage(pagePath) {
  // Các trang không cần chốt quyền (tuỳ anh chỉnh thêm)
  const pub = new Set([
    "",                 // root (nếu có)
    "index.html",
    "login.html",
    "404.html",
  ]);
  return pub.has(pagePath);
}

function isAdminByLocalFlag() {
  try {
    return (localStorage.getItem("is_admin") || "").trim() === "true";
  } catch {
    return false;
  }
}

function renderBlocked(htmlMessage) {
  // Block UI kiểu "chắc chắn không dùng được"
  // Không redirect ngay để tránh loop nếu trang index cũng chặn.
  document.documentElement.innerHTML = `
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Không có quyền</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;background:#f6f7fb}
        .wrap{max-width:680px;margin:60px auto;background:#fff;border:1px solid #eee;border-radius:14px;padding:18px 18px 14px;box-shadow:0 8px 24px rgba(0,0,0,.06)}
        .ttl{font-size:18px;font-weight:800;margin:0 0 8px;color:#b00020}
        .msg{font-size:14px;line-height:1.5;color:#111}
        .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        button{padding:10px 12px;border-radius:10px;border:1px solid #d0d7de;background:#fff;cursor:pointer;font-weight:600}
        button.primary{background:#0b84ff;color:#fff;border-color:#0b84ff}
        .hint{margin-top:10px;color:#6b7280;font-size:13px}
      </style>
    </head>
    <body>
      <div class="wrap">
        <h1 class="ttl">⛔ Không có quyền truy cập</h1>
        <div class="msg">${htmlMessage || "Tài khoản của bạn không được phép sử dụng trang này."}</div>
        <div class="row">
          <button class="primary" id="btnGoHome">Về trang chính</button>
          <button id="btnLogout">Đăng xuất</button>
          <button id="btnReload">Tải lại</button>
        </div>
        <div class="hint">Nếu bạn cần quyền, hãy liên hệ quản lý để cấp quyền trên trang “Phân quyền nhân viên”.</div>
      </div>

      <script>
        document.getElementById('btnGoHome')?.addEventListener('click', () => {
          try { location.href = '/index.html'; } catch(e){ location.href = 'index.html'; }
        });
        document.getElementById('btnReload')?.addEventListener('click', () => location.reload());
        document.getElementById('btnLogout')?.addEventListener('click', () => {
          try {
            // Xoá những key phổ biến (tuỳ dự án anh có thể thêm)
            [
              'manv','tennv','is_admin','quyen_sua_hoadon',
              'supabase_access_token','supabase_refresh_token',
              'currentUser'
            ].forEach(k => { try{localStorage.removeItem(k);}catch(e){}; try{sessionStorage.removeItem(k);}catch(e){}; });
          } catch(e){}
          try { location.href = '/index.html'; } catch(e){ location.href = 'index.html'; }
        });
      </script>
    </body>
  `;
}

/**
 * ensureAccess({ supabase, manv })
 * - supabase: client supabase-js đã login
 * - manv: mã NV đang login (localStorage.manv)
 *
 * Trả về:
 * - true: được phép vào
 * - false: bị chặn (đã render UI block)
 */
export async function ensureAccess({ supabase, manv }) {
  try {
    const pagePath = getCurrentPagePath();

    // Trang public => không chốt
    if (isPublicPage(pagePath)) return true;

    // Admin => cho qua
    if (isAdminByLocalFlag()) return true;

    const mv = String(manv || "").trim().toUpperCase();
    if (!mv) {
      renderBlocked("Bạn chưa đăng nhập (không tìm thấy <b>manv</b>). Vui lòng đăng nhập lại.");
      return false;
    }

    if (!supabase || typeof supabase.rpc !== "function") {
      renderBlocked("Hệ thống chưa khởi tạo Supabase client. Vui lòng tải lại trang.");
      return false;
    }

    // Cache theo manv + pagePath
    const now = Date.now();
    const cacheKey = `perm_ok:${mv}:${pagePath}`;
    const cache = readJSON(cacheKey, null);

    if (cache && typeof cache.ok === "boolean" && (now - (cache.ts || 0)) < CACHE_TTL_MS) {
      if (!cache.ok) {
        renderBlocked(`Tài khoản <b>${mv}</b> không được mở trang "<b>${pagePath}</b>".`);
        return false;
      }
      return true;
    }

    // ✅ Check quyền trực tiếp bằng RPC has_access_path
    const { data, error } = await supabase.rpc("has_access_path", {
      p_manv: mv,
      p_path: pagePath
    });

    const ok = !error && data === true;
    writeJSON(cacheKey, { ts: now, ok });

    if (!ok) {
      // Nếu muốn debug nhanh:
      // console.warn("Denied", { mv, pagePath, error, data });

      renderBlocked(`Tài khoản <b>${mv}</b> không được mở trang "<b>${pagePath}</b>".`);
      return false;
    }

    return true;
  } catch (e) {
    console.error("ensureAccess error:", e);
    renderBlocked("Có lỗi khi kiểm tra quyền truy cập. Vui lòng tải lại trang hoặc liên hệ quản lý.");
    return false;
  }
}
