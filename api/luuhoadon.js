import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rddjrmbyftlcvrgzlyby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njc2NTgwNCwiZXhwIjoyMDYyMzQxODA0fQ.6UBSL-2jW7Qj73W8PEKOtIeDcGldbCMwpHn1He0MfhM'
);

function formatSoHD(prefix, stt) {
  return `${prefix}_${String(stt).padStart(5, '0')}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    try {
      const { hoadon, chitiet } = req.body;
      const prefix = hoadon.loai || (hoadon.diadiem === "Cơ sở 1" ? "bancs1" : "bancs2");

      const { data: soRow, error: err1 } = await supabase
        .from('sochungtu')
        .select('so_hientai')
        .eq('loai', prefix)
        .single();

      if (err1) throw new Error("Lỗi khi lấy số chứng từ: " + err1.message);

      const sohd_num = soRow ? soRow.so_hientai + 1 : 1;
      const sohd = formatSoHD(prefix, sohd_num);

      const hoaDonData = { sohd, ...hoadon };
      const chiTietData = chitiet.map(row => ({ sohd, ...row }));
      const soCTData = { loai: prefix, so_hientai: sohd_num };

      // Ghi song song cả 3 bảng
      const [res1, res2, res3] = await Promise.all([
        supabase.from('hoadon_banle').insert([hoaDonData]),
        supabase.from('ct_hoadon_banle').insert(chiTietData),
        supabase.from('sochungtu').upsert(soCTData)
      ]);

      if (res1.error) throw new Error("Lỗi ghi bảng hoadon_banle: " + res1.error.message);
      if (res2.error) throw new Error("Lỗi ghi bảng ct_hoadon_banle: " + res2.error.message);
      if (res3.error) throw new Error("Lỗi cập nhật số chứng từ: " + res3.error.message);

      res.status(200).json({ success: true, sohd });

    } catch (err) {
      console.error("Lỗi API:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
