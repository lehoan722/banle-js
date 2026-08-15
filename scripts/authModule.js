// scripts/authModule.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";
import { initCopyDuLieu } from "./copyDuLieu.js";
import { createPasskeyManager } from "./passkeyModule.js";

// =======================================================
// 1) CẤU HÌNH SUPABASE DÙNG CHUNG (frontend anon key)
// =======================================================
const SUPABASE_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM";

// Luôn tái sử dụng 1 instance trên window để đồng bộ session giữa các trang/tab
if (
  !window.supabase ||
  !window.supabase.auth ||
  typeof window.supabase.auth.setSession !== "function"
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      storage: localStorage,   // ✅ giữ đăng nhập lâu dài trên máy riêng
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

// Helper: lấy client Supabase chuẩn (cho page nào muốn dùng chung)
export function getSupabaseClient() {
  return window.supabase;
}

// =======================================================
// 2) HÀM LẤY THÔNG TIN USER HIỆN TẠI (tương thích code cũ)
// =======================================================
// Nhiều trang của anh đang gọi: await authModule.getCurrentUserInfo()
// -> Phải tồn tại hàm này để không bị TypeError.
export function getCurrentUserInfo() {
  const get = (k) => (sessionStorage.getItem(k) || localStorage.getItem(k) || "").trim();
  return {
    diadiem: get("diadiem"),
    manv: get("manv"),
    tennv: get("tennv"),
    is_admin: (sessionStorage.getItem("is_admin") || localStorage.getItem("is_admin")) === "true",
    quyen_sua_hoadon: (sessionStorage.getItem("quyen_sua_hoadon") || localStorage.getItem("quyen_sua_hoadon")) === "true",
  };
}

function clearLocalAuthProfile({ keepBranch = true, keepIdentifier = true } = {}) {
  const savedBranch = keepBranch ? (localStorage.getItem("diadiem") || "") : "";
  const savedIdentifier = keepIdentifier ? (localStorage.getItem("last_login_identifier") || "") : "";

  [
    "manv",
    "tennv",
    "is_admin",
    "quyen_sua_hoadon"
  ].forEach((k) => {
    try { localStorage.removeItem(k); } catch { }
    try { sessionStorage.removeItem(k); } catch { }
  });

  if (keepBranch && savedBranch) localStorage.setItem("diadiem", savedBranch);
  if (keepIdentifier && savedIdentifier) localStorage.setItem("last_login_identifier", savedIdentifier);
}

let authStateListenerRegistered = false;

function registerAuthStateListener() {
  if (authStateListenerRegistered) return;
  authStateListenerRegistered = true;

  window.supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === "SIGNED_OUT" || !session) {
        clearLocalAuthProfile({ keepBranch: true, keepIdentifier: true });
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        // Không cần tự lưu access/refresh token nữa.
        // Session đã do supabase-js tự persist bằng localStorage.
      }
    } catch (err) {
      console.warn("onAuthStateChange error:", err);
    }
  });
}

// =======================================================
// 3) HÀM HỖ TRỢ HYDRATE USER TỪ SESSION SUPABASE
// =======================================================
// Session nay do supabase-js tự persist bằng localStorage.
// App chỉ cần đọc session hiện tại và nạp lại thông tin user/admin vào localStorage.

function syncGlobalsFromLocalStorageGlobal() {
  try {
    window.diadiem = localStorage.getItem("diadiem") || "";
    window.manv = localStorage.getItem("manv") || "";
    window.tennv = localStorage.getItem("tennv") || "";
    window.is_admin = localStorage.getItem("is_admin") === "true";
  } catch { }
}

