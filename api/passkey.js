// /api/passkey.js
// Hoan Tuyet Passkey API - gộp 2 chức năng vào 1 Vercel Function.
// POST JSON:
//   { action: "bootstrap", manv, passwordNV, diadiem? }
//   { action: "exchange", diadiem? } + Authorization: Bearer <identity access token>
//
// bootstrap:
//   - Xác thực mã NV + mật khẩu hiện tại trong dmnhanvien
//   - Tạo/đồng bộ Supabase Auth user RIÊNG cho nhân viên
//   - Gắn auth.users.id vào dmnhanvien.user_id
//
// exchange:
//   - Xác minh identity access token sau Passkey
//   - Map auth user -> admin_users hoặc dmnhanvien
//   - Với nhân viên: đổi sang warehouse session CS1/CS2 để giữ nguyên RLS/RPC hiện hữu

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const WAREHOUSE_EMAIL_CS1 = process.env.WAREHOUSE_CS1_EMAIL;
const WAREHOUSE_PASSWORD_CS1 = process.env.WAREHOUSE_CS1_PASSWORD;
const WAREHOUSE_EMAIL_CS2 = process.env.WAREHOUSE_CS2_EMAIL;
const WAREHOUSE_PASSWORD_CS2 = process.env.WAREHOUSE_CS2_PASSWORD;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function syntheticEmail(manv) {
  const safe = String(manv || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");
  return `employee.${safe}@auth.hoantuyet.vn`;
}

function pickWarehouse(raw) {
  const cs = String(raw || "cs1").toLowerCase() === "cs2" ? "cs2" : "cs1";
  return cs === "cs2"
    ? {
        diadiem: "cs2",
        email: WAREHOUSE_EMAIL_CS2,
        password: WAREHOUSE_PASSWORD_CS2,
      }
    : {
        diadiem: "cs1",
        email: WAREHOUSE_EMAIL_CS1,
        password: WAREHOUSE_PASSWORD_CS1,
      };
}

async function handleBootstrap(req, res) {
  const { manv, passwordNV } = req.body || {};
  const manvUpper = String(manv || "").trim().toUpperCase();
  const password = String(passwordNV || "");

  if (!manvUpper || !password) {
    return res
      .status(400)
      .json({ ok: false, error: "Thiếu mã nhân viên hoặc mật khẩu" });
  }

  const { data: nv, error: nvErr } = await admin
    .from("dmnhanvien")
    .select(
      "manv, tennv, matkhau, trangthai, sua_hoadon, xoa_hoadon, user_id"
    )
    .eq("manv", manvUpper)
    .maybeSingle();

  if (nvErr) {
    console.error("passkey bootstrap - dmnhanvien error:", nvErr);
    return res.status(500).json({ ok: false, error: "Lỗi đọc dmnhanvien" });
  }

  if (!nv) {
    return res
      .status(401)
      .json({ ok: false, error: "Mã nhân viên không tồn tại" });
  }

  if (nv.trangthai === false) {
    return res
      .status(403)
      .json({ ok: false, error: "Nhân viên đang bị khóa" });
  }

  if (!nv.matkhau || String(nv.matkhau) !== password) {
    return res
      .status(401)
      .json({ ok: false, error: "Mật khẩu nhân viên không đúng" });
  }

  let userId = nv.user_id || null;
  let identityEmail = syntheticEmail(manvUpper);

  // Nếu đã có user_id: kiểm tra Auth user còn tồn tại và đồng bộ mật khẩu hiện tại.
  if (userId) {
    const { data: existing, error: getErr } =
      await admin.auth.admin.getUserById(userId);

    if (!getErr && existing?.user) {
      identityEmail = existing.user.email || identityEmail;

      const { error: updateErr } =
        await admin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existing.user.user_metadata || {}),
            manv: manvUpper,
            account_type: "employee",
          },
        });

      if (updateErr) {
        console.error("passkey bootstrap - update auth user error:", updateErr);
        return res.status(500).json({
          ok: false,
          error: "Không đồng bộ được Auth user nhân viên",
        });
      }
    } else {
      // DB đang trỏ tới Auth user không còn tồn tại -> tạo lại.
      userId = null;
    }
  }

  if (!userId) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: identityEmail,
        password,
        email_confirm: true,
        user_metadata: {
          manv: manvUpper,
          account_type: "employee",
        },
      });

    if (createErr || !created?.user?.id) {
      console.error("passkey bootstrap - create auth user error:", createErr);
      return res.status(500).json({
        ok: false,
        error:
          "Không tạo được Auth user riêng cho nhân viên: " +
          (createErr?.message || "unknown"),
      });
    }

    userId = created.user.id;
    identityEmail = created.user.email || identityEmail;

    const { error: linkErr } = await admin
      .from("dmnhanvien")
      .update({ user_id: userId })
      .eq("manv", manvUpper);

    if (linkErr) {
      console.error("passkey bootstrap - link dmnhanvien error:", linkErr);
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch {}

      return res.status(500).json({
        ok: false,
        error: "Không liên kết được user_id vào dmnhanvien",
      });
    }
  }

  return res.status(200).json({
    ok: true,
    action: "bootstrap",
    user_id: userId,
    identity_email: identityEmail,
    nhanvien: {
      manv: nv.manv,
      tennv: nv.tennv,
      sua_hoadon: !!nv.sua_hoadon,
      xoa_hoadon: !!nv.xoa_hoadon,
      is_admin: false,
    },
  });
}

