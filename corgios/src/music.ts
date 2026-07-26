import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config, requireElevenLabs } from "./config.ts";

export const PUBLIC_DIR = path.join(import.meta.dirname, "..", "public");
const TRACKS_DIR = path.join(PUBLIC_DIR, "tracks");
const LIBRARY_DIR = path.join(TRACKS_DIR, "library");

type Bucket = "calm" | "warm" | "hard";

/**
 * Map the mood to a track bucket. Deliberately crude — the library backend is
 * the guaranteed path, and a wrong-ish bucket still plays music.
 */
function bucketFor(mood: string): Bucket {
  const m = mood.toLowerCase();
  if (/\b(rage|angry|furious|hype|amped|wired|manic|restless)\b/.test(m)) return "hard";
  if (/\b(sad|flat|drained|numb|tender|lonely|tired|exhausted|quiet)\b/.test(m)) return "calm";
  return "warm";
}

/**
 * Pre-loaded local tracks. Works on any ElevenLabs tier, has zero latency, and
 * cannot fail live. This is the DEFAULT backend.
 */
async function fromLibrary(mood: string): Promise<string | null> {
  let files: string[];
  try {
    files = (await readdir(LIBRARY_DIR)).filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.warn(
      `[music] no tracks in public/tracks/library/ — the rave link will be skipped. ` +
        `Drop calm.mp3 / warm.mp3 / hard.mp3 in there (see the README in that folder).`,
    );
    return null;
  }

  const bucket = bucketFor(mood);
  const match = files.find((f) => f.toLowerCase().startsWith(bucket)) ?? files[0]!;
  console.log(`[music] library: mood "${mood}" -> ${bucket} -> ${match}`);
  return `/tracks/library/${match}`;
}

/**
 * ElevenLabs Music. REQUIRES A PAID PLAN — a free key returns
 * HTTP 402 `paid_plan_required`. Verified against the current key on
 * 2026-07-26. Kept behind MUSIC_BACKEND=elevenlabs so upgrading the plan is a
 * one-line change with no code edits.
 */
async function fromElevenLabs(sessionId: string, prompt: string): Promise<string | null> {
  const apiKey = requireElevenLabs();

  const res = await fetch("https://api.elevenlabs.io/v1/music/compose", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      music_length_ms: 30_000,
      model_id: "music_v2",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 402) {
      console.error(
        "[music] ElevenLabs Music needs a PAID plan (HTTP 402). " +
          "Set MUSIC_BACKEND=library, or upgrade the account.",
      );
    } else {
      console.error(`[music] compose failed ${res.status}: ${body}`);
    }
    return null;
  }

  await mkdir(TRACKS_DIR, { recursive: true });
  const filename = `${sessionId}.mp3`;
  await writeFile(path.join(TRACKS_DIR, filename), Buffer.from(await res.arrayBuffer()));
  console.log(`[music] composed ${filename}`);
  return `/tracks/${filename}`;
}

/**
 * Returns a path under PUBLIC_BASE_URL, or null if no track could be produced
 * (in which case the corgi still texts — it just doesn't send a rave link).
 */
export async function getTrack(
  sessionId: string,
  mood: string,
  prompt: string,
): Promise<string | null> {
  if (config.musicBackend === "elevenlabs") {
    const generated = await fromElevenLabs(sessionId, prompt);
    if (generated) return generated;
    console.warn("[music] falling back to the local library");
  }
  return fromLibrary(mood);
}
