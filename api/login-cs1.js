// /api/login-cs2.js
// Đăng nhập nhân viên cho CS2 – dùng service_role để đọc dmnhanvien (bỏ qua RLS)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WAREHOUSE_EMAIL_CS2 = process.env.WAREHOUSE_CS2_EMAIL;
const WAREHOUSE_PASSWORD_CS2 = process.env.WAREHOUSE_CS2_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong ENV');
}

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { manv, passwordNV, diadiem } = req.body || {};

    if (!manv || !passwordNV) {
      return res
        .status(400)
        .json({ ok: false, error: 'Thiếu mã nhân viên hoặc mật khẩu' });
    }

    const manvUpper = manv.toString().trim().toUpperCase();

    // 1. Lấy nhân viên bằng service_role (bỏ qua RLS)
    const { data: nvArr, error: errNV } = await supabaseAdmin
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon, xoa_hoadon, is_admin, matkhau')
      .eq('manv', manvUpper)
      .limit(1);

    // CHÈN LOG Ở ĐÂY
    console.log('LOGIN CS1 manvUpper =', manvUpper);
    console.log('LOGIN CS1 nvArr =', nvArr, 'errNV =', errNV);

    if (errNV) {
      console.error('Lỗi truy vấn dmnhanvien (CS2):', errNV);
      return res
        .status(500)
        .json({ ok: false, error: 'Lỗi truy vấn dmnhanvien' });
    }

    const nv = nvArr && nvArr[0];
    if (!nv) {
      return res
        .status(401)
        .json({ ok: false, error: 'Mã nhân viên không tồn tại' });
    }

    const matkhauDB = (nv.matkhau ?? '').toString().trim();
    const matkhauNhap = passwordNV.toString().trim();

    if (!matkhauDB || matkhauDB !== matkhauNhap) {
      return res
        .status(401)
        .json({ ok: false, error: 'Mã nhân viên hoặc mật khẩu không đúng' });
    }

    // 2. Đăng nhập tài khoản kho CS2 để lấy session Supabase
    if (!WAREHOUSE_EMAIL_CS2 || !WAREHOUSE_PASSWORD_CS2) {
      console.error(
        'Thiếu WAREHOUSE_CS2_EMAIL hoặc WAREHOUSE_CS2_PASSWORD trong ENV'
      );
      return res.status(500).json({
        ok: false,
        error: 'Chưa cấu hình tài khoản kho CS2 trên server',
      });
    }

    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: WAREHOUSE_EMAIL_CS2,
        password: WAREHOUSE_PASSWORD_CS2,
      });

    if (signInError) {
      console.error('Lỗi signInWithPassword CS2:', signInError);
      return res
        .status(500)
        .json({ ok: false, error: 'Đăng nhập tài khoản kho CS2 thất bại' });
    }

    const session = signInData?.session;
    if (!session || !session.access_token) {
      console.error('Không lấy được session Supabase CS2:', signInData);
      return res
        .status(500)
        .json({ ok: false, error: 'Không lấy được session Supabase' });
    }

    return res.status(200).json({
      ok: true,
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv,
        sua_hoadon: nv.sua_hoadon,
        xoa_hoadon: nv.xoa_hoadon,
        is_admin: nv.is_admin,
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      diadiem: diadiem || 'cs2',
    });
  } catch (err) {
    console.error('Lỗi không xác định ở login-cs2:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Lỗi server không xác định' });
  }
}