async function handleExchange(req, res) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!token) {
    return res
      .status(401)
      .json({ ok: false, error: "Thiếu identity access token" });
  }

  // Không tin user_id từ frontend. Luôn xác minh access token với Supabase Auth.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;

  if (userErr || !uid) {
    console.error("passkey exchange - invalid identity token:", userErr);
    return res
      .status(401)
      .json({ ok: false, error: "Identity session không hợp lệ" });
  }

  // 1) Kiểm tra admin trước.
  const { data: adm, error: admErr } = await admin
    .from("admin_users")
    .select("user_id, manv, tenadmin, active, is_admin")
    .eq("user_id", uid)
    .maybeSingle();

  if (admErr) {
    console.error("passkey exchange - admin_users error:", admErr);
    return res.status(500).json({
      ok: false,
      error: "Lỗi kiểm tra tài khoản admin",
    });
  }

  if (adm) {
    if (adm.active === false || adm.is_admin === false) {
      return res
        .status(403)
        .json({ ok: false, error: "Tài khoản admin đang bị khóa" });
    }

    return res.status(200).json({
      ok: true,
      action: "exchange",
      kind: "admin",
      profile: {
        manv: String(adm.manv || "ADMIN").trim().toUpperCase(),
        tennv: String(adm.tenadmin || adm.manv || "ADMIN").trim(),
        sua_hoadon: true,
        xoa_hoadon: true,
        is_admin: true,
      },
    });
  }

  // 2) Nhân viên.
  const { data: nv, error: nvErr } = await admin
    .from("dmnhanvien")
    .select("manv, tennv, trangthai, sua_hoadon, xoa_hoadon, user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (nvErr) {
    console.error("passkey exchange - dmnhanvien error:", nvErr);
    return res.status(500).json({
      ok: false,
      error: "Lỗi kiểm tra nhân viên",
    });
  }

  if (!nv) {
    return res.status(403).json({
      ok: false,
      error: "Passkey chưa được liên kết với nhân viên",
    });
  }

  if (nv.trangthai === false) {
    return res
      .status(403)
      .json({ ok: false, error: "Nhân viên đang bị khóa" });
  }

  const wh = pickWarehouse(req.body?.diadiem);

  if (!wh.email || !wh.password) {
    return res.status(500).json({
      ok: false,
      error: `Thiếu ENV warehouse ${wh.diadiem}`,
    });
  }

  const authClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } =
    await authClient.auth.signInWithPassword({
      email: wh.email,
      password: wh.password,
    });

  if (signInErr || !signInData?.session) {
    console.error("passkey exchange - warehouse login error:", signInErr);
    return res.status(500).json({
      ok: false,
      error: "Không tạo được warehouse session",
    });
  }

  return res.status(200).json({
    ok: true,
    action: "exchange",
    kind: "employee",
    diadiem: wh.diadiem,
    profile: {
      manv: nv.manv,
      tennv: nv.tennv,
      sua_hoadon: !!nv.sua_hoadon,
      xoa_hoadon: !!nv.xoa_hoadon,
      is_admin: false,
    },
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    },
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong ENV",
    });
  }

  try {
    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();

    if (action === "bootstrap") {
      return await handleBootstrap(req, res);
    }

    if (action === "exchange") {
      return await handleExchange(req, res);
    }

    return res.status(400).json({
      ok: false,
      error: "action không hợp lệ. Chỉ chấp nhận bootstrap hoặc exchange",
    });
  } catch (err) {
    console.error("passkey API error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Lỗi server không xác định" });
  }
}
