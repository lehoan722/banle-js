// scripts/authEmailAdmin.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm';

// ==== SUPABASE CONFIG (anon key public) ====
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

// Tạo 1 client duy nhất trên window
if (
  !window.supabase ||
  !window.supabase.auth ||
  typeof window.supabase.auth.getSession !== 'function'
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

async function checkAdminOrThrow() {
  // Yêu cầu bạn đã tạo RPC: public.is_admin_uid() -> boolean
  const { data, error } = await window.supabase.rpc('is_admin_uid');
  if (error) throw error;
  if (!data) {
    const e = new Error('Tài khoản này KHÔNG phải ADMIN.');
    e.code = 'NOT_ADMIN';
    throw e;
  }
  return true;
}

/**
 * Login bằng Email/Password (Supabase Auth) và CHỈ CHO ADMIN vào app.
 * options:
 * - loginContainerId: 'login-container' (default)
 * - appContainerId:   'app-container' (default)
 * - title: tiêu đề form
 * - onLoginSuccess({ user, session }): callback khi admin hợp lệ
 */
export async function khoiTaoDangNhapEmailAdmin(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    title = 'Đăng nhập',
    onLoginSuccess,
  } = options;

  // Tạo/đảm bảo có div login
  let loginContainer = document.getElementById(loginContainerId);
  if (!loginContainer) {
    loginContainer = document.createElement('div');
    loginContainer.id = loginContainerId;
    document.body.appendChild(loginContainer);
  }

  // Style overlay
  loginContainer.style.position = 'fixed';
  loginContainer.style.top = '0';
  loginContainer.style.left = '0';
  loginContainer.style.width = '100%';
  loginContainer.style.height = '100%';
  loginContainer.style.background = '#fff';
  loginContainer.style.display = 'flex';
  loginContainer.style.flexDirection = 'column';
  loginContainer.style.alignItems = 'center';
  loginContainer.style.justifyContent = 'center';
  loginContainer.style.zIndex = '99999';

  // App ẩn lúc chưa login
  const appContainer = document.getElementById(appContainerId);
  if (appContainer) appContainer.style.display = 'none';

  const savedEmail = localStorage.getItem('last_login_email') || '';

  loginContainer.innerHTML = `
    <div style="background:#f9f9f9; padding:30px; border-radius:8px; box-shadow:0 0 10px #ccc; min-width:320px;">
      <h2 style="margin:0 0 12px 0;">${title}</h2>

      <form id="form-login-email-admin">
        <label>Email</label><br />
        <input type="email" id="login-email" required
               value="${savedEmail}"
               style="width:100%;padding:8px;margin:6px 0 10px 0;" />

        <label>Mật khẩu</label><br />
        <input type="password" id="login-password" required
               style="width:100%;padding:8px;margin:6px 0 12px 0;" />

        <button type="submit"
                style="width:100%; padding:10px; background:#0b5; color:#fff; border:0; border-radius:6px; cursor:pointer;">
          Đăng nhập
        </button>

        <div id="login-error" style="margin-top:10px; color:#c00; font-size:13px;"></div>
      </form>
    </div>
  `;

  const form = document.getElementById('form-login-email-admin');
  const emailInput = document.getElementById('login-email');
  const passInput = document.getElementById('login-password');
  const errorEl = document.getElementById('login-error');

  async function finalizeLogin(session) {
    try {
      await checkAdminOrThrow();

      // Lưu vài thông tin cho tiện debug
      const user = session?.user;
      if (user?.email) localStorage.setItem('last_login_email', user.email);
      if (user?.id) localStorage.setItem('user_id', user.id);
      localStorage.setItem('is_admin', 'true');

      // Hiện app, ẩn login
      if (appContainer) appContainer.style.display = '';
      loginContainer.style.display = 'none';

      if (typeof onLoginSuccess === 'function') {
        await onLoginSuccess({ user: session.user, session });
      }
    } catch (e) {
      // Không phải admin -> signOut luôn
      try { await window.supabase.auth.signOut(); } catch (_) {}
      localStorage.removeItem('is_admin');

      if (e?.code === 'NOT_ADMIN') {
        errorEl.textContent = '❌ Tài khoản này KHÔNG phải ADMIN.';
      } else {
        errorEl.textContent = '❌ Không kiểm tra được quyền admin: ' + (e?.message || 'Unknown error');
      }
    }
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    errorEl.textContent = 'Đang đăng nhập...';

    const email = (emailInput.value || '').trim();
    const password = passInput.value || '';

    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = '❌ ' + error.message;
      return;
    }
    if (!data?.session) {
      errorEl.textContent = '❌ Không lấy được session đăng nhập.';
      return;
    }
    await finalizeLogin(data.session);
  }

  form.addEventListener('submit', handleSubmit);
  emailInput.focus();

  // Auto login nếu đã có session trước đó
  try {
    const { data } = await window.supabase.auth.getSession();
    const sess = data?.session;
    if (sess?.access_token) {
      errorEl.style.color = '#060';
      errorEl.textContent = 'Đang khôi phục phiên đăng nhập...';
      await finalizeLogin(sess);
    }
  } catch (_) {}
}

export async function dangXuatEmail(options = {}) {
  const { loginContainerId = 'login-container', appContainerId = 'app-container' } = options;

  try {
    await window.supabase.auth.signOut();
  } catch (_) {}

  localStorage.removeItem('is_admin');
  // giữ last_login_email để lần sau tiện đăng nhập
  // localStorage.removeItem('last_login_email');

  const loginContainer = document.getElementById(loginContainerId);
  const appContainer = document.getElementById(appContainerId);

  if (loginContainer) loginContainer.style.display = '';
  if (appContainer) appContainer.style.display = 'none';
}
