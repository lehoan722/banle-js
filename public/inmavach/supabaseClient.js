// supabaseClient.js
const { createClient } = supabase;

window.supabase = createClient(
  'https://YOUR-SUPABASE-URL.supabase.co',
  'YOUR-ANON-KEY'
);
