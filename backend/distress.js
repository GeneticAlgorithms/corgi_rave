const photonClient = require("./photonClient");
const elevenLabsClient = require("./elevenLabsClient");

const KEYWORDS = [/\bhelp\b/i, /get me out/i, /not okay/i, /i'?m not ok/i, /i need out/i];
const CANCEL_PHRASE = /ok i'?m fine/i;

const COUNTDOWN_MS = Number(process.env.DISTRESS_COUNTDOWN_MS) || 20000;
const DEAD_MAN_INTERVAL_MS = Number(process.env.DEAD_MAN_SWITCH_INTERVAL_MS) || 10 * 60 * 1000;

function matchesKeyword(text) {
  return KEYWORDS.some((re) => re.test(text));
}

/**
 * Sends the buddy a text (always) and best-effort attempts an outbound call
 * (may fail — that's fine, the text is the load-bearing fallback per the plan).
 */
async function escalate(session) {
  const buddyName = process.env.BUDDY_NAME || "your buddy";
  const buddyNumber = process.env.BUDDY_PHONE_NUMBER;
  if (!buddyNumber) {
    console.error("[distress] BUDDY_PHONE_NUMBER not set — cannot escalate. See .env.example.");
    return;
  }

  console.log(`[distress] escalating for session ${session.id} -> ${buddyName}`);
  const buddyChatGuid = await photonClient.getOrCreateChat(buddyNumber);
  await photonClient.sendText(
    buddyChatGuid,
    `Hey ${buddyName} — this is Corgi Rave. ${session.recipient} may need you right now. ` +
      `Please check in with them.`
  );

  try {
    await elevenLabsClient.triggerOutboundCall(buddyNumber, `${session.recipient} may need help.`);
  } catch (err) {
    console.warn(`[distress] outbound call failed (buddy text still sent): ${err.message}`);
  }
}

function cancelCountdown(session) {
  if (session.distress.timer) {
    clearTimeout(session.distress.timer);
    session.distress.timer = null;
  }
  session.distress.active = false;
}

async function startCountdown(session) {
  if (session.distress.active) return; // already counting down, don't restack
  session.distress.active = true;

  const buddyName = process.env.BUDDY_NAME || "your buddy";
  await photonClient.sendText(
    session.chatGuid,
    `I think you need out — reaching ${buddyName} in ${Math.round(COUNTDOWN_MS / 1000)}s. ` +
      `Reply "OK I'M FINE" to stop.`
  );

  session.distress.timer = setTimeout(async () => {
    if (!session.distress.active) return; // was cancelled
    session.distress.active = false;
    session.distress.timer = null;
    await escalate(session);
  }, COUNTDOWN_MS);
}

/**
 * Main entry point for every incoming Photon message on an active session.
 */
async function handleIncomingMessage(session, text) {
  if (session.distress.active) {
    if (CANCEL_PHRASE.test(text)) {
      cancelCountdown(session);
      await photonClient.sendText(session.chatGuid, "Okay, glad you're alright. Still raving 🎉");
    }
    return;
  }

  if (session.deadManSwitch.awaitingReply) {
    session.deadManSwitch.awaitingReply = false;
    return; // any reply counts as "still here"
  }

  if (matchesKeyword(text)) {
    await startCountdown(session);
  }
}

function startDeadManSwitch(session) {
  stopDeadManSwitch(session);
  session.deadManSwitch.timer = setInterval(async () => {
    if (session.distress.active) return; // already handling a countdown
    session.deadManSwitch.awaitingReply = true;
    await photonClient.sendText(session.chatGuid, "still with me? 👍");
    setTimeout(async () => {
      if (session.deadManSwitch.awaitingReply) {
        session.deadManSwitch.awaitingReply = false;
        await startCountdown(session);
      }
    }, COUNTDOWN_MS);
  }, DEAD_MAN_INTERVAL_MS);
}

function stopDeadManSwitch(session) {
  if (session.deadManSwitch.timer) {
    clearInterval(session.deadManSwitch.timer);
    session.deadManSwitch.timer = null;
  }
}

module.exports = { handleIncomingMessage, startDeadManSwitch, stopDeadManSwitch, matchesKeyword };
