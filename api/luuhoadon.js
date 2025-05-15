import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xxxx.supabase.co',            // THAY bằng Supabase URL của bạn
  'SUPABASE_SERVICE_ROLE_KEY'            // THAY bằng service role key
);

function formatSoHD(prefix, stt) {
  return `${prefix}_${String(stt).padStart(5, '0')}`;
}

export default async function handler(req, res) {
  // ✅ Thiết lập header CORS CHO MỌI TRƯỜNG HỢP
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Nếu là preflight request → phản hồi ngay
  if (req.method === "OPTIONS") {
    return res.status(200).end();  // Không làm gì thêm
  }

  // ✅ Nếu là POST: xử lý logic lưu hóa đơn
  if (req.method === "POST") {
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
      res.status(500).json({ error: "Internal error", detail: err.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
