// /api/login-cs1.js
// Đăng nhập nhân viên cho cơ sở 1.
// - Bước 1: kiểm tra manv/passwordNV trong bảng dmnhanvien (dùng service_role để đọc, bỏ qua RLS)
// - Bước 2: nếu hợp lệ thì sign-in Supabase Auth bằng tài khoản WAREHOUSE_CS1_* để lấy session dùng cho toàn app
//
// Lưu ý: Endpoint đăng nhập là POST. GET/HEAD trả về 200 để tránh log đỏ 401/405
// trong trường hợp trang/tiện ích vô tình request endpoint như 1 resource.

import { createClient } from '@supabase/supabase-js';

function sendJson(res, status, obj) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function safeString(v) {
  return (v ?? '').toString();
}

export default async function handler(req, res) {
  // (Tuỳ chọn) CORS nhẹ cho an toàn khi có preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET, HEAD');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Nếu có GET/HEAD (bị load nhầm như resource) => trả 200 để khỏi log đỏ
  if (req.method === 'GET' || req.method === 'HEAD') {
    return sendJson(res, 200, {
      ok: true,
      hint: 'Use POST with JSON body: { manv, passwordNV, diadiem: \"cs1\" }',
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  // Parse body an toàn
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const manv = safeString(body?.manv).trim().toUpperCase();
  const passwordNV = safeString(body?.passwordNV);
  const diadiem = safeString(body?.diadiem || 'cs1').trim().toLowerCase();

  if (!manv || !passwordNV) {
    return sendJson(res, 400, { ok: false, error: 'Thiếu manv/passwordNV' });
  }

  // Endpoint này cố định cho CS1
  if (diadiem !== 'cs1') {
    return sendJson(res, 400, { ok: false, error: 'Endpoint này chỉ dùng cho cs1' });
  }

  const SUPABASE_URL =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trên Vercel',
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Kiểm tra nhân viên
    const { data: nv, error: nvErr } = await admin
      .from('dmnhanvien')
      .select('manv, tennv, matkhau, trangthai, is_admin')
      .eq('manv', manv)
      .maybeSingle();

    if (nvErr) {
      return sendJson(res, 500, {
        ok: false,
        error: `Lỗi truy vấn dmnhanvien: ${nvErr.message}`,
      });
    }

    if (!nv || nv.trangthai === false) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Sai mã nhân viên hoặc tài khoản bị khóa',
      });
    }

    if (safeString(nv.matkhau) !== passwordNV) {
      return sendJson(res, 401, { ok: false, error: 'Sai mã nhân viên hoặc mật khẩu' });
    }

    // 2) Sign-in bằng tài khoản kho CS1 để lấy session dùng trong app
    const warehouseEmail = process.env.WAREHOUSE_CS1_EMAIL;
    const warehousePassword = process.env.WAREHOUSE_CS1_PASSWORD;

    if (!warehouseEmail || !warehousePassword) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Chưa cấu hình WAREHOUSE_CS1_EMAIL/WAREHOUSE_CS1_PASSWORD trên Vercel',
      });
    }

    const { data: authData, error: authErr } = await admin.auth.signInWithPassword({
      email: warehouseEmail,
      password: warehousePassword,
    });

    if (authErr || !authData?.session) {
      return sendJson(res, 401, {
        ok: false,
        error: 'Không đăng nhập được tài khoản kho CS1 (WAREHOUSE_CS1_*)',
        detail: authErr?.message || null,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      diadiem: 'cs1',
      session: authData.session,
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv || '',
        is_admin: !!nv.is_admin,
      },
    });
  } catch (e) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Server error',
      detail: e?.message || String(e),
    });
  }
}
