// public/scripts/soundBeep.js

// Dùng 1 AudioContext dùng chung (lazy init), iOS cần kích hoạt sau tương tác người dùng
let _ctx = null;
export function getAudioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _ctx = new AC();
  }
  // Nếu bị "suspended" trên iOS, gọi resume() sau tương tác người dùng
  if (_ctx.state === "suspended" && typeof _ctx.resume === "function") {
    _ctx.resume().catch(()=>{});
  }
  return _ctx;
}

// Envelope chống "click" đầu/cuối
function beep(frequency = 1000, durationMs = 150, type = "sine", volume = 0.25) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);

  // fade-in/out rất ngắn để êm
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.setValueAtTime(volume, now + Math.max(0, dur - 0.04));
  gain.gain.linearRampToValueAtTime(0.0001, now + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

// “tinh” — ngắn, sáng
export function playSuccessBeep() {
  beep(2800, 120, "sine", 0.7);
}

// “tút” — dài, trầm hơn
export function playWaitSizeBeep() {
  beep(1200, 240, "sine", 0.7);
}

// Tuỳ chọn: beep cảnh báo (âm vuông, hơi “gắt” hơn)
export function playAlertBeep() {
  beep(800, 500, "square", 0.7);
}

// Gợi ý: gọi hàm này 1 lần sau tương tác người dùng (click/keydown) để “unlock” audio trên iOS
export function setupBeepUnlockOnce(dom = document) {
  const unlock = () => {
    try { getAudioCtx().resume?.(); } catch {}
    dom.removeEventListener("click", unlock);
    dom.removeEventListener("keydown", unlock);
    dom.removeEventListener("touchstart", unlock);
  };
  dom.addEventListener("click", unlock);
  dom.addEventListener("keydown", unlock);
  dom.addEventListener("touchstart", unlock);
}
