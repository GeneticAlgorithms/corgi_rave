import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name} — see .env.example and add it to .env`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

/**
 * Spectrum needs these at startup; everything else is resolved lazily so a
 * missing ElevenLabs key degrades that one feature instead of refusing to boot.
 * The old backend/ hard-exited on nine env vars, which made it unrunnable.
 */
export const config = {
  projectId: required("PROJECT_ID"),
  projectSecret: required("PROJECT_SECRET"),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId: optional("ELEVENLABS_VOICE_ID", "CwhRBWXzGAHq8TQ4Fs17"),
  elevenLabsTtsModel: optional("ELEVENLABS_TTS_MODEL", "eleven_v3"),

  // "library" plays pre-loaded mp3s (works on any ElevenLabs tier).
  // "elevenlabs" calls /v1/music/compose — requires a PAID plan (free returns 402).
  musicBackend: optional("MUSIC_BACKEND", "library") as "library" | "elevenlabs",

  // Day signal: the markdown fixture always works. Live Merge is opt-in.
  useLiveMerge: process.env.USE_LIVE_MERGE === "true",
  mergeBin: optional(
    "MERGE_BIN",
    "/Users/corgioffice/Library/Application Support/pipx/venvs/merge-api/bin/merge",
  ),
  mergeTimezone: optional("MERGE_TIMEZONE", "America/Los_Angeles"),

  buddyHandle: process.env.BUDDY_HANDLE ?? "",
  buddyName: optional("BUDDY_NAME", "your friend"),

  port: Number(optional("PORT", "3001")),
  // Must be reachable FROM THE PHONE — localhost will not work on device.
  publicBaseUrl: optional("PUBLIC_BASE_URL", "http://localhost:3001"),
  frontendOrigin: optional("FRONTEND_ORIGIN", "http://localhost:8000"),

  distressCountdownMs: Number(optional("DISTRESS_COUNTDOWN_MS", "20000")),
} as const;

export function requireElevenLabs(): string {
  if (!config.elevenLabsApiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set — add it to .env");
  }
  return config.elevenLabsApiKey;
}
