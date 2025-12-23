// /api/login-admin.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { manv, passwordNV, diadiem } = req.body || {};
    if (!manv || !passwordNV) {
      return res.status(400).json({ ok: false, error: 'Thiếu mã nhân viên hoặc mật khẩu' });
    }

    // 1) xác thực nội bộ từ dmnhanvien
    const manvUpper = manv.toString().trim().toUpperCase();
    const { data: nvArr, error: errNV } = await supabaseAdmin
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon, xoa_hoadon, is_admin, matkhau')
      .eq('manv', manvUpper)
      .limit(1);

    if (errNV) return res.status(500).json({ ok: false, error: 'Lỗi truy vấn dmnhanvien' });
    const nv = nvArr?.[0];
    if (!nv) return res.status(401).json({ ok: false, error: 'Mã nhân viên không tồn tại' });

    const matkhauDB = (nv.matkhau ?? '').toString().trim();
    const matkhauNhap = passwordNV.toString().trim();
    if (!matkhauDB || matkhauDB !== matkhauNhap) {
      return res.status(401).json({ ok: false, error: 'Mã nhân viên hoặc mật khẩu không đúng' });
    }

    // 2) bắt buộc phải là admin theo nội bộ
    if (!nv.is_admin) {
      return res.status(403).json({ ok: false, error: 'Không phải ADMIN' });
    }

    // 3) sign-in bằng ADMIN Auth account (để auth.uid() là admin thật)
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      return res.status(500).json({
        ok: false,
        error: 'Chưa cấu hình ADMIN_EMAIL/ADMIN_PASSWORD',
      });
    }

    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

    if (signInError) {
      return res.status(500).json({ ok: false, error: 'Đăng nhập ADMIN thất bại' });
    }

    const session = signInData?.session;
    if (!session?.access_token) {
      return res.status(500).json({ ok: false, error: 'Không lấy được session ADMIN' });
    }

    return res.status(200).json({
      ok: true,
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv,
        sua_hoadon: nv.sua_hoadon,
        xoa_hoadon: nv.xoa_hoadon,
        is_admin: true, // sẽ được authModule sync lại bằng rpc luôn
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      diadiem: diadiem || 'cs1',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Lỗi server không xác định' });
  }
}
