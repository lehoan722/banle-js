import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const ANON_KEY = process.env.SUPABASE_ANON_KEY; // nếu có thì tốt

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
    }
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({ error: 'Chua cau hinh ADMIN_EMAIL/ADMIN_PASSWORD' });
    }

    const { manv, matkhau, diadiem } = req.body || {};
    const manvUpper = (manv || '').toString().trim().toUpperCase();
    const pass = (matkhau || '').toString().trim();

    if (!manvUpper || !pass) {
      return res.status(400).json({ error: 'Missing manv/matkhau' });
    }

    // 1) Client admin để đọc dmnhanvien (bypass RLS)
    const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // 2) Lấy dòng nhân viên
    const { data: nv, error: e1 } = await adminDb
      .from('dmnhanvien')
      .select('manv, tennv, matkhau, trangthai, is_admin, sua_hoadon, xoa_hoadon')
      .eq('manv', manvUpper)
      .maybeSingle();

    if (e1) return res.status(500).json({ error: e1.message });
    if (!nv) return res.status(401).json({ error: 'Ma nhan vien khong ton tai' });
    if (nv.trangthai === false) return res.status(403).json({ error: 'Nhan vien dang ngung hoat dong' });
    if ((nv.matkhau || '').toString().trim() !== pass) return res.status(401).json({ error: 'Mat khau sai' });

    // 3) Chỉ cho ADMIN vào endpoint này
    if (!nv.is_admin) {
      return res.status(403).json({ error: 'Khong phai ADMIN' });
    }

    // 4) Đăng nhập Supabase Auth bằng tài khoản ADMIN
    const authKey = ANON_KEY || SERVICE_KEY; // nếu chưa set ANON key thì tạm dùng SERVICE
    const authClient = createClient(SUPABASE_URL, authKey, {
      auth: { persistSession: false },
    });

    const { data: signInData, error: e2 } = await authClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (e2) return res.status(401).json({ error: 'Admin signIn failed: ' + e2.message });
    if (!signInData?.session) return res.status(401).json({ error: 'No session returned' });

    return res.status(200).json({
      ok: true,
      diadiem: (diadiem || 'cs1').toString(),
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv,
        is_admin: true,
        sua_hoadon: !!nv.sua_hoadon,
        xoa_hoadon: !!nv.xoa_hoadon,
      },
      session: signInData.session,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
