import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// =======================================================
// 1) CẤU HÌNH SUPABASE
// =======================================================
const SUPABASE_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM";

if (
  !window.supabase ||
  typeof window.supabase.from !== "function" ||
  !window.supabase.auth
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: sessionStorage
    }
  });
}

export function getSupabaseClient() {
  return window.supabase;
}

// =======================================================
// 2) KEY UI PROFILE
// =======================================================
const UI_PROFILE_KEYS = [
  "diadiem",
  "manv",
  "tennv",
  "is_admin",
  "quyen_sua_hoadon"
];

function ssSet(key, value) {
  try {
    sessionStorage.setItem(key, String(value ?? ""));
  } catch { }
}

function ssGet(key) {
  try {
    return (sessionStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ""));
  } catch { }
}

function lsGet(key) {
  try {
    return (localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function clearUiProfile() {
  UI_PROFILE_KEYS.forEach((k) => {
    try { sessionStorage.removeItem(k); } catch { }
    try { localStorage.removeItem(k); } catch { }
  });
}

function saveUiProfile(profile = {}) {
  const data = {
    diadiem: profile.diadiem || "",
    manv: profile.manv || "",
    tennv: profile.tennv || "",
    is_admin: profile.is_admin ? "true" : "false",
    quyen_sua_hoadon: profile.quyen_sua_hoadon ? "true" : "false"
  };

  Object.entries(data).forEach(([k, v]) => {
    ssSet(k, v);
    lsSet(k, v);
  });
}

function syncGlobalsFromProfile(profile = {}) {
  try {
    window.diadiem = profile.diadiem || "";
    window.manv = profile.manv || "";
    window.tennv = profile.tennv || "";
    window.is_admin = !!profile.is_admin;
  } catch { }
}

export function getCurrentUserInfo() {
  return {
    diadiem: ssGet("diadiem") || lsGet("diadiem"),
    manv: ssGet("manv") || lsGet("manv"),
    tennv: ssGet("tennv") || lsGet("tennv"),
    is_admin: (ssGet("is_admin") || lsGet("is_admin")) === "true",
    quyen_sua_hoadon: (ssGet("quyen_sua_hoadon") || lsGet("quyen_sua_hoadon")) === "true"
  };
}

// =======================================================
// 3) TIỆN ÍCH CHUNG
// =======================================================
function getRedirectUrl(defaultUrl = "/") {
  try {
    const url = new URL(window.location.href);
    const redirect = url.searchParams.get("redirect");
    return redirect || defaultUrl;
  } catch {
    return defaultUrl;
  }
}

function goToLoginPage(redirectTo = null) {
  const current = redirectTo || (location.pathname + location.search + location.hash);
  const url = `/login.html?redirect=${encodeURIComponent(current)}`;
  window.location.replace(url);
}

function resolveLoginApiPath(loginApiPath, cs) {
  if (typeof loginApiPath === "function") return loginApiPath(cs);
  if (typeof loginApiPath === "string" && loginApiPath.trim()) return loginApiPath.trim();
  if (loginApiPath && typeof loginApiPath === "object") return loginApiPath[cs];
  return `/api/login-${cs}`;
}

async function checkIsAdminBestEffort() {
  try {
    const { data, error } = await window.supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

async function readAdminProfile() {
  try {
    const { data: userRes } = await window.supabase.auth.getUser();
    const user = userRes?.user;
    if (!user?.id) return null;

    const { data, error } = await window.supabase
      .from("admin_users")
      .select("manv, tenadmin, active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data || data.active === false) return null;

    return {
      manv: String(data.manv || "ADMIN").trim().toUpperCase(),
      tennv: String(data.tenadmin || "ADMIN").trim(),
      is_admin: true,
      quyen_sua_hoadon: true
    };
  } catch {
    return null;
  }
}

// =======================================================
// 4) LOGIN NHÂN VIÊN
// =======================================================
async function loginEmployee({ cs, manv, password, loginApiPath }) {
  const apiPath = resolveLoginApiPath(loginApiPath, cs);

  const resp = await fetch(apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      manv: String(manv || "").trim().toUpperCase(),
      passwordNV: String(password || ""),
      diadiem: cs
    })
  });

  const result = await resp.json().catch(() => ({}));

  if (!resp.ok || !result?.ok) {
    throw new Error(result?.error || "Đăng nhập nhân viên thất bại");
  }

  const session = result?.session;
  const nhanvien = result?.nhanvien || {};
  const diadiem = result?.diadiem || cs;

  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("Server không trả session hợp lệ");
  }

  const { error: setSessionError } = await window.supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });

  if (setSessionError) {
    throw new Error("Không set được session");
  }

  return {
    diadiem,
    manv: String(nhanvien.manv || manv || "").trim().toUpperCase(),
    tennv: String(nhanvien.tennv || "").trim(),
    is_admin: false,
    quyen_sua_hoadon: !!nhanvien.sua_hoadon
  };
}

// =======================================================
// 5) LOGIN ADMIN
// =======================================================
async function loginAdmin({ cs, email, password }) {
  const { data, error } = await window.supabase.auth.signInWithPassword({
    email: String(email || "").trim().toLowerCase(),
    password: String(password || "")
  });

  if (error || !data?.session) {
    console.error("[loginAdmin] Supabase signIn error:", error);
    throw new Error(error?.message || "Đăng nhập admin thất bại");
  }

  const isAdmin = await checkIsAdminBestEffort();
  if (!isAdmin) {
    await window.supabase.auth.signOut().catch(() => { });
    throw new Error("Tài khoản không có quyền admin");
  }

  const profile = await readAdminProfile();
  if (!profile) {
    await window.supabase.auth.signOut().catch(() => { });
    throw new Error("Không đọc được hồ sơ admin");
  }

  return {
    diadiem: cs,
    manv: profile.manv,
    tennv: profile.tennv,
    is_admin: true,
    quyen_sua_hoadon: true
  };
}

