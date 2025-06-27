import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3JnejJ5Ynl9...'; // lấy đúng anon key của bạn!
export const supabase = createClient(supabaseUrl, supabaseKey);

// Nếu đã có access token (ví dụ đăng nhập ở trang khác), set lại session:
const accessToken = localStorage.getItem('supabase_access_token');
const refreshToken = localStorage.getItem('supabase_refresh_token'); // Nếu có
if (accessToken && supabase && supabase.auth) {
  supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken || ""
  });
}
