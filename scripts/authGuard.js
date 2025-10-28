<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  // ⚠️ Đặt 2 biến môi trường này vào HTML của bạn hoặc dùng file config chung.
  const SUPABASE_URL = window.SUPABASE_URL || "<YOUR_SUPABASE_URL>";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "<YOUR_SUPABASE_ANON_KEY>";

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true }
  });

  async function guardPage() {
    // 1) Yêu cầu đăng nhập
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login.html?redirect=${redirect}`);
      return;
    }

    // 2) Lấy các trang được phép
    const { data, error } = await supabase.rpc('my_pages');
    if (error) {
      console.error(error);
      alert('Không kiểm tra được quyền truy cập. Vui lòng thử lại.');
      location.replace('/403.html');
      return;
    }

    const allowed = new Set((data || []).map(x => x.path));
    const current = location.pathname; // ví dụ '/nhaptamcs1.html'

    if (!allowed.has(current)) {
      location.replace('/403.html');
      return;
    }

    // 3) (Tùy chọn) Nhét quyền vào window để trang dùng tiếp
    window.__MY_PAGES__ = data;
    window.__CAN_EDIT__ = (data.find(x => x.path === current)?.can_edit) || false;
  }

  guardPage();
</script>
