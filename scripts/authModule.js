// scripts/authModule.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm';

// ==== 1. CẤU HÌNH SUPABASE DÙNG CHUNG TRÊN FRONTEND ====
// (Anon key public giống như bạn đã dùng từ trước, KHÔNG phải service key)
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

// Chỉ tạo 1 lần trên window – nhưng phải chắc chắn là CLIENT, không phải chỉ là namespace thư viện
if (
  !window.supabase ||                    // chưa có
  !window.supabase.auth ||               // có nhưng không phải client
  typeof window.supabase.auth.setSession !== 'function'
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}


// ==== 1B. CƠ CHẾ "PHIÊN TRÌNH DUYỆT" (SESSION COOKIE) ====
// Mục tiêu:
// - Đóng trình duyệt / tắt máy => bắt buộc đăng nhập lại (KHÔNG tự ăn login cũ từ localStorage)
// - Mở thêm tab trong cùng phiên trình duyệt => vẫn có thể tự khôi phục phiên (nếu token Supabase còn hợp lệ)
//
// Cách làm bền vững hơn heartbeat:
// - Dùng "session cookie" (không có Expires/Max-Age) => cookie sẽ tự mất khi đóng trình duyệt
// - localStorage vẫn còn, nhưng nếu cookie đã mất => coi như phiên cũ => xoá localStorage auth

const __SESSION_COOKIE__ = '__APP_SESSION__';

function __setSessionCookie() {
  try {
    // Session cookie: không set Expires/Max-Age => tự mất khi đóng trình duyệt
    document.cookie = `${__SESSION_COOKIE__}=1; path=/; SameSite=Lax`;
  } catch { }
}

function __hasSessionCookie() {
  try {
    return document.cookie.split('; ').some(s => s.startsWith(__SESSION_COOKIE__ + '='));
  } catch {
    return false;
  }
}

function __clearSessionCookie() {
  try {
    document.cookie = `${__SESSION_COOKIE__}=; Max-Age=0; path=/; SameSite=Lax`;
  } catch { }
}

function __hasSupabaseAuthTokenInLocalStorage() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Supabase v2 thường lưu key dạng: sb-<projectRef>-auth-token
      if (k.startsWith('sb-') && k.includes('rddjrmbyftlcvrgzlyby') && k.includes('auth-token')) {
        return true;
      }
    }
  } catch { }
  return false;
}

function __hasAnyAuthInLocalStorage() {
  return !!localStorage.getItem('manv') || __hasSupabaseAuthTokenInLocalStorage();
}

function __clearAuthLocalStorage() {
  // Chỉ xoá các key liên quan đăng nhập, không đụng các setting khác
  const keys = [
    'manv', 'tennv', 'supabase_access_token',
    'quyen_sua_hoadon', 'is_admin',
    'last_login_password' // legacy (không còn lưu)
  ];
  keys.forEach(k => { try { localStorage.removeItem(k); } catch { } });

  // Xoá token Supabase trong localStorage (nếu đang persist)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('sb-') && k.includes('rddjrmbyftlcvrgzlyby') && k.includes('auth-token')) {
        localStorage.removeItem(k);
      }
    }
  } catch { }
}

function __enforceFreshBrowserSession() {
  // Nếu có auth trong localStorage nhưng session cookie KHÔNG còn
  // => coi như đã đóng trình duyệt => xoá auth và bắt login lại
  if (__hasAnyAuthInLocalStorage() && !__hasSessionCookie()) {
    console.warn('🔒 Phiên đăng nhập cũ (đã đóng trình duyệt). Tự xoá localStorage auth.');
    __clearAuthLocalStorage();
    try { window.supabase?.auth?.signOut(); } catch { }
  }
}

// Tự kiểm tra ngay khi module được load (tránh script khác dùng localStorage trước)
try { __enforceFreshBrowserSession(); } catch (e) { }

// ==== HẾT CƠ CHẾ PHIÊN TRÌNH DUYỆT ====



