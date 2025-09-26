// public/scripts/soundBeep.js — Pro beeps (multi-tone + stereo + sweep + vibrato)

let _ctx = null;
export function getAudioCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _ctx = new AC();
  }
  if (_ctx.state === "suspended" && _ctx.resume) {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

// Gọi 1 lần sau tương tác để unlock audio trên iOS
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

// ====== Core helpers ======
function envConnect(ctx, vol = 0.25, dur = 0.15, attack = 0.01, release = 0.04) {
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.setValueAtTime(vol, t0 + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  return { g, t0 };
}

function withPan(ctx, node, pan = 0) {
  // StereoPan: -1 (trái) .. +1 (phải)
  if (typeof ctx.createStereoPanner === "function") {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    return p;
  }
  return node; // fallback: không có panner thì trả về node gốc
}

// Tạo 1 oscillator + (optional) vibrato + sweep + panning
function spawnTone({
  f = 1000,             // Hz
  type = "sine",        // "sine" | "triangle" | "square" | "sawtooth"
  vol = 0.24,
  dur = 0.15,           // seconds
  pan = 0,              // -1..+1
  vibratoHz = 0,        // >0 để bật vibrato
  vibratoDepth = 5,     // Hz
  sweepTo = null,       // Hz | null — lướt tần đến đây
  sweepCurve = "linear" // "linear" | "exp"
}) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  osc.type = type;
  const { g, t0 } = envConnect(ctx, vol, dur);

  // Panning
  const panNode = withPan(ctx, g, pan);
  osc.connect(g).connect(panNode).connect(ctx.destination);

  // Tần số & sweep
  if (sweepTo && sweepTo > 0) {
    if (sweepCurve === "exp") {
      osc.frequency.setValueAtTime(Math.max(1, f), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
    } else {
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.linearRampToValueAtTime(sweepTo, t0 + dur);
    }
  } else {
    osc.frequency.setValueAtTime(f, t0);
  }

  // Vibrato (LFO vào frequency)
  let lfo;
  if (vibratoHz > 0 && vibratoDepth > 0) {
    lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = vibratoHz;
    lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }

  osc.start(t0);
  osc.stop(t0 + dur);
}

// Tạo arpeggio/cụm nốt liên tiếp rất nhanh (sequence)
function scheduleSequence(steps = []) {
  const ctx = getAudioCtx();
  const tBase = ctx.currentTime;
  steps.forEach(s => {
    const delay = (s.startMs || 0) / 1000;
    const dur = (s.durMs || 140) / 1000;
    setTimeout(() => {
      spawnTone({
        f: s.f || 1000,
        type: s.type || "sine",
        vol: s.vol ?? 0.24,
        dur,
        pan: s.pan ?? 0,
        vibratoHz: s.vibratoHz || 0,
        vibratoDepth: s.vibratoDepth || 0,
        sweepTo: s.sweepTo || null,
        sweepCurve: s.sweepCurve || "linear"
      });
    }, Math.max(0, s.startMs || 0));
  });
}

// ====== Public beeps (đa tần & stereo) ======

// 1) “Success” — nổ hợp âm + arpeggio siêu ngắn, sáng & nổi (stereo nhẹ)
export function playSuccessBeep() {
  // Hợp âm major: f, 1.25f (≈maj3), 1.5f (quint)
  const f = 1040;
  // Layer chord tức thời (tr/trg/phải) + arpeggio 2 nốt đi lên rất nhanh
  spawnTone({ f, type: "triangle", vol: 0.22, dur: 0.12, pan: -0.35 });
  spawnTone({ f: f * 1.25, type: "sine", vol: 0.18, dur: 0.12, pan: 0.0 });
  spawnTone({ f: f * 1.5, type: "sine", vol: 0.18, dur: 0.12, pan: 0.35 });

  // Arp lên nhanh (hai nốt 60ms & 120ms)
  scheduleSequence([
    { startMs: 60, f: f * 1.25, type: "triangle", durMs: 90, vol: 0.5, pan: -0.2 },
    { startMs: 120, f: f * 1.5, type: "triangle", durMs: 120, vol: 0.6, pan: 0.25 }
  ]);
}

// 2) “Wait size” — trầm, dài hơn, có sweep nhẹ từ cao xuống thấp + vibrato dịu, stereo nhẹ
export function playWaitSizeBeep() {
   // Ping trái
  scheduleSequence([
   
    { startMs: 250,  f: 800, type: "square", durMs: 140, vol: 0.6, pan: 0.5 } // Ping phải
  ]);
  // Lớp nền rất nhỏ cho mỗi nhát để dày tiếng (triangle detune)
  scheduleSequence([
    { startMs: 0,   f: 520*0.97, type: "triangle", durMs: 120, vol: 0.08, pan: -0.2 },
    { startMs: 80,  f: 720*1.03, type: "triangle", durMs: 140, vol: 0.08, pan: 0.2 }
  ]);
}

// 3) “Alert” — hai nhát nhanh kiểu “bi-bip”, hơi gắt hơn (square), stereo ping-pong
export function playAlertBeep() {
  // Ping trái
  scheduleSequence([
    { startMs: 0,   f: 520, type: "square", durMs: 120, vol: 0.5, pan: -0.5 },
    { startMs: 180,  f: 720, type: "square", durMs: 140, vol: 0.6, pan: 0.5 } // Ping phải
  ]);
  // Lớp nền rất nhỏ cho mỗi nhát để dày tiếng (triangle detune)
  scheduleSequence([
    { startMs: 0,   f: 520*0.97, type: "triangle", durMs: 120, vol: 0.08, pan: -0.2 },
    { startMs: 80,  f: 720*1.03, type: "triangle", durMs: 140, vol: 0.08, pan: 0.2 }
  ]);
}
