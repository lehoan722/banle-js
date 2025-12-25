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

  const csSelect = document.getElementById('login-cs');
  const manvInput = document.getElementById('login-manv');
  const passInput = document.getElementById('login-password-nv');
  const errorEl = document.getElementById('login-error');
  const form = document.getElementById('form-login-dungchung');
  // ===== Email dropdown gợi ý (vừa chọn vừa gõ) =====
  const emailDatalist = document.getElementById('email-suggest');
  const FIXED_ADMIN_EMAILS = [
    'nguyennhuyet140175@gmail.com',
    'danghoanghai02@gmail.com',
    'lehoan722@gmail.com'
  ];

  function readEmailHistory() {
    try { return JSON.parse(localStorage.getItem('email_suggest_history') || '[]'); }
    catch { return []; }
  }
  function writeEmailHistory(list) {
    try { localStorage.setItem('email_suggest_history', JSON.stringify(list.slice(0, 10))); } catch {}
  }
  function addEmailToHistory(email) {
    const e = (email || '').trim();
    if (!e || !e.includes('@')) return;
    const cur = readEmailHistory();
    const next = [e, ...cur.filter(x => x !== e)];
    writeEmailHistory(next);
  }
  function renderEmailDatalist() {
    if (!emailDatalist) return;
    const history = readEmailHistory();
    const last = (localStorage.getItem('last_login_identifier') || '').trim();
    const merged = [
      ...FIXED_ADMIN_EMAILS,
      ...(last.includes('@') ? [last] : []),
      ...history
    ];
    const uniq = [];
    for (const x of merged) {
      const v = (x || '').trim();
      if (!v) continue;
      if (!uniq.includes(v)) uniq.push(v);
    }
    emailDatalist.innerHTML = uniq.map(v => `<option value="${v}"></option>`).join('');
  }
  renderEmailDatalist();


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

  
async function tryAdminLogin(cs, email, password) {
  const emailLower = (email || '').trim().toLowerCase();

  // 1) Supabase Auth sign-in chuẩn
  const { data: signInData, error: signInErr } = await window.supabase.auth.signInWithPassword({
    email: emailLower,
    password
  });

  if (signInErr || !signInData?.session) {
    return { ok: false, error: signInErr?.message || 'Sai email/mật khẩu admin' };
  }

  const session = signInData.session;
  const uid = session?.user?.id;

  // 2) Lấy profile admin (manv/tenadmin/active) từ bảng admin_users
  //    Ưu tiên match theo user_id; nếu lỗi/không có dữ liệu thì fallback theo email.
  async function fetchAdminProfile(uid, emailLower) {
    const selectCols = 'manv, tenadmin, active, email, user_id';

    // Ưu tiên match theo email (ổn định hơn, tránh lỗi 400 nếu cột user_id/policy đang khác)
    const rEmail = await window.supabase
      .from('admin_users')
      .select(selectCols)
      .eq('email', emailLower)
      .maybeSingle();

    if (!rEmail?.error && rEmail?.data) {
      return { profile: rEmail.data, error: null };
    }

    // Nếu không có theo email -> thử theo user_id
    const rUid = await window.supabase
      .from('admin_users')
      .select(selectCols)
      .eq('user_id', uid)
      .maybeSingle();

    if (rUid?.error) return { profile: null, error: rUid.error };
    return { profile: rUid?.data || null, error: null };
  }

  const { profile, error: profErr } = await fetchAdminProfile(uid, emailLower);

  if (profErr) {
    console.warn('Không lấy được admin profile:', profErr);
    return { ok: false, error: 'Không lấy được thông tin admin (admin_users). Kiểm tra cột user_id/email & policy SELECT.' };
  }

  if (!profile) {
    return { ok: false, error: 'Không tìm thấy admin trong bảng admin_users (hãy kiểm tra user_id/email đã khớp chưa).' };
  }

  if (profile.active === false) {
    // Chủ động sign-out nếu admin bị khóa
    try { await window.supabase.auth.signOut(); } catch (e) {}
    return { ok: false, error: 'Tài khoản admin đang bị khóa (active = false).' };
  }

  const manvAdmin = String(profile.manv || '').trim().toUpperCase();
  const tenAdmin = String(profile.tenadmin || manvAdmin || '').trim();

  // 3) Lưu session info và manv/tennv như nhân viên
  localStorage.setItem('user_email', emailLower);
  localStorage.setItem('admin_email_last', emailLower);
  localStorage.setItem('is_admin', 'true');

  localStorage.setItem('manv', manvAdmin || 'ADMIN');
  localStorage.setItem('tennv', tenAdmin || 'ADMIN');

  // (tuỳ chọn) cập nhật UI ngay nếu có các ô trên trang
  try {
    const elManv = document.getElementById('manv');
    const elTennv = document.getElementById('tennv');
    if (elManv) elManv.value = (manvAdmin || 'ADMIN');
    if (elTennv) elTennv.value = (tenAdmin || 'ADMIN');
  } catch (e) {}

  // 4) Trả về context theo format giống nhân viên
  return {
    ok: true,
    session,
    nhanvien: {
      manv: manvAdmin || 'ADMIN',
      tennv: tenAdmin || 'ADMIN',
      is_admin: true,
      email: emailLower,
      user_id: uid
    },
    diadiem: cs
  };
}


  
async function xuLyDangNhap(e) {
  e?.preventDefault?.();

  const cs = (loginCsEl?.value || '').trim() || 'cs1';
  const idRaw = (loginIdEl?.value || '').trim();
  const password = (loginPwEl?.value || '').trim();

  if (!idRaw || !password) {
    setLoginStatus('Vui lòng nhập đầy đủ thông tin', true);
    return;
  }

  const isEmail = idRaw.includes('@'); // admin dùng email -> bỏ qua bước login nhân viên (tránh 401 api/login-cs1)
  const idNorm = normalizeLoginIdentifier(idRaw);

  setLoginStatus('Đang đăng nhập...', false);

  // 1) Nếu là email -> ưu tiên đăng nhập admin ngay (không gọi /api/login-cs1)
  if (isEmail) {
    const adminResult = await tryAdminLogin(cs, idNorm, password);
    if (!adminResult.ok) {
      setLoginStatus(adminResult.error || 'Đăng nhập thất bại', true);
      return;
    }

    // Set session Supabase ở frontend nếu server/SDK chưa tự set (thường đã set rồi)
    // (Không cần setSession thủ công vì signInWithPassword đã set session)

    callOnLoginSuccess({
      ...adminResult.nhanvien,
      diadiem: adminResult.diadiem
    });

    return;
  }

  // 2) Không phải email -> thử đăng nhập nhân viên trước
  const empResult = await tryEmployeeLogin(cs, idNorm, password);
  if (empResult.ok) {
    callOnLoginSuccess({
      ...empResult.nhanvien,
      diadiem: empResult.diadiem
    });
    return;
  }

  // 3) Fallback: nếu id nằm trong whitelist email admin (trường hợp user chọn dropdown nhưng xoá '@'...) thì thử admin
  if (FIXED_ADMIN_EMAILS.includes(idNorm)) {
    const adminResult = await tryAdminLogin(cs, idNorm, password);
    if (adminResult.ok) {
      callOnLoginSuccess({
        ...adminResult.nhanvien,
        diadiem: adminResult.diadiem
      });
      return;
    }
    setLoginStatus(adminResult.error || 'Đăng nhập thất bại', true);
    return;
  }

  setLoginStatus(empResult.error || 'Đăng nhập thất bại', true);
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
        // nếu là admin: lấy manv/tennv từ bảng admin_users để hiển thị/ghi DB đúng theo admin đang đăng nhập
        try {
          const uid = session?.user?.id;
          if (uid) {
            const { data: prof, error: profErr } = await window.supabase
              .from('admin_users')
              .select('manv, tenadmin, active')
              .eq('user_id', uid)
              .maybeSingle();

            if (!profErr && prof) {
              if (prof.active === false) {
                await window.supabase.auth.signOut().catch(() => {});
                throw new Error('Tài khoản admin đang bị khóa');
              }
              const manvAdmin = String(prof.manv || 'ADMIN').trim().toUpperCase();
              const tenAdmin = String(prof.tenadmin || manvAdmin).trim();

              localStorage.setItem('is_admin', 'true');
              localStorage.setItem('manv', manvAdmin);
              localStorage.setItem('tennv', tenAdmin);
              localStorage.setItem('quyen_sua_hoadon', 'true');
            } else {
              // fallback tối thiểu nếu không lấy được profile
              localStorage.setItem('is_admin', 'true');
              localStorage.setItem('manv', localStorage.getItem('manv') || 'ADMIN');
              localStorage.setItem('tennv', localStorage.getItem('tennv') || 'ADMIN');
              localStorage.setItem('quyen_sua_hoadon', 'true');
            }
          }
        } catch (e) {
          console.warn('Auto session: không lấy được profile admin_users:', e);
          localStorage.setItem('is_admin', 'true');
          localStorage.setItem('manv', localStorage.getItem('manv') || 'ADMIN');
          localStorage.setItem('tennv', localStorage.getItem('tennv') || 'ADMIN');
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
