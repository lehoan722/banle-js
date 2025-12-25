// scripts/authModule.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm';

// ==== 1. CẤU HÌNH SUPABASE DÙNG CHUNG TRÊN FRONTEND ====
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

// Chỉ tạo 1 lần trên window
if (
  !window.supabase ||
  !window.supabase.auth ||
  typeof window.supabase.auth.setSession !== 'function'
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}


// ==== 2A. DANH SÁCH EMAIL ADMIN GỢI Ý (datalist: vừa gõ vừa chọn) ====
// (Anh sửa danh sách này theo thực tế)
const ADMIN_EMAIL_SUGGESTIONS = [
  'tuyet140175@gmail.com',
  'hai2508@gmail.com',
  'lehoan722@gmail.com'
];

function attachAdminEmailDatalist(inputEl) {
  try {
    const listId = 'admin-email-datalist';
    let dl = document.getElementById(listId);
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = listId;
      for (const email of ADMIN_EMAIL_SUGGESTIONS) {
        const opt = document.createElement('option');
        opt.value = email;
        dl.appendChild(opt);
      }
      document.body.appendChild(dl);
    }
    inputEl.setAttribute('list', listId);
  } catch (e) {
    // ignore
  }
}

// ==== 2. MODULE ĐĂNG NHẬP DÙNG CHUNG ====
export function khoiTaoDangNhapDungChung(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    macDinhDiaDiem = 'cs1',
    tuDongKhoaCoSo = true,
    loginApiPath = null,
    onLoginSuccess
  } = options;

  // Tạo/đảm bảo có div login
  let loginContainer = document.getElementById(loginContainerId);
  if (!loginContainer) {
    loginContainer = document.createElement('div');
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

  // App ẩn lúc chưa login
  const appContainer = document.getElementById(appContainerId);
  if (appContainer) appContainer.style.display = 'none';

  // 1 FORM: “Mã nhân viên” (hoặc email admin) + “Mật khẩu”
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
        <input type="text" id="login-manv" autocomplete="off"
               placeholder="Ví dụ: NV01 hoặc admin@email.com" required
               style="width:100%;padding:6px;margin-bottom:8px;" /><br />

        <label for="login-password-nv">Mật khẩu</label><br />
        <input type="password" id="login-password-nv"
               placeholder="Nhập mật khẩu"
               style="width:100%;padding:6px;margin-bottom:12px;" /><br />

        <button type="submit" style="padding: 8px 16px;">Đăng nhập</button>
        <p id="login-error" style="color:red; margin-top:10px;"></p>
      </form>
    </div>
  `;

  const csSelect = document.getElementById('login-cs');
  const manvInput = document.getElementById('login-manv');
  attachAdminEmailDatalist(manvInput);
  const passInput = document.getElementById('login-password-nv');
  const errorEl = document.getElementById('login-error');
  const form = document.getElementById('form-login-dungchung');

  // Set default cơ sở (ưu tiên localStorage)
  try {
    const savedBranch = localStorage.getItem('diadiem');
    if (savedBranch) csSelect.value = savedBranch;
    else if (macDinhDiaDiem) csSelect.value = macDinhDiaDiem;
  } catch (e) {
    if (macDinhDiaDiem) csSelect.value = macDinhDiaDiem;
  }

  if (tuDongKhoaCoSo) csSelect.disabled = true;

  function showAppAfterLogin(nhanvienLike, context) {
    if (appContainer) appContainer.style.display = '';
    loginContainer.style.display = 'none';

    if (typeof onLoginSuccess === 'function') {
      Promise.resolve(onLoginSuccess(nhanvienLike, context)).catch(console.error);
    }
  }

  async function checkIsAdminBestEffort() {
    // Nếu chưa tạo RPC is_admin() thì coi như false
    try {
      const { data, error } = await window.supabase.rpc('is_admin');
      if (error) return false;
      return data === true;
    } catch (e) {
      return false;
    }
  }


  function resolveLoginApiPath(cs) {
    // Ưu tiên: loginApiPath truyền vào (function/object/string). Nếu không có -> tự suy ra theo cs
    try {
      if (typeof loginApiPath === 'function') return loginApiPath(cs);
      if (loginApiPath && typeof loginApiPath === 'object') return loginApiPath[cs];
      if (typeof loginApiPath === 'string' && loginApiPath.trim()) return loginApiPath.trim();
    } catch (e) {}
    return `/api/login-${cs}`;
  }

  async function tryEmployeeLogin(cs, manvUpper, password) {
    const resp = await fetch(resolveLoginApiPath(cs), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manv: manvUpper, passwordNV: password, diadiem: cs })
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.ok) {
      return { ok: false, error: result?.error || 'Đăng nhập thất bại' };
    }

    const { session, nhanvien, diadiem } = result;
    if (!session || !session.access_token || !session.refresh_token) {
      return { ok: false, error: 'Không nhận được session hợp lệ từ server' };
    }

    // Set session Supabase ở frontend
    const { data: setSessionData, error: setSessionError } =
      await window.supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });

    if (setSessionError) {
      console.error('Lỗi setSession:', setSessionError);
      return { ok: false, error: 'Không set được session Supabase' };
    }

    // IMPORTANT: Nhân viên luôn là is_admin=false (không tin dmnhanvien.is_admin nữa)
    const csFinal = diadiem || cs;
    localStorage.setItem('diadiem', csFinal);
    localStorage.setItem('supabase_access_token', session.access_token); // giữ lại để tương thích code cũ
    localStorage.setItem('manv', nhanvien?.manv || manvUpper);
    localStorage.setItem('tennv', nhanvien?.tennv || '');
    localStorage.setItem('quyen_sua_hoadon', nhanvien?.sua_hoadon ? 'true' : 'false');
    localStorage.setItem('is_admin', 'false'); // CHỐT: nhân viên không thể thành admin

    window.diadiem = csFinal;

    return {
      ok: true,
      nhanvienLike: { ...(nhanvien || {}), is_admin: false },
      context: {
        diadiem: csFinal,
        nhanvien,
        session: setSessionData?.session || session
      }
    };
  }

  async function tryAdminLogin(cs, emailRaw, password) {
    const emailLower = String(emailRaw || '').trim().toLowerCase();
    const pw = String(password || '').trim();

    // 1) Đăng nhập Supabase Auth bằng email/password
    const { data: signInData, error: signInErr } = await window.supabase.auth.signInWithPassword({
      email: emailLower,
      password: pw
    });

    if (signInErr) {
      console.error('[Auth] Admin signIn error:', signInErr);
      return { ok: false, error: 'Sai email hoặc mật khẩu admin' };
    }
    if (!signInData?.session?.access_token) {
      return { ok: false, error: 'Không nhận được session hợp lệ từ Supabase' };
    }

    const session = signInData.session;
    const uid = session.user?.id;

    // 2) Lấy profile admin (manv/tenadmin) từ bảng admin_users
    //    Ưu tiên theo user_id, nếu fail thì fallback theo email
    let prof = null;
    let profErr = null;

    if (uid) {
      const r1 = await window.supabase
        .from('admin_users')
        .select('manv, tenadmin, active')
        .eq('user_id', uid)
        .maybeSingle();
      prof = r1.data || null;
      profErr = r1.error || null;
    }

    if (!prof) {
      const r2 = await window.supabase
        .from('admin_users')
        .select('manv, tenadmin, active')
        .eq('email', emailLower)
        .maybeSingle();
      prof = r2.data || null;
      profErr = profErr || r2.error || null;
    }

    if (profErr) {
      console.error('[Auth] Không lấy được profile admin_users:', profErr);
      // sign out để tránh vào app với manv sai
      try { await window.supabase.auth.signOut(); } catch (_) {}
      return { ok: false, error: 'Không lấy được thông tin admin (admin_users). Kiểm tra policy/field user_id/email.' };
    }
    if (!prof) {
      console.error('[Auth] Không tìm thấy dòng admin_users cho:', { uid, emailLower });
      try { await window.supabase.auth.signOut(); } catch (_) {}
      return { ok: false, error: 'Chưa có thông tin admin trong bảng admin_users (thiếu dòng user_id/email)' };
    }

    if (prof.active === false) {
      try { await window.supabase.auth.signOut(); } catch (_) {}
      return { ok: false, error: 'Tài khoản admin đang bị khóa (active=false)' };
    }

    const manvAdmin = String(prof.manv || '').trim() || 'ADMIN';
    const tenAdmin = String(prof.tenadmin || '').trim() || manvAdmin;

    // 3) Gán quyền / lưu localStorage giống flow nhân viên
    localStorage.setItem('last_login_identifier', emailLower); // nhớ email để gõ nhanh
    localStorage.setItem('diadiem', cs);
    localStorage.setItem('manv', manvAdmin);
    localStorage.setItem('tennv', tenAdmin);

    localStorage.setItem('is_admin', 'true');
    localStorage.setItem('quyen_xoa_hoadon', 'true');
    localStorage.setItem('quyen_sua_hoadon', 'true');

    window.diadiem = cs;

    const nhanvienLike = {
      manv: manvAdmin,
      tennv: tenAdmin,
      is_admin: true,
      sua_hoadon: true,
      xoa_hoadon: true,
      email: emailLower,
      user_id: uid
    };

    localStorage.setItem('currentUser', JSON.stringify(nhanvienLike));

    return {
      ok: true,
      nhanvienLike,
      context: {
        diadiem: cs,
        nhanvien: { manv: manvAdmin, tennv: tenAdmin, is_admin: true },
        session
      }
    };
  }

  async function xuLyDangNhap(e) {
    e.preventDefault();

    const cs = csSelect.value;
    const rawId = (manvInput.value || '').trim();
    const password = (passInput.value || '').trim();

    errorEl.style.color = 'red';

    if (!cs) return (errorEl.textContent = 'Vui lòng chọn cơ sở!');
    if (!rawId) return (errorEl.textContent = 'Vui lòng nhập mã nhân viên hoặc email!');
    if (!password) return (errorEl.textContent = 'Vui lòng nhập mật khẩu!');

    // Chỉ lưu identifier để tiện lần sau (KHÔNG lưu password)
    try {
      localStorage.setItem('last_login_identifier', rawId);
    } catch (e) {}

    errorEl.textContent = 'Đang xác thực, vui lòng đợi…';
    

    // A) Nếu là email admin -> bỏ qua bước login nhân viên (tránh 401 /api/login-cs*)
  const looksLikeEmail = rawId.includes('@');

  // Chỉ thử login nhân viên khi KHÔNG phải email
  if (!looksLikeEmail) {
    try {
      const emp = await tryEmployeeLogin(cs, manvUpper, password);
      if (emp.ok) {
        localStorage.setItem('last_login_identifier', manvUpper);
        return;
      }
      errorEl.textContent = emp.error || 'Sai mã nhân viên hoặc mật khẩu';
      return;
    } catch (e) {
      console.warn('[Auth] tryEmployeeLogin error', e);
      errorEl.textContent = 'Không đăng nhập được nhân viên';
      return;
    }
  }

// B) Thử login admin (email/pass + is_admin())
    try {
      const email = rawId.toLowerCase();
      const adm = await tryAdminLogin(cs, email, password);
      if (!adm.ok) {
        errorEl.textContent = '❌ ' + (adm.error || 'Không đăng nhập được');
        return;
      }

      errorEl.style.color = 'green';
      errorEl.textContent = '✅ Đăng nhập thành công!';
      showAppAfterLogin(adm.nhanvienLike, adm.context);
    } catch (err) {
      console.error(err);
      errorEl.textContent = '❌ Không đăng nhập được';
    }
  }

  form.addEventListener('submit', xuLyDangNhap);

  // ===== AUTO: nếu đã có session Supabase -> bỏ qua login overlay =====
  (async () => {
    try {
      // Fill lại identifier/branch cho tiện (không fill password)
      const savedId = localStorage.getItem('last_login_identifier') || localStorage.getItem('manv') || '';
      const savedBranch = localStorage.getItem('diadiem') || '';
      if (savedId) manvInput.value = savedId;
      if (savedBranch) csSelect.value = savedBranch;

      const { data } = await window.supabase.auth.getSession();
      const session = data?.session;
      if (session) {
        const isAdmin = await checkIsAdminBestEffort();
        localStorage.setItem('is_admin', isAdmin ? 'true' : 'false');
        // nếu là admin mà chưa set manv/tennv thì set tối thiểu
        if (isAdmin) {
          if (!localStorage.getItem('manv')) localStorage.setItem('manv', 'ADMIN');
          if (!localStorage.getItem('tennv')) localStorage.setItem('tennv', 'ADMIN');
          localStorage.setItem('quyen_sua_hoadon', 'true');
        }
        showAppAfterLogin(
          {
            manv: localStorage.getItem('manv') || '',
            tennv: localStorage.getItem('tennv') || '',
            is_admin: isAdmin
          },
          { diadiem: localStorage.getItem('diadiem') || macDinhDiaDiem, session }
        );
      }
    } catch (e) {
      // ignore
    }

    // Focus
    manvInput.focus();
  })();

  // Enter UX
  manvInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      passInput?.focus();
    }
  });

  passInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    }
  });
}

// ==== 3. HÀM ĐĂNG XUẤT DÙNG CHUNG ====
export async function dangXuatDungChung(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    clearDraft = true
  } = options;

  try {
    if (window.supabase && window.supabase.auth) {
      await window.supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('Lỗi khi signOut Supabase:', err);
  }

  // Chỉ xóa key liên quan auth (không clear all để khỏi mất config khác)
  const keepBranch = localStorage.getItem('diadiem');
  const keepId = localStorage.getItem('last_login_identifier');

  localStorage.removeItem('supabase_access_token');
  localStorage.removeItem('manv');
  localStorage.removeItem('tennv');
  localStorage.removeItem('is_admin');
  localStorage.removeItem('quyen_sua_hoadon');

  sessionStorage.clear();

  if (keepBranch) localStorage.setItem('diadiem', keepBranch);
  if (keepId) localStorage.setItem('last_login_identifier', keepId);

  const loginContainer = document.getElementById(loginContainerId);
  const appContainer = document.getElementById(appContainerId);
  if (loginContainer) loginContainer.style.display = '';
  if (appContainer) appContainer.style.display = 'none';

  if (clearDraft) {
    localStorage.removeItem('draft_hoadon');
    sessionStorage.removeItem('draft_hoadon');
  }
}
