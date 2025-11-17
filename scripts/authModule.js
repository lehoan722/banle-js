// scripts/authModule.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ==== 1. CẤU HÌNH SUPABASE DÙNG CHUNG ====
const SUPABASE_URL = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM';

// Chỉ tạo 1 lần, các trang khác dùng chung window.supabase
if (!window.supabase) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ==== 2. ÁNH XẠ EMAIL → CƠ SỞ (giữ nguyên kiểu bạn đang dùng) ====
function getDiaDiemFromEmail(email) {
  if (!email) return "";
  email = email.trim().toLowerCase();

  if (email === "khohangcs1@gmail.com") return "cs1";
  // Sau này bạn bổ sung thêm các email khác tại đây
  // if (email === "khohangcs2@gmail.com") return "cs2";

  return "";
}

// ==== 3. HÀM TẠO KHUNG LOGIN + GẮN LOGIC ĐĂNG NHẬP DÙNG CHUNG ====
// options:
// - loginContainerId: id div chứa giao diện login (mặc định: 'login-container')
// - appContainerId: id div chứa ứng dụng chính (mặc định: 'app-container')
// - macDinhDiaDiem: ví dụ 'cs1'
// - emailMacDinh: email mặc định cho trang đó
// - tuDongKhoaCoSo: true => ô chọn cơ sở bị disable & tự chọn theo email
// - onLoginSuccess(nv, context): callback khi đăng nhập thành công
export function khoiTaoDangNhapDungChung(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    macDinhDiaDiem = 'cs1',
    emailMacDinh = 'khohangcs1@gmail.com',
    tuDongKhoaCoSo = true,
    onLoginSuccess
  } = options;

  // Đảm bảo có div login-container
  let loginContainer = document.getElementById(loginContainerId);
  if (!loginContainer) {
    loginContainer = document.createElement('div');
    loginContainer.id = loginContainerId;
    document.body.appendChild(loginContainer);
  }

  // Tạo HTML đăng nhập (giống logic trang bannvcs1, chỉ chỉnh cho dùng chung)
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

  loginContainer.innerHTML = `
    <div style="background:#f9f9f9; padding:30px; border-radius:8px; box-shadow:0 0 10px #ccc; min-width:280px;">
      <h2>Đăng nhập hệ thống</h2>
      <form id="form-login-dungchung">
        <label>Email đăng nhập:</label><br />
        <input type="email" id="login-email" style="width:100%;padding:6px;margin-bottom:8px;" /><br />

        <label>Cơ sở:</label><br />
        <select id="login-cs" style="width:100%; padding:6px; margin-bottom:8px;">
          <option value="">-- Chọn cơ sở --</option>
          <option value="cs1">Cơ sở 1</option>
          <option value="cs2">Cơ sở 2</option>
        </select>

        <label for="login-manv">Mã nhân viên</label><br />
        <input type="password" id="login-manv" autocomplete="off"
               placeholder="Nhập mã nhân viên" required
               style="width:100%;padding:6px;margin-bottom:8px;" /><br />

        <label>Mật khẩu:</label><br />
        <input type="password" id="login-password"
               style="width:100%;padding:6px;margin-bottom:12px;" /><br />

        <button type="submit" style="padding: 8px 16px;">Đăng nhập</button>
        <p id="login-error" style="color:red; margin-top:10px;"></p>
      </form>
    </div>
  `;

  // Gán giá trị mặc định
  const emailInput = document.getElementById('login-email');
  const csSelect   = document.getElementById('login-cs');
  const passInput  = document.getElementById('login-password');
  const manvInput  = document.getElementById('login-manv');
  const errorEl    = document.getElementById('login-error');

  if (emailMacDinh) {
    emailInput.value = emailMacDinh;
  }
  if (macDinhDiaDiem) {
    csSelect.value = macDinhDiaDiem;
  }
  if (tuDongKhoaCoSo) {
    csSelect.disabled = true;
  }

  // Khi rời khỏi ô email -> tự nhận diện cơ sở theo email
  emailInput.addEventListener('blur', function () {
    const email = this.value.trim();
    const cs = getDiaDiemFromEmail(email);
    if (cs) {
      csSelect.value = cs;
      csSelect.disabled = true;
    } else if (tuDongKhoaCoSo) {
      // email không khớp, cho phép tự chọn
      csSelect.value = "";
      csSelect.disabled = false;
    }
  });

  // Hàm xử lý đăng nhập (giống logic cũ, nhưng viết thành module)
  async function xuLyDangNhap(e) {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value.trim();
    const cs = csSelect.value;
    const manv = manvInput.value.trim().toUpperCase();

    errorEl.style.color = 'red';

    if (!email || !password) {
      errorEl.textContent = 'Vui lòng nhập đầy đủ email và mật khẩu';
      return;
    }
    if (!cs) {
      errorEl.textContent = 'Vui lòng chọn cơ sở bán hàng!';
      return;
    }
    if (!manv) {
      errorEl.textContent = 'Vui lòng nhập mã nhân viên!';
      return;
    }

    // 1. Đăng nhập Supabase
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = `❌ Đăng nhập thất bại: ${error.message}`;
      return;
    }

    // Đảm bảo session
    await window.supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });

    // 2. Kiểm tra dmnhanvien
    const { data: nvArr, error: errNV } = await window.supabase
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon')
      .eq('manv', manv);

    if (errNV || !nvArr || nvArr.length === 0) {
      errorEl.textContent = '❌ Mã nhân viên không đúng hoặc không tồn tại!';

      // Đăng xuất ngay nếu sai
      await window.supabase.auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      manvInput.focus();
      return;
    }

    const nv = nvArr[0];

    // 3. Lưu thông tin vào localStorage (đúng như trang bannvcs1)
    localStorage.setItem("diadiem", cs);
    localStorage.setItem('supabase_access_token', data.session.access_token);
    localStorage.setItem("manv", nv.manv);
    localStorage.setItem("tennv", nv.tennv);
    localStorage.setItem("quyen_sua_hoadon", nv.sua_hoadon ? "true" : "false");

    // Gắn lên window nếu cần
    window.diadiem = cs;

    // 4. Ẩn login, hiện app
    errorEl.style.color = 'green';
    errorEl.textContent = '✅ Đăng nhập thành công!';

    const appContainer = document.getElementById(appContainerId);
    if (appContainer) {
      appContainer.style.display = '';
    }
    loginContainer.style.display = 'none';

    // 5. Gọi callback để trang tùy biến (gán mã NV, chạy main.js, set checkbox…)
    if (typeof onLoginSuccess === 'function') {
      const context = {
        email,
        cs,
        nv,
        session: data.session
      };
      await onLoginSuccess(nv, context);
    }
  }

  const form = document.getElementById('form-login-dungchung');
  form.addEventListener('submit', xuLyDangNhap);
}

// ==== 4. HÀM ĐĂNG XUẤT DÙNG CHUNG ====
export async function dangXuatDungChung(options = {}) {
  const {
    loginContainerId = 'login-container',
    appContainerId = 'app-container',
    clearDraft = true
  } = options;

  if (window.supabase && window.supabase.auth) {
    await window.supabase.auth.signOut();
  }
  localStorage.clear();
  sessionStorage.clear();
  localStorage.removeItem("quyen_sua_hoadon");

  // Hiện lại form login
  const loginContainer = document.getElementById(loginContainerId);
  const appContainer = document.getElementById(appContainerId);
  if (loginContainer) loginContainer.style.display = '';
  if (appContainer) appContainer.style.display = 'none';

  // Xóa dữ liệu draft hóa đơn nếu cần
  if (clearDraft) {
    localStorage.removeItem('draft_hoadon');
    sessionStorage.removeItem('draft_hoadon');
  }
}
