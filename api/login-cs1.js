// /api/login-cs1.js
// Đăng nhập nhân viên cho CƠ SỞ 1
// - Kiểm tra dmnhanvien (mã NV + mật khẩu NV + cơ sở)
// - Nếu OK thì đăng nhập tài khoản kỹ thuật (email kho CS1) để lấy session Supabase
// - Trả về: { ok, session, nhanvien, diadiem }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tài khoản kỹ thuật dùng để đăng nhập Supabase Auth cho CS1
const APP_EMAIL_CS1 = process.env.APP_EMAIL_CS1;
const APP_PASSWORD_CS1 = process.env.APP_PASSWORD_CS1;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { manv, passwordNV, diadiem } = req.body || {};

    if (!manv || !passwordNV || !diadiem) {
      return res
        .status(400)
        .json({ ok: false, error: "Thiếu mã nhân viên / mật khẩu / cơ sở" });
    }

    // 1. Lấy thông tin nhân viên từ dmnhanvien
    const { data: nvRows, error: nvError } = await supabaseAdmin
      .from("dmnhanvien")
      .select("*")
      .eq("manv", manv)
      .eq("diadiem", diadiem)
      .limit(1);

    if (nvError) {
      console.error("Lỗi truy vấn dmnhanvien:", nvError);
      return res
        .status(500)
        .json({ ok: false, error: "Lỗi truy vấn dmnhanvien" });
    }

    if (!nvRows || nvRows.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "Không tìm thấy nhân viên phù hợp" });
    }

    const nhanvien = nvRows[0];

    // 2. Kiểm tra mật khẩu nhân viên
    //   -> cột mật khẩu NV trong bảng dmnhanvien ví dụ là `password_nv`
    if (nhanvien.password_nv !== passwordNV) {
      return res
        .status(400)
        .json({ ok: false, error: "Sai mật khẩu nhân viên" });
    }

    // 3. Đăng nhập tài khoản kỹ thuật Supabase cho CS1
    if (!APP_EMAIL_CS1 || !APP_PASSWORD_CS1) {
      console.error("Thiếu APP_EMAIL_CS1 / APP_PASSWORD_CS1 trong env");
      return res
        .status(500)
        .json({ ok: false, error: "Server chưa cấu hình tài khoản CS1" });
    }

    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: APP_EMAIL_CS1,
        password: APP_PASSWORD_CS1,
      });

    if (signInError) {
      console.error("Lỗi signInWithPassword CS1:", signInError);
      return res
        .status(500)
        .json({ ok: false, error: "Không đăng nhập được Supabase CS1" });
    }

    const session = signInData?.session;
    if (!session || !session.access_token || !session.refresh_token) {
      console.error("Không nhận được session hợp lệ:", signInData);
      return res
        .status(500)
        .json({ ok: false, error: "Session Supabase không hợp lệ" });
    }

    // 4. Trả kết quả cho frontend
    return res.status(200).json({
      ok: true,
      session,
      nhanvien,
      diadiem, // cs1
    });
  } catch (err) {
    console.error("Lỗi không xác định trong login-cs1:", err);
    return res.status(500).json({ ok: false, error: "Lỗi server login-cs1" });
  }
}
