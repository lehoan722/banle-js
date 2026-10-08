// /api/login-cs1.js
// Dang nhap nhan vien dung chung CS1/CS2 + rate limit chong thu mat khau lien tuc.
// - POST JSON: { manv, passwordNV, diadiem: "cs1"|"cs2" }
// - 401: sai ma NV/mat khau
// - 403: tai khoan nhan vien bi khoa
// - 429: thu sai qua nhieu lan, tam khoa dang nhap
// - API nay KHONG dung cho ADMIN.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const WAREHOUSE_EMAIL_CS1 = process.env.WAREHOUSE_CS1_EMAIL;
const WAREHOUSE_PASSWORD_CS1 = process.env.WAREHOUSE_CS1_PASSWORD;
const WAREHOUSE_EMAIL_CS2 = process.env.WAREHOUSE_CS2_EMAIL;
const WAREHOUSE_PASSWORD_CS2 = process.env.WAREHOUSE_CS2_PASSWORD;

// Co the tao ENV RATE_LIMIT_SECRET rieng sau nay.
// Neu chua co, dung SERVICE_ROLE_KEY lam secret HMAC phia server (khong lo ra frontend).
const RATE_LIMIT_SECRET =
  process.env.RATE_LIMIT_SECRET || SUPABASE_SERVICE_ROLE_KEY || "";

// Cau hinh hien tai: uu tien an toan nhung khong de khoa nham cua hang.
const ACCOUNT_IP_LIMIT = {
  threshold: 5,
  windowSeconds: 10 * 60,
  blockSeconds: 15 * 60,
};

const IP_LIMIT = {
  threshold: 30,
  windowSeconds: 10 * 60,
  blockSeconds: 30 * 60,
};

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

function getClientIp(req) {
  const xff = req.headers?.["x-forwarded-for"];
  if (Array.isArray(xff) && xff[0]) return String(xff[0]).split(",")[0].trim();
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();

  const realIp = req.headers?.["x-real-ip"];
  if (Array.isArray(realIp) && realIp[0]) return String(realIp[0]).trim();
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();

  return String(req.socket?.remoteAddress || "unknown").trim();
}

function hmacKey(value) {
  return crypto
    .createHmac("sha256", RATE_LIMIT_SECRET)
    .update(String(value))
    .digest("hex");
}

function normalizeRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function checkOneRateLimit(supabaseAdmin, keyHash, scope, cfg) {
  const { data, error } = await supabaseAdmin.rpc("auth_rate_limit_check", {
    p_key_hash: keyHash,
    p_scope: scope,
    p_window_seconds: cfg.windowSeconds,
  });

  if (error) {
    // Fail-open: loi he thong rate-limit khong duoc lam dung ban hang.
    console.warn(`Rate-limit CHECK ${scope} failed:`, error.message);
    return { allowed: true, retry_after_seconds: 0, rateLimitError: true };
  }

  return normalizeRpcRow(data) || {
    allowed: true,
    retry_after_seconds: 0,
  };
}

async function recordOneFailure(supabaseAdmin, keyHash, scope, cfg) {
  const { data, error } = await supabaseAdmin.rpc("auth_rate_limit_fail", {
    p_key_hash: keyHash,
    p_scope: scope,
    p_threshold: cfg.threshold,
    p_window_seconds: cfg.windowSeconds,
    p_block_seconds: cfg.blockSeconds,
  });

  if (error) {
    console.warn(`Rate-limit FAIL ${scope} failed:`, error.message);
    return { allowed: true, retry_after_seconds: 0, rateLimitError: true };
  }

  return normalizeRpcRow(data) || {
    allowed: true,
    retry_after_seconds: 0,
  };
}

async function resetOneRateLimit(supabaseAdmin, keyHash) {
  const { error } = await supabaseAdmin.rpc("auth_rate_limit_reset", {
    p_key_hash: keyHash,
  });
  if (error) console.warn("Rate-limit RESET failed:", error.message);
}

