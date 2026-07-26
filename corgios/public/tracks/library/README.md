# Track library

Drop mp3 files here. This is the **default** music backend and the one that
cannot fail on stage — no API call, no latency, no plan tier.

`music.ts` buckets the mood into one of three names and picks the file whose
name starts with that bucket (falling back to the first mp3 present):

| File | Chosen when the mood reads as |
|---|---|
| `calm.mp3` | sad, flat, drained, numb, tender, lonely, tired, exhausted, quiet |
| `warm.mp3` | anything else — the default |
| `hard.mp3` | rage, angry, furious, hype, amped, wired, manic, restless |

Any mp3 works; 2–4 minutes is a good length for a demo. The visualizer reads the
waveform through an `AnalyserNode`, so tracks with a clear beat and dynamic
range look considerably better than ambient ones.

## Why not generate them?

ElevenLabs Music (`/v1/music/compose`) returns **HTTP 402 `paid_plan_required`**
on a free key — verified 2026-07-26. To switch to generated tracks, upgrade the
ElevenLabs plan and set `MUSIC_BACKEND=elevenlabs`. No code changes: `getTrack()`
already falls back here if a generation call fails.
