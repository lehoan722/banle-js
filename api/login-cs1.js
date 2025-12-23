// /api/login-cs1.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const WAREHOUSE_EMAIL = process.env.WAREHOUSE_CS1_EMAIL;
    const WAREHOUSE_PASSWORD = process.env.WAREHOUSE_CS1_PASSWORD;

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(500).json({ ok: false, error: "Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" });
    }

    const { manv, matkhau } = req.body || {};
    const manvUpper = String(manv || "").trim().toUpperCase();
    const pass = String(matkhau || "").trim();

    if (!manvUpper || !pass) {
      return res.status(400).json({ ok: false, error: "Thiếu mã nhân viên / mật khẩu" });
    }

    // 1) Check nhân viên bằng service_role (an toàn, bypass RLS)
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: nv, error: nvErr } = await sbAdmin
      .from("dmnhanvien")
      .select("manv, tennv, matkhau, is_admin, active")
      .eq("manv", manvUpper)
      .limit(1)
      .maybeSingle();

    if (nvErr) {
      return res.status(500).json({ ok: false, error: `DB error: ${nvErr.message}` });
    }
    if (!nv) {
      return res.status(401).json({ ok: false, error: "Mã nhân viên không tồn tại" });
    }
    if (nv.active === false) {
      return res.status(403).json({ ok: false, error: "Tài khoản đã bị khóa" });
    }
    if (String(nv.matkhau || "") !== pass) {
      return res.status(401).json({ ok: false, error: "Sai mật khẩu" });
    }

    const isInternalAdmin = nv.is_admin === true;

    // 2) Chọn account Supabase để sign-in
    const loginEmail = isInternalAdmin ? ADMIN_EMAIL : WAREHOUSE_EMAIL;
    const loginPassword = isInternalAdmin ? ADMIN_PASSWORD : WAREHOUSE_PASSWORD;

    if (!loginEmail || !loginPassword) {
      const need = isInternalAdmin ? "ADMIN_EMAIL/ADMIN_PASSWORD" : "WAREHOUSE_CS1_EMAIL/WAREHOUSE_CS1_PASSWORD";
      return res.status(500).json({ ok: false, error: `Chưa cấu hình ${need}` });
    }

    // 3) Sign in lấy session
    const sbAuth = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signInData, error: signInErr } = await sbAuth.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (signInErr || !signInData?.session) {
      return res.status(401).json({ ok: false, error: `Đăng nhập Supabase thất bại: ${signInErr?.message || "no session"}` });
    }

    // 4) Trả về
    return res.status(200).json({
      ok: true,
      diadiem: "cs1",
      nhanvien: {
        manv: nv.manv,
        tennv: nv.tennv || "",
        // giữ is_admin nội bộ để tương thích cũ (authModule sẽ override bằng RPC nếu bạn muốn)
        is_admin: !!nv.is_admin,
      },
      session: signInData.session,
      user: signInData.user,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
