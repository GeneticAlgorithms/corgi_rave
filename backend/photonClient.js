const { createClient } = require("@photon-ai/advanced-imessage");

let im = null;
let onIncomingMessage = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} — see backend/.env.example`);
  }
  return value;
}

function getClient() {
  if (im) return im;
  const address = requireEnv("IMESSAGE_ADDRESS");
  const token = requireEnv("IMESSAGE_TOKEN");
  im = createClient({ address, token });
  return im;
}

async function getOrCreateChat(recipient) {
  const client = getClient();
  const { chat } = await client.chats.create([recipient]);
  return chat.guid;
}

async function sendText(chatGuid, text) {
  const client = getClient();
  console.log(`[photon] sending text to ${chatGuid}: ${text}`);
  return client.messages.sendText(chatGuid, text);
}

async function sendVoiceNote(chatGuid, audioBuffer, filename = "corgi-voice.mp3") {
  const client = getClient();
  console.log(`[photon] sending voice note (${audioBuffer.length} bytes) to ${chatGuid}`);
  // Attachment upload shape — confirm exact method name/signature against
  // Photon's docs during build; this is the best-guess call per their
  // "attachments and file uploads" feature list.
  return client.messages.sendAttachment(chatGuid, {
    filename,
    contentType: "audio/mpeg",
    data: audioBuffer,
  });
}

async function sendMiniAppCard(chatGuid, url, title) {
  const client = getClient();
  console.log(`[photon] sending mini-app card to ${chatGuid}: ${title} -> ${url}`);
  return client.messages.sendMiniAppCard(chatGuid, { url, title });
}

/**
 * Registers the single handler invoked whenever an incoming message webhook
 * arrives (wired up in server.js's POST /photon/webhook route). This module
 * doesn't run its own HTTP listener — Photon posts events to our server.
 */
function onMessage(handler) {
  onIncomingMessage = handler;
}

async function handleWebhookPayload(payload) {
  if (!onIncomingMessage) {
    console.warn("[photon] received webhook but no handler registered");
    return;
  }
  await onIncomingMessage(payload);
}

module.exports = {
  getOrCreateChat,
  sendText,
  sendVoiceNote,
  sendMiniAppCard,
  onMessage,
  handleWebhookPayload,
};
