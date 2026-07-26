# corgi-rave-backend

Node service that bridges Merge (real personal data), Claude (mood/brain), ElevenLabs (voice + music), and Photon Spectrum (iMessage delivery) into the Corgi Rave experience. See `../docs/photon-merge.md` and the plan this was built from for full architecture context.

## Setup

```bash
cd backend
cp .env.example .env   # fill in every value below
npm install
npm run dev
```

Required env vars (service exits with a clear error naming any that are missing):

| Var | Where it comes from |
|---|---|
| `MERGE_TOOL_PACK_ID`, `MERGE_REGISTERED_USER_ID`, `MERGE_API_KEY` | Teammate's Merge Agent Handler setup |
| `IMESSAGE_ADDRESS`, `IMESSAGE_TOKEN` | Photon Spectrum dashboard |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | ElevenLabs account (paid tier required for Music API) |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `BUDDY_PHONE_NUMBER` | The pre-consented buddy for the safety-net demo |

Optional: `MERGE_CALENDAR_TOOL` / `MERGE_CHAT_TOOL` to override auto-detected Merge tool names (check server logs on startup — every discovered Merge tool name is printed).

## How it flows

1. Someone texts the Photon-connected number → Photon posts to `POST /photon/webhook`.
2. New chat → `startRave()`: pulls today's Merge signal, has Claude read the mood, drafts a check-in, sends it back over iMessage, generates a track via ElevenLabs Music, sends a mini-app card linking to `/rave/:sessionId`.
3. That URL returns `{ trackUrl, mood, corgiText }` for the frontend visualizer to fetch and play.
4. Further replies on an existing session route through `distress.js`: keyword-triggered countdown-then-escalate, plus a periodic dead-man-switch check-in.

## Verification

```bash
npm run dev

# Confirm server + Merge MCP connection status
curl -s http://localhost:3001/health | jq

# Simulate an incoming Photon message (starts a new session)
curl -s -X POST http://localhost:3001/photon/webhook \
  -H 'Content-Type: application/json' \
  -d '{"chat":{"guid":"test-chat-1"},"message":{"sender":"+15555550100","content":{"type":"text","text":"hey"}}}' | jq

# Once a session exists, fetch its rave payload (grab the sessionId logged by startRave)
curl -s http://localhost:3001/rave/<sessionId> | jq

# Simulate a distress trigger on that same chat
curl -s -X POST http://localhost:3001/photon/webhook \
  -H 'Content-Type: application/json' \
  -d '{"chat":{"guid":"test-chat-1"},"message":{"sender":"+15555550100","content":{"type":"text","text":"i need help"}}}' | jq

# Cancel within the countdown window
curl -s -X POST http://localhost:3001/photon/webhook \
  -H 'Content-Type: application/json' \
  -d '{"chat":{"guid":"test-chat-1"},"message":{"sender":"+15555550100","content":{"type":"text","text":"OK I'\''M FINE"}}}' | jq
```

Real end-to-end confirmation: text the real Photon-connected number from a phone, confirm the corgi's reply, and check that the mini-app card link plays the generated track through the visualizer.

## Known gaps (see plan's "open items")

- `photonClient.sendVoiceNote`'s attachment method name is a best guess — confirm against Photon's actual attachment API during build.
- `elevenLabsClient.triggerOutboundCall` is a stub — ElevenLabs' outbound-call API (SIP trunk / batch calls) needs to be looked up directly; the Photon buddy-text send happens regardless and is the load-bearing safety-net fallback.
- Location sharing isn't implemented — Photon's location message-type support wasn't confirmed; falls back to a plain maps link in text if needed.
- Prod vs. test `MERGE_API_KEY` mismatch is the most likely first failure (401s) — double check which environment your key belongs to.