function sendRateLimited(res, retrySeconds) {
  const retry = Math.max(1, Number(retrySeconds) || 60);
  res.setHeader("Retry-After", String(retry));
  return res.status(429).json({
    ok: false,
    code: "LOGIN_RATE_LIMITED",
    retry_after_seconds: retry,
    error: `Ban da nhap sai qua nhieu lan. Vui long thu lai sau ${Math.ceil(
      retry / 60
    )} phut.`,
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong ENV",
      });
    }

    if (!RATE_LIMIT_SECRET) {
      return res.status(500).json({
        ok: false,
        error: "Khong khoi tao duoc RATE_LIMIT_SECRET",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed. Use POST with JSON body.",
      });
    }

    let body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      body = await readBody(req).catch(() => null);
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        ok: false,
        error: "Body JSON khong hop le",
      });
    }

    const manvUpper = String(body.manv || "").trim().toUpperCase();
    const passwordNV = String(body.passwordNV || "").trim();
    const { diadiem, email: warehouseEmail, password: warehousePassword } =
      pickWarehouse(body.diadiem);

    if (!manvUpper || !passwordNV) {
      return res.status(400).json({
        ok: false,
        error: "Thieu manv hoac passwordNV",
      });
    }

    if (!warehouseEmail || !warehousePassword) {
      return res.status(500).json({
        ok: false,
        error: `Chua cau hinh WAREHOUSE_${diadiem.toUpperCase()}_EMAIL/PASSWORD`,
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // =========================================================
    // RATE LIMIT: kiem tra TRUOC khi doc/so sanh mat khau.
    // Khong luu IP tho vao DB; chi luu HMAC fingerprint.
    // =========================================================
    const clientIp = getClientIp(req);
    const accountIpKey = hmacKey(`ACCOUNT_IP|${diadiem}|${manvUpper}|${clientIp}`);
    const ipKey = hmacKey(`IP|${clientIp}`);

    const [accountStatus, ipStatus] = await Promise.all([
      checkOneRateLimit(
        supabaseAdmin,
        accountIpKey,
        "ACCOUNT_IP",
        ACCOUNT_IP_LIMIT
      ),
      checkOneRateLimit(supabaseAdmin, ipKey, "IP", IP_LIMIT),
    ]);

    if (accountStatus.allowed === false || ipStatus.allowed === false) {
      const retry = Math.max(
        Number(accountStatus.retry_after_seconds) || 0,
        Number(ipStatus.retry_after_seconds) || 0
      );
      return sendRateLimited(res, retry);
    }

    // 1) Dung service_role de doc dmnhanvien (bo qua RLS)
    const { data: nvArr, error: nvErr } = await supabaseAdmin
      .from("dmnhanvien")
      .select("*")
      .ilike("manv", manvUpper)
      .limit(1);

    const nv = Array.isArray(nvArr) ? nvArr[0] : null;

    if (nvErr) {
      return res.status(500).json({
        ok: false,
        error: "Loi doc dmnhanvien: " + nvErr.message,
      });
    }

    const storedPass =
      nv?.matkhau ??
      nv?.matkhaunv ??
      nv?.password ??
      nv?.pass ??
      nv?.mat_khau ??
      null;

    const storedPassNormalized = String(storedPass ?? "").trim();
    const credentialsOk =
      !!nv &&
      !!storedPassNormalized &&
      storedPassNormalized === passwordNV;

    if (!credentialsOk) {
      // Ghi dong thoi 2 lop. Khong tiet lo ma NV co ton tai hay khong.
      const [accountFail, ipFail] = await Promise.all([
        recordOneFailure(
          supabaseAdmin,
          accountIpKey,
          "ACCOUNT_IP",
          ACCOUNT_IP_LIMIT
        ),
        recordOneFailure(supabaseAdmin, ipKey, "IP", IP_LIMIT),
      ]);

      if (accountFail.allowed === false || ipFail.allowed === false) {
        const retry = Math.max(
          Number(accountFail.retry_after_seconds) || 0,
          Number(ipFail.retry_after_seconds) || 0
        );
        return sendRateLimited(res, retry);
      }

      // Thong bao chung de tranh do tim ma nhan vien hop le.
      return res.status(401).json({
        ok: false,
        error: "Ma nhan vien hoac mat khau khong dung",
      });
    }

    if (nv.active === false || nv.trangthai === false) {
      return res.status(403).json({ ok: false, error: "Nhan vien dang bi khoa" });
    }

    // 2) Dang nhap Supabase bang tai khoan warehouse cua dung co so.
    const supabaseAuth = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
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
          "Dang nhap warehouse that bai: " +
          (signInErr?.message || "Khong co session"),
      });
    }

    const session = signInData.session;

    // Dang nhap thanh cong: xoa bo dem ACCOUNT+IP nay.
    // Co y GIU bo dem IP tong de van chan duoc brute-force tren nhieu tai khoan.
    await resetOneRateLimit(supabaseAdmin, accountIpKey);

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
      error: "Loi server: " + (err?.message || "khong xac dinh"),
    });
  }
}
