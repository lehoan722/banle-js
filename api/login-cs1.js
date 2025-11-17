// api/login-cs1.js - phiên bản ESM cho dự án "type": "module"

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;

const WAREHOUSE_EMAIL    = process.env.WAREHOUSE_CS1_EMAIL;
const WAREHOUSE_PASSWORD = process.env.WAREHOUSE_CS1_PASSWORD;

function createServerSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_ANON_KEY trong ENV');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

export default async function handler(req, res) {
  // Chỉ cho phép POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { manv, passwordNV, diadiem } = req.body || {};

    if (!manv || !passwordNV) {
      return res.status(400).json({ ok: false, error: 'Thiếu mã nhân viên hoặc mật khẩu' });
    }

    const supabase = createServerSupabase();
    const manvUpper = String(manv).trim().toUpperCase();

    // 1. Lấy thông tin nhân viên + mật khẩu từ bảng dmnhanvien
    const { data: nvArr, error: errNV } = await supabase
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon, matkhau')
      .eq('manv', manvUpper)
      .limit(1);

    if (errNV) {
      console.error('Lỗi truy vấn dmnhanvien:', errNV);
      return res.status(500).json({ ok: false, error: 'Lỗi truy vấn dmnhanvien' });
    }

    const nv = nvArr && nvArr[0];
    if (!nv) {
      return res.status(401).json({ ok: false, error: 'Mã nhân viên không tồn tại' });
    }

    // 1b. So sánh mật khẩu nhân viên
    const matkhauDB = (nv.matkhau ?? '').toString().trim();
    const matkhauNhap = passwordNV.toString().trim();

    if (!matkhauDB || matkhauDB !== matkhauNhap) {
      return res.status(401).json({ ok: false, error: 'Mã nhân viên hoặc mật khẩu không đúng' });
    }

    // 2. Đăng nhập tài khoản kho CS1 bằng email + password từ ENV
    if (!WAREHOUSE_EMAIL || !WAREHOUSE_PASSWORD) {
      console.error('Thiếu WAREHOUSE_CS1_EMAIL hoặc WAREHOUSE_CS1_PASSWORD');
      return res.status(500).json({ ok: false, error: 'Chưa cấu hình email/mật khẩu kho CS1 trên server' });
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: WAREHOUSE_EMAIL,
      password: WAREHOUSE_PASSWORD
    });

    if (authError) {
      console.error('Đăng nhập tài khoản kho CS1 thất bại:', authError);
      return res.status(500).json({ ok: false, error: 'Không đăng nhập được tài khoản kho CS1' });
    }

    const session = authData?.session;
    if (!session || !session.access_token || !session.refresh_token) {
      console.error('Không lấy được session Supabase hợp lệ');
      return res.status(500).json({ ok: false, error: 'Không lấy được session Supabase' });
    }

    // 3. Trả về session + thông tin nhân viên cho frontend
    return res.status(200).json({
      ok: true,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      },
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv,
        sua_hoadon: nv.sua_hoadon
      },
      diadiem: diadiem || 'cs1'
    });
  } catch (err) {
    console.error('Lỗi không xác định trong login-cs1:', err);
    return res.status(500).json({ ok: false, error: 'Lỗi server trong login-cs1' });
  }
}
