import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "./config.ts";

const MODEL = "claude-sonnet-5";
const CLI_BIN = path.join(import.meta.dirname, "..", "node_modules", ".bin", "claude");

export type Backend = "cli" | "api";

/**
 * Prefer the API key when present (faster, no subprocess); otherwise drive the
 * locally-installed Claude Code CLI, which authenticates with the user's own
 * Claude login instead of an API key.
 */
export const backend: Backend = config.anthropicApiKey ? "api" : "cli";

/** Lazily imported so a missing SDK never breaks the CLI path. */
let sdk: unknown = null;
async function viaApi(system: string, user: string, maxTokens: number): Promise<string> {
  if (!sdk) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    sdk = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  const client = sdk as {
    messages: {
      create(a: unknown): Promise<{ content: Array<{ type: string; text?: string }> }>;
    };
  };
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return block?.text?.trim() ?? "";
}

/** The prompt goes over stdin — execFile has no `input`, and argv has limits. */
function runCli(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI_BIN, args, {
      // Run outside the repo so the CLI doesn't load this project's CLAUDE.md.
      cwd: tmpdir(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Claude CLI timed out after 90s"));
    }, 90_000);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        reject(new Error(`Claude CLI exited ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.end(input);
  });
}

async function viaCli(system: string, user: string): Promise<string> {
  const stdout = await runCli(
    [
      "-p",
      "--output-format",
      "json",
      "--model",
      MODEL,
      "--system-prompt",
      system,
      // Pure text generation — no file access, no tool loop.
      "--allowed-tools",
      "",
    ],
    user,
  );

  const env = JSON.parse(stdout) as { is_error?: boolean; result?: string };
  if (env.is_error) {
    throw new Error(
      env.result === "Not logged in · Please run /login"
        ? "Claude CLI is not logged in — run `npx @anthropic-ai/claude-code` and use /login " +
          "(no API key needed), or set ANTHROPIC_API_KEY in .env"
        : `Claude CLI error: ${env.result ?? "unknown"}`,
    );
  }
  return (env.result ?? "").trim();
}

export async function complete(
  system: string,
  user: string,
  maxTokens = 1024,
): Promise<string> {
  return backend === "api" ? viaApi(system, user, maxTokens) : viaCli(system, user);
}

/** Extracts the first JSON object from a model response. */
export function extractJson<T>(text: string, fallback: T): T {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text) as T;
  } catch {
    console.warn("[model] could not parse JSON from response, using fallback");
    return fallback;
  }
}
