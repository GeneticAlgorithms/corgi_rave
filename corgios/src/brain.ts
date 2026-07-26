import type { DaySignal } from "./daySignal.ts";
import { backend, complete, extractJson } from "./model.ts";

export { backend };

export type DayRead = {
  mood: string;
  vibeDescription: string;
  checkIn: string;
  musicPrompt: string;
};

/**
 * A deliberately *good* fallback, not `mood: "unknown"`. If the model is
 * unreachable mid-demo the corgi still says something warm and specific
 * rather than something obviously broken.
 */
const FALLBACK: DayRead = {
  mood: "wired and frayed",
  vibeDescription: "Long day, not enough sleep, and no gap to put it down.",
  checkIn: "hey. that looked like a lot today. come here — I made you something. 🐶",
  musicPrompt:
    "warm pastel synthwave, slow four-on-the-floor, soft analog pads, " +
    "gentle and forgiving, like the end of a long day",
};

const READ_SYSTEM =
  "You are the mind behind a warm, slightly goofy corgi who checks in on someone " +
  "over iMessage and throws them a rave tuned to their day. You are perceptive and " +
  "specific, never saccharine and never clinical.\n\n" +
  "Respond with ONLY a JSON object, no prose and no code fence:\n" +
  "{\n" +
  '  "mood": "one to three words",\n' +
  '  "vibeDescription": "one sentence citing SPECIFICS from the data (meeting count, sleep, a cancelled plan)",\n' +
  '  "checkIn": "the corgi\'s opening iMessage — two sentences max, lowercase-ish, warm, ' +
  'references one concrete detail from their day, at most one emoji, sounds like a friend who noticed",\n' +
  '  "musicPrompt": "1-2 sentence text-to-music prompt: genre, tempo, texture — matched to the mood. ' +
  'If the day was brutal this is catharsis, not cheerfulness."\n' +
  "}";

/** Single round trip for the whole opening beat. */
export async function readTheDay(signal: DaySignal): Promise<DayRead> {
  try {
    const out = await complete(
      READ_SYSTEM,
      `Here is everything I know about their day:\n\n${signal.text}`,
      1024,
    );
    const parsed = extractJson<Partial<DayRead>>(out, {});
    if (!parsed.checkIn || !parsed.mood) return FALLBACK;
    return { ...FALLBACK, ...parsed } as DayRead;
  } catch (err) {
    console.warn(`[brain] readTheDay failed, using fallback: ${(err as Error).message}`);
    return FALLBACK;
  }
}

/**
 * Secondary confirmation for distress. AND-gated with keyword matching in
 * distress.ts and fails OPEN to keyword-only, so an API hiccup can never
 * suppress a real escalation.
 */
export async function confirmsDistress(text: string): Promise<boolean> {
  try {
    const out = await complete(
      "You judge whether a message from someone at a party genuinely asks for help " +
        "or signals distress, versus ordinary hyperbole ('this bass is not okay', " +
        "'help me find the bathroom'). Answer with one word: YES or NO.",
      text,
      16,
    );
    const verdict = out.trim().toUpperCase();
    console.log(`[brain] distress check "${text}" -> ${verdict || "(empty)"}`);
    return verdict.startsWith("YES");
  } catch (err) {
    console.warn(
      `[brain] distress check failed, failing open to keyword match: ${(err as Error).message}`,
    );
    return true;
  }
}

/** Short reassurance while a countdown is running. */
export async function draftReassurance(): Promise<string> {
  try {
    const out = await complete(
      "You are a warm corgi. Someone just asked for help. Reply in ONE short sentence: " +
        "calm, present, no advice, no questions. Lowercase is fine. Reply with the sentence only.",
      "they asked for help",
      100,
    );
    return out || "i'm here. stay with me.";
  } catch {
    return "i'm here. stay with me.";
  }
}
