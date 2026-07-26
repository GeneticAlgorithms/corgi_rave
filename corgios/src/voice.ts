import { config, requireElevenLabs } from "./config.ts";

const API_BASE = "https://api.elevenlabs.io";

/**
 * Emoji read badly aloud and burn characters against the free tier's
 * 10,000/month budget, so strip them before synthesis.
 */
function forSpeech(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Corgi speaks. Returns MP3 bytes suitable for Spectrum's `voice()` builder.
 * Verified working on the free tier (TTS is included; music is not).
 */
export async function synthesize(text: string): Promise<Buffer> {
  const apiKey = requireElevenLabs();
  const spoken = forSpeech(text);

  const res = await fetch(
    `${API_BASE}/v1/text-to-speech/${config.elevenLabsVoiceId}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        model_id: config.elevenLabsTtsModel,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`[11labs] TTS ${res.status}: ${await res.text()}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`[voice] synthesized ${spoken.length} chars -> ${buf.length} bytes`);
  return buf;
}

/**
 * Corgi listens. Transcribes an inbound iMessage voice note via Scribe so a
 * spoken message routes through exactly the same path as a typed one.
 */
export async function transcribe(
  audio: Buffer,
  mimeType = "audio/mpeg",
): Promise<string> {
  const apiKey = requireElevenLabs();

  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), "note.mp3");

  const res = await fetch(`${API_BASE}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`[11labs] STT ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  console.log(`[voice] transcribed ${audio.length} bytes -> "${text}"`);
  return text;
}
