import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import next from "next";
import { WebSocketServer } from "ws";
import {
  resolveOpenSession,
  backlog,
  persist,
} from "./lib/chat-store.ts";
import { validateMessage, computeOffsetMs } from "./lib/chat-core.ts";

const VOD_DIR = path.join(process.cwd(), "var", "vod");

/** Serve a file from var/vod/ at /vod-file/<basename>. Returns true if handled. */
async function handleVodFile(req, res) {
  if (!req.url?.startsWith("/vod-file/")) return false;
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.join(VOD_DIR, path.basename(pathname));
  try {
    await stat(file);
    const EXT_TO_MIME = {
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
    };
    const fileExt = path.extname(file).toLowerCase();
    res.setHeader("content-type", EXT_TO_MIME[fileExt] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
  return true;
}

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

// name -> Set<ws>. In-memory rooms; Postgres is the source of truth.
const rooms = new Map();

await app.prepare();

// TLS: if TLS_CERT + TLS_KEY are set (prod LAN with mkcert), use HTTPS; else HTTP (dev).
let server;
if (process.env.TLS_CERT && process.env.TLS_KEY) {
  server = createHttpsServer(
    {
      cert: readFileSync(process.env.TLS_CERT),
      key: readFileSync(process.env.TLS_KEY),
    },
    async (req, res) => {
      if (await handleVodFile(req, res)) return;
      handle(req, res);
    },
  );
} else {
  server = createHttpServer(async (req, res) => {
    if (await handleVodFile(req, res)) return;
    handle(req, res);
  });
}

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname !== "/chat") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", async (ws, req) => {
  const name = new URL(req.url, "http://localhost").searchParams.get("name");
  if (!name) return ws.close();

  const session = await resolveOpenSession(name);
  if (!session) {
    ws.send(JSON.stringify({ type: "offline" }));
    return; // read-only / nothing to join
  }

  let set = rooms.get(name);
  if (!set) rooms.set(name, (set = new Set()));
  set.add(ws);

  for (const m of await backlog(session.sessionId)) {
    ws.send(JSON.stringify({ type: "msg", message: m }));
  }

  ws.on("message", async (data) => {
    let raw;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      return;
    }
    const v = validateMessage(raw);
    if (!v.ok) return;
    const sentAt = new Date();
    try {
      const stored = await persist({
        sessionId: session.sessionId,
        userId: null, // guest; auth wiring is a later enhancement
        displayName: v.displayName,
        body: v.body,
        offsetMs: computeOffsetMs(sentAt, session.startedAt),
        sentAt,
      });
      const payload = JSON.stringify({ type: "msg", message: stored });
      for (const peer of rooms.get(name) ?? []) {
        if (peer.readyState === peer.OPEN) peer.send(payload);
      }
    } catch (err) {
      console.warn("Failed to persist/broadcast message:", err);
      return;
    }
  });

  ws.on("close", () => rooms.get(name)?.delete(ws));
});

server.listen(port, () => console.log(`> ready on :${port}`));
