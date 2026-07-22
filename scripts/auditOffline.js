import { AUDIT_CONFIG } from "./auditConfig.js";

function loadQueue() {
  try {
    const data = JSON.parse(localStorage.getItem(AUDIT_CONFIG.queueKey) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveQueue(items) {
  try {
    localStorage.setItem(
      AUDIT_CONFIG.queueKey,
      JSON.stringify(items.slice(-AUDIT_CONFIG.maxQueueItems))
    );
  } catch (error) {
    console.warn("Không lưu được hàng đợi audit:", error);
  }
}

export function enqueueAudit(item) {
  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);
}

export function getAuditQueue() {
  return loadQueue();
}

export function replaceAuditQueue(items) {
  saveQueue(items);
}
