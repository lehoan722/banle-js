// scripts/authModule.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

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
      storage: sessionStorage,   // ✅ tách session theo từng tab
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

// =======================================================
// 3) ĐỒNG BỘ / KHÔI PHỤC SESSION KHI MỞ TAB/TRANG MỚI
// =======================================================
// Vì dự án của anh có trang dùng supabaseClient.js (có thể dùng sessionStorage),
// nên ta giữ 2 key "legacy" để phục hồi session trên mọi trang:
//
// - supabase_access_token
// - supabase_refresh_token
//
// Khi mở tab mới: nếu Supabase chưa có session nhưng 2 key này còn,
// sẽ gọi setSession() để khôi phục (không cần nhập mật khẩu lại).
async function tryRestoreSessionFromLegacyTokens() {
  try {
    const at = localStorage.getItem("supabase_access_token") || "";
    const rt = localStorage.getItem("supabase_refresh_token") || "";
    if (!at || !rt) return false;

    const { error } = await window.supabase.auth.setSession({
      access_token: at,
      refresh_token: rt,
    });
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

// =======================================================
// 4) MODULE ĐĂNG NHẬP DÙNG CHUNG
// =======================================================
export function khoiTaoDangNhapDungChung(options = {}) {
  const {
    loginContainerId = "login-container",
    appContainerId = "app-container",
    macDinhDiaDiem = "cs1",
    tuDongKhoaCoSo = true,
    loginApiPath = null,
    onLoginSuccess,
  } = options;

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

      <button type="submit" style="padding: 8px 16px;">Đăng nhập</button>
      <p id="login-error" style="color:red; margin-top:10px;"></p>
    </form>
  </div>
  `;

  const csSelect = document.getElementById("login-cs");
  const manvInput = document.getElementById("login-manv");
  const passInput = document.getElementById("login-password-nv");
  const errorEl = document.getElementById("login-error");
  const form = document.getElementById("form-login-dungchung");

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

  function syncGlobalsFromLocalStorage() {
    try {
      window.diadiem = localStorage.getItem("diadiem") || "";
      window.manv = localStorage.getItem("manv") || "";
      window.tennv = localStorage.getItem("tennv") || "";
      window.is_admin = localStorage.getItem("is_admin") === "true";
    } catch { }
  }

  function showAppAfterLogin(nhanvienLike, context) {
    const hook =
      typeof onLoginSuccess === "function"
        ? Promise.resolve(onLoginSuccess(nhanvienLike, context))
        : Promise.resolve(true);

    hook
      .then((res) => {
        if (res === false) return;
        syncGlobalsFromLocalStorage();
        if (appContainer) appContainer.style.display = "";
        loginContainer.style.display = "none";
      })
      .catch(console.error);
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

  function resolveLoginApiPath(cs) {
    try {
      if (typeof loginApiPath === "function") return loginApiPath(cs);
      if (loginApiPath && typeof loginApiPath === "object") return loginApiPath[cs];
      if (typeof loginApiPath === "string" && loginApiPath.trim()) return loginApiPath.trim();
    } catch { }
    return `/api/login-${cs}`;
  }

  function isForceLoginNoRememberPage() {
    const p = (location.pathname || "").toLowerCase();

    // ✅ Chỉ cần match theo tên file/đường dẫn bạn dùng thực tế
    // Ví dụ: /ccn2v1cs2.html, /ccn1v2cs1.html ...
    return (
      p.includes("ccn1v2") ||
      p.includes("ccn2v1")
    );
  }

  function clearAuthMemoryForThisPage() {
    // Xóa các key “nhớ đăng nhập” của app
    [
      "supabase_access_token",
      "supabase_refresh_token",
      "manv",
      "tennv",
      "is_admin",
      "quyen_sua_hoadon",
      "last_login_identifier",
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch { }
      try { sessionStorage.removeItem(k); } catch { }
    });

    // Xóa token supabase-js (sb-...-auth-token) để không có session auto
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
          localStorage.removeItem(key);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("sb-") && key.includes("-auth-token")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch { }
  }

  function saveSessionLegacy(session) {
    try {
      if (session?.access_token) localStorage.setItem("supabase_access_token", session.access_token);
      if (session?.refresh_token) localStorage.setItem("supabase_refresh_token", session.refresh_token);
    } catch { }
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

    saveSessionLegacy(setSessionData?.session || session);
    syncGlobalsFromLocalStorage();

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

    const isAdmin = await checkIsAdminBestEffort();
    if (!isAdmin) {
      await window.supabase.auth.signOut().catch(() => { });
      return { ok: false, error: "Không được phép đăng nhập" };
    }

    // Load profile admin
    let manvAdmin = prof?.manv ? String(prof.manv).toUpperCase() : null;

    if (!manvAdmin) {
      alert("⚠️ Admin chưa được gán mã nhân viên (manv) trong hệ thống.");
      await supabase.auth.signOut();
      return;
    }

    localStorage.setItem("manv", manvAdmin);
    localStorage.setItem("is_admin", "true");


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

    saveSessionLegacy(signInData.session);
    addEmailToHistory(email);
    syncGlobalsFromLocalStorage();

    return {
      ok: true,
      nhanvienLike: { manv: manvAdmin, tennv: tenAdmin, is_admin: true, sua_hoadon: true, xoa_hoadon: true },
      context: { diadiem: cs, nhanvien: { manv: manvAdmin, tennv: tenAdmin, is_admin: true }, session: signInData.session },
    };
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
      if (isForceLoginNoRememberPage()) {
        clearAuthMemoryForThisPage();

        // đảm bảo overlay login vẫn hiện, app vẫn ẩn
        if (appContainer) appContainer.style.display = "none";
        loginContainer.style.display = "flex";

        // không set manvInput.value, không set csSelect.value từ localStorage
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

      // 1) Nếu supabase chưa có session, thử phục hồi từ legacy tokens
      const { data: pre } = await window.supabase.auth.getSession();
      if (!pre?.session) {
        await tryRestoreSessionFromLegacyTokens();
      }

      // 2) Lấy session lần nữa
      const { data } = await window.supabase.auth.getSession();
      const session = data?.session;
      if (!session) return;

      const uid = session?.user?.id || null;
      const isAdmin = await checkIsAdminBestEffort();

      // ✅ CHỐT is_admin đúng theo RPC (an toàn nhất)
      localStorage.setItem("is_admin", isAdmin ? "true" : "false");

      if (isAdmin) {
        // --- hydrate admin_users ---
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

              let manvAdmin = prof?.manv ? String(prof.manv).toUpperCase() : null;

              // nếu không lấy được manv từ admin_users → KHÔNG fallback ADMIN
              if (!manvAdmin) {
                const oldManv = localStorage.getItem("manv");
                if (oldManv && oldManv !== "ADMIN") {
                  manvAdmin = oldManv;
                } else {
                  alert("⚠️ Tài khoản admin chưa cấu hình mã nhân viên (manv). Vui lòng liên hệ quản trị.");
                  await supabase.auth.signOut();
                  return;
                }
              }

              localStorage.setItem("manv", manvAdmin);
              localStorage.setItem("is_admin", "true");

            }
          }
        } catch (e) {
          console.warn("Auto session (admin): không lấy được profile admin_users:", e);
          localStorage.setItem("quyen_sua_hoadon", "true");
          localStorage.setItem("is_admin", "true");
        }
      } else {
        // --- hydrate nhân viên từ dmnhanvien theo user_id ---
        try {
          if (uid) {
            const { data: nv, error: nvErr } = await window.supabase
              .from("dmnhanvien")
              .select("manv, tennv, sua_hoadon, xoa_hoadon")
              .eq("user_id", uid)
              .maybeSingle();

            if (!nvErr && nv) {
              if (nv && Object.prototype.hasOwnProperty.call(nv, "active") && nv.active === false) {
                await window.supabase.auth.signOut().catch(() => { });
                throw new Error("Tài khoản nhân viên đang bị khóa");
              }

              localStorage.setItem("manv", String(nv.manv || "").trim().toUpperCase());
              localStorage.setItem("tennv", String(nv.tennv || "").trim());
              localStorage.setItem("quyen_sua_hoadon", nv.sua_hoadon ? "true" : "false");
              localStorage.setItem("is_admin", "false");
            } else {
              // Không tìm thấy dòng nv: giữ nguyên localStorage (nếu có), nhưng TUYỆT ĐỐI không gán ADMIN
              localStorage.setItem("is_admin", "false");
              localStorage.setItem(
                "quyen_sua_hoadon",
                localStorage.getItem("quyen_sua_hoadon") || "false"
              );
            }
          }
        } catch (e) {
          console.warn("Auto session (nv): không hydrate được dmnhanvien:", e);
          localStorage.setItem("is_admin", "false");
        }
      }

      // đảm bảo diadiem
      if (!localStorage.getItem("diadiem")) {
        localStorage.setItem("diadiem", macDinhDiaDiem || "cs1");
      }

      // lưu legacy tokens để tab khác phục hồi
      saveSessionLegacy(session);
      syncGlobalsFromLocalStorage();

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

  localStorage.removeItem('supabase_access_token');
  localStorage.removeItem('manv');
  localStorage.removeItem('tennv');
  localStorage.removeItem('is_admin');
  localStorage.removeItem('quyen_sua_hoadon');

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