async function checkIsAdminBestEffortGlobal() {
  try {
    const { data, error } = await window.supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

async function hydrateCurrentUserFromSession(macDinhDiaDiem = "cs1") {
  const { data } = await window.supabase.auth.getSession();
  const session = data?.session;
  if (!session) return { session: null, isAdmin: false };

  const uid = session?.user?.id || null;
  const isAdmin = await checkIsAdminBestEffortGlobal();

  localStorage.setItem("is_admin", isAdmin ? "true" : "false");

  if (isAdmin) {
    try {
      if (uid) {
        const { data: prof, error: profErr } = await window.supabase
          .from("admin_users")
          .select("manv, tenadmin, active")
          .eq("user_id", uid)
          .maybeSingle();

        if (!profErr && prof) {
          if (prof.active === false) {
            await window.supabase.auth.signOut().catch(() => { });
            throw new Error("Tài khoản admin đang bị khóa");
          }

          const manvAdmin = String(prof.manv || "ADMIN").trim().toUpperCase();
          const tenAdmin = String(prof.tenadmin || manvAdmin).trim();

          localStorage.setItem("manv", manvAdmin);
          localStorage.setItem("tennv", tenAdmin);
          localStorage.setItem("quyen_sua_hoadon", "true");
          localStorage.setItem("is_admin", "true");
        } else {
          localStorage.setItem("quyen_sua_hoadon", "true");
          localStorage.setItem("is_admin", "true");
        }
      }
    } catch (e) {
      console.warn("hydrate admin error:", e);
      localStorage.setItem("quyen_sua_hoadon", "true");
      localStorage.setItem("is_admin", "true");
    }
  } else {
    try {
      if (uid) {
        const { data: nv, error: nvErr } = await window.supabase
          .from("dmnhanvien")
          .select("manv, tennv, sua_hoadon, xoa_hoadon, trangthai")
          .eq("user_id", uid)
          .maybeSingle();

        if (!nvErr && nv) {
          if (nv.trangthai === false) {
            await window.supabase.auth.signOut().catch(() => { });
            throw new Error("Tài khoản nhân viên đang bị khóa");
          }

          localStorage.setItem("manv", String(nv.manv || "").trim().toUpperCase());
          localStorage.setItem("tennv", String(nv.tennv || "").trim());
          localStorage.setItem("quyen_sua_hoadon", nv.sua_hoadon ? "true" : "false");
          localStorage.setItem("is_admin", "false");
        } else {
          localStorage.setItem("is_admin", "false");
          localStorage.setItem(
            "quyen_sua_hoadon",
            localStorage.getItem("quyen_sua_hoadon") || "false"
          );
        }
      }
    } catch (e) {
      console.warn("hydrate nv error:", e);
      localStorage.setItem("is_admin", "false");
    }
  }

  if (!localStorage.getItem("diadiem")) {
    localStorage.setItem("diadiem", macDinhDiaDiem || "cs1");
  }

  syncGlobalsFromLocalStorageGlobal();
  return { session, isAdmin };
}

// =======================================================
// 4) MODULE ĐĂNG NHẬP DÙNG CHUNG
// =======================================================
export function khoiTaoDangNhapDungChung(options = {}) {
  const {
    loginContainerId = "login-container",
    appContainerId = "app-container",
    macDinhDiaDiem = "cs1",
    tuDongKhoaCoSo = false,
    loginApiPath = null,
    onLoginSuccess,
  } = options;

  // ===== PASSKEY POC =====
  // Client danh tính riêng, KHÔNG ghi đè session Supabase nghiệp vụ/warehouse.
  const passkeyManager = createPasskeyManager({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_KEY,
  });

  // ✅ đăng ký 1 lần để các trang gọi window.capNhatQuyenGiaoDien()
  registerAuthStateListener();
  registerGlobalUiPermissionHook();

  // Tạo/đảm bảo có div login
  let loginContainer = document.getElementById(loginContainerId);
  if (!loginContainer) {
    loginContainer = document.createElement("div");
    loginContainer.id = loginContainerId;
    document.body.appendChild(loginContainer);
  }

  // Style overlay
  loginContainer.style.position = "fixed";
  loginContainer.style.top = "0";
  loginContainer.style.left = "0";
  loginContainer.style.width = "100%";
  loginContainer.style.height = "100%";
  loginContainer.style.background = "#fff";
  loginContainer.style.display = "flex";
  loginContainer.style.flexDirection = "column";
  loginContainer.style.alignItems = "center";
  loginContainer.style.justifyContent = "center";
  loginContainer.style.zIndex = "99999";

  // App ẩn lúc chưa login (sẽ bật lại nếu auto session)
  const appContainer = document.getElementById(appContainerId);
  if (appContainer) appContainer.style.display = "none";

  // 1 FORM: “Mã nhân viên (hoặc email admin)” + “Mật khẩu”
  loginContainer.innerHTML = `
  <div style="background:#f9f9f9; padding:30px; border-radius:8px; box-shadow:0 0 10px #ccc; min-width:280px;">
    <h2>Đăng nhập</h2>
    <form id="form-login-dungchung">
      <label>Cơ sở:</label><br />
      <select id="login-cs" style="width:100%; padding:6px; margin-bottom:8px;">
        <option value="">-- Chọn cơ sở --</option>
        <option value="cs1">Cơ sở 1</option>
        <option value="cs2">Cơ sở 2</option>
      </select>

      <label for="login-manv">Mã nhân viên / Email admin</label><br />
      <input type="text" id="login-manv" autocomplete="off" list="email-suggest"
             placeholder="Ví dụ: NV01 hoặc admin@email.com" required
             style="width:100%;padding:6px;margin-bottom:8px;" /><br />
      <datalist id="email-suggest"></datalist>

      <label for="login-password-nv">Mật khẩu</label><br />
      <input type="password" id="login-password-nv"
             placeholder="Nhập mật khẩu"
             style="width:100%;padding:6px;margin-bottom:12px;" /><br />

      <button type="button" id="btn-login-passkey"
              style="padding:8px 16px; margin-right:8px; background:#111827; color:white; border:0; border-radius:6px;">
        🔐 Khuôn mặt / vân tay
      </button>
      <button type="submit" style="padding:8px 16px;">Đăng nhập bằng mật khẩu</button>
      <div style="font-size:12px;color:#666;margin-top:8px;line-height:1.35;">
        Lần đầu vẫn đăng nhập bằng mật khẩu để thiết lập Passkey.
      </div>
      <p id="login-error" style="color:red; margin-top:10px;"></p>
    </form>
  </div>
  `;

  const csSelect = document.getElementById("login-cs");
  const manvInput = document.getElementById("login-manv");
  const passInput = document.getElementById("login-password-nv");
  const errorEl = document.getElementById("login-error");
  const form = document.getElementById("form-login-dungchung");
  const btnPasskey = document.getElementById("btn-login-passkey");

  if (btnPasskey && !passkeyManager.isSupported()) {
    btnPasskey.disabled = true;
    btnPasskey.title = "Thiết bị/trình duyệt chưa hỗ trợ Passkey hoặc trang chưa chạy HTTPS";
    btnPasskey.style.opacity = "0.55";
  }

  // ===== Email dropdown gợi ý (vừa chọn vừa gõ) =====
  const emailDatalist = document.getElementById("email-suggest");
  const FIXED_ADMIN_EMAILS = [
    "nguyenanhtuyet140175@gmail.com",
    "danghoanghai02@gmail.com",
    "lehoan722@gmail.com",
  ];

  function readEmailHistory() {
    try {
      return JSON.parse(localStorage.getItem("email_suggest_history") || "[]");
    } catch {
      return [];
    }
  }
  function writeEmailHistory(list) {
    try {
      localStorage.setItem(
        "email_suggest_history",
        JSON.stringify(list.slice(0, 10))
      );
    } catch { }
  }
  function addEmailToHistory(email) {
    const e = (email || "").trim();
    if (!e || !e.includes("@")) return;
    const cur = readEmailHistory();
    const next = [e, ...cur.filter((x) => x !== e)];
    writeEmailHistory(next);
  }
  function renderEmailDatalist() {
    if (!emailDatalist) return;
    const history = readEmailHistory();
    const last = (localStorage.getItem("last_login_identifier") || "").trim();
    const merged = [
      ...FIXED_ADMIN_EMAILS,
      ...(last.includes("@") ? [last] : []),
      ...history,
    ];
    const uniq = [];
    for (const x of merged) {
      const v = (x || "").trim();
      if (!v) continue;
      if (!uniq.includes(v)) uniq.push(v);
    }
    emailDatalist.innerHTML = uniq.map((v) => `<option value="${v}"></option>`).join("");
  }
  renderEmailDatalist();

  // Set default cơ sở (ưu tiên localStorage)
  try {
    const savedBranch = (localStorage.getItem("diadiem") || "").trim().toLowerCase();
    if (savedBranch) csSelect.value = savedBranch;

    else if (macDinhDiaDiem) csSelect.value = macDinhDiaDiem;
  } catch {
    if (macDinhDiaDiem) csSelect.value = macDinhDiaDiem;
  }

  if (tuDongKhoaCoSo) csSelect.disabled = true;

  function showAppAfterLogin(nhanvienLike, context) {
    const hook =
      typeof onLoginSuccess === "function"
        ? Promise.resolve(onLoginSuccess(nhanvienLike, context))
        : Promise.resolve(true);

    hook
      .then((res) => {
        if (res === false) return;
        syncGlobalsFromLocalStorageGlobal();

        // Nếu là trang cần xác thực lại thì đánh dấu đã unlock trong tab này
        try {
          if (isReAuthRequiredPage()) setCcnUnlockedForThisTab();
        } catch { }

        // ✅ áp quyền UI ngay sau login/auto-session
        try { window.capNhatQuyenGiaoDien?.(); } catch { }
        try {
          initCopyDuLieu();
        } catch (e) {
          console.warn("Không khởi tạo được module copy dữ liệu:", e);
        }

        if (appContainer) appContainer.style.display = "";
        loginContainer.style.display = "none";
      })
      .catch(console.error);
  }

  function resolveLoginApiPath(cs) {
    try {
      if (typeof loginApiPath === "function") return loginApiPath(cs);
      if (loginApiPath && typeof loginApiPath === "object") return loginApiPath[cs];
      if (typeof loginApiPath === "string" && loginApiPath.trim()) return loginApiPath.trim();
    } catch { }
    return `/api/login-${cs}`;
  }


  function isReAuthRequiredPage() {
    const p = (location.pathname || "").toLowerCase();

    // Các trang nhạy cảm: đã có session chung vẫn phải xác thực lại trong tab này
    return (
      p.includes("kiem_nhapkho_cs1") ||
      p.includes("kiem_nhapkho_cs2") ||
      p.includes("chamcongcs1") ||
      p.includes("chamcongcs2") ||
      p.includes("banlemtcs1") ||
      p.includes("banlemtcs2")
    );
  }

  function getCcnUnlockKey() {
    // khóa theo từng trang + từng tab
    const p = (location.pathname || "").toLowerCase();
    return `ccn_unlocked:${p}`;
  }

  function isCcnUnlockedInThisTab() {
    try { return sessionStorage.getItem(getCcnUnlockKey()) === "1"; } catch { return false; }
  }

  function setCcnUnlockedForThisTab() {
    try { sessionStorage.setItem(getCcnUnlockKey(), "1"); } catch { }
  }

  function clearAuthMemoryForThisPage() {
    // Chỉ xóa profile local của app tại trang này nếu cần
    // Không đụng vào session Supabase toàn cục
    clearLocalAuthProfile({ keepBranch: true, keepIdentifier: true });

    // Xóa cờ unlock của tab hiện tại để lần vào lại trang nhạy cảm phải xác thực lại
    try { sessionStorage.removeItem(getCcnUnlockKey()); } catch { }
  }

  async function tryEmployeeLogin(cs, manvUpper, password) {
    if (String(manvUpper || "").includes("@")) {
      return { ok: false, error: "SKIP_EMPLOYEE_LOGIN_FOR_EMAIL" };
    }

    const resp = await fetch(resolveLoginApiPath(cs), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manv: manvUpper, passwordNV: password, diadiem: cs }),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.ok) {
      return { ok: false, error: result?.error || "Đăng nhập thất bại" };
    }

    const { session, nhanvien, diadiem } = result;
    if (!session?.access_token || !session?.refresh_token) {
      return { ok: false, error: "Không nhận được session hợp lệ từ server" };
    }

    // Set session Supabase ở frontend
    const { data: setSessionData, error: setSessionError } = await window.supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (setSessionError) {
      console.error("Lỗi setSession:", setSessionError);
      return { ok: false, error: "Không set được session Supabase" };
    }

    const csFinal = diadiem || cs;

    // IMPORTANT: nhân viên luôn is_admin=false (không tin dmnhanvien.is_admin trên client)
    localStorage.setItem("diadiem", csFinal);
    localStorage.setItem("manv", (nhanvien?.manv || manvUpper || "").trim().toUpperCase());
    localStorage.setItem("tennv", String(nhanvien?.tennv || "").trim());
    localStorage.setItem("quyen_sua_hoadon", nhanvien?.sua_hoadon ? "true" : "false");
    localStorage.setItem("is_admin", "false");

    syncGlobalsFromLocalStorageGlobal();

    return {
      ok: true,
      nhanvienLike: { ...(nhanvien || {}), is_admin: false },
      context: { diadiem: csFinal, nhanvien, session: setSessionData?.session || session },
    };
  }

  async function tryAdminLogin(cs, email, password) {
    const { data: signInData, error: signInError } = await window.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session) {
      return { ok: false, error: "Không đăng nhập được" };
    }

    const isAdmin = await checkIsAdminBestEffortGlobal();
    if (!isAdmin) {
      await window.supabase.auth.signOut().catch(() => { });
      return { ok: false, error: "Không được phép đăng nhập" };
    }

    // Load profile admin
    let manvAdmin = "ADMIN";
    let tenAdmin = "ADMIN";

    try {
      const uid = signInData?.user?.id || signInData?.session?.user?.id;
      if (uid) {
        const { data: prof, error: profErr } = await window.supabase
          .from("admin_users")
          .select("manv, tenadmin, active")
          .eq("user_id", uid)
          .maybeSingle();

        if (!profErr && prof) {
          if (prof.active === false) {
            await window.supabase.auth.signOut().catch(() => { });
            return { ok: false, error: "Tài khoản admin đang bị khóa" };
          }
          manvAdmin = String(prof.manv || "ADMIN").trim().toUpperCase();
          tenAdmin = String(prof.tenadmin || manvAdmin).trim();
        }
      }
    } catch (e) {
      console.warn("Không lấy được profile admin_users:", e);
    }

    localStorage.setItem("diadiem", cs);
    localStorage.setItem("is_admin", "true");
    localStorage.setItem("manv", manvAdmin);
    localStorage.setItem("tennv", tenAdmin);
    localStorage.setItem("quyen_sua_hoadon", "true");

    addEmailToHistory(email);
    syncGlobalsFromLocalStorageGlobal();

    return {
      ok: true,
      nhanvienLike: { manv: manvAdmin, tennv: tenAdmin, is_admin: true, sua_hoadon: true, xoa_hoadon: true },
      context: { diadiem: cs, nhanvien: { manv: manvAdmin, tennv: tenAdmin, is_admin: true }, session: signInData.session },
    };
  }

  async function apDungKetQuaPasskey(result, cs) {
    if (!result?.ok || !result?.appSession?.access_token || !result?.appSession?.refresh_token) {
      throw new Error("Kết quả Passkey không có session hợp lệ");
    }

    // Chuyển session danh tính -> session app chính.
    // Employee: appSession là warehouse session.
    // Admin: appSession là session admin cá nhân.
    const { data: setData, error: setErr } = await window.supabase.auth.setSession({
      access_token: result.appSession.access_token,
      refresh_token: result.appSession.refresh_token,
    });
    if (setErr) throw setErr;

    const p = result.profile || {};
    const isAdmin = result.kind === "admin" || p.is_admin === true;

    localStorage.setItem("diadiem", cs || macDinhDiaDiem || "cs1");
    localStorage.setItem("manv", String(p.manv || "").trim().toUpperCase());
    localStorage.setItem("tennv", String(p.tennv || "").trim());
    localStorage.setItem("quyen_sua_hoadon", p.sua_hoadon ? "true" : "false");
    localStorage.setItem("is_admin", isAdmin ? "true" : "false");
    localStorage.setItem("last_login_identifier", String(p.manv || "PASSKEY"));

    syncGlobalsFromLocalStorageGlobal();

    return {
      nhanvienLike: {
        ...p,
        is_admin: isAdmin,
      },
      context: {
        diadiem: cs || macDinhDiaDiem || "cs1",
        nhanvien: p,
        session: setData?.session || result.appSession,
        login_method: "passkey",
      },
    };
  }

  async function dangNhapBangPasskey() {
    const cs = (csSelect.value || macDinhDiaDiem || "cs1").toLowerCase();
    errorEl.style.color = "#333";
    errorEl.textContent = "Đang chờ xác nhận khuôn mặt / vân tay…";
    if (btnPasskey) btnPasskey.disabled = true;

    try {
      const result = await passkeyManager.signIn({ diadiem: cs });
      const normalized = await apDungKetQuaPasskey(result, cs);

      errorEl.style.color = "green";
      errorEl.textContent = `✅ Đã xác nhận ${normalized.nhanvienLike?.manv || "người dùng"}`;
      showAppAfterLogin(normalized.nhanvienLike, normalized.context);
    } catch (err) {
      console.error("Passkey login error:", err);
      errorEl.style.color = "red";
      errorEl.textContent = "❌ Không xác nhận được Passkey. Anh/chị có thể đăng nhập bằng mật khẩu.";
    } finally {
      if (btnPasskey) btnPasskey.disabled = !passkeyManager.isSupported();
    }
  }

  async function goiYDangKyPasskeySauPassword({ kind, identifier, password, cs }) {
    if (!passkeyManager.isSupported()) return;

    const key = `passkey_enrolled_hint:${String(identifier || "").toLowerCase()}`;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch { }

    // Chỉ POC trên banlemtcs1 trước. Khi test ổn có thể bỏ điều kiện này để áp dụng toàn hệ thống.
    const path = (location.pathname || "").toLowerCase();
    if (!path.includes("banlemtcs1")) return;

    setTimeout(async () => {
      const ok = window.confirm(
        "Bật đăng nhập nhanh bằng khuôn mặt / vân tay trên thiết bị này?\n\n" +
        "Lần sau có thể dùng Passkey thay cho việc nhập lại mật khẩu."
      );
      if (!ok) return;

      try {
        if (kind === "admin") {
          await passkeyManager.enrollAdmin({ email: identifier, password });
        } else {
          await passkeyManager.enrollEmployee({ manv: identifier, password, diadiem: cs });
        }
        try { localStorage.setItem(key, "1"); } catch { }
        alert("✅ Đã thiết lập đăng nhập khuôn mặt / vân tay thành công trên tài khoản này.");
      } catch (err) {
        console.error("Passkey enroll error:", err);
        const code = err?.code || "";
        if (code === "webauthn_credential_exists" || String(err?.message || "").includes("already")) {
          try { localStorage.setItem(key, "1"); } catch { }
          alert("Passkey này đã được đăng ký trước đó.");
          return;
        }
        alert("Chưa thiết lập được Passkey: " + (err?.message || "Lỗi không xác định"));
      }
    }, 700);
  }

  if (btnPasskey) {
    btnPasskey.addEventListener("click", dangNhapBangPasskey);
  }

  async function xuLyDangNhap(e) {
    e.preventDefault();

    const cs = csSelect.value;
    const rawId = (manvInput.value || "").trim();
    const password = (passInput.value || "").trim();

    errorEl.style.color = "red";

    if (!cs) return (errorEl.textContent = "Vui lòng chọn cơ sở!");
    if (!rawId) return (errorEl.textContent = "Vui lòng nhập mã nhân viên hoặc email!");
    if (!password) return (errorEl.textContent = "Vui lòng nhập mật khẩu!");

    try {
      localStorage.setItem("last_login_identifier", rawId);
    } catch { }

    errorEl.textContent = "Đang xác thực, vui lòng đợi…";

    const looksLikeEmail = rawId.includes("@");

    // A) Thử login nhân viên trước
    try {
      const manvUpper = rawId.toUpperCase();
      const emp = await tryEmployeeLogin(cs, manvUpper, password);
      if (emp.ok) {
        errorEl.style.color = "green";
        errorEl.textContent = "✅ Đăng nhập thành công!";
        showAppAfterLogin(emp.nhanvienLike, emp.context);
        goiYDangKyPasskeySauPassword({
          kind: "employee",
          identifier: manvUpper,
          password,
          cs,
        });
        return;
      }

      if (!looksLikeEmail) {
        errorEl.textContent = "❌ Không đăng nhập được";
        return;
      }
    } catch (err) {
      if (!looksLikeEmail) {
        console.error(err);
        errorEl.textContent = "❌ Không đăng nhập được";
        return;
      }
    }

    // B) Thử login admin
    try {
      const email = rawId.toLowerCase();
      const adm = await tryAdminLogin(cs, email, password);
      if (!adm.ok) {
        errorEl.textContent = "❌ " + (adm.error || "Không đăng nhập được");
        return;
      }
      errorEl.style.color = "green";
      errorEl.textContent = "✅ Đăng nhập thành công!";
      showAppAfterLogin(adm.nhanvienLike, adm.context);
      goiYDangKyPasskeySauPassword({
        kind: "admin",
        identifier: email,
        password,
        cs,
      });
    } catch (err) {
      console.error(err);
      errorEl.textContent = "❌ Không đăng nhập được";
    }
  }

  form.addEventListener("submit", xuLyDangNhap);

  // =======================================================
  // AUTO: nếu đã có session (hoặc phục hồi được session) -> bỏ qua login overlay
  // =======================================================
  (async () => {
    try {
      // ✅ Nếu là trang chuyển chi nhánh: không nhớ đăng nhập, không auto điền
      // ✅ Trang chuyển chi nhánh: bắt xác nhận lại (unlock theo tab), KHÔNG xóa nhớ đăng nhập
      if (isReAuthRequiredPage() && !isCcnUnlockedInThisTab()) {
        // đảm bảo overlay login vẫn hiện, app vẫn ẩn
        if (appContainer) appContainer.style.display = "none";
        loginContainer.style.display = "flex";

        // có thể cho phép auto-fill manv/cs (tùy bạn thích), nhưng tuyệt đối không auto-pass
        // không tryRestoreSessionFromLegacyTokens, không getSession để auto-pass
        return;
      }

      // ====== (phần code cũ giữ nguyên từ đây trở xuống) ======
      const savedId =
        localStorage.getItem("last_login_identifier") ||
        localStorage.getItem("manv") ||
        "";
      const savedBranch = localStorage.getItem("diadiem") || "";
      if (savedId) manvInput.value = savedId;
      if (savedBranch) csSelect.value = savedBranch;

      const { session } = await hydrateCurrentUserFromSession(macDinhDiaDiem);
      if (!session) return;

      showAppAfterLogin(getCurrentUserInfo(), {
        diadiem: localStorage.getItem("diadiem") || macDinhDiaDiem,
        session,
      });

    } catch {
      // ignore
    } finally {
      manvInput.focus();
    }
  })();

  // Enter UX
  manvInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      passInput?.focus();
    }
  });

  passInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    }
  });
}

