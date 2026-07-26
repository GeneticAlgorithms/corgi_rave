/**
 * Generates placeholder rave tracks as 16-bit PCM WAVs — no ffmpeg, no deps.
 *
 * These exist so the pipeline is demonstrable before you source real music.
 * They are synthesized four-on-the-floor loops with enough dynamic range for
 * the visualizer's AnalyserNode to react to. Replace them with real tracks
 * before the actual demo.
 *
 *   npm run tracks
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RATE = 44_100;
const OUT_DIR = path.join(import.meta.dirname, "..", "public", "tracks", "library");

type Preset = {
  name: string;
  bpm: number;
  seconds: number;
  root: number;
  /** Scale degrees (semitones) the arpeggio walks. */
  scale: number[];
  kickGain: number;
  hatGain: number;
  padGain: number;
  leadGain: number;
};

const PRESETS: Preset[] = [
  {
    name: "calm",
    bpm: 96,
    seconds: 60,
    root: 110, // A2
    scale: [0, 3, 7, 10, 12, 10, 7, 3],
    kickGain: 0.24,
    hatGain: 0.03,
    padGain: 0.3,
    leadGain: 0.1,
  },
  {
    name: "warm",
    bpm: 122,
    seconds: 60,
    root: 138.59, // C#3
    scale: [0, 4, 7, 11, 12, 11, 7, 4],
    kickGain: 0.42,
    hatGain: 0.07,
    padGain: 0.22,
    leadGain: 0.17,
  },
  {
    name: "hard",
    bpm: 142,
    seconds: 60,
    root: 82.41, // E2
    scale: [0, 3, 7, 3, 10, 7, 12, 7],
    kickGain: 0.55,
    hatGain: 0.11,
    padGain: 0.14,
    leadGain: 0.22,
  },
];

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
const semis = (hz: number, n: number) => hz * Math.pow(2, n / 12);

/** Deterministic noise so runs are reproducible. */
function makeNoise() {
  let seed = 0x2f6e2b1;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function render(p: Preset): Float32Array {
  const total = Math.floor(RATE * p.seconds);
  const out = new Float32Array(total);
  const beat = 60 / p.bpm;
  const noise = makeNoise();

  // Long swell so the visualizer has macro-scale movement, not just a loop.
  for (let i = 0; i < total; i++) {
    const t = i / RATE;
    const beatPos = (t / beat) % 1;
    const beatIndex = Math.floor(t / beat);
    const build = 0.55 + 0.45 * Math.sin((t / p.seconds) * Math.PI * 2 - Math.PI / 2);

    // Kick: pitch-swept sine with a fast exponential decay.
    const kEnv = Math.exp(-beatPos * 18);
    const kFreq = 42 + 90 * Math.exp(-beatPos * 26);
    const kick = Math.sin(2 * Math.PI * kFreq * beatPos * beat) * kEnv * p.kickGain;

    // Offbeat hat.
    const hPos = (beatPos + 0.5) % 1;
    const hat = noise() * Math.exp(-hPos * 60) * p.hatGain * build;

    // Sub bass, held across the beat.
    const bass =
      Math.sin(2 * Math.PI * p.root * t) * 0.5 * Math.exp(-beatPos * 1.4) * p.padGain;

    // Pad: two detuned saws a fifth apart.
    const saw = (f: number) => 2 * (((t * f) % 1) - 0.5);
    const pad =
      (saw(p.root * 2) * 0.5 + saw(p.root * 2 * 1.005) * 0.5 + saw(semis(p.root * 2, 7)) * 0.4) *
      0.18 *
      p.padGain *
      build;

    // Arpeggio on 16ths.
    const step = Math.floor(t / (beat / 4)) % p.scale.length;
    const notePos = (t / (beat / 4)) % 1;
    const lead =
      Math.sin(2 * Math.PI * semis(p.root * 4, p.scale[step]!) * t) *
      Math.exp(-notePos * 4) *
      p.leadGain *
      build;

    // Duck everything under the kick — the pump is what reads as "rave".
    const duck = 1 - 0.45 * Math.exp(-beatPos * 9);

    let s = kick + (hat + bass + pad + lead) * duck;

    // Light saturation for glue.
    s = Math.tanh(s * 1.6) * 0.82;

    // Fade in/out so the loop doesn't click.
    const fade = Math.min(1, t / 1.5, (p.seconds - t) / 2.5);
    out[i] = clamp(s * Math.max(0, fade));

    void beatIndex;
  }
  return out;
}

function toWav(samples: Float32Array): Buffer {
  const bytes = samples.length * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(samples[i]! * 32767), 44 + i * 2);
  }
  return buf;
}

await mkdir(OUT_DIR, { recursive: true });
for (const preset of PRESETS) {
  const wav = toWav(render(preset));
  const file = path.join(OUT_DIR, `${preset.name}.wav`);
  await writeFile(file, wav);
  console.log(
    `  ${preset.name}.wav  ${preset.bpm} bpm  ${preset.seconds}s  ${(wav.length / 1e6).toFixed(1)} MB`,
  );
}
console.log("\nPlaceholder tracks written. Replace with real music before the demo.");
