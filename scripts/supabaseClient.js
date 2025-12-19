


// supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

const SUPABASE_URL = "https://rddjrmbyftlcvrgzlyby.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM";

// Nếu chưa có client trên window thì mới tạo
if (
  !window.supabase ||
  !window.supabase.auth ||
  typeof window.supabase.auth.setSession !== "function"
) {
  window.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Tất cả các file khác import sẽ dùng đúng 1 client này
export const supabase = window.supabase;

// ✅ Giữ phiên đăng nhập sống khi tab đang dùng
export function startSessionKeeper({
  minTtlSeconds = 300,        // còn < 5 phút thì refresh
  intervalMs = 5 * 60 * 1000  // 5 phút kiểm tra 1 lần
} = {}) {
  if (window.__sessionKeeperStarted) return;
  window.__sessionKeeperStarted = true;

  const tick = async () => {
    try {
      // chỉ chạy khi tab đang “thấy được” hoặc user quay lại
      if (document.visibilityState !== "visible") return;

      const { data, error } = await supabase.auth.getSession();
      if (error) return;

      const s = data?.session;
      if (!s) return;

      const remainMs = (s.expires_at || 0) * 1000 - Date.now();
      if (remainMs <= minTtlSeconds * 1000) {
        await supabase.auth.refreshSession();
      }
    } catch (e) {
      // im lặng, không làm gián đoạn bán hàng
      console.warn("session keeper tick error:", e);
    }
  };

  // user quay lại tab / quay lại cửa sổ => refresh ngay
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });

  // chạy định kỳ
  setInterval(tick, intervalMs);
  tick();
}
