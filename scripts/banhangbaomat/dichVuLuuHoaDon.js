// scripts/banhangbaomat/dichVuLuuHoaDon.js

import { supabase } from "../supabaseClient.js";

export async function guiDuLieuLuuBaoMat(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("SECURE_PAYLOAD_INVALID");
  }

  const { data, error } = await supabase.rpc(
    "rpc_save_invoice_secure",
    {
      p_payload: payload
    }
  );

  if (error) {
    console.error("[SECURE SAVE] Lỗi thật từ Supabase:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      error
    });

    const e = new Error(error.message || "SECURE_SAVE_FAILED");
    e.code = error.code || "SUPABASE_ERROR";
    e.details = error.details || "";
    e.hint = error.hint || "";
    throw e;
  }

  if (!data) {
    throw new Error("SECURE_RPC_EMPTY_RESULT");
  }

  if (data.ok === false) {
    console.error("[SECURE SAVE] RPC trả về thất bại:", data);

    const e = new Error(data.message || "SECURE_SAVE_FAILED");
    e.code = data.code || "RPC_REJECTED";
    e.details = data.details || "";
    e.hint = data.hint || "";
    throw e;
  }

  return data;
}
