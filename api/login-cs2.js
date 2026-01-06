// /api/login-cs2.js
// Đăng nhập nhân viên + trả session Supabase theo tài khoản kho (warehouse) (ưu tiên CS2)
// - POST JSON: { manv, passwordNV, diadiem: "cs2" (mặc định) hoặc "cs1" }
// - 401: sai mã nv hoặc sai mật khẩu
// - 403: tài khoản nhân viên bị khóa (active=false) (nếu có cột active)
// - 405: gọi sai method (GET/PUT...)
// Lưu ý: API này KHÔNG dùng cho đăng nhập ADMIN (ADMIN dùng /api/login-admin)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const WAREHOUSE_EMAIL_CS1 = process.env.WAREHOUSE_CS1_EMAIL;
const WAREHOUSE_PASSWORD_CS1 = process.env.WAREHOUSE_CS1_PASSWORD;

const WAREHOUSE_EMAIL_CS2 = process.env.WAREHOUSE_CS2_EMAIL;
const WAREHOUSE_PASSWORD_CS2 = process.env.WAREHOUSE_CS2_PASSWORD;

function pickWarehouse(diadiemRaw) {
  const diadiem = String(diadiemRaw || "cs2").toLowerCase();
  if (diadiem === "cs1") {
    return {
      diadiem: "cs1",
      email: WAREHOUSE_EMAIL_CS1,
      password: WAREHOUSE_PASSWORD_CS1,
    };
  }
  return {
    diadiem: "cs2",
    email: WAREHOUSE_EMAIL_CS2,
    password: WAREHOUSE_PASSWORD_CS2,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong ENV",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST with JSON body.",
      });
    }

    const body = await readBody(req).catch(() => null);
    const { manv, passwordNV, diadiem } = body || {};

    if (!manv || !passwordNV) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu mã nhân viên hoặc mật khẩu",
      });
    }

    const manvUpper = String(manv).trim().toUpperCase();

    // 1) Đọc nhân viên bằng service_role (bỏ qua RLS)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: nv, error: nvErr } = await adminClient
      .from("dmnhanvien")
      .select("manv,tennv,matkhau,matkhaunv,password,pass,mat_khau,active,sua_hoadon,xoa_hoadon,is_admin")
      .eq("manv", manvUpper)
      .maybeSingle();

    if (nvErr) {
      return res.status(500).json({
        ok: false,
        error: "Lỗi đọc dmnhanvien: " + nvErr.message,
      });
    }

    if (!nv) {
      return res.status(401).json({ ok: false, error: "Sai mã nhân viên" });
    }

    // 2) Check mật khẩu nhân viên (hỗ trợ nhiều tên cột)
    const storedPass =
      nv.matkhau ??
      nv.matkhaunv ??
      nv.password ??
      nv.pass ??
      nv.mat_khau ??
      null;

    if (String(storedPass ?? "") !== String(passwordNV)) {
      return res.status(401).json({ ok: false, error: "Sai mật khẩu nhân viên" });
    }

    // Nếu có cột active để khóa NV
    if (nv.active === false) {
      return res.status(403).json({ ok: false, error: "Nhân viên đang bị khóa" });
    }

    // 3) Đăng nhập tài khoản kho (warehouse) để lấy session Supabase
    if (!SUPABASE_ANON_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Thiếu SUPABASE_ANON_KEY trong ENV",
      });
    }

    const wh = pickWarehouse(diadiem);
    if (!wh.email || !wh.password) {
      return res.status(500).json({
        ok: false,
        error: `Chưa cấu hình tài khoản kho cho ${wh.diadiem} (WAREHOUSE_${wh.diadiem.toUpperCase()}_EMAIL/PASSWORD)`,
      });
    }

    const warehouseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInErr } =
      await warehouseClient.auth.signInWithPassword({
        email: wh.email,
        password: wh.password,
      });

    if (signInErr) {
      return res.status(500).json({
        ok: false,
        error: "Warehouse login failed: " + signInErr.message,
      });
    }

    const session = signInData?.session;
    if (!session?.access_token || !session?.refresh_token) {
      return res.status(500).json({
        ok: false,
        error: "Không lấy được session Supabase",
      });
    }

    // 4) Trả về thông tin nhân viên + token
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
      diadiem: wh.diadiem,
    });
  } catch (err) {
    console.error("login-cs2 error:", err);
    return res.status(500).json({
      ok: false,
      error: "Lỗi server không xác định",
    });
  }
}
