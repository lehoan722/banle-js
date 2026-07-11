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

    throw new Error(
      error.message ||
      error.details ||
      "SECURE_SAVE_FAILED"
    );
  }

  if (!data) {
    throw new Error("SECURE_RPC_EMPTY_RESULT");
  }

  if (data.ok === false) {
    console.error("[SECURE SAVE] RPC trả về thất bại:", data);

    throw new Error(
      data.message ||
      data.code ||
      "SECURE_SAVE_FAILED"
    );
  }

  return data;
}
