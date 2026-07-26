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

console.log("\n== music (library backend, empty library) ==");
const track = await getTrack("test-session", "drained", "n/a");
ok(track === null, "returns null when library is empty (warns, does not throw)");

console.log("\n== voice: TTS -> STT round trip ==");
if (!process.env.ELEVENLABS_API_KEY) {
  console.log("  SKIP  ELEVENLABS_API_KEY not set");
} else {
  const mp3 = await synthesize("Six meetings back to back? Come here.");
  ok(mp3.length > 5000, `TTS returned ${mp3.length} bytes`);
  const text = await transcribe(mp3);
  ok(/six meetings/i.test(text), `STT round-tripped: "${text}"`);
}

console.log(fail === 0 ? "\nALL PASS\n" : `\n${fail} FAILED\n`);
process.exit(fail === 0 ? 0 : 1);
