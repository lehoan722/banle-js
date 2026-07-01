// cafe/scripts/cafe_auth.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

const SUPABASE_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ2x5YnkiLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM";

// Nếu trang cafe đã có supabase client thì dùng lại
if (!window.supabase || !window.supabase.auth) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      storage: localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getCafeCurrentUser() {
  const get = (k) => (sessionStorage.getItem(k) || localStorage.getItem(k) || "").trim();

  return {
    diadiem: get("diadiem") || "cs1",
    manv: get("manv"),
    tennv: get("tennv"),
    is_admin: get("is_admin") === "true",
  };
}

function syncCafeGlobals() {
  const user = getCafeCurrentUser();

  window.diadiem = user.diadiem;
  window.manv = user.manv;
  window.tennv = user.tennv;
  window.is_admin = user.is_admin;
  window.cafeUser = user;

  return user;
}

function clearCafeAuthProfile() {
  ["manv", "tennv", "is_admin"].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

async function checkIsAdmin() {
  try {
    const { data, error } = await window.supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

async function hydrateCafeUserFromSession(macDinhDiaDiem = "cs1") {
  const { data } = await window.supabase.auth.getSession();
  const session = data?.session;

  if (!session) return null;

  const uid = session.user?.id;
  const isAdmin = await checkIsAdmin();

  localStorage.setItem("is_admin", isAdmin ? "true" : "false");

  if (isAdmin) {
    let manv = "ADMIN";
    let tennv = "ADMIN";

    try {
      const { data: prof } = await window.supabase
        .from("admin_users")
        .select("manv, tenadmin, active")
        .eq("user_id", uid)
        .maybeSingle();

      if (prof?.active === false) {
        await window.supabase.auth.signOut();
        clearCafeAuthProfile();
        return null;
      }

      if (prof) {
        manv = String(prof.manv || "ADMIN").trim().toUpperCase();
        tennv = String(prof.tenadmin || manv).trim();
      }
    } catch {}

    localStorage.setItem("manv", manv);
    localStorage.setItem("tennv", tennv);
    localStorage.setItem("is_admin", "true");
  } else {
    try {
      const { data: nv } = await window.supabase
        .from("dmnhanvien")
        .select("manv, tennv, trangthai")
        .eq("user_id", uid)
        .maybeSingle();

      if (nv?.trangthai === false) {
        await window.supabase.auth.signOut();
        clearCafeAuthProfile();
        return null;
      }

      if (nv) {
        localStorage.setItem("manv", String(nv.manv || "").trim().toUpperCase());
        localStorage.setItem("tennv", String(nv.tennv || "").trim());
        localStorage.setItem("is_admin", "false");
      }
    } catch {}
  }

  if (!localStorage.getItem("diadiem")) {
    localStorage.setItem("diadiem", macDinhDiaDiem || "cs1");
  }

  return syncCafeGlobals();
}

async function loginNhanVienCafe(cs, manv, password) {
  if (manv.includes("@")) {
    return { ok: false };
  }

  const resp = await fetch(`/api/login-${cs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      manv,
      passwordNV: password,
      diadiem: cs,
    }),
  });

  const result = await resp.json().catch(() => ({}));

  if (!resp.ok || !result.ok) {
    return { ok: false, error: result?.error || "Đăng nhập thất bại" };
  }

  const { session, nhanvien, diadiem } = result;

  if (!session?.access_token || !session?.refresh_token) {
    return { ok: false, error: "Không nhận được session hợp lệ" };
  }

  const { error } = await window.supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    return { ok: false, error: "Không set được session Supabase" };
  }

  localStorage.setItem("diadiem", diadiem || cs);
  localStorage.setItem("manv", String(nhanvien?.manv || manv).trim().toUpperCase());
  localStorage.setItem("tennv", String(nhanvien?.tennv || "").trim());
  localStorage.setItem("is_admin", "false");

  return { ok: true, user: syncCafeGlobals() };
}

async function loginAdminCafe(cs, email, password) {
  const { data, error } = await window.supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    return { ok: false, error: "Không đăng nhập được" };
  }

  const isAdmin = await checkIsAdmin();

  if (!isAdmin) {
    await window.supabase.auth.signOut();
    return { ok: false, error: "Tài khoản này không có quyền admin" };
  }

  let manv = "ADMIN";
  let tennv = "ADMIN";

  try {
    const uid = data.session.user?.id;

    const { data: prof } = await window.supabase
      .from("admin_users")
      .select("manv, tenadmin, active")
      .eq("user_id", uid)
      .maybeSingle();

    if (prof?.active === false) {
      await window.supabase.auth.signOut();
      return { ok: false, error: "Tài khoản admin đang bị khóa" };
    }

    if (prof) {
      manv = String(prof.manv || "ADMIN").trim().toUpperCase();
      tennv = String(prof.tenadmin || manv).trim();
    }
  } catch {}

  localStorage.setItem("diadiem", cs);
  localStorage.setItem("manv", manv);
  localStorage.setItem("tennv", tennv);
  localStorage.setItem("is_admin", "true");
  localStorage.setItem("last_login_identifier", email);

  return { ok: true, user: syncCafeGlobals() };
}

export function khoiTaoDangNhapCafe(options = {}) {
  const {
    loginContainerId = "cafeLogin",
    appContainerId = "cafeApp",
    macDinhDiaDiem = "cs1",
    onLoginSuccess,
  } = options;

  let loginEl = document.getElementById(loginContainerId);

  if (!loginEl) {
    loginEl = document.createElement("div");
    loginEl.id = loginContainerId;
    document.body.appendChild(loginEl);
  }

  const appEl = document.getElementById(appContainerId);
  if (appEl) appEl.style.display = "none";

  loginEl.style.position = "fixed";
  loginEl.style.inset = "0";
  loginEl.style.zIndex = "999999";
  loginEl.style.background = "#f5f2ec";
  loginEl.style.display = "flex";
  loginEl.style.alignItems = "center";
  loginEl.style.justifyContent = "center";

  loginEl.innerHTML = `
    <div style="
      width: min(360px, calc(100vw - 32px));
      background: #fff;
      border-radius: 18px;
      padding: 26px;
      box-shadow: 0 20px 60px rgba(0,0,0,.18);
      font-family: Arial, sans-serif;
    ">
      <h2 style="margin:0 0 18px;text-align:center;">Đăng nhập Cafe</h2>

      <form id="formCafeLogin">
        <input id="cafeLoginCs" type="hidden" value="" />

        <label>Mã nhân viên </label>
        <input id="cafeLoginUser" type="text" autocomplete="off"
          placeholder="NV01 hoặc email admin"
          style="width:100%;height:42px;margin:6px 0 12px;padding:0 10px;box-sizing:border-box;" />

        <label>Mật khẩu</label>
        <input id="cafeLoginPass" type="password"
          placeholder="Nhập mật khẩu"
          style="width:100%;height:42px;margin:6px 0 16px;padding:0 10px;box-sizing:border-box;" />

        <button type="submit" style="
          width:100%;
          height:44px;
          border:0;
          border-radius:12px;
          background:#1f7a35;
          color:#fff;
          font-weight:700;
          font-size:16px;
        ">Đăng nhập</button>

        <p id="cafeLoginError" style="min-height:22px;color:red;text-align:center;margin:12px 0 0;"></p>
      </form>
    </div>
  `;

  const csEl = document.getElementById("cafeLoginCs");
  const userEl = document.getElementById("cafeLoginUser");
  const passEl = document.getElementById("cafeLoginPass");
  const errorEl = document.getElementById("cafeLoginError");
  const formEl = document.getElementById("formCafeLogin");

  csEl.value = "cs1";
localStorage.setItem("diadiem", "");
  userEl.value = localStorage.getItem("last_login_identifier") || localStorage.getItem("manv") || "";

  function showApp(user) {
    if (appEl) appEl.style.display = "";
    loginEl.style.display = "none";

    const userText = document.querySelector(".cafe-user");
    if (userText) {
      userText.textContent = user.tennv || user.manv || "admin";
    }

    if (typeof onLoginSuccess === "function") {
      onLoginSuccess(user);
    }
  }

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();

    const cs = csEl.value;
    const rawUser = userEl.value.trim();
    const password = passEl.value.trim();

    if (!cs) return (errorEl.textContent = "Vui lòng chọn cơ sở.");
    if (!rawUser) return (errorEl.textContent = "Vui lòng nhập tài khoản.");
    if (!password) return (errorEl.textContent = "Vui lòng nhập mật khẩu.");

    errorEl.style.color = "#555";
    errorEl.textContent = "Đang đăng nhập...";

    try {
      localStorage.setItem("last_login_identifier", rawUser);

      let result;

      if (rawUser.includes("@")) {
        result = await loginAdminCafe(cs, rawUser.toLowerCase(), password);
      } else {
        result = await loginNhanVienCafe(cs, rawUser.toUpperCase(), password);
      }

      if (!result.ok) {
        errorEl.style.color = "red";
        errorEl.textContent = "❌ " + (result.error || "Không đăng nhập được");
        return;
      }

      errorEl.style.color = "green";
      errorEl.textContent = "✅ Đăng nhập thành công";
      showApp(result.user);
    } catch (err) {
      console.error("Cafe login error:", err);
      errorEl.style.color = "red";
      errorEl.textContent = "❌ Không đăng nhập được";
    }
  });

  passEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  userEl.focus();

  (async () => {
    const user = await hydrateCafeUserFromSession(macDinhDiaDiem);
    if (user?.manv || user?.is_admin) {
      showApp(user);
    }
  })();
}

export async function dangXuatCafe() {
  try {
    await window.supabase.auth.signOut();
  } catch {}

  const keepBranch = localStorage.getItem("diadiem");
  const keepId = localStorage.getItem("last_login_identifier");

  clearCafeAuthProfile();

  if (keepBranch) localStorage.setItem("diadiem", keepBranch);
  if (keepId) localStorage.setItem("last_login_identifier", keepId);

  location.reload();
}
