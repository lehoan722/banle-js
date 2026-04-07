// public/scripts/soundBeep.js

let _ctx = null;
let _unlocked = false;
let _alertBusy = false;

export function getAudioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  return _ctx;
}

export async function unlockBeepAudio() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return false;

    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      await ctx.resume();
    }

    _unlocked = (ctx.state === "running");
    return _unlocked;
  } catch (e) {
    console.warn("unlockBeepAudio lỗi:", e);
    return false;
  }
}

export function isBeepUnlocked() {
  return _unlocked;
}

function beep(frequency = 1000, durationMs = 150, type = "sine", volume = 0.25) {
  const ctx = getAudioCtx();
  if (!ctx) return false;

  if (ctx.state === "suspended" && typeof ctx.resume === "function") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const dur = durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.setValueAtTime(volume, now + Math.max(0.02, dur - 0.04));
  gain.gain.linearRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);

  return true;
}

export function playSuccessBeep() {
  return beep(2400, 120, "sine", 0.3);
}

export function playWaitSizeBeep() {
  return beep(1200, 180, "sine", 0.4);
}

export function playAlertBeep() {
  if (_alertBusy) return false;
  _alertBusy = true;

  try {
    return beep(800, 220, "square", 0.28);
  } finally {
    setTimeout(() => {
      _alertBusy = false;
    }, 260);
  }
}

export function setupBeepUnlockOnce(dom = document) {
  let done = false;

  const unlock = async () => {
    if (done) return;

    const ok = await unlockBeepAudio();
    if (ok) {
      done = true;
      dom.removeEventListener("click", unlock, true);
      dom.removeEventListener("keydown", unlock, true);
      dom.removeEventListener("touchstart", unlock, true);
      dom.removeEventListener("touchend", unlock, true);
      dom.removeEventListener("pointerdown", unlock, true);
      dom.removeEventListener("focusin", unlock, true);
    }
  };

  dom.addEventListener("click", unlock, true);
  dom.addEventListener("keydown", unlock, true);
  dom.addEventListener("touchstart", unlock, true);
  dom.addEventListener("touchend", unlock, true);
  dom.addEventListener("pointerdown", unlock, true);
  dom.addEventListener("focusin", unlock, true);
}

export function patchAlertWithBeep() {
  // cố ý để trống, không patch alert nữa
}
