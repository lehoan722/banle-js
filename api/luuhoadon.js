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

      const { error: err2 } = await supabase.from('hoadon_banle').insert([{ sohd, ...hoadon }]);
      if (err2) throw new Error("Lỗi ghi bảng hoadon_banle: " + err2.message);

      const ct_data = chitiet.map(row => ({ sohd, ...row }));
      const { error: err3 } = await supabase.from('ct_hoadon_banle').insert(ct_data);
      if (err3) throw new Error("Lỗi ghi bảng ct_hoadon_banle: " + err3.message);

      const { error: err4 } = await supabase.from('sochungtu').upsert({ loai: prefix, so_hientai: sohd_num });
      if (err4) throw new Error("Lỗi cập nhật số chứng từ: " + err4.message);

      res.status(200).json({ success: true, sohd });

    } catch (err) {
      console.error("Lỗi API:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
