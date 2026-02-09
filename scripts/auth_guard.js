// scripts/auth_guard.js
// Guard dùng chung để chặn truy cập theo quyền trang.
// - ADMIN: kiểm tra bằng RPC public.is_admin() (bảng admin_users) => nếu true thì cho phép vào mọi trang.
// - NV thường: kiểm tra quyền theo path bằng RPC has_access_path(p_manv, p_path) (dựa trên nv_page + app_page).

import { supabase } from "./supabaseClient.js";

// Cache quyền theo từng trang (theo manv + page)
const CACHE_KEY = "perm_cache_page_ok_v2";
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 phút

function getCurrentPagePath() {
  // Ưu tiên meta (nếu bạn set), fallback pathname
  const meta = document.querySelector('meta[name="app:page_path"]');
  const raw = (meta && meta.content ? meta.content : (window.location.pathname || "")).trim();

  // bỏ query/hash
  const p = raw.split("?")[0].split("#")[0];

  // lấy tên file cuối cùng, bỏ dấu / nếu có
  const file = (p || "").split("/").pop() || p || "";
  return String(file).trim().toLowerCase();
}

function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

async function getIsAdmin() {
  try {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return !!data;
  } catch (e) {
    return false;
  }
}

function renderBlocked(message) {
  const wrap = document.createElement("div");
  wrap.id = "auth-guard-block";
  wrap.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:999999",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#f5f6f8",
    "font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial"
  ].join(";");

  wrap.innerHTML = `
    <div style="width:min(560px,92vw);background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px 24px;box-shadow:0 12px 30px rgba(0,0,0,.08)">
      <div style="font-size:26px;font-weight:800;letter-spacing:.2px;margin-bottom:10px">Không có quyền truy cập</div>
      <div style="color:#374151;font-size:15px;line-height:1.5;margin-bottom:18px">${message}</div>
      <div style="display:flex;gap:10px">
        <button id="auth-guard-back" style="padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer">Quay lại</button>
        <button id="auth-guard-logout" style="padding:10px 14px;border:1px solid #ef4444;border-radius:10px;background:#ef4444;color:#fff;cursor:pointer">Đăng xuất</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.querySelector("#auth-guard-back")?.addEventListener("click", () => history.back());
  wrap.querySelector("#auth-guard-logout")?.addEventListener("click", async () => {
    try { localStorage.clear(); } catch (e) {}
    try { await supabase.auth.signOut(); } catch (e) {}
    location.href = "/"; // hoặc trang login của bạn
  });
}

// ✅ Check quyền theo path bằng RPC has_access_path
async function hasAccessByPath(manv, pagePath) {
  // Cache theo manv + page
  const mv = String(manv || "").trim().toUpperCase();
  const pg = String(pagePath || "").trim().toLowerCase();

  if (!mv || !pg) return false;

  const now = Date.now();
  const cache = readJSON(CACHE_KEY, null);
  if (
    cache &&
    cache.manv === mv &&
    cache.page === pg &&
    (now - cache.ts) < CACHE_TTL_MS &&
    typeof cache.ok === "boolean"
  ) {
    return cache.ok;
  }

  // DB của anh có thể lưu path dạng "banlemtcs1.html" hoặc "/banlemtcs1.html"
  // => thử 2 biến thể để chắc chắn không lệch dữ liệu hiện có.
  const tries = [pg, pg.startsWith("/") ? pg : ("/" + pg)];

  let ok = false;
  for (const pTry of tries) {
    try {
      const { data, error } = await supabase.rpc("has_access_path", {
        p_manv: mv,
        p_path: pTry
      });
      if (!error && data === true) {
        ok = true;
        break;
      }
    } catch (e) {}
  }

  writeJSON(CACHE_KEY, { manv: mv, page: pg, ts: now, ok });
  return ok;
}

/**
 * ensureAccess({ manv })
 * - manv: mã nhân viên lấy từ localStorage (bạn set sau khi login nội bộ).
 */
export async function ensureAccess({ manv } = {}) {
  const page = getCurrentPagePath();

  // Cho qua các trang login (tùy bạn thêm/bớt)
  const lower = page.toLowerCase();
  if (lower.includes("login") || lower.includes("dangnhap")) return true;

  // Nếu đang có session supabase => có thể check admin
  let user = null;
  try {
    const r = await supabase.auth.getUser();
    user = r?.data?.user || null;
  } catch (e) {}

  // Đồng bộ is_admin vào currentUser nếu có
  let currentUser = readJSON("currentUser", null);
  const isAdmin = user ? await getIsAdmin() : !!currentUser?.is_admin;

  // Đồng bộ lại currentUser để main.js và các trang khác nhận đúng trạng thái ADMIN
  if (!currentUser && isAdmin) {
    currentUser = {
      manv: "ADMIN",
      email: user?.email || "",
      is_admin: true,
      ts: Date.now()
    };
    writeJSON("currentUser", currentUser);
    try { localStorage.setItem("manv", "ADMIN"); } catch (e) {}
  } else if (currentUser) {
    currentUser.is_admin = !!isAdmin;
    writeJSON("currentUser", currentUser);
  }

  // ADMIN được vào mọi trang
  if (isAdmin) return true;

  // NV thường: cần manv
  const mv = (manv || currentUser?.manv || localStorage.getItem("manv") || "").toString().trim();
  if (!mv) {
    renderBlocked("Bạn chưa đăng nhập hoặc thiếu <b>mã nhân viên</b> trong phiên.");
    return false;
  }

  // ✅ CHỐT QUYỀN TRANG THEO DB nv_page + app_page
  const ok = await hasAccessByPath(mv, page);

  if (!ok) {
    renderBlocked(`Tài khoản <b>${mv}</b> không được mở "<b>${page}</b>".`);
    return false;
  }
  return true;
}
