


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
