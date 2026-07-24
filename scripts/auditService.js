import { supabase } from "./supabaseClient.js";
import { enqueueAudit, getAuditQueue, replaceAuditQueue } from "./auditOffline.js";
import { xepMucRuiRo } from "./auditRisk.js";

let isFlushing = false;

export async function insertAuditEvent(event) {
  const { error } = await supabase
    .from("banle_nhatky_sanpham")
    .insert(event);
  if (error) throw error;
}

export async function safeInsertAuditEvent(event) {
  try {
    await insertAuditEvent(event);
    return true;
  } catch (error) {
    console.error("[AUDIT V2] GHI SUPABASE THẤT BẠI", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      event
    });
    enqueueAudit(event);
    return false;
  }
}

export async function flushAuditQueue() {
  if (isFlushing || !navigator.onLine) return;
  isFlushing = true;
  try {
    const queue = getAuditQueue();
    const remain = [];

    for (const event of queue) {
      try {
        await insertAuditEvent(event);
      } catch {
        remain.push(event);
      }
    }
    replaceAuditQueue(remain);
  } finally {
    isFlushing = false;
  }
}

export async function upsertAuditSession(payload) {
  const { error } = await supabase
    .from("banle_phien")
    .upsert(payload, { onConflict: "session_id" });
  if (error) throw error;
}

export async function getAuditSession(sessionId) {
  const { data, error } = await supabase
    .from("banle_phien")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAuditSession(sessionId, patch) {
  const payload = { ...patch };
  if (payload.diem_rui_ro != null) {
    payload.muc_rui_ro = xepMucRuiRo(Number(payload.diem_rui_ro || 0));
  }

  const { error } = await supabase
    .from("banle_phien")
    .update(payload)
    .eq("session_id", sessionId);
  if (error) throw error;
}

window.addEventListener("online", flushAuditQueue);
