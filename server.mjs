import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import next from "next";
import { WebSocketServer } from "ws";
import {
  resolveOpenSession,
  backlog,
  persist,
} from "./lib/chat-store.ts";
import { validateMessage, computeOffsetMs } from "./lib/chat-core.ts";

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
    (req, res) => handle(req, res),
  );
} else {
  server = createHttpServer((req, res) => handle(req, res));
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
  });

  ws.on("close", () => rooms.get(name)?.delete(ws));
});

server.listen(port, () => console.log(`> ready on :${port}`));
