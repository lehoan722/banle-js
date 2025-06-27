// loginSupabaseModule.js
export function renderLoginModule({
    supabaseUrl,
    supabaseKey,
    onLoginSuccess
}) {
    // Đảm bảo chỉ khởi tạo 1 lần!
    if (window._supabaseLoginModuleInited) return;
    window._supabaseLoginModuleInited = true;

    // DOM
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit');
    const statusSpan = document.getElementById('login-status');

    // Tải supabase sdk động
    let supabase = null;
    import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm').then(({ createClient }) => {
        supabase = createClient(supabaseUrl, supabaseKey);
    });

    // Bấm Đăng nhập
    submitBtn.onclick = async () => {
        statusSpan.textContent = 'Đang đăng nhập...';
        statusSpan.style.color = '#666';
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) {
            statusSpan.textContent = '❌ Nhập đủ email và mật khẩu!';
            statusSpan.style.color = '#ad3a2b';
            return;
        }
        if (!supabase) {
            statusSpan.textContent = '⚠️ Chưa sẵn sàng!';
            statusSpan.style.color = '#ad3a2b';
            return;
        }
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error || !data.session) {
                statusSpan.textContent = 'Đăng nhập thất bại!';
                statusSpan.style.color = '#ad3a2b';
                return;
            }
            // Lưu token vào localStorage cho các trang khác dùng chung
            localStorage.setItem('supabase_access_token', data.session.access_token);
            statusSpan.textContent = '✅ Đăng nhập thành công!';
            statusSpan.style.color = '#218838';
            // Gọi callback để cập nhật lại supabase client (nếu có)
            if (typeof onLoginSuccess === 'function') onLoginSuccess(data.session.access_token);
        } catch (err) {
            statusSpan.textContent = '❌ Có lỗi kết nối!';
            statusSpan.style.color = '#ad3a2b';
        }
    };
}
