// public/scripts/soundBeep.js

let _ctx = null;
let _unlocking = null;
let _unlocked = false;
let _alertBeepBusy = false;

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
        if (ctx.state !== "running") {
          await ctx.resume();
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001;
        osc.type = "sine";
        osc.frequency.value = 1200;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);

        _unlocked = (ctx.state === "running");
      } catch (e) {
        console.warn("ensureRunning lỗi:", e);
      } finally {
        _unlocking = null;
      }
    })();
  }

  await _unlocking;

  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn("resume lần 2 lỗi:", e);
    }
  }

  _unlocked = (ctx.state === "running");
  return ctx;
}

async function safeBeep(frequency = 1000, durationMs = 150, type = "sine", volume = 0.25) {
  try {
    const ctx = await ensureRunning();
    if (!ctx || ctx.state !== "running") return false;

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
  } catch (e) {
    console.warn("safeBeep lỗi:", e);
    return false;
  }
}

export function playSuccessBeep() {
  return safeBeep(2400, 120, "sine", 0.3);
}

export function playWaitSizeBeep() {
  return safeBeep(1200, 180, "sine", 0.4);
}

export function playAlertBeep() {
  if (_alertBeepBusy) return Promise.resolve(false);

  _alertBeepBusy = true;
  return safeBeep(800, 220, "square", 0.25).finally(() => {
    setTimeout(() => {
      _alertBeepBusy = false;
    }, 260);
  });
}

export async function unlockBeepAudio() {
  const ctx = await ensureRunning();
  _unlocked = !!ctx && ctx.state === "running";
  return _unlocked;
}

export function isBeepUnlocked() {
  return _unlocked;
}

export function setupBeepUnlockOnce(dom = document) {
  let done = false;

  const removeAll = () => {
    dom.removeEventListener("click", unlock, true);
    dom.removeEventListener("keydown", unlock, true);
    dom.removeEventListener("touchstart", unlock, true);
    dom.removeEventListener("touchend", unlock, true);
    dom.removeEventListener("pointerdown", unlock, true);
  };

  const unlock = async () => {
    if (done) return;

    const ok = await unlockBeepAudio();

    if (ok || isBeepUnlocked()) {
      done = true;
      removeAll();
    }
  };

  dom.addEventListener("click", unlock, true);
  dom.addEventListener("keydown", unlock, true);
  dom.addEventListener("touchstart", unlock, true);
  dom.addEventListener("touchend", unlock, true);
  dom.addEventListener("pointerdown", unlock, true);
}

export function patchAlertWithBeep() {
  if (window.__alertBeepPatched) return;
  window.__alertBeepPatched = true;

  if (!window.__nativeAlert) {
    window.__nativeAlert = window.alert.bind(window);
  }

  let alertBusy = false;

  window.alert = function (message) {
    const text = String(message ?? "");

    if (alertBusy) {
      return window.__nativeAlert(text);
    }

    alertBusy = true;

    try { playAlertBeep(); } catch {}

    setTimeout(() => {
      try {
        window.__nativeAlert(text);
      } finally {
        alertBusy = false;
      }
    }, 120);
  };
}

window.addEventListener("pageshow", () => {
  _unlocking = null;
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && _ctx && _ctx.state !== "running") {
    _ctx.resume().catch(() => {});
  }
});
