// scripts/viettelInvoice.js

export async function guiHoaDonViettel(sohd) {
  sohd = String(sohd || "").trim();

  if (!sohd) {
    return {
      ok: false,
      code: "NO_SOHD"
    };
  }

  const { data } = await window.supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    return {
      ok: false,
      code: "NO_AUTH"
    };
  }

  const response = await fetch("/api/guiHDDT", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      sohd
    })
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      code: result?.code || "SEND_FAILED"
    };
  }

  return {
    ok: true,
    code: result.code || "SENT",
    sohd: result.sohd || sohd
  };
}
