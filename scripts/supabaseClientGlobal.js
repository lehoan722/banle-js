// supabaseClientGlobal.js
// Wrapper: lấy supabase từ module gốc và gắn ra window để script thường dùng được

import { supabase } from './supabaseClient.js';

window.supabase = supabase;
