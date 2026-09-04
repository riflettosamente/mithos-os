/* Chiptune SFX via WebAudio — onde quadre anni '90. */
"use client";

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}
export function isSoundEnabled() {
  return enabled;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(freq: number, start: number, dur: number, vol = 0.05, type: OscillatorType = "square") {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export type SfxKind = "click" | "select" | "flip" | "ok" | "err" | "boot" | "drag";

export function sfx(kind: SfxKind) {
  if (!enabled) return;
  switch (kind) {
    case "click":
      note(520, 0, 0.06, 0.04);
      break;
    case "select":
      note(660, 0, 0.05, 0.04);
      note(880, 0.05, 0.07, 0.04);
      break;
    case "flip":
      note(220, 0, 0.09, 0.05, "triangle");
      note(330, 0.09, 0.09, 0.05, "triangle");
      note(440, 0.18, 0.09, 0.05, "triangle");
      note(660, 0.27, 0.14, 0.05, "triangle");
      break;
    case "ok":
      note(523, 0, 0.09, 0.05);
      note(659, 0.09, 0.09, 0.05);
      note(784, 0.18, 0.16, 0.05);
      break;
    case "err":
      note(196, 0, 0.14, 0.06, "sawtooth");
      note(131, 0.14, 0.22, 0.06, "sawtooth");
      break;
    case "boot":
      note(262, 0, 0.1, 0.05);
      note(392, 0.1, 0.1, 0.05);
      note(523, 0.2, 0.1, 0.05);
      note(659, 0.3, 0.1, 0.05);
      note(784, 0.4, 0.24, 0.06);
      break;
    case "drag":
      note(880, 0, 0.03, 0.025);
      break;
  }
}