// =======================================================
// 6) LOGOUT
// =======================================================
export async function logoutAndClear() {
  try {
    await window.supabase.auth.signOut();
  } catch { }

  clearUiProfile();

  try {
    window.diadiem = "";
    window.manv = "";
    window.tennv = "";
    window.is_admin = false;
  } catch { }
}

// =======================================================
// 7) RENDER FORM LOGIN
// =======================================================
function renderLoginForm(rootEl, options = {}) {
  const {
    defaultBranch = "cs1",
    lockBranch = false
  } = options;

  rootEl.innerHTML = `
    <form id="auth-login-form">
      <label for="login-cs">Cơ sở</label>
      <select id="login-cs">
        <option value="">-- Chọn cơ sở --</option>
        <option value="cs1">Cơ sở 1</option>
        <option value="cs2">Cơ sở 2</option>
      </select>

      <label for="login-id">Mã nhân viên hoặc email admin</label>
      <input
        id="login-id"
        type="text"
        autocomplete="username"
        placeholder="Ví dụ: NV01 hoặc admin@email.com"
      />

      <label for="login-password">Mật khẩu</label>
      <input
        id="login-password"
        type="password"
        autocomplete="current-password"
        placeholder="Nhập mật khẩu"
      />

      <button type="submit">Đăng nhập</button>
      <div id="login-error"></div>
    </form>
  `;

  const csEl = document.getElementById("login-cs");
  if (csEl) {
    csEl.value = defaultBranch || "cs1";
    csEl.disabled = !!lockBranch;
  }
}

// =======================================================
// 8) LOGIN PAGE MODE
// =======================================================
export async function initLoginPage(options = {}) {
  const {
    loginRootId = "login-root",
    defaultBranch = "cs1",
    lockBranch = false,
    loginApiPath = null
  } = options;

  const root = document.getElementById(loginRootId);
  if (!root) {
    throw new Error(`Không tìm thấy #${loginRootId}`);
  }

  renderLoginForm(root, { defaultBranch, lockBranch });

  const form = document.getElementById("auth-login-form");
  const csEl = document.getElementById("login-cs");
  const idEl = document.getElementById("login-id");
  const pwEl = document.getElementById("login-password");
  const errorEl = document.getElementById("login-error");

  // Nếu đã có session sẵn thì chuyển luôn
  try {
    const { data } = await window.supabase.auth.getSession();
    if (data?.session?.user) {
      const redirect = getRedirectUrl("/");
      location.replace(redirect);
      return;
    }
  } catch { }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cs = String(csEl?.value || "").trim().toLowerCase();
    const identifier = String(idEl?.value || "").trim();
    const password = String(pwEl?.value || "").trim();

    errorEl.style.color = "#c62828";
    errorEl.textContent = "";

    if (!cs) {
      errorEl.textContent = "Vui lòng chọn cơ sở";
      return;
    }

    if (!identifier) {
      errorEl.textContent = "Vui lòng nhập mã nhân viên hoặc email";
      return;
    }

    if (!password) {
      errorEl.textContent = "Vui lòng nhập mật khẩu";
      return;
    }

    try {
      errorEl.style.color = "#444";
      errorEl.textContent = "Đang đăng nhập...";

      let profile;
      if (identifier.includes("@")) {
        profile = await loginAdmin({
          cs,
          email: identifier,
          password
        });
      } else {
        profile = await loginEmployee({
          cs,
          manv: identifier,
          password,
          loginApiPath
        });
      }

      saveUiProfile(profile);
      syncGlobalsFromProfile(profile);

      const redirect = getRedirectUrl("/");
      location.replace(redirect);
    } catch (err) {
      console.error("[authModule] initLoginPage login error:", err);
      errorEl.style.color = "#c62828";
      errorEl.textContent = err?.message || "Không đăng nhập được";
    }
  });
}

// =======================================================
// 9) GUARD MODE CHO CÁC TRANG NGHIỆP VỤ
// =======================================================
export async function requireAuth(options = {}) {
  const {
    expectedBranch = "",
    onAuthenticated = null
  } = options;

  try {
    const { data } = await window.supabase.auth.getSession();
    const session = data?.session;

    if (!session?.user) {
      goToLoginPage();
      return false;
    }

    let profile = getCurrentUserInfo();

    const isAdmin = await checkIsAdminBestEffort();

    if (isAdmin) {
      const adminProfile = await readAdminProfile();
      if (!adminProfile) {
        await logoutAndClear();
        goToLoginPage();
        return false;
      }

      profile = {
        diadiem: profile.diadiem || expectedBranch || "cs1",
        manv: adminProfile.manv,
        tennv: adminProfile.tennv,
        is_admin: true,
        quyen_sua_hoadon: true
      };

      saveUiProfile(profile);
      syncGlobalsFromProfile(profile);
    } else {
      if (!profile.manv) {
        await logoutAndClear();
        goToLoginPage();
        return false;
      }

      if (expectedBranch && profile.diadiem && profile.diadiem !== expectedBranch) {
        await logoutAndClear();
        alert(`Tài khoản này không đúng cơ sở yêu cầu (${expectedBranch}).`);
        goToLoginPage();
        return false;
      }

      syncGlobalsFromProfile(profile);
    }

    if (typeof onAuthenticated === "function") {
      await onAuthenticated(profile);
    }

    return true;
  } catch (err) {
    console.error("[authModule] requireAuth error:", err);
    goToLoginPage();
    return false;
  }
}