// ======================================================= 
// 5) ĐĂNG XUẤT DÙNG CHUNG
// =======================================================
// ==== 3. HÀM ĐĂNG XUẤT DÙNG CHUNG ====
export async function dangXuatDungChung(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    clearDraft = true,
    reloadPage = true, // ✅ mặc định: logout xong reload luôn cho ổn định
  } = options;

  // 1) Sign out Supabase
  try {
    if (window.supabase && window.supabase.auth) {
      await window.supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('Lỗi khi signOut Supabase:', err);
  }

  // 2) Chỉ xóa key liên quan auth (không clear all để khỏi mất config khác)
  const keepBranch = localStorage.getItem('diadiem');
  const keepId = localStorage.getItem('last_login_identifier');

  localStorage.removeItem('manv');
  localStorage.removeItem('tennv');
  localStorage.removeItem('is_admin');
  localStorage.removeItem('quyen_sua_hoadon');

  try {
    const p = (location.pathname || "").toLowerCase();
    sessionStorage.removeItem(`ccn_unlocked:${p}`);
  } catch (e) { }

  // sessionStorage: xóa sạch cho chắc (reload cũng sẽ sạch)
  try { sessionStorage.clear(); } catch (e) { }

  // giữ lại cơ sở + identifier để lần sau chọn nhanh
  if (keepBranch) localStorage.setItem('diadiem', keepBranch);
  if (keepId) localStorage.setItem('last_login_identifier', keepId);

  // 3) Ẩn app / hiện login (phòng trường hợp reload bị chặn)
  const loginContainer = document.getElementById(loginContainerId);
  const appContainer = document.getElementById(appContainerId);
  if (loginContainer) loginContainer.style.display = '';
  if (appContainer) appContainer.style.display = 'none';

  // 4) Xóa draft nếu muốn
  if (clearDraft) {
    localStorage.removeItem('draft_hoadon');
    try { sessionStorage.removeItem('draft_hoadon'); } catch (e) { }
  }

  // 5) ✅ Ổn định nhất: reload trang để tránh bị init/lắng nghe sự kiện nhiều lần
  if (reloadPage) {
    try {
      location.reload();
    } catch (e) {
      // ignore
    }
  }
}

