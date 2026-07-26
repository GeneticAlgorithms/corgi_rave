import { config } from "./config.ts";
import { confirmsDistress, draftReassurance } from "./brain.ts";
import { markBuddySpace, type Session } from "./sessions.ts";

/**
 * iOS Smart Punctuation rewrites ' as ’ (U+2019) as you type. The previous
 * cancel regex only matched a straight apostrophe, so a user who typed exactly
 * what the bot told them to — OK I'M FINE — was still escalated. Normalize
 * before every match.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’ʼ´]/g, "'")
    .toLowerCase()
    .trim();
}

/**
 * Tuned for what people actually type at a rave. Bare /\bhelp\b/ was dropped —
 * it fires on "help me find the bathroom" — and the phrases that matter in a
 * real drug/heat emergency were added.
 */
const TRIGGERS = [
  /\b(need|want|get)\s+(me\s+)?help\b/,
  // "help me" alone is a real signal; "help me find the bathroom" is not.
  /\bhelp me\b(?!\s+(find|with|pick|choose|carry|understand|decide|remember|figure|get to))/,
  /get me out/,
  /i need out/,
  /i want to go home/,
  /come get me/,
  /something'?s wrong/,
  /i can'?t breathe/,
  /i'?m not ok(ay)?\b/,
  /\bi feel weird\b/,
];

const CANCEL =
  /\b(stop|cancel|nvm|nevermind|no+|false alarm|i'?m (ok|okay|fine|good)|im (ok|fine|good))\b/;

export function matchesTrigger(text: string): boolean {
  const t = normalize(text);
  return TRIGGERS.some((re) => re.test(t));
}

export function matchesCancel(text: string): boolean {
  return CANCEL.test(normalize(text));
}

type App = { space: { create(users: string): Promise<{ id: string; send(c: unknown): Promise<unknown> }> } };

let app: App | null = null;
export function bindApp(instance: unknown): void {
  app = instance as App;
}

function cancelCountdown(session: Session): void {
  if (session.distress.timer) clearTimeout(session.distress.timer);
  session.distress.timer = null;
  session.distress.active = false;
}

async function escalate(session: Session): Promise<void> {
  if (!config.buddyHandle) {
    console.error("[distress] BUDDY_HANDLE not set — cannot escalate. Add it to .env");
    await session.space.send(
      "i wanted to reach someone for you but i don't have anyone saved. " +
        "if this is a medical thing, call 911 — i'm just a dog.",
    );
    return;
  }
  if (!app) throw new Error("[distress] app not bound — call bindApp() at startup");

  console.log(`[distress] escalating session ${session.id} -> ${config.buddyName}`);

  // `space.create` resolves an existing 1:1 or opens a new one, so the buddy
  // does NOT need to have messaged us first.
  const buddySpace = await app.space.create(config.buddyHandle);
  markBuddySpace(buddySpace.id);

  await buddySpace.send(
    `hey ${config.buddyName} — this is Corgi Rave, texting on behalf of your friend. ` +
      `they asked for help just now and i couldn't reach anyone else. ` +
      `please check in with them. if you can't reach them and you're worried, call 911.`,
  );

  await session.space.send(`i texted ${config.buddyName}. they're on it. i'm still here.`);
}

/** Sends the warning, then escalates unless cancelled. */
async function startCountdown(session: Session): Promise<void> {
  if (session.distress.active) return;

  const seconds = Math.round(config.distressCountdownMs / 1000);

  // Set the flag only AFTER a successful send. Setting it first meant a failed
  // send left the session permanently "counting down" with no timer — the
  // safety net silently off forever.
  await session.space.send(
    `i think you need out. i'm reaching ${config.buddyName} in ${seconds}s — ` +
      `reply STOP to cancel. if this is a medical thing, call 911 — i'm just a dog.`,
  );
  session.distress.active = true;

  session.distress.timer = setTimeout(() => {
    void (async () => {
      try {
        if (!session.distress.active) return;
        session.distress.active = false;
        session.distress.timer = null;
        await escalate(session);
      } catch (err) {
        // An unhandled rejection in a timer callback takes down the process —
        // i.e. the safety net would kill the server exactly when it's needed.
        console.error(`[distress] escalation failed: ${(err as Error).stack}`);
      }
    })();
  }, config.distressCountdownMs);
}

/**
 * Hands-free entry point, raised by a hand gesture on the visualizer wall
 * rather than a typed message — you can't text from the middle of a dancefloor.
 *
 * Deliberately routed through the SAME countdown as a typed trigger so it stays
 * cancellable; a gesture is easier to make by accident than a sentence.
 */
export async function requestHelp(session: Session): Promise<void> {
  if (session.distress.active) return;
  console.log(`[distress] help requested by gesture on session ${session.id}`);
  await session.space.send(await draftReassurance());
  await startCountdown(session);
}

/** Hands-free "I'm good" — cancels a running countdown from the wall. */
export async function signalOk(session: Session): Promise<boolean> {
  if (!session.distress.active) return false;
  cancelCountdown(session);
  await session.space.send("okay, saw your thumbs up. glad you're alright. 🐶");
  return true;
}

/**
 * Returns true if the message was consumed by the distress flow.
 */
export async function handleMessage(session: Session, text: string): Promise<boolean> {
  if (session.distress.active) {
    if (matchesCancel(text)) {
      cancelCountdown(session);
      await session.space.send("okay. glad you're alright. still here whenever. 🐶");
    } else {
      // Never silently swallow input while an irreversible action is pending.
      await session.space.send(`didn't catch that — reply STOP to cancel.`);
    }
    return true;
  }

  if (!matchesTrigger(text)) return false;

  // AND-gate: keyword AND model agreement. confirmsDistress fails OPEN, so an
  // API error degrades to keyword-only rather than suppressing a real call.
  if (!(await confirmsDistress(text))) {
    console.log(`[distress] keyword hit but model said no: "${text}"`);
    return false;
  }

  await session.space.send(await draftReassurance());
  await startCountdown(session);
  return true;
}
