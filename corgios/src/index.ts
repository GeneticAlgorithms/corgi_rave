import { Spectrum, richlink, voice } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";
import { config } from "./config.ts";
import { readTheDay, backend as brainBackend } from "./brain.ts";
import { getTodaySignal } from "./daySignal.ts";
import { getTrack } from "./music.ts";
import * as sessions from "./sessions.ts";
import * as distress from "./distress.ts";
import { startHttpServer } from "./http.ts";
import { synthesize, transcribe } from "./voice.ts";

// Spectrum bridges a single agent loop to many messaging interfaces.
// `app.messages` is a PULL-based async iterable — no webhook, no public tunnel
// needed for inbound. Docs: https://photon.codes/docs/spectrum-ts
const app = await Spectrum({
  projectId: config.projectId,
  projectSecret: config.projectSecret,
  providers: [
    // imessage
    imessage.config(),
  ],
});

distress.bindApp(app);
startHttpServer();

console.log(
  `[corgi] ready — brain=${brainBackend} music=${config.musicBackend} liveMerge=${config.useLiveMerge}`,
);

/** Best-effort voice note; a TTS failure must never cost us the text message. */
async function speak(space: { send(c: unknown): Promise<unknown> }, line: string) {
  if (!config.elevenLabsApiKey) return;
  try {
    const mp3 = await synthesize(line);
    await space.send(voice(mp3, { mimeType: "audio/mpeg" }));
  } catch (err) {
    console.warn(`[corgi] voice note skipped: ${(err as Error).message}`);
  }
}

/** The opening beat: read the day, say something true about it, build the rave. */
async function startRave(space: any): Promise<void> {
  const session = sessions.create(space);
  console.log(`[corgi] session ${session.id} for space ${space.id}`);

  await space.startTyping().catch(() => {});

  const signal = await getTodaySignal();
  const read = await readTheDay(signal);

  session.mood = read.mood;
  session.vibeDescription = read.vibeDescription;
  session.corgiText = read.checkIn;

  await space.stopTyping().catch(() => {});
  await space.send(read.checkIn);
  await speak(space, read.checkIn);

  session.trackUrl = await getTrack(session.id, read.mood, read.musicPrompt);

  if (session.trackUrl) {
    // Must point at the VISUALIZER, not the JSON endpoint. script.js:1592-1596
    // parses ?rave=<id>&backend=<base>.
    const raveUrl =
      `${config.frontendOrigin}/index.html` +
      `?rave=${session.id}&backend=${encodeURIComponent(config.publicBaseUrl)}`;
    await space.send(richlink(raveUrl));
    console.log(`[corgi] rave link: ${raveUrl}`);
  } else {
    await space.send(
      "i'd throw you a rave but i've got no tracks loaded — drop an mp3 in " +
        "public/tracks/library/ and text me again.",
    );
  }
}

/** Text messages and voice notes converge here. */
async function resolveText(message: any): Promise<string | null> {
  const content = message.content;
  if (content?.type === "text") return content.text ?? null;

  if (content?.type === "voice") {
    if (!config.elevenLabsApiKey) {
      console.warn("[corgi] voice note received but ELEVENLABS_API_KEY is unset");
      return null;
    }
    try {
      return await transcribe(await content.read(), content.mimeType ?? "audio/mpeg");
    } catch (err) {
      console.warn(`[corgi] transcription failed: ${(err as Error).message}`);
      return null;
    }
  }

  return null;
}

for await (const [space, message] of app.messages) {
  try {
    // Our own sends echo back on some providers. Without this the corgi's
    // check-in can self-trigger the distress keywords.
    if (message.direction === "outbound") continue;

    // The buddy replying "what's wrong?" must not spawn them their own rave —
    // the check-in would narrate the user's calendar to them.
    if (sessions.isBuddySpace(space.id)) {
      console.log(`[corgi] ignoring buddy space ${space.id}`);
      continue;
    }

    const text = await resolveText(message);
    if (!text) continue;
    console.log(`[corgi] <- "${text}"`);

    const session = sessions.getBySpace(space.id);
    if (!session) {
      await startRave(space);
      continue;
    }

    if (await distress.handleMessage(session, text)) continue;

    await space.send("still here. 🐶");
  } catch (err) {
    console.error(`[corgi] message handling failed: ${(err as Error).stack}`);
  }
}
