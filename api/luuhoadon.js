import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rddjrmbyftlcvrgzlyby.supabase.co',                // Thay bằng URL Supabase của bạn
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM'           // Thay bằng Service Role Key (có quyền ghi)
);

function formatSoHD(stt) {
  return `hdbl_${String(stt).padStart(5, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { hoadon, chitiet } = req.body;

  // 1. Lấy số hiện tại
  const { data: soRow, error: soErr } = await supabase
    .from('sochungtu')
    .select('so_hientai')
    .eq('loai', 'hdbl')
    .single();

  let sohd_num = soRow ? soRow.so_hientai + 1 : 1;
  let sohd = formatSoHD(sohd_num);

  // 2. Cập nhật lại số
  await supabase
    .from('sochungtu')
    .upsert({ loai: 'hdbl', so_hientai: sohd_num });

  // 3. Ghi hóa đơn tổng
  const { error: hdErr } = await supabase
    .from('hoadon_banle')
    .insert([{ sohd, ...hoadon }]);

  if (hdErr) return res.status(500).json({ error: 'Lỗi ghi hóa đơn', detail: hdErr });

  // 4. Ghi từng dòng chi tiết
  const ct_data = chitiet.map(row => ({ sohd, ...row }));
  const { error: ctErr } = await supabase
    .from('ct_hoadon_banle')
    .insert(ct_data);

  if (ctErr) return res.status(500).json({ error: 'Lỗi ghi chi tiết', detail: ctErr });

  res.status(200).json({ success: true, sohd });
}
