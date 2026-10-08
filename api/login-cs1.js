// /api/login-cs1.js
// Dang nhap nhan vien dung chung CS1/CS2 + rate limit + nhat ky dang nhap.
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

const RATE_LIMIT_SECRET =
  process.env.RATE_LIMIT_SECRET || SUPABASE_SERVICE_ROLE_KEY || "";

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

function maxDateIso(...values) {
  const dates = values
    .filter(Boolean)
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
}

async function checkOneRateLimit(supabaseAdmin, keyHash, scope, cfg) {
  const { data, error } = await supabaseAdmin.rpc("auth_rate_limit_check", {
    p_key_hash: keyHash,
    p_scope: scope,
    p_window_seconds: cfg.windowSeconds,
  });

  if (error) {
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

async function ghiLichSu(supabaseAdmin, thongtin) {
  try {
    const { error } = await supabaseAdmin.from("lichsu_dangnhap").insert({
      thoigian: new Date().toISOString(),
      loai_taikhoan: "nhanvien",
      manv_nhap: thongtin.manv_nhap || null,
      manv_xacnhan: thongtin.manv_xacnhan || null,
      diadiem: thongtin.diadiem || null,
      ketqua: thongtin.ketqua,
      lydo: thongtin.lydo || null,
      solan_sai: Number.isFinite(Number(thongtin.solan_sai))
        ? Number(thongtin.solan_sai)
        : null,
      khoa_den: thongtin.khoa_den || null,
      phamvi_khoa: thongtin.phamvi_khoa || null,
      diachi_ip_tho: thongtin.diachi_ip_tho || null,
      diachi_ip_bam: thongtin.diachi_ip_bam || null,
      taikhoan_ip_bam: thongtin.taikhoan_ip_bam || null,
      thongtin_thietbi: String(thongtin.thongtin_thietbi || "").slice(0, 500) || null,
      ma_yeucau: thongtin.ma_yeucau,
      thoigian_phanhoi_ms: Math.max(0, Date.now() - thongtin.batdau_ms),
      dangnhap_bang: "matkhau",
    });
    if (error) console.warn("Khong ghi duoc lichsu_dangnhap:", error.message);
  } catch (e) {
    // Fail-open: loi nhat ky khong duoc lam dung dang nhap.
    console.warn("ghiLichSu error:", e?.message || e);
  }
}

function sendRateLimited(res, retrySeconds, phamviKhoa, khoaDen) {
  const retry = Math.max(1, Number(retrySeconds) || 60);
  res.setHeader("Retry-After", String(retry));
  return res.status(429).json({
    ok: false,
    code: "LOGIN_RATE_LIMITED",
    ma_loi: "VUOT_GIOI_HAN",
    retry_after_seconds: retry,
    thu_lai_sau_giay: retry,
    phamvi_khoa: phamviKhoa || "TAIKHOAN_IP",
    khoa_den: khoaDen || new Date(Date.now() + retry * 1000).toISOString(),
    error: `Ban da nhap sai qua nhieu lan. Vui long thu lai sau ${Math.ceil(
      retry / 60
    )} phut.`,
  });
}


// =========================================================
// QUAN TRI DANG NHAP - DUNG CHUNG CUNG API /api/login-cs1
// Khong tao them Serverless Function moi tren Vercel.
// =========================================================
function getBearerToken(req) {
  const raw = String(req.headers?.authorization || "");
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function xacThucAdmin(req, supabaseAdmin) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "Chua dang nhap ADMIN" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user?.id) {
    return { ok: false, status: 401, error: "Phien dang nhap ADMIN khong hop le" };
  }

  const { data: admin, error: adminErr } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, manv, tenadmin, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr || !admin || admin.active === false) {
    return { ok: false, status: 403, error: "Tai khoan khong co quyen ADMIN" };
  }

  return { ok: true, user, admin };
}

function apDungBoLocQuanTri(query, q) {
  if (q.ngaytu) query = query.gte("thoigian", `${q.ngaytu}T00:00:00+07:00`);
  if (q.ngayden) query = query.lt("thoigian", `${q.ngayden}T23:59:59.999+07:00`);
  if (q.diadiem && ["cs1", "cs2"].includes(q.diadiem)) query = query.eq("diadiem", q.diadiem);
  if (q.ketqua && ["THANHCONG", "THATBAI", "BI_KHOA", "TAIKHOAN_BI_KHOA", "LOI_HE_THONG"].includes(q.ketqua)) {
    query = query.eq("ketqua", q.ketqua);
  }
  if (q.manv) query = query.ilike("manv_nhap", `%${String(q.manv).trim()}%`);
  if (q.ip) query = query.ilike("diachi_ip_tho", `%${String(q.ip).trim()}%`);
  return query;
}

