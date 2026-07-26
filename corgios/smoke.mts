import { getTodaySignal } from "./src/daySignal.ts";
import { getTrack } from "./src/music.ts";
import { matchesTrigger, matchesCancel, normalize } from "./src/distress.ts";
import { synthesize, transcribe } from "./src/voice.ts";

let fail = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}`);
  if (!cond) fail++;
};

console.log("\n== distress: the iPhone curly-apostrophe bug ==");
ok(matchesCancel("OK I'M FINE"), "straight apostrophe cancels");
ok(matchesCancel("OK I’M FINE"), "CURLY apostrophe cancels (was broken)");
ok(matchesCancel("stop"), '"stop" cancels');
ok(matchesCancel("nvm"), '"nvm" cancels');
ok(matchesCancel("i'm good"), '"i\'m good" cancels');
ok(normalize("OK I’M FINE") === "ok i'm fine", "normalize folds U+2019");

console.log("\n== distress: triggers ==");
ok(matchesTrigger("i need help"), '"i need help" triggers');
ok(matchesTrigger("get me out"), '"get me out" triggers');
ok(matchesTrigger("come get me"), '"come get me" triggers');
ok(matchesTrigger("i can’t breathe"), '"i can’t breathe" triggers (curly)');
ok(matchesTrigger("i want to go home"), '"i want to go home" triggers');

console.log("\n== distress: false positives that used to fire ==");
ok(!matchesTrigger("can you help me find the bathroom"), "bathroom question does NOT trigger");
ok(!matchesTrigger("thanks for the help"), '"thanks for the help" does NOT trigger');
ok(!matchesTrigger("this bass is not okay lol"), '"bass is not okay" does NOT trigger');

console.log("\n== daySignal (fixture) ==");
const signal = await getTodaySignal();
ok(signal.source === "fixture", "reads fixtures/day.md");
ok(signal.text.includes("Northwind"), "fixture content loaded");

console.log("\n== music (library backend) ==");
const calm = await getTrack("test-session", "drained and quiet", "n/a");
const hard = await getTrack("test-session", "wired and frayed", "n/a");
const warm = await getTrack("test-session", "content", "n/a");
if (calm === null) {
  // No tracks installed — must degrade quietly rather than throw.
  ok(hard === null && warm === null, "empty library returns null (warns, does not throw)");
} else {
  ok(/calm/.test(calm), `"drained and quiet" -> calm (${calm})`);
  ok(/hard/.test(hard ?? ""), `"wired and frayed" -> hard (${hard})`);
  ok(/warm/.test(warm ?? ""), `"content" -> warm (${warm})`);
}

console.log("\n== voice: TTS -> STT round trip ==");
if (!process.env.ELEVENLABS_API_KEY) {
  console.log("  SKIP  ELEVENLABS_API_KEY not set");
} else {
  const mp3 = await synthesize("Six meetings back to back? Come here.");
  ok(mp3.length > 5000, `TTS returned ${mp3.length} bytes`);
  const text = await transcribe(mp3);
  ok(/six meetings/i.test(text), `STT round-tripped: "${text}"`);
}

console.log("\n== gesture -> action (hands-free safety net) ==");
{
  const { startHttpServer } = await import("./src/http.ts");
  const sessions = await import("./src/sessions.ts");

  // Stub space that records what the corgi would have sent over iMessage.
  const sent: string[] = [];
  const stubSpace = {
    id: "space-gesture-test",
    send: async (c: unknown) => {
      sent.push(String(c));
      return undefined;
    },
  };
  const session = sessions.create(stubSpace as never);

  const server = startHttpServer();
  await new Promise((r) => setTimeout(r, 300));
  const base = `http://localhost:${process.env.PORT}`;

  const post = async (body: unknown) => {
    const res = await fetch(`${base}/gesture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  };

  const bad = await post({ action: "nope", sessionId: session.id });
  ok(bad.status === 400, `unknown action -> 400 (got ${bad.status})`);

  const help = await post({ action: "help", sessionId: session.id });
  ok(help.status === 200, `help -> 200 (got ${help.status})`);
  ok(session.distress.active, "help armed the countdown");
  ok(
    sent.some((m) => /reaching|i'm here|stay with me/i.test(m)),
    `corgi responded: ${JSON.stringify(sent.slice(0, 2))}`,
  );
  ok(sent.some((m) => /call 911/i.test(m)), "escalation warning includes the 911 clause");

  const okRes = await post({ action: "ok", sessionId: session.id });
  ok(okRes.status === 200, `ok -> 200 (got ${okRes.status})`);
  ok(!session.distress.active, "thumbs-up cancelled the countdown");

  const missing = await fetch(`${base}/gesture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "help", sessionId: "nope" }),
  });
  ok(missing.status === 409, `unknown session -> 409 (got ${missing.status})`);

  server.close();
}

console.log(fail === 0 ? "\nALL PASS\n" : `\n${fail} FAILED\n`);
process.exit(fail === 0 ? 0 : 1);
