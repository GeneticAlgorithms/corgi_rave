import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { config } from "./config.ts";
import { PUBLIC_DIR } from "./music.ts";
import * as sessions from "./sessions.ts";
import * as distress from "./distress.ts";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/**
 * The visualizer fetches this cross-origin and the <audio> element is
 * crossorigin="anonymous" (index.html:24), so both need permissive CORS or the
 * AnalyserNode receives silence.
 */
function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy(); // don't buffer unbounded input
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function serveStatic(urlPath: string, res: http.ServerResponse): Promise<boolean> {
  // Resolve then confirm containment, so ../ can't escape public/.
  const filePath = path.join(PUBLIC_DIR, decodeURIComponent(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return false;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;

    cors(res);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
    });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

export function startHttpServer(): http.Server {
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);

      if (req.method === "OPTIONS") {
        cors(res);
        res.writeHead(204).end();
        return;
      }

      // GET /rave/:sessionId — what script.js:1602 fetches.
      const rave = url.pathname.match(/^\/rave\/([\w-]+)$/);
      if (rave) {
        const session = sessions.get(rave[1]!);
        cors(res);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "session_not_found" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            trackUrl: session.trackUrl ? `${config.publicBaseUrl}${session.trackUrl}` : null,
            mood: session.mood,
            vibeDescription: session.vibeDescription,
            corgiText: session.corgiText,
          }),
        );
        return;
      }

      // POST /gesture — hand gestures on the wall trigger real actions.
      // { action: "help" | "ok", sessionId?: string }
      if (req.method === "POST" && url.pathname === "/gesture") {
        cors(res);
        const body = await readBody(req);
        const { action, sessionId } = JSON.parse(body || "{}") as {
          action?: string;
          sessionId?: string;
        };

        const session = sessionId ? sessions.get(sessionId) : sessions.latest();
        if (!session) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "no_active_session" }));
          return;
        }

        console.log(`[gesture] ${action} -> session ${session.id}`);
        if (action === "help") await distress.requestHelp(session);
        else if (action === "ok") await distress.signalOk(session);
        else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unknown_action" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, action, sessionId: session.id }));
        return;
      }

      // GET /tracks — the library, so the visualizer can cycle on a swipe.
      if (url.pathname === "/tracks") {
        cors(res);
        let files: string[] = [];
        try {
          files = (await readdir(path.join(PUBLIC_DIR, "tracks", "library")))
            .filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f))
            .sort();
        } catch {
          files = [];
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            tracks: files.map((f) => `${config.publicBaseUrl}/tracks/library/${f}`),
          }),
        );
        return;
      }

      if (url.pathname === "/health") {
        cors(res);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            musicBackend: config.musicBackend,
            liveMerge: config.useLiveMerge,
          }),
        );
        return;
      }

      if (await serveStatic(url.pathname, res)) return;

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    })().catch((err) => {
      console.error(`[http] ${err.stack}`);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  server.listen(config.port, () => {
    console.log(`[http] listening on :${config.port} (public: ${config.publicBaseUrl})`);
  });

  return server;
}