async function demTheoKetQuaQuanTri(supabaseAdmin, q, ketqua = null) {
  let query = supabaseAdmin
    .from("lichsu_dangnhap")
    .select("id", { count: "exact", head: true });
  query = apDungBoLocQuanTri(query, { ...q, ketqua: ketqua || q.ketqua || "" });
  const { count, error } = await query;
  if (error) throw error;
  return Number(count) || 0;
}

async function xuLyQuanTriDangNhap(req, res, supabaseAdmin, body) {
  const auth = await xacThucAdmin(req, supabaseAdmin);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const hanhdong = String(body?.hanhdong || "").trim().toLowerCase();

  if (hanhdong === "quantri_danhsach") {
    const q = {
      ngaytu: String(body?.ngaytu || "").trim(),
      ngayden: String(body?.ngayden || "").trim(),
      diadiem: String(body?.diadiem || "").trim().toLowerCase(),
      ketqua: String(body?.ketqua || "").trim().toUpperCase(),
      manv: String(body?.manv || "").trim().toUpperCase(),
      ip: String(body?.ip || "").trim(),
    };

    const trang = Math.max(1, Number(body?.trang) || 1);
    const kichthuoc = Math.min(100, Math.max(10, Number(body?.kichthuoc) || 50));
    const tu = (trang - 1) * kichthuoc;
    const den = tu + kichthuoc - 1;

    let query = supabaseAdmin
      .from("lichsu_dangnhap")
      .select(
        "id, thoigian, loai_taikhoan, manv_nhap, manv_xacnhan, diadiem, ketqua, lydo, solan_sai, khoa_den, phamvi_khoa, diachi_ip_tho, thongtin_thietbi, dangnhap_bang",
        { count: "exact" }
      );

    query = apDungBoLocQuanTri(query, q)
      .order("thoigian", { ascending: false })
      .range(tu, den);

    const [rowsResult, tong, thanhcong, thatbai, bikhoa, taikhoankhoa, loihethong] = await Promise.all([
      query,
      demTheoKetQuaQuanTri(supabaseAdmin, q, null),
      demTheoKetQuaQuanTri(supabaseAdmin, { ...q, ketqua: "" }, "THANHCONG"),
      demTheoKetQuaQuanTri(supabaseAdmin, { ...q, ketqua: "" }, "THATBAI"),
      demTheoKetQuaQuanTri(supabaseAdmin, { ...q, ketqua: "" }, "BI_KHOA"),
      demTheoKetQuaQuanTri(supabaseAdmin, { ...q, ketqua: "" }, "TAIKHOAN_BI_KHOA"),
      demTheoKetQuaQuanTri(supabaseAdmin, { ...q, ketqua: "" }, "LOI_HE_THONG"),
    ]);

    if (rowsResult.error) throw rowsResult.error;

    return res.status(200).json({
      ok: true,
      dulieu: rowsResult.data || [],
      tongso: Number(rowsResult.count) || 0,
      trang,
      kichthuoc,
      thongke: { tong, thanhcong, thatbai, bikhoa, taikhoankhoa, loihethong },
    });
  }

  if (hanhdong === "quantri_mo_khoa") {
    const id = Number(body?.id_lichsu);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "Thieu id_lichsu hop le" });
    }

    const { data: dong, error: dongErr } = await supabaseAdmin
      .from("lichsu_dangnhap")
      .select("id, manv_nhap, diadiem, phamvi_khoa, diachi_ip_bam, taikhoan_ip_bam")
      .eq("id", id)
      .maybeSingle();

    if (dongErr || !dong) {
      return res.status(404).json({ ok: false, error: "Khong tim thay dong lich su" });
    }

    const keys = [];
    if (dong.taikhoan_ip_bam) keys.push(dong.taikhoan_ip_bam);
    if (dong.phamvi_khoa === "IP" && dong.diachi_ip_bam) keys.push(dong.diachi_ip_bam);

    if (!keys.length) {
      return res.status(400).json({ ok: false, error: "Dong nay khong co khoa rate-limit de mo" });
    }

    const { error: delErr } = await supabaseAdmin
      .from("auth_login_rate_limit")
      .delete()
      .in("key_hash", [...new Set(keys)]);

    if (delErr) throw delErr;

    return res.status(200).json({
      ok: true,
      message: `Da mo khoa dang nhap cho ${dong.manv_nhap || "tai khoan"}${dong.phamvi_khoa === "IP" ? " va IP lien quan" : ""}.`,
    });
  }

  return res.status(400).json({ ok: false, error: "Hanh dong quan tri khong hop le" });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const batdau_ms = Date.now();
  const ma_yeucau = crypto.randomUUID();

  let supabaseAdmin = null;
  let manvUpper = "";
  let diadiem = null;
  let diachiIpTho = null;
  let diachiIpBam = null;
  let taikhoanIpBam = null;
  const thongtinThietbi = req.headers?.["user-agent"] || "";

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
      return res.status(400).json({ ok: false, error: "Body JSON khong hop le" });
    }

    manvUpper = String(body.manv || "").trim().toUpperCase();
    const passwordNV = String(body.passwordNV || "").trim();
    const warehouse = pickWarehouse(body.diadiem);
    diadiem = warehouse.diadiem;

    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Cac thao tac quan tri dung chung endpoint nay de khong tang so Vercel Functions.
    const hanhdong = String(body?.hanhdong || "").trim().toLowerCase();
    if (hanhdong === "quantri_danhsach" || hanhdong === "quantri_mo_khoa") {
      return await xuLyQuanTriDangNhap(req, res, supabaseAdmin, body);
    }

    const clientIp = getClientIp(req);
    diachiIpTho = clientIp;
    diachiIpBam = hmacKey(`IP|${clientIp}`);
    taikhoanIpBam = hmacKey(`ACCOUNT_IP|${diadiem}|${manvUpper}|${clientIp}`);

    if (!manvUpper || !passwordNV) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: "THATBAI",
        lydo: "THIEU_THONGTIN_DANGNHAP",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
      return res.status(400).json({ ok: false, error: "Thieu manv hoac passwordNV" });
    }

    if (!warehouse.email || !warehouse.password) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: "LOI_HE_THONG",
        lydo: "THIEU_CAUHINH_WAREHOUSE",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
      return res.status(500).json({
        ok: false,
        error: `Chua cau hinh WAREHOUSE_${diadiem.toUpperCase()}_EMAIL/PASSWORD`,
      });
    }

    // =========================================================
    // RATE LIMIT - 2 lop: tai khoan+IP va IP tong.
    // =========================================================
    const [accountStatus, ipStatus] = await Promise.all([
      checkOneRateLimit(supabaseAdmin, taikhoanIpBam, "ACCOUNT_IP", ACCOUNT_IP_LIMIT),
      checkOneRateLimit(supabaseAdmin, diachiIpBam, "IP", IP_LIMIT),
    ]);

    if (accountStatus.allowed === false || ipStatus.allowed === false) {
      const ipBiKhoa = ipStatus.allowed === false;
      const phamviKhoa = ipBiKhoa ? "IP" : "TAIKHOAN_IP";
      const retry = Math.max(
        Number(accountStatus.retry_after_seconds) || 0,
        Number(ipStatus.retry_after_seconds) || 0
      );
      const khoaDen = maxDateIso(accountStatus.blocked_until, ipStatus.blocked_until);
      const solanSai = Math.max(
        Number(accountStatus.failure_count) || 0,
        Number(ipStatus.failure_count) || 0
      );

      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: "BI_KHOA",
        lydo: "DANG_TRONG_THOIGIAN_KHOA",
        solan_sai: solanSai,
        khoa_den: khoaDen,
        phamvi_khoa: phamviKhoa,
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });

      return sendRateLimited(res, retry, phamviKhoa, khoaDen);
    }

    const { data: nvArr, error: nvErr } = await supabaseAdmin
      .from("dmnhanvien")
      .select("*")
      .ilike("manv", manvUpper)
      .limit(1);

    const nv = Array.isArray(nvArr) ? nvArr[0] : null;

    if (nvErr) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: "LOI_HE_THONG",
        lydo: "LOI_DOC_DMNHANVIEN",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
      return res.status(500).json({ ok: false, error: "Loi doc dmnhanvien: " + nvErr.message });
    }

    const storedPass =
      nv?.matkhau ?? nv?.matkhaunv ?? nv?.password ?? nv?.pass ?? nv?.mat_khau ?? null;

    const credentialsOk =
      !!nv && !!String(storedPass ?? "").trim() && String(storedPass ?? "").trim() === passwordNV;

    if (!credentialsOk) {
      const [accountFail, ipFail] = await Promise.all([
        recordOneFailure(supabaseAdmin, taikhoanIpBam, "ACCOUNT_IP", ACCOUNT_IP_LIMIT),
        recordOneFailure(supabaseAdmin, diachiIpBam, "IP", IP_LIMIT),
      ]);

      const biKhoa = accountFail.allowed === false || ipFail.allowed === false;
      const ipBiKhoa = ipFail.allowed === false;
      const phamviKhoa = biKhoa ? (ipBiKhoa ? "IP" : "TAIKHOAN_IP") : null;
      const retry = Math.max(
        Number(accountFail.retry_after_seconds) || 0,
        Number(ipFail.retry_after_seconds) || 0
      );
      const khoaDen = maxDateIso(accountFail.blocked_until, ipFail.blocked_until);
      const solanSai = Number(accountFail.failure_count) || 0;

      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: biKhoa ? "BI_KHOA" : "THATBAI",
        lydo: biKhoa ? "VUOT_GIOI_HAN_DANGNHAP" : "SAI_MA_HOAC_MATKHAU",
        solan_sai: solanSai,
        khoa_den: khoaDen,
        phamvi_khoa: phamviKhoa,
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });

      if (biKhoa) return sendRateLimited(res, retry, phamviKhoa, khoaDen);

      return res.status(401).json({
        ok: false,
        error: "Ma nhan vien hoac mat khau khong dung",
        solan_sai: solanSai,
        con_lai_truoc_khi_khoa: Math.max(0, ACCOUNT_IP_LIMIT.threshold - solanSai),
      });
    }

    if (nv.active === false || nv.trangthai === false) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        manv_xacnhan: nv.manv,
        diadiem,
        ketqua: "TAIKHOAN_BI_KHOA",
        lydo: "NHANVIEN_BI_KHOA",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
      return res.status(403).json({ ok: false, error: "Nhan vien dang bi khoa" });
    }

    const supabaseAuth = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: signInData, error: signInErr } =
      await supabaseAuth.auth.signInWithPassword({
        email: warehouse.email,
        password: warehouse.password,
      });

    if (signInErr || !signInData?.session) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        manv_xacnhan: nv.manv,
        diadiem,
        ketqua: "LOI_HE_THONG",
        lydo: "DANGNHAP_WAREHOUSE_THATBAI",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
      return res.status(500).json({
        ok: false,
        error: "Dang nhap warehouse that bai: " + (signInErr?.message || "Khong co session"),
      });
    }

    const session = signInData.session;

    // Dang nhap dung: xoa bo dem tai khoan+IP; van giu bo dem IP tong.
    await resetOneRateLimit(supabaseAdmin, taikhoanIpBam);

    await ghiLichSu(supabaseAdmin, {
      manv_nhap: manvUpper,
      manv_xacnhan: nv.manv,
      diadiem,
      ketqua: "THANHCONG",
      lydo: "DANGNHAP_THANHCONG",
      solan_sai: 0,
      diachi_ip_bam: diachiIpBam,
      taikhoan_ip_bam: taikhoanIpBam,
      thongtin_thietbi: thongtinThietbi,
      ma_yeucau,
      batdau_ms,
    });

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

    if (supabaseAdmin) {
      await ghiLichSu(supabaseAdmin, {
        manv_nhap: manvUpper,
        diadiem,
        ketqua: "LOI_HE_THONG",
        lydo: "LOI_SERVER_KHONG_XACDINH",
        diachi_ip_tho: diachiIpTho,
        diachi_ip_bam: diachiIpBam,
        taikhoan_ip_bam: taikhoanIpBam,
        thongtin_thietbi: thongtinThietbi,
        ma_yeucau,
        batdau_ms,
      });
    }

    return res.status(500).json({
      ok: false,
      error: "Loi server: " + (err?.message || "khong xac dinh"),
    });
  }
}
