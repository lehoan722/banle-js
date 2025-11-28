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

// Hàm xử lý login cho CS1
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { manv, passwordNV, diadiem } = req.body || {};

    if (!manv || !passwordNV) {
      return res.status(400).json({ ok: false, error: 'Thiếu manv hoặc passwordNV' });
    }

    const supabase = createServerSupabase();
    const manvUpper = manv.toString().trim().toUpperCase();

    // 1. Lấy thông tin nhân viên + mật khẩu từ bảng dmnhanvien
    const { data: nvArr, error: errNV } = await supabase
      .from('dmnhanvien')
      .select('manv, tennv, sua_hoadon, xoa_hoadon, is_admin, matkhau')
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

    // 2. Đăng nhập "tài khoản kho" để lấy session Supabase (service user)
    if (!WAREHOUSE_EMAIL || !WAREHOUSE_PASSWORD) {
      console.error('Thiếu WAREHOUSE_CS1_EMAIL hoặc WAREHOUSE_CS1_PASSWORD trong ENV');
      return res.status(500).json({ ok: false, error: 'Chưa cấu hình tài khoản kho CS1 trên server' });
    }

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: WAREHOUSE_EMAIL,
        password: WAREHOUSE_PASSWORD
      })
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      console.error('Lỗi đăng nhập tài khoản kho CS1:', errText);
      return res.status(500).json({ ok: false, error: 'Đăng nhập tài khoản kho CS1 thất bại' });
    }

    const session = await authRes.json();
    if (!session || !session.access_token) {
      console.error('Không lấy được access_token từ tài khoản kho CS1:', session);
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
        sua_hoadon: nv.sua_hoadon,
        xoa_hoadon: nv.xoa_hoadon,
        is_admin: nv.is_admin
      },
      diadiem: diadiem || 'cs1'
    });
  } catch (err) {
    console.error('Lỗi không xác định trong login-cs1:', err);
    return res.status(500).json({ ok: false, error: 'Lỗi server trong login-cs1' });
  }
}
