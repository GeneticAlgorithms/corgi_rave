require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const mergeClient = require("./mergeClient");
const photonClient = require("./photonClient");
const elevenLabsClient = require("./elevenLabsClient");
const claudeBrain = require("./claudeBrain");
const sessionStore = require("./sessionStore");
const distress = require("./distress");

const REQUIRED_ENV = [
  "MERGE_TOOL_PACK_ID",
  "MERGE_REGISTERED_USER_ID",
  "MERGE_API_KEY",
  "IMESSAGE_ADDRESS",
  "IMESSAGE_TOKEN",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ANTHROPIC_API_KEY",
  "BUDDY_PHONE_NUMBER",
];

function checkRequiredEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(
      `Missing required env vars: ${missing.join(", ")}\n` +
        "Copy backend/.env.example to backend/.env and fill these in before starting."
    );
    process.exit(1);
  }
}

checkRequiredEnv();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
app.use("/tracks", express.static(path.join(__dirname, "public", "tracks")));

const PORT = process.env.PORT || 3001;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// Kick off the Merge MCP connection at startup, but don't block the server on it —
// /health honestly reports "disconnected" if it hasn't succeeded yet.
mergeClient
  .ensureConnected()
  .then(() => console.log("[server] Merge MCP connected"))
  .catch((err) => console.error(`[server] Merge MCP connect failed: ${err.message}`));

/**
 * Runs the full "corgi checks in" flow for a brand new session: pull real
 * data, assess mood, draft a check-in, generate a track, and send it all
 * back through Photon. This is the demo's opening beat.
 */
async function startRave(chatGuid, recipient) {
  const sessionId = crypto.randomUUID();
  const session = sessionStore.createSession(sessionId, { chatGuid, recipient });

  console.log(`[rave] starting session ${sessionId} for ${recipient}`);

  const signal = await mergeClient.getTodaySignal().catch((err) => {
    console.warn(`[rave] getTodaySignal failed, continuing with no data: ${err.message}`);
    return { calendarEvents: null, recentMessages: null };
  });

  const mood = await claudeBrain.assessMood(signal);
  sessionStore.updateSession(sessionId, { mood });

  const corgiText = await claudeBrain.draftCheckIn(mood);
  sessionStore.updateSession(sessionId, { corgiText });
  await photonClient.sendText(chatGuid, corgiText);

  const musicPrompt = await claudeBrain.draftMusicPrompt(mood);
  const trackUrl = await elevenLabsClient.composeTrack(sessionId, musicPrompt).catch((err) => {
    console.error(`[rave] composeTrack failed: ${err.message}`);
    return null;
  });
  sessionStore.updateSession(sessionId, { trackUrl });

  if (trackUrl) {
    const raveUrl = `${PUBLIC_BASE_URL}/rave/${sessionId}`;
    await photonClient.sendMiniAppCard(chatGuid, raveUrl, "Your rave is ready 🎉");
  }

  distress.startDeadManSwitch(session);
}

app.post("/photon/webhook", async (req, res) => {
  try {
    const payload = req.body;
    // Shape follows Photon's documented incoming-message event: a message
    // with `content.type === "text"`, `content.text`, and the owning chat.
    const chatGuid = payload?.chat?.guid;
    const text = payload?.message?.content?.text;
    const recipient = payload?.message?.sender ?? payload?.chat?.recipient ?? "unknown";

    if (!chatGuid || typeof text !== "string") {
      return res.status(400).json({ status: "error", error: "invalid_payload" });
    }

    const session = sessionStore.getSessionByChatGuid(chatGuid);
    if (!session) {
      startRave(chatGuid, recipient).catch((err) =>
        console.error(`[rave] startRave failed: ${err.message}`)
      );
    } else {
      await distress.handleIncomingMessage(session, text);
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error(`[server] webhook handling error: ${err.stack}`);
    res.status(500).json({ status: "error", error: "internal_error" });
  }
});

app.get("/rave/:sessionId", (req, res) => {
  const session = sessionStore.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ status: "error", error: "session_not_found" });
  }
  res.json({
    trackUrl: session.trackUrl ? `${PUBLIC_BASE_URL}${session.trackUrl}` : null,
    mood: session.mood,
    corgiText: session.corgiText,
  });
});

app.get("/health", async (_req, res) => {
  res.json({ ok: true, mcp: mergeClient.getStatus() });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(`[server] unhandled error: ${err.stack}`);
  res.status(400).json({ status: "error", error: "bad_request" });
});

app.listen(PORT, () => {
  console.log(`[server] corgi-rave-backend listening on :${PORT}`);
});
