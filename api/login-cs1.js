// /api/login-cs1.js
// Đăng nhập nhân viên (CS1/CS2) + trả session Supabase theo tài khoản kho (warehouse)
// - POST JSON: { manv, passwordNV, diadiem: "cs1"|"cs2" }
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
  const diadiem = String(diadiemRaw || "cs1").toLowerCase();
  if (diadiem === "cs2") {
    return {
      diadiem: "cs2",
      email: WAREHOUSE_EMAIL_CS2,
      password: WAREHOUSE_PASSWORD_CS2,
    };
  }
  return {
    diadiem: "cs1",
    email: WAREHOUSE_EMAIL_CS1,
    password: WAREHOUSE_PASSWORD_CS1,
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

    // Nếu ai đó mở trực tiếp /api/login-cs1 trên trình duyệt => GET
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST with JSON body.",
      });
    }

    // Vercel/Next có thể đã parse JSON sẵn vào req.body.
    // Chỉ đọc stream thủ công khi req.body chưa có để tránh mất body.
    let body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      body = await readBody(req).catch(() => null);
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        ok: false,
        error: "Body JSON không hợp lệ",
      });
    }

    const manvUpper = String(body.manv || "").trim().toUpperCase();
    // Giữ tương thích login-cs2 cũ: bỏ khoảng trắng thừa hai đầu mật khẩu.
    const passwordNV = String(body.passwordNV || "").trim();
    const { diadiem, email: warehouseEmail, password: warehousePassword } =
      pickWarehouse(body.diadiem);

    if (!manvUpper || !passwordNV) {
      return res.status(400).json({
        ok: false,
        error: "Thiếu manv hoặc passwordNV",
      });
    }

    if (!warehouseEmail || !warehousePassword) {
      return res.status(500).json({
        ok: false,
        error: `Chưa cấu hình WAREHOUSE_${diadiem.toUpperCase()}_EMAIL/PASSWORD`,
      });
    }

    // 1) Dùng service_role để đọc dmnhanvien (bỏ qua RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: nvArr, error: nvErr } = await supabaseAdmin
      .from("dmnhanvien")
      .select("*")
      // ilike không phân biệt hoa/thường, tránh tài khoản cũ lưu manv khác kiểu chữ.
      .ilike("manv", manvUpper)
      .limit(1);

    const nv = Array.isArray(nvArr) ? nvArr[0] : null;

    if (nvErr) {
      return res.status(500).json({
        ok: false,
        error: "Lỗi đọc dmnhanvien: " + nvErr.message,
      });
    }

    if (!nv) {
      return res.status(401).json({ ok: false, error: "Sai mã nhân viên" });
    }

    // Tên cột mật khẩu có thể khác nhau giữa các bản (matkhau / matkhaunv / password...)
    const storedPass =
      nv.matkhau ??
      nv.matkhaunv ??
      nv.password ??
      nv.pass ??
      nv.mat_khau ??
      null;

    const storedPassNormalized = String(storedPass ?? "").trim();
    if (!storedPassNormalized || storedPassNormalized !== passwordNV) {
      return res.status(401).json({ ok: false, error: "Sai mật khẩu nhân viên" });
    }

    // Hỗ trợ cả tên cột active cũ và trangthai đang dùng ở authModule.
    if (nv.active === false || nv.trangthai === false) {
      return res.status(403).json({ ok: false, error: "Nhân viên đang bị khóa" });
    }

    // 2) Đăng nhập Supabase bằng tài khoản kho (warehouse) để lấy session token
    const supabaseAuth = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: signInData, error: signInErr } =
      await supabaseAuth.auth.signInWithPassword({
        email: warehouseEmail,
        password: warehousePassword,
      });

    if (signInErr || !signInData?.session) {
      return res.status(500).json({
        ok: false,
        error:
          "Đăng nhập warehouse thất bại: " +
          (signInErr?.message || "Không có session"),
      });
    }

    const session = signInData.session;

    // 3) Trả về thông tin nhân viên + token
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
      diadiem,
    });
  } catch (err) {
    console.error("login-cs1 error:", err);
    return res.status(500).json({
      ok: false,
      error: "Lỗi server: " + (err?.message || "không xác định"),
    });
  }
}