// =======================================================
// 2.1) PHÂN QUYỀN UI BÁN LẺ: chỉ ADMIN được sửa #sohd, #chietkhau
// =======================================================
export function applyBanLeHeaderEditPermission(options = {}) {
  const {
    sohdSelector = "#sohd",
    chietkhauSelector = "#chietkhau",
    // nếu sau này muốn mở rộng thêm ô khác thì thêm vào đây
  } = options;

  const info = getCurrentUserInfo();
  const isAdmin = !!info.is_admin;

  const lockInput = (el, locked, reasonText) => {
    if (!el) return;

    // locked = true => chỉ xem
    // locked = false => admin sửa được
    el.readOnly = !!locked;

    // gợi ý UX
    if (locked) {
      el.setAttribute("data-locked-by-role", "1");
      el.title = reasonText || "Chỉ ADMIN mới được phép chỉnh sửa ô này.";
      // vẫn cho copy nên KHÔNG dùng disabled
      // chặn một số trình duyệt/tiện ích vẫn cố set value qua UI
      el.addEventListener(
        "keydown",
        (e) => {
          // cho phép Ctrl/Cmd + C/A và phím điều hướng
          const k = e.key;
          const ctrl = e.ctrlKey || e.metaKey;
          const okKeys = ["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
          if (ctrl && (k.toLowerCase() === "c" || k.toLowerCase() === "a")) return;
          if (okKeys.includes(k)) return;
          // chặn nhập liệu
          e.preventDefault();
        },
        { passive: false }
      );
    } else {
      el.removeAttribute("data-locked-by-role");
      el.title = "";
      // readOnly=false là đủ để admin sửa
    }
  };

  const sohdEl = document.querySelector(sohdSelector);
  const ckEl = document.querySelector(chietkhauSelector);

  // Nhân viên: khóa; Admin: mở
  const locked = !isAdmin;
  const msg = "Chỉ ADMIN mới được phép chỉnh sửa.";
  lockInput(sohdEl, locked, msg);
  lockInput(ckEl, locked, msg);

  return { isAdmin, locked };
}

// helper legacy: để các trang cũ chỉ cần gọi window.capNhatQuyenGiaoDien()
export function registerGlobalUiPermissionHook() {
  try {
    window.capNhatQuyenGiaoDien = function () {
      // an toàn: trang nào không có #sohd hoặc #chietkhau thì hàm tự bỏ qua
      applyBanLeHeaderEditPermission();
    };
  } catch { }
}



