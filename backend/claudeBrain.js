const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-sonnet-5";

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required env var ANTHROPIC_API_KEY — see backend/.env.example");
  }
  client = new Anthropic({ apiKey });
  return client;
}

async function ask(system, prompt) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block ? block.text.trim() : "";
}

function parseJson(text, fallback) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch (err) {
    console.warn(`[claude] failed to parse JSON response, using fallback: ${err.message}`);
    return fallback;
  }
}

/**
 * Summarizes raw Merge calendar/chat signal into a short mood read.
 * Input shape is whatever mergeClient.getTodaySignal() returned — treated
 * loosely since it depends on the actual connector's payload shape.
 */
async function assessMood({ calendarEvents, recentMessages }) {
  const text = await ask(
    "You are the brain behind a warm, caring corgi companion. Given someone's raw " +
      "calendar and message data for today, read their mood. Respond with ONLY a JSON " +
      'object: {"mood": "<one or two words>", "vibeDescription": "<one sentence, ' +
      'concrete, references specifics from the data (e.g. meeting count, tone)>"}.',
    `Calendar data: ${JSON.stringify(calendarEvents)}\n\nMessage data: ${JSON.stringify(recentMessages)}`
  );
  return parseJson(text, { mood: "unknown", vibeDescription: "Not enough signal to tell yet." });
}

async function draftCheckIn(mood) {
  return ask(
    "You are a warm, brief corgi companion checking in over iMessage. Two sentences max, " +
      "no emoji spam (one is fine), sound like a caring friend, not a customer support bot.",
    `The person's mood today reads as: ${mood.mood} — ${mood.vibeDescription}. Write the check-in message.`
  );
}

async function draftMusicPrompt(mood) {
  return ask(
    "You write short, vivid prompts (1-2 sentences) for a text-to-music generation model, " +
      "describing genre, tempo, and texture. Respond with ONLY the prompt text, no preamble.",
    `Write a music generation prompt for someone whose mood today is: ${mood.mood} — ${mood.vibeDescription}.`
  );
}

/**
 * Secondary signal alongside distress.js's keyword matching — never the sole
 * trigger for escalation. Returns { escalate: boolean, confidence: number }.
 */
async function shouldEscalate(incomingText) {
  const text = await ask(
    "You monitor iMessage replies for genuine signs someone wants help or is in distress " +
      "during a live event. Respond with ONLY a JSON object: " +
      '{"escalate": true|false, "confidence": 0.0-1.0}. Be conservative — only flag clear signals.',
    `Message: "${incomingText}"`
  );
  return parseJson(text, { escalate: false, confidence: 0 });
}

module.exports = { assessMood, draftCheckIn, draftMusicPrompt, shouldEscalate };
