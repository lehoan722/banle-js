// public/scripts/soundBeep.js

let _ctx = null;
let _unlocked = false;

export function getAudioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC({ latencyHint: "interactive" });
  }
  return _ctx;
}

export async function unlockBeepAudio() {
  const ctx = getAudioCtx();
  if (!ctx) return false;

  try {
    if (ctx.state !== "running") {
      await ctx.resume();
    }

    // phát 1 tiếng siêu nhỏ để iPhone chịu mở audio hoàn toàn
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    gain.gain.value = 0.00001;
    osc.frequency.value = 1000;
    osc.type = "sine";

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);

    _unlocked = true;
    return true;
  } catch (e) {
    console.warn("unlockBeepAudio lỗi:", e);
    return false;
  }
}

function safeBeep(frequency = 1000, durationMs = 150, type = "sine", volume = 0.25) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  if (ctx.state !== "running") {
    console.warn("AudioContext chưa running, bỏ qua beep này");
    return;
  }

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
  safeBeep(2400, 120, "sine", 0.3);
}

export function playWaitSizeBeep() {
  safeBeep(1200, 180, "sine", 0.4);
}

export function playAlertBeep() {
  safeBeep(800, 250, "square", 0.3);
}

export function setupBeepUnlockOnce(dom = document) {
  const unlock = async () => {
    await unlockBeepAudio();
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
