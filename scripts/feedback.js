// scripts/feedback.js
import { playSuccessBeep, playAlertBeep, setupBeepUnlockOnce } from "./soundBeep.js";

// ===== FLASH =====
export function showFlash() {
  const flash = document.getElementById("flashOverlay");
  if (!flash) return;
  flash.style.opacity = "1";
  setTimeout(() => { flash.style.opacity = "0"; }, 120);
}

// ===== TOAST =====
export function showToast(msg, type = "info") {
  const toast = document.getElementById("toastMsg");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = type === "warn"
    ? "rgba(211,47,47,0.9)"
    : "rgba(25,118,210,0.9)";
  toast.style.opacity = "1";
  setTimeout(() => { toast.style.opacity = "0"; }, 1800);
}

// ===== HAPTIC (rung) =====
export function haptic(pattern = 60) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}

// ===== BEEP =====
export function beepSuccess() {
  try { playSuccessBeep(); } catch (_) {}
}
export function beepAlert() {
  try { playAlertBeep(); } catch (_) {}
}

// ===== Unlock beep (gọi 1 lần trong onload) =====
export function unlockBeepOnce(doc = document) {
  try { setupBeepUnlockOnce(doc); } catch (_) {}
}
