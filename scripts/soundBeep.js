// public/scripts/soundBeep.js

let _ctx = null;
let _unlocking = null;
let _unlocked = false;

export function getAudioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC({ latencyHint: "interactive" });
  }
  return _ctx;
}

async function ensureRunning() {
  const ctx = getAudioCtx();
  if (!ctx) return null;

  if (ctx.state === "running") return ctx;

  if (!_unlocking) {
    _unlocking = (async () => {
      try {
        await ctx.resume();

        // silent unlock cho iPhone/Safari
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001;
        osc.type = "sine";
        osc.frequency.value = 1200;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);

        _unlocked = true;
      } catch (e) {
        console.warn("Audio resume lỗi:", e);
      } finally {
        _unlocking = null;
      }
    })();
  }

  await _unlocking;
  return ctx;
}

async function beep(frequency = 1000, durationMs = 150, type = "sine", volume = 0.25) {
  const ctx = await ensureRunning();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const dur = durationMs / 1000;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.setValueAtTime(volume, now + Math.max(0.02, dur - 0.04));
  gain.gain.linearRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

export function playSuccessBeep() {
  beep(2400, 120, "sine", 0.3);
}

export function playWaitSizeBeep() {
  beep(1200, 180, "sine", 0.4);
}

export function playAlertBeep() {
  beep(800, 250, "square", 0.3);
}

export function setupBeepUnlockOnce(dom = document) {
  const unlock = () => {
    ensureRunning();
    dom.removeEventListener("click", unlock, true);
    dom.removeEventListener("keydown", unlock, true);
    dom.removeEventListener("touchstart", unlock, true);
    dom.removeEventListener("pointerdown", unlock, true);
  };

  dom.addEventListener("click", unlock, true);
  dom.addEventListener("keydown", unlock, true);
  dom.addEventListener("touchstart", unlock, true);
  dom.addEventListener("pointerdown", unlock, true);
}

export function isBeepUnlocked() {
  return _unlocked;
}

export function isBeepUnlocked() {
  return _unlocked;
}
