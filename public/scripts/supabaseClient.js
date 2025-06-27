import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://rddjrmbyftlcvrgzlyby.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM" // 🔒 dùng role `anon`
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
