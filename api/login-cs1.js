// /api/login-cs1.js
// Đăng nhập nhân viên cho CS1 – đọc dmnhanvien bằng SERVICE ROLE (bỏ qua RLS)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

// DÙNG SERVICE ROLE KEY ĐỂ ĐỌC dmnhanvien (bỏ qua RLS)
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tài khoản kho CS1 (email + mật khẩu) – cấu hình trong ENV Vercel
const WAREHOUSE_EMAIL_CS1 = process.env.WAREHOUSE_CS1_EMAIL;
const WAREHOUSE_PASSWORD_CS1 = process.env.WAREHOUSE_CS1_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong ENV');
}

// Client admin dùng service_role
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
      return res
        .status(400)
        .json({ ok: false, error: 'Thiếu mã nhân viên hoặc mật khẩu' });
    }

    const manvUpper = manv.toString().trim().toUpperCase();

    // 1. Lấy thông tin nhân viên bằng service_role (bỏ qua RLS)
    const { data: nvArr, error: errNV } = await supabaseAdmin
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon, xoa_hoadon, is_admin, matkhau')
      .eq('manv', manvUpper)
      .limit(1);

    if (errNV) {
      console.error('Lỗi truy vấn dmnhanvien (CS1):', errNV);
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

    // 1b. Kiểm tra mật khẩu nhân viên
    const matkhauDB = (nv.matkhau ?? '').toString().trim();
    const matkhauNhap = passwordNV.toString().trim();

    if (!matkhauDB || matkhauDB !== matkhauNhap) {
      return res
        .status(401)
        .json({ ok: false, error: 'Mã nhân viên hoặc mật khẩu không đúng' });
    }

    // 2. Đăng nhập tài khoản kho CS1 để lấy session Supabase (jwt)
    if (!WAREHOUSE_EMAIL_CS1 || !WAREHOUSE_PASSWORD_CS1) {
      console.error(
        'Thiếu WAREHOUSE_CS1_EMAIL hoặc WAREHOUSE_CS1_PASSWORD trong ENV',
      );
      return res.status(500).json({
        ok: false,
        error: 'Chưa cấu hình tài khoản kho CS1 trên server',
      });
    }

    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: WAREHOUSE_EMAIL_CS1,
        password: WAREHOUSE_PASSWORD_CS1,
      });

    if (signInError) {
      console.error('Lỗi signInWithPassword CS1:', signInError);
      return res
        .status(500)
        .json({ ok: false, error: 'Đăng nhập tài khoản kho CS1 thất bại' });
    }

    const session = signInData?.session;
    if (!session || !session.access_token) {
      console.error('Không lấy được session Supabase CS1:', signInData);
      return res
        .status(500)
        .json({ ok: false, error: 'Không lấy được session Supabase' });
    }

    // 3. Trả về cho frontend – giữ nguyên format cũ
    return res.status(200).json({
      ok: true,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv,
        sua_hoadon: nv.sua_hoadon,
        xoa_hoadon: nv.xoa_hoadon,
        is_admin: nv.is_admin,
      },
      diadiem: diadiem || 'cs1',
    });
  } catch (err) {
    console.error('Lỗi không xác định trong login-cs1:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'Lỗi server trong login-cs1' });
  }
}
