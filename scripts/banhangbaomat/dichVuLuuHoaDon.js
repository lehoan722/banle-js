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
    throw new Error("SECURE_SAVE_FAILED");
}
  if (!data) {
    throw new Error("SECURE_RPC_EMPTY_RESULT");
  }

  return data;
}