// ==== 2. MODULE ĐĂNG NHẬP DÙNG CHUNG ====
// options:
// - loginContainerId: div chứa giao diện login (mặc định: 'login-container')
// - appContainerId:   div chứa ứng dụng chính (mặc định: 'app-container')
// - macDinhDiaDiem:   'cs1' hoặc 'cs2'
// - tuDongKhoaCoSo:   true => disable dropdown cơ sở
// - loginApiPath:     đường dẫn API, ví dụ '/api/login-cs1'
// - onLoginSuccess(nv, context): callback sau khi đăng nhập thành công
export function khoiTaoDangNhapDungChung(options = {}) {
  // Chặn auto-login sau khi đã đóng trình duyệt
  __enforceFreshBrowserSession();
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    macDinhDiaDiem = 'cs1',
    tuDongKhoaCoSo = true,
    loginApiPath = '/api/login-cs1',
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
  if (appContainer) {
    appContainer.style.display = 'none';
  }

  // HTML form đăng nhập mới (chỉ MÃ NV + MẬT KHẨU NV + CƠ SỞ)
  loginContainer.innerHTML = `
    <div style="background:#f9f9f9; padding:30px; border-radius:8px; box-shadow:0 0 10px #ccc; min-width:280px;">
      <h2>Đăng nhập nhân viên</h2>
      <form id="form-login-dungchung">
        <label>Cơ sở:</label><br />
        <select id="login-cs" style="width:100%; padding:6px; margin-bottom:8px;">
          <option value="">-- Chọn cơ sở --</option>
          <option value="cs1">Cơ sở 1</option>
          <option value="cs2">Cơ sở 2</option>
        </select>

        <label for="login-manv">Mã nhân viên</label><br />
        <input type="text" id="login-manv" autocomplete="off"
               placeholder="Ví dụ: NV01" required
               style="width:100%;padding:6px;margin-bottom:8px;" /><br />

        <label for="login-password-nv">Mật khẩu nhân viên</label><br />
        <input type="password" id="login-password-nv"
               placeholder="Nhập mật khẩu nhân viên"
               style="width:100%;padding:6px;margin-bottom:12px;" /><br />

        <button type="submit" style="padding: 8px 16px;">Đăng nhập</button>
        <p id="login-error" style="color:red; margin-top:10px;"></p>
      </form>
    </div>
  `;

  const csSelect = document.getElementById('login-cs');
  const manvInput = document.getElementById('login-manv');
  const passNVInput = document.getElementById('login-password-nv');
  const errorEl = document.getElementById('login-error');

  // Giá trị mặc định cơ sở:
  //  - Ưu tiên lấy từ localStorage.diadiem (lần đăng nhập trước)
  //  - Nếu không có thì dùng macDinhDiaDiem truyền vào
  try {
    const savedBranch = localStorage.getItem('diadiem');
    if (savedBranch) {
      csSelect.value = savedBranch;
    } else if (macDinhDiaDiem) {
      csSelect.value = macDinhDiaDiem;
    }
  } catch (e) {
    if (macDinhDiaDiem) {
      csSelect.value = macDinhDiaDiem;
    }
  }

  if (tuDongKhoaCoSo) {
    csSelect.disabled = true;
  }


  async function xuLyDangNhap(e) {
    e.preventDefault();
    const cs = csSelect.value;
    const manv = (manvInput.value || '').trim().toUpperCase();
    const passwordNV = (passNVInput.value || '').trim();

    errorEl.style.color = 'red';

    if (!cs) {
      errorEl.textContent = 'Vui lòng chọn cơ sở!';
      return;
    }
    if (!manv) {
      errorEl.textContent = 'Vui lòng nhập mã nhân viên!';
      return;
    }
    if (!passwordNV) {
      errorEl.textContent = 'Vui lòng nhập mật khẩu nhân viên!';
      return;
    }

    // LƯU MÃ NV + MẬT KHẨU VÀO LOCALSTORAGE ĐỂ DÙNG CHO LẦN SAU
    try {
      if (manv) {
        localStorage.setItem('last_login_manv', manv);
        // đồng bộ luôn với key manv đang dùng
        localStorage.setItem('manv', manv);
      }
      // ✅ KHÔNG lưu mật khẩu vào localStorage (tránh tự đăng nhập khi người khác mở máy)
    } catch (e) {
      console.warn('Không lưu được thông tin đăng nhập gần nhất:', e);
    }

    // Gọi API login trên server (ẩn email + mật khẩu kho ở backend)
    try {
      errorEl.textContent = 'Đang xác thực, vui lòng đợi…';

      const resp = await fetch(loginApiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manv, passwordNV, diadiem: cs })
      });

      const result = await resp.json().catch(() => ({}));

      if (!resp.ok || !result.ok) {
        const msg = result.error || 'Đăng nhập thất bại';
        errorEl.textContent = '❌ ' + msg;
        return;
      }

      const { session, nhanvien, diadiem } = result;

      if (!session || !session.access_token || !session.refresh_token) {
        errorEl.textContent = 'Không nhận được session hợp lệ từ server';
        return;
      }

      // Set session Supabase ở frontend
      const { data: setSessionData, error: setSessionError } =
        await window.supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });

      if (setSessionError) {
        console.error('Lỗi setSession:', setSessionError);
        errorEl.textContent = 'Không set được session Supabase';
        return;
      }

      // Lưu thông tin vào localStorage giống các trang khác
      // Lưu thông tin vào localStorage giống các trang khác
      const csFinal = diadiem || cs;

      localStorage.setItem('diadiem', csFinal);
      localStorage.setItem('supabase_access_token', session.access_token);
      localStorage.setItem('manv', nhanvien.manv);
      localStorage.setItem('tennv', nhanvien.tennv || '');
      localStorage.setItem('quyen_sua_hoadon', nhanvien.sua_hoadon ? 'true' : 'false');

      // ⭐ LƯU THÊM CỜ ADMIN ĐỂ CÁC TRANG KHÁC DÙNG
      // nếu API trả về is_admin = true/false thì dòng dưới sẽ hoạt động
      localStorage.setItem('is_admin', nhanvien.is_admin ? 'true' : 'false');

      // Bắt đầu heartbeat để tab khác nhận biết còn phiên đăng nhập đang mở
      __setSessionCookie();

      // Debug nhẹ: xem trong Console object nhân viên có gì
      console.log('DEBUG nhanvien login:', nhanvien);

      window.diadiem = csFinal;

      errorEl.style.color = 'green';
      errorEl.textContent = '✅ Đăng nhập thành công!';

      // Hiện app, ẩn login
      const appContainer = document.getElementById(appContainerId);
      if (appContainer) appContainer.style.display = '';
      loginContainer.style.display = 'none';

      // Gọi callback cho trang cụ thể
      if (typeof onLoginSuccess === 'function') {
        const context = {
          diadiem: csFinal,
          nhanvien,
          session: setSessionData?.session || session
        };
        await onLoginSuccess(nhanvien, context);
      }

    } catch (err) {
      console.error('Lỗi khi gọi loginApiPath:', err);
      errorEl.textContent = 'Lỗi kết nối tới máy chủ đăng nhập';
    }
  }

  const form = document.getElementById('form-login-dungchung');
  form.addEventListener('submit', xuLyDangNhap);

  // ===== TỰ ĐIỀN LẠI MÃ NV + CƠ SỞ (KHÔNG lưu mật khẩu) =====
  try {
    // Lấy từ localStorage: ưu tiên 'manv', nếu không có thì dùng 'last_login_manv'
    const savedManv =
      localStorage.getItem('manv') ||
      localStorage.getItem('last_login_manv');

    const savedBranch = localStorage.getItem('diadiem');

    if (savedManv && manvInput) {
      manvInput.value = savedManv;
    }
    if (savedBranch && csSelect) {
      csSelect.value = savedBranch;
    }
  } catch (e) {
    console.warn('Không đọc được thông tin đăng nhập từ localStorage:', e);
  }

  // ===== TỰ KHÔI PHỤC ĐĂNG NHẬP (CHỈ KHI CÒN TAB KHÁC ĐANG MỞ) =====
  // Nếu bạn mở THÊM TAB trong cùng một phiên (còn tab khác đang chạy) => tự vào app luôn.
  // Nếu bạn đã đóng trình duyệt/tắt máy => heartbeat nguội => bắt buộc đăng nhập lại.
  (async () => {
    try {
      if (!__hasSessionCookie()) return;

      const { data } = await window.supabase.auth.getSession();
      const session = data?.session;
      const manvLS = localStorage.getItem('manv');
      if (!session || !manvLS) return;

      const csFinal = localStorage.getItem('diadiem') || macDinhDiaDiem;
      const nhanvien = {
        manv: manvLS,
        tennv: localStorage.getItem('tennv') || '',
        sua_hoadon: localStorage.getItem('quyen_sua_hoadon') === 'true',
        is_admin: localStorage.getItem('is_admin') === 'true'
      };

      window.diadiem = csFinal;

      const appContainer = document.getElementById(appContainerId);
      if (appContainer) appContainer.style.display = '';
      loginContainer.style.display = 'none';

      __setSessionCookie();

      if (typeof onLoginSuccess === 'function') {
        await onLoginSuccess(nhanvien, { diadiem: csFinal, nhanvien, session });
      }
    } catch (e) {
      console.warn('Không tự khôi phục được phiên đăng nhập:', e);
    }
  })();


// 🔹 Enter ở ô MÃ NV -> nhảy sang ô MẬT KHẨU
  manvInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (passNVInput) {
        passNVInput.focus();
      }
    }
  });


  // 🔹 Enter ở ô MẬT KHẨU -> gửi form đăng nhập
  passNVInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // requestSubmit giúp trigger submit như bấm nút
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit(); // fallback cho trình duyệt rất cũ
      }
    }
  });

  // Tự focus vào ô mã NV khi mở form
  manvInput.focus();
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

  // Chỉ xoá auth liên quan đăng nhập (không xoá các setting khác)
  __clearSessionCookie();
  __clearAuthLocalStorage();
  try { sessionStorage.clear(); } catch { }

  const loginContainer = document.getElementById(loginContainerId);
  const appContainer = document.getElementById(appContainerId);
  if (loginContainer) loginContainer.style.display = '';
  if (appContainer) appContainer.style.display = 'none';

  if (clearDraft) {
    localStorage.removeItem('draft_hoadon');
    sessionStorage.removeItem('draft_hoadon');
  }
}
