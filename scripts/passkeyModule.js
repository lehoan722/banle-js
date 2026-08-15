// scripts/passkeyModule.js
// POC Passkey/Face ID cho Hoan Tuyet.
// Dùng Supabase client RIÊNG để xác thực danh tính, không đụng session warehouse của app.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.0/+esm";

export function createPasskeyManager({ supabaseUrl, supabaseAnonKey }) {
  const identityClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storage: localStorage,
      storageKey: "hoantuyet-passkey-identity",
      autoRefreshToken: true,
      detectSessionInUrl: false,
      experimental: { passkey: true },
    },
  });

  function isSupported() {
    return !!(
      window.isSecureContext &&
      window.PublicKeyCredential &&
      navigator.credentials
    );
  }

  async function postJson(url, body, accessToken = null) {
    const headers = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${resp.status}`);
    }
    return data;
  }

  async function enrollEmployee({ manv, password, diadiem = "cs1" }) {
    if (!isSupported()) throw new Error("Thiết bị/trình duyệt chưa hỗ trợ Passkey hoặc trang chưa chạy HTTPS.");

    // 1) Server xác thực mật khẩu NV + tạo/đồng bộ Auth user riêng cho NV.
    const boot = await postJson("/api/passkey", {
      action: "bootstrap",
      manv,
      passwordNV: password,
      diadiem,
    });

    // 2) Đăng nhập client danh tính bằng Auth user riêng.
    const { data: signInData, error: signInError } = await identityClient.auth.signInWithPassword({
      email: boot.identity_email,
      password,
    });
    if (signInError || !signInData?.session) {
      throw signInError || new Error("Không tạo được session danh tính nhân viên.");
    }

    // 3) Đăng ký Passkey. Supabase tự chạy WebAuthn ceremony.
    const { data, error } = await identityClient.auth.registerPasskey();
    if (error) throw error;

    return { ok: true, passkey: data, profile: boot.nhanvien };
  }

  async function enrollAdmin({ email, password }) {
    if (!isSupported()) throw new Error("Thiết bị/trình duyệt chưa hỗ trợ Passkey hoặc trang chưa chạy HTTPS.");

    const { data: signInData, error: signInError } = await identityClient.auth.signInWithPassword({
      email: String(email || "").trim().toLowerCase(),
      password,
    });
    if (signInError || !signInData?.session) {
      throw signInError || new Error("Không đăng nhập được tài khoản admin để đăng ký Passkey.");
    }

    const { data, error } = await identityClient.auth.registerPasskey();
    if (error) throw error;
    return { ok: true, passkey: data };
  }

  async function signIn({ diadiem = "cs1" } = {}) {
    if (!isSupported()) throw new Error("Thiết bị/trình duyệt chưa hỗ trợ Passkey hoặc trang chưa chạy HTTPS.");

    // Supabase dùng discoverable credential: không cần nhập email/manv trước.
    const { data: passkeyData, error: passkeyError } = await identityClient.auth.signInWithPasskey();
    if (passkeyError || !passkeyData?.session?.access_token) {
      throw passkeyError || new Error("Không xác thực được Passkey.");
    }

    const identitySession = passkeyData.session;

    // Server xác minh access token danh tính, map user_id -> admin_users/dmnhanvien.
    // Với NV: server đổi sang warehouse session đúng cơ sở.
    const resolved = await postJson(
      "/api/passkey",
      { action: "exchange", diadiem },
      identitySession.access_token
    );

    if (resolved.kind === "admin") {
      // Admin dùng chính session Auth cá nhân.
      return {
        ok: true,
        kind: "admin",
        profile: resolved.profile,
        appSession: identitySession,
      };
    }

    if (resolved.kind === "employee") {
      if (!resolved.session?.access_token || !resolved.session?.refresh_token) {
        throw new Error("Server không trả warehouse session hợp lệ.");
      }
      return {
        ok: true,
        kind: "employee",
        profile: resolved.profile,
        appSession: resolved.session,
      };
    }

    throw new Error("Loại tài khoản Passkey không hợp lệ.");
  }

  async function signOutIdentity() {
    try { await identityClient.auth.signOut(); } catch { }
  }

  async function listCurrentPasskeys() {
    const { data, error } = await identityClient.auth.passkey.list();
    if (error) throw error;
    return data || [];
  }

  return {
    isSupported,
    enrollEmployee,
    enrollAdmin,
    signIn,
    signOutIdentity,
    listCurrentPasskeys,
    identityClient,
  };
}
