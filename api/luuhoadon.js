import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
https://rddjrmbyftlcvrgzlyby.supabase.co',                // Thay bằng URL Supabase của bạn
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3NjU4MDQsImV4cCI6MjA2MjM0MTgwNH0.-0xtqxn6b9OBz4unTTvJ4klxizWhHa1iSuYGm7cOYTM'           // Thay bằng Service Role Key (có quyền ghi)
);

function formatSoHD(prefix, stt) {
  return `${prefix}_${String(stt).padStart(5, '0')}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Xử lý preflight request (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { hoadon, chitiet } = req.body;
    const prefix = hoadon.loai || (hoadon.diadiem === "Cơ sở 1" ? "bancs1" : "bancs2");

    const { data: soRow } = await supabase
      .from('sochungtu')
      .select('so_hientai')
      .eq('loai', prefix)
      .single();

    const sohd_num = soRow ? soRow.so_hientai + 1 : 1;
    const sohd = formatSoHD(prefix, sohd_num);

    const { error: hdErr } = await supabase
      .from('hoadon_banle')
      .insert([{ sohd, ...hoadon }]);

    if (hdErr) return res.status(500).json({ error: 'Lỗi ghi hóa đơn', detail: hdErr });

    const ct_data = chitiet.map(row => ({ sohd, ...row }));
    const { error: ctErr } = await supabase
      .from('ct_hoadon_banle')
      .insert(ct_data);

    if (ctErr) return res.status(500).json({ error: 'Lỗi ghi chi tiết', detail: ctErr });

    await supabase
      .from('sochungtu')
      .upsert({ loai: prefix, so_hientai: sohd_num });

    res.status(200).json({ success: true, sohd });
  } catch (err) {
    res.status(500).json({ error: "Internal Error", detail: err.message });
  }
}
