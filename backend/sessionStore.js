const sessions = new Map(); // sessionId -> session
const byChatGuid = new Map(); // chatGuid -> sessionId

function createSession(sessionId, { chatGuid, recipient }) {
  const session = {
    id: sessionId,
    chatGuid,
    recipient,
    mood: null,
    trackUrl: null,
    corgiText: null,
    distress: { active: false, timer: null },
    deadManSwitch: { timer: null, awaitingReply: false },
  };
  sessions.set(sessionId, session);
  byChatGuid.set(chatGuid, sessionId);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) ?? null;
}

function getSessionByChatGuid(chatGuid) {
  const sessionId = byChatGuid.get(chatGuid);
  return sessionId ? sessions.get(sessionId) : null;
}

function updateSession(sessionId, patch) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  Object.assign(session, patch);
  return session;
}

module.exports = { createSession, getSession, getSessionByChatGuid, updateSession };
