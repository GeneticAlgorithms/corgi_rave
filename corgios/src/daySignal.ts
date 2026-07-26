import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.ts";

const execFileAsync = promisify(execFile);

const FIXTURE_PATH = path.join(import.meta.dirname, "..", "fixtures", "day.md");

export type DaySignal = {
  /** Free-form text describing the day; the brain reads this directly. */
  text: string;
  source: "fixture" | "merge";
};

/**
 * Merge tool names are HARDCODED on purpose.
 *
 * `merge list-tools` returns the full ~5,440-tool catalog, so resolving tools
 * by regex silently picks the wrong one: /calendar/i matches only 3 tools and
 * lands on `factset__get_calendar_events`, while the tool we actually want —
 * `outlook__get_today_events` — does not contain the string "calendar" at all.
 *
 * Discover names at BUILD time with:
 *   merge search-tools "list today's calendar events" --connector outlook
 * then pin the string here.
 */
const CALENDAR_TOOL = "outlook__get_today_events";

async function readFixture(): Promise<DaySignal> {
  const text = await readFile(FIXTURE_PATH, "utf8");
  return { text, source: "fixture" };
}

async function readFromMerge(): Promise<DaySignal> {
  const args = [
    "execute-tool",
    CALENDAR_TOOL,
    JSON.stringify({
      user_id: null,
      calendar_id: null,
      timezone: config.mergeTimezone,
    }),
  ];

  const { stdout } = await execFileAsync(config.mergeBin, args, {
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout) as {
    status?: string;
    error_type?: string;
    message?: string;
    result?: unknown;
  };

  // The CLI exits 0 even when the connector is unlinked, so check the envelope.
  if (parsed.status === "error" || !parsed.result) {
    throw new Error(
      `merge ${CALENDAR_TOOL} returned ${parsed.error_type ?? "an error"}: ${
        parsed.message ?? "no result"
      }`,
    );
  }

  return { text: JSON.stringify(parsed.result, null, 2), source: "merge" };
}

/**
 * One interface, two backends. The fixture always works and keeps the demo
 * deterministic; live Merge upgrades the same code path once a connector is
 * OAuth-linked (`merge execute-tool authenticate_outlook '{}'`).
 *
 * Live Merge never breaks the demo — any failure falls back to the fixture.
 */
export async function getTodaySignal(): Promise<DaySignal> {
  if (config.useLiveMerge) {
    try {
      const signal = await readFromMerge();
      console.log("[day] using live Merge data");
      return signal;
    } catch (err) {
      console.warn(
        `[day] live Merge failed, falling back to fixture: ${(err as Error).message}`,
      );
    }
  }
  console.log("[day] using fixtures/day.md");
  return readFixture();
}
