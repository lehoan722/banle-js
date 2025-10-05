import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient('https://rddjrmbyftlcvrgzlyby.supabase.co', '<anon-key>');

window.saveNhapTam = async function() {
  try {
    const cs = localStorage.getItem('diadiem') || 'cs1';
    const manv = localStorage.getItem('manv') || '';
    const tennv = localStorage.getItem('tennv') || '';
    const ghichu = document.getElementById('ghichu').value || '';
    const today = new Date().toISOString().slice(0, 10);

    // 1. Tạo số chứng từ mới (vd: ntcs1_00045)
    const { data: last, error: errLast } = await supabase
      .from('nhaptam_hd')
      .select('soct')
      .ilike('soct', `nt${cs}_%`)
      .order('soct', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 1;
    if (last?.soct) {
      const num = parseInt(last.soct.split('_')[1]);
      if (!isNaN(num)) nextNumber = num + 1;
    }
    const soct = `nt${cs}_${String(nextNumber).padStart(5, '0')}`;

    // 2. Lấy dữ liệu bảng hiện tại
    const rows = MobileKQ.getAll();
    const details = [];
    for (const r of rows) {
      const tong = Object.values(r.qty).reduce((a, b) => a + (parseInt(b) || 0), 0);
      details.push({
        soct,
        masp: r.masp,
        qty0: r.qty[0] || 0,
        qty38: r.qty[38] || 0,
        qty39: r.qty[39] || 0,
        qty40: r.qty[40] || 0,
        qty41: r.qty[41] || 0,
        qty42: r.qty[42] || 0,
        qty43: r.qty[43] || 0,
        qty44: r.qty[44] || 0,
        qty45: r.qty[45] || 0,
        tong,
        created_by: manv
      });
    }

    // 3. Ghi vào Supabase
    await supabase.from('nhaptam_hd').insert([{
      soct, diadiem: cs, ngay: today, manv, tennv, ghichu
    }]);
    await supabase.from('nhaptam_ct').insert(details);

    alert(`✅ Đã lưu hóa đơn nhập tạm: ${soct}`);
  } catch (e) {
    console.error(e);
    alert('❌ Lưu hóa đơn nhập tạm thất bại!');
  }
};
