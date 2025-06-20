
import { supabase } from './api/supabaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { masp } = req.body;
    if (!masp) {
      return res.status(400).json({ error: 'Thiếu mã sản phẩm' });
    }

    const { data, error } = await supabase
      .from('dmhanghoa')
      .select('*')
      .eq('masp', masp)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Không tìm thấy mã sản phẩm' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Lỗi API hoadon:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
