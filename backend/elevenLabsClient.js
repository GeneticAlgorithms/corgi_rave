const fs = require("fs");
const path = require("path");

const API_BASE = "https://api.elevenlabs.io";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — see backend/.env.example`);
  }
  return value;
}

async function synthesizeSpeech(text) {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const voiceId = requireEnv("ELEVENLABS_VOICE_ID");

  const res = await fetch(`${API_BASE}/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });

  if (!res.ok) {
    throw new Error(`[elevenlabs] TTS failed: ${res.status} ${await res.text()}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generates a one-off track from a mood/vibe prompt and writes it to
 * backend/public/tracks/<sessionId>.mp3 so server.js can serve it statically.
 * Returns the relative URL path to serve.
 */
async function composeTrack(sessionId, prompt, musicLengthMs = 30000) {
  const apiKey = requireEnv("ELEVENLABS_API_KEY");

  const res = await fetch(`${API_BASE}/v1/music/compose`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: musicLengthMs,
      model_id: "music_v2",
    }),
  });

  if (!res.ok) {
    throw new Error(`[elevenlabs] music compose failed: ${res.status} ${await res.text()}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  const tracksDir = path.join(__dirname, "public", "tracks");
  fs.mkdirSync(tracksDir, { recursive: true });
  const filename = `${sessionId}.mp3`;
  fs.writeFileSync(path.join(tracksDir, filename), audio);

  return `/tracks/${filename}`;
}

/**
 * Buddy-escalation outbound call. The exact API (SIP trunk / batch calls)
 * wasn't confirmed during planning — see docs/photon-merge.md and the plan's
 * "open items" — so this is stubbed with a clear failure rather than a
 * silently wrong call. The Photon text to the buddy is the load-bearing
 * fallback and works independently of this function.
 */
async function triggerOutboundCall(_toNumber, _contextText) {
  throw new Error(
    "[elevenlabs] triggerOutboundCall not yet implemented — confirm ElevenLabs " +
      "Conversational AI's SIP trunk / batch calls API during build (see plan open item #2). " +
      "The Photon buddy-text fallback should be sent regardless of this call's outcome."
  );
}

module.exports = { synthesizeSpeech, composeTrack, triggerOutboundCall };
