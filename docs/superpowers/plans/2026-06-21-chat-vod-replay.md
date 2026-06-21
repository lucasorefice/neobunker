# Chat + VOD + Synchronized Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live viewer chat whose messages carry a livestream-relative timestamp, plus publisher-side VOD recording and a replay page that plays the chat back in sync with the recorded video.

**Architecture:** A `sessions` table (one row per go-live, opened/closed by the presence route) anchors a stream's timeline. Chat travels over a WebSocket hosted by a new repo-committed custom server (`server.mjs`) and is persisted to Postgres with `offsetMs = sentAt − session.startedAt`. The broadcaster records locally (OBS or browser `MediaRecorder`) and uploads the file; replay binds each message to video time via `offsetMs − recordingOffsetMs`.

**Tech Stack:** Next.js 16 (custom server), TypeScript, Drizzle + Postgres, `ws`, `@moq/publish` (browser `MediaRecorder`), Vitest.

## Global Constraints

- **This is NOT the Next.js you know** (`AGENTS.md`): read the relevant guide under `node_modules/next/dist/docs/` before App-Router/custom-server work. In particular, read the custom-server guide before Task 3.
- **Do NOT run `git commit` or `git push`.** Lucas commits manually. "Stage" steps run `git add` only, then stop.
- **Depends on the presence-plus plan** (`2026-06-21-phase5-presence-plus.md`): `streams.liveStartedAt`, `POST /api/presence`, `usePresence`, and the Vitest harness must already exist. Branch `chat-vod-replay` is stacked on `phase5-presence-plus`.
- `offsetMs` is always `sentAt − session.startedAt`, clamped `>= 0`, in milliseconds.
- Single-node deployment: WebSocket rooms are in-memory, backed by Postgres for persistence. No multi-instance scaling.
- Spec: `docs/superpowers/specs/2026-06-21-chat-vod-replay-design.md`.

---

### Task 1: `sessions` + `chatMessages` schema and pure helpers

**Files:**
- Modify: `lib/schema.ts`
- Create: `lib/sessions.ts` (pure decisions over an injected repo)
- Create: `lib/__tests__/sessions.test.ts`
- Create: migration under `drizzle/` (generated)

**Interfaces:**
- Produces:
  - Drizzle tables `sessions` and `chatMessages` (+ inferred types `Session`, `ChatMessage`).
  - `type SessionRepo = { findOpen(streamId: string): Promise<{ id: string } | undefined>; open(streamId: string, startedAt: Date): Promise<void>; close(streamId: string, endedAt: Date): Promise<void> }`.
  - `async function openSession(repo: SessionRepo, streamId: string, now: Date): Promise<void>` — opens only if none open.
  - `async function closeSession(repo: SessionRepo, streamId: string, now: Date): Promise<void>`.

- [ ] **Step 1: Add the tables**

In `lib/schema.ts` add (keep existing imports; add `integer`):

```ts
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  streamId: uuid("stream_id").notNull().references(() => streams.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  recordingUrl: text("recording_url"),
  recordingDurationMs: integer("recording_duration_ms"),
  recordingOffsetMs: integer("recording_offset_ms").notNull().default(0),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  offsetMs: integer("offset_ms").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
```

- [ ] **Step 2: Write the failing test for the helpers**

Create `lib/__tests__/sessions.test.ts`:

```ts
import { expect, test } from "vitest";
import { openSession, closeSession, type SessionRepo } from "../sessions";

function fakeRepo() {
  const calls: string[] = [];
  let open: { id: string } | undefined;
  const repo: SessionRepo = {
    async findOpen() {
      return open;
    },
    async open() {
      open = { id: "s1" };
      calls.push("open");
    },
    async close() {
      open = undefined;
      calls.push("close");
    },
  };
  return { repo, calls };
}

const now = new Date("2026-06-21T10:00:00Z");

test("openSession opens when none is open", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  expect(calls).toEqual(["open"]);
});

test("openSession is idempotent when one is already open", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  await openSession(repo, "stream1", now);
  expect(calls).toEqual(["open"]);
});

test("closeSession closes the open one", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  await closeSession(repo, "stream1", now);
  expect(calls).toEqual(["open", "close"]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- sessions`
Expected: FAIL (`../sessions` not found).

- [ ] **Step 4: Implement the helpers**

Create `lib/sessions.ts`:

```ts
// Pure session lifecycle over an injected repo, so the open-once/close logic is
// unit-testable without a database. The DB-backed repo is wired in the presence
// route (Task 2).
export type SessionRepo = {
  findOpen(streamId: string): Promise<{ id: string } | undefined>;
  open(streamId: string, startedAt: Date): Promise<void>;
  close(streamId: string, endedAt: Date): Promise<void>;
};

export async function openSession(repo: SessionRepo, streamId: string, now: Date): Promise<void> {
  const existing = await repo.findOpen(streamId);
  if (existing) return;
  await repo.open(streamId, now);
}

export async function closeSession(repo: SessionRepo, streamId: string, now: Date): Promise<void> {
  const existing = await repo.findOpen(streamId);
  if (!existing) return;
  await repo.close(streamId, now);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- sessions`
Expected: PASS.

- [ ] **Step 6: Generate + apply the migration**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: a new SQL file in `drizzle/` creating both tables; applies cleanly.

- [ ] **Step 7: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Stage**

```bash
git add lib/schema.ts lib/sessions.ts lib/__tests__/sessions.test.ts drizzle/
```
Stop — Lucas commits.

---

### Task 2: Presence route opens/closes sessions

**Files:**
- Create: `lib/session-repo.ts` (DB-backed `SessionRepo`)
- Modify: `app/api/presence/route.ts` (from presence-plus)

**Interfaces:**
- Consumes: `openSession`/`closeSession`/`SessionRepo` (Task 1); the presence route (presence-plus).
- Produces: `dbSessionRepo: SessionRepo`. After this task, `POST /api/presence {kind:"live"}` opens a session and `{kind:"offline"}` closes it, in addition to updating `liveStartedAt`.

- [ ] **Step 1: Implement the DB-backed repo**

Create `lib/session-repo.ts`:

```ts
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import type { SessionRepo } from "@/lib/sessions";

export const dbSessionRepo: SessionRepo = {
  async findOpen(streamId) {
    const row = await db.query.sessions.findFirst({
      where: and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)),
    });
    return row ? { id: row.id } : undefined;
  },
  async open(streamId, startedAt) {
    await db.insert(sessions).values({ streamId, startedAt });
  },
  async close(streamId, endedAt) {
    await db
      .update(sessions)
      .set({ endedAt })
      .where(and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)));
  },
};
```

- [ ] **Step 2: Wire it into the presence route**

In `app/api/presence/route.ts`, import the helpers and call them after the `liveStartedAt` update:

```ts
import { openSession, closeSession } from "@/lib/sessions";
import { dbSessionRepo } from "@/lib/session-repo";
// ... after `await db.update(streams).set(...)`:
const now2 = new Date();
if (kind === "live") await openSession(dbSessionRepo, owned.id, now2);
else await closeSession(dbSessionRepo, owned.id, now2);
```

> Use the same `new Date()` instance for the `liveStartedAt` write and the session open so the timeline origins agree; refactor the route's single `new Date()` to a `const now` reused by both.

- [ ] **Step 3: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 4: Manual DB check**

With the dev DB running, POST a `live` then `offline` (e.g. via the publish page as the owner, or `curl` with a session cookie) and confirm a `sessions` row is created then gets `ended_at` set.

- [ ] **Step 5: Stage**

```bash
git add lib/session-repo.ts app/api/presence/route.ts
```
Stop — Lucas commits.

---

### Task 3: Custom server + WebSocket chat core

**Files:**
- Create: `server.mjs` (custom Next + WS server)
- Create: `lib/chat-core.ts` (pure message validation/decision)
- Create: `lib/__tests__/chat-core.test.ts`
- Create: `lib/chat-store.ts` (DB persistence for chat, used by the server)
- Modify: `package.json` (`ws` dep; `dev`/`start` scripts)

**Interfaces:**
- Produces:
  - `validateMessage(raw: unknown): { ok: true; body: string; displayName: string } | { ok: false; error: string }` — non-empty, trims, `body` ≤ 500 chars, `displayName` ≤ 40 chars.
  - `computeOffsetMs(sentAt: Date, startedAt: Date): number` — clamped `>= 0`.
  - `lib/chat-store.ts`: `resolveOpenSession(broadcastName)`, `backlog(sessionId)`, `persist({sessionId,userId,displayName,body,offsetMs,sentAt})` returning the stored row.
  - A running WS endpoint at `/chat?name=<broadcastName>`.
- Consumes: `sessions`/`chatMessages` (Task 1).

- [ ] **Step 1: Read the custom-server guide**

Read the custom-server doc under `node_modules/next/dist/docs/` (search for "custom server"). Note how Next 16 wants `next({ dev })`, `app.prepare()`, and `app.getRequestHandler()` invoked.

- [ ] **Step 2: Write the failing test for the pure core**

Create `lib/__tests__/chat-core.test.ts`:

```ts
import { expect, test } from "vitest";
import { validateMessage, computeOffsetMs } from "../chat-core";

test("accepts a normal message and trims", () => {
  const r = validateMessage({ body: "  hi  ", displayName: " bob " });
  expect(r).toEqual({ ok: true, body: "hi", displayName: "bob" });
});
test("rejects empty body", () => {
  expect(validateMessage({ body: "   ", displayName: "bob" }).ok).toBe(false);
});
test("rejects over-long body", () => {
  expect(validateMessage({ body: "x".repeat(501), displayName: "bob" }).ok).toBe(false);
});
test("offset is sentAt minus startedAt in ms", () => {
  const started = new Date("2026-06-21T10:00:00Z");
  const sent = new Date("2026-06-21T10:00:12Z");
  expect(computeOffsetMs(sent, started)).toBe(12_000);
});
test("offset clamps negatives to zero", () => {
  const started = new Date("2026-06-21T10:00:05Z");
  const sent = new Date("2026-06-21T10:00:00Z");
  expect(computeOffsetMs(sent, started)).toBe(0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- chat-core`
Expected: FAIL.

- [ ] **Step 4: Implement the pure core**

Create `lib/chat-core.ts`:

```ts
const MAX_BODY = 500;
const MAX_NAME = 40;

export function validateMessage(
  raw: unknown,
): { ok: true; body: string; displayName: string } | { ok: false; error: string } {
  const body = String((raw as { body?: unknown })?.body ?? "").trim();
  const displayName = String((raw as { displayName?: unknown })?.displayName ?? "").trim();
  if (!body) return { ok: false, error: "empty body" };
  if (body.length > MAX_BODY) return { ok: false, error: "body too long" };
  if (!displayName) return { ok: false, error: "empty name" };
  if (displayName.length > MAX_NAME) return { ok: false, error: "name too long" };
  return { ok: true, body, displayName };
}

export function computeOffsetMs(sentAt: Date, startedAt: Date): number {
  return Math.max(0, sentAt.getTime() - startedAt.getTime());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- chat-core`
Expected: PASS.

- [ ] **Step 6: Implement the chat store**

Create `lib/chat-store.ts`:

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, sessions, streams } from "@/lib/schema";

export async function resolveOpenSession(
  broadcastName: string,
): Promise<{ sessionId: string; startedAt: Date } | undefined> {
  const stream = await db.query.streams.findFirst({
    where: eq(streams.broadcastName, broadcastName),
  });
  if (!stream) return undefined;
  const open = await db.query.sessions.findFirst({
    where: and(eq(sessions.streamId, stream.id), isNull(sessions.endedAt)),
  });
  return open ? { sessionId: open.id, startedAt: open.startedAt } : undefined;
}

export async function backlog(sessionId: string) {
  return db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.offsetMs),
  });
}

export async function persist(row: {
  sessionId: string;
  userId: string | null;
  displayName: string;
  body: string;
  offsetMs: number;
  sentAt: Date;
}) {
  const [stored] = await db.insert(chatMessages).values(row).returning();
  return stored;
}
```

- [ ] **Step 7: Add `ws` and update scripts**

Run: `npm install ws && npm install -D @types/ws`

In `package.json`, change scripts:

```json
    "dev": "node server.mjs",
    "start": "NODE_ENV=production node server.mjs",
```

- [ ] **Step 8: Write the custom server**

Create `server.mjs`:

```js
import { createServer } from "node:http";
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

const server = createServer((req, res) => handle(req, res));
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
```

> Importing `.ts` from `server.mjs` relies on Node's TS support. If Node refuses the `.ts` import in this version, run the server via `tsx server.mjs` (add `tsx` as a dev dep and use it in the `dev`/`start` scripts) — the server logic is unchanged. Verify which works during implementation.
>
> TLS: production on the LAN currently uses an HTTPS server with mkcert certs. Add an HTTPS branch (read cert/key paths from env, e.g. `TLS_CERT`/`TLS_KEY`) mirroring the existing ad-hoc `server.mjs`; fall back to `createServer` (HTTP) when those env vars are unset (dev).

- [ ] **Step 9: Verify build + boot**

Run: `npm run build && (npm start &) && sleep 4 && curl -sf http://localhost:3000/ >/dev/null && echo OK; kill %1 2>/dev/null`
Expected: `OK` (custom server serves the app). Note: in this sandbox QUIC/UDP is blocked, but plain HTTP serving must work.

- [ ] **Step 10: Stage**

```bash
git add server.mjs lib/chat-core.ts lib/__tests__/chat-core.test.ts lib/chat-store.ts package.json package-lock.json
```
Stop — Lucas commits.

---

### Task 4: Live chat UI

**Files:**
- Create: `lib/use-chat.ts` (browser WS hook)
- Create: `app/chat-panel.tsx`
- Modify: `app/watch/[...name]/page.tsx` (render the panel)

**Interfaces:**
- Consumes: the `/chat` WS endpoint (Task 3); `ChatMessage` type (Task 1).
- Produces:
  - `useChat(name): { messages: ChatMessage[]; status: "connecting"|"open"|"offline"|"closed"; send(body: string): void; nickname: string; setNickname(n: string): void }`.
  - `<ChatPanel name />`.

> Browser/WS — verified by build + manual LAN test (no Vitest).

- [ ] **Step 1: Implement the hook**

Create `lib/use-chat.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schema";

type Status = "connecting" | "open" | "offline" | "closed";

export function useChat(name: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [nickname, setNickname] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setNickname(localStorage.getItem("nb:nick") ?? "");
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/chat?name=${encodeURIComponent(name)}`);
    wsRef.current = ws;
    setStatus("connecting");
    ws.onopen = () => setStatus("open");
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "offline") setStatus("offline");
      else if (data.type === "msg") setMessages((prev) => [...prev, data.message]);
    };
    return () => ws.close();
  }, [name]);

  const setNick = useCallback((n: string) => {
    setNickname(n);
    localStorage.setItem("nb:nick", n);
  }, []);

  const send = useCallback(
    (body: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== ws.OPEN || !nickname.trim() || !body.trim()) return;
      ws.send(JSON.stringify({ body, displayName: nickname }));
    },
    [nickname],
  );

  return { messages, status, send, nickname, setNickname: setNick };
}
```

- [ ] **Step 2: Implement the panel**

Create `app/chat-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useChat } from "@/lib/use-chat";
import { formatUptime } from "@/lib/format-uptime";

export function ChatPanel({ name }: { name: string }) {
  const { messages, status, send, nickname, setNickname } = useChat(name);
  const [draft, setDraft] = useState("");

  return (
    <aside className="flex h-[70vh] w-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 lg:h-auto">
      <header className="border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
        Chat {status === "offline" && "· stream offline"}
      </header>
      <ul className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {messages.map((m) => (
          <li key={m.id}>
            <span className="font-mono text-[10px] text-neutral-600">
              {formatUptime(m.offsetMs)}{" "}
            </span>
            <span className="font-medium text-neutral-300">{m.displayName}</span>{" "}
            <span className="text-neutral-200">{m.body}</span>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-neutral-800 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nickname.trim()) return;
          send(draft);
          setDraft("");
        }}
      >
        {!nickname.trim() ? (
          <input
            placeholder="pick a nickname"
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none"
            onBlur={(e) => setNickname(e.target.value)}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`message as ${nickname}`}
            disabled={status !== "open"}
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none disabled:opacity-50"
          />
        )}
        <button className="rounded-md bg-white px-3 py-1 text-sm font-medium text-neutral-950 disabled:opacity-50" disabled={status !== "open"}>
          Send
        </button>
      </form>
    </aside>
  );
}
```

- [ ] **Step 3: Render beside the player**

In `app/watch/[...name]/page.tsx`, wrap the stage + chat in a responsive 2-column layout: e.g. a `div` with `grid lg:grid-cols-[1fr_20rem] gap-4` containing the existing `<WatchStage>` and `<ChatPanel name={broadcastName} />`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Stage**

```bash
git add lib/use-chat.ts app/chat-panel.tsx "app/watch/[...name]/page.tsx"
```
Stop — Lucas commits.

---

### Task 5: VOD upload endpoint + dashboard form

**Files:**
- Create: `lib/vod-store.ts` (resolve target session, write recording fields)
- Create: `lib/__tests__/vod-target.test.ts`
- Create: `app/api/vod/upload/route.ts`
- Modify: `app/dashboard/page.tsx` (upload form for the latest ended session)

**Interfaces:**
- Consumes: `sessions` (Task 1); ownership pattern from `app/api/token/route.ts`.
- Produces:
  - `pickUploadTargetSession(sessions: {id:string; endedAt: Date|null}[]): string | undefined` — the most-recent ENDED session id.
  - `POST /api/vod/upload` (owner-only, multipart): writes the file under `var/vod/<sessionId>.<ext>`, sets `recordingUrl`, `recordingDurationMs?`, `recordingOffsetMs`.

- [ ] **Step 1: Write the failing test for target selection**

Create `lib/__tests__/vod-target.test.ts`:

```ts
import { expect, test } from "vitest";
import { pickUploadTargetSession } from "../vod-store";

test("picks the most-recent ended session", () => {
  const got = pickUploadTargetSession([
    { id: "a", endedAt: new Date("2026-06-21T09:00:00Z") },
    { id: "b", endedAt: new Date("2026-06-21T11:00:00Z") },
    { id: "c", endedAt: null }, // still live — skip
  ]);
  expect(got).toBe("b");
});

test("returns undefined when none ended", () => {
  expect(pickUploadTargetSession([{ id: "c", endedAt: null }])).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- vod-target`
Expected: FAIL.

- [ ] **Step 3: Implement `vod-store`**

Create `lib/vod-store.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

export function pickUploadTargetSession(
  rows: { id: string; endedAt: Date | null }[],
): string | undefined {
  const ended = rows.filter((r) => r.endedAt !== null) as { id: string; endedAt: Date }[];
  if (ended.length === 0) return undefined;
  ended.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
  return ended[0].id;
}

export async function setRecording(
  sessionId: string,
  fields: { recordingUrl: string; recordingDurationMs?: number; recordingOffsetMs: number },
) {
  await db.update(sessions).set(fields).where(eq(sessions.id, sessionId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- vod-target`
Expected: PASS.

- [ ] **Step 5: Implement the upload route**

Create `app/api/vod/upload/route.ts`:

```ts
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sessions, streams } from "@/lib/schema";
import { setRecording } from "@/lib/vod-store";

const VOD_DIR = path.join(process.cwd(), "var", "vod");

// multipart: file=<blob>, sessionId=<uuid>, offsetMs=<int>, durationMs=<int?>
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const sessionId = String(form.get("sessionId") ?? "");
  if (!(file instanceof File) || !sessionId) {
    return NextResponse.json({ error: "file and sessionId required" }, { status: 400 });
  }

  // Ownership: the session's stream must belong to the caller.
  const row = await db
    .select({ sessionId: sessions.id })
    .from(sessions)
    .innerJoin(streams, eq(sessions.streamId, streams.id))
    .where(and(eq(sessions.id, sessionId), eq(streams.ownerUserId, session.user.id)));
  if (row.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ext = file.type.includes("webm") ? "webm" : "mp4";
  await mkdir(VOD_DIR, { recursive: true });
  await writeFile(path.join(VOD_DIR, `${sessionId}.${ext}`), Buffer.from(await file.arrayBuffer()));

  await setRecording(sessionId, {
    recordingUrl: `/vod-file/${sessionId}.${ext}`,
    recordingOffsetMs: Number(form.get("offsetMs") ?? 0) || 0,
    recordingDurationMs: form.get("durationMs") ? Number(form.get("durationMs")) : undefined,
  });
  return NextResponse.json({ ok: true });
}
```

> The file is served at `/vod-file/<id>.<ext>`. Add a static route for `var/vod` in `server.mjs`: in the HTTP handler, if `req.url` starts with `/vod-file/`, stream the matching file from `VOD_DIR` with the right content-type; otherwise delegate to Next's `handle`. (Do NOT put recordings in `public/` — that is build-time only.)

- [ ] **Step 6: Add the static-file branch to `server.mjs`**

In `server.mjs`, before delegating to Next, handle `/vod-file/`:

```js
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
const VOD_DIR = path.join(process.cwd(), "var", "vod");
// inside createServer callback, first lines:
if (req.url?.startsWith("/vod-file/")) {
  const file = path.join(VOD_DIR, path.basename(req.url));
  try {
    await stat(file);
    res.setHeader("content-type", file.endsWith(".webm") ? "video/webm" : "video/mp4");
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
  return;
}
```

> `<video>` seeking wants HTTP range support. Progressive playback works without it; if scrubbing is janky, add `Range`/`Content-Range` handling here (note for manual verification).

- [ ] **Step 7: Add the dashboard upload form**

In `app/dashboard/page.tsx`: query the owner's sessions, compute the target via `pickUploadTargetSession`, and render a small `multipart/form-data` form posting to `/api/vod/upload` with hidden `sessionId` = target (only when one exists). Label it "Upload OBS recording for your last stream".

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 9: Stage**

```bash
git add lib/vod-store.ts lib/__tests__/vod-target.test.ts app/api/vod/upload/route.ts server.mjs app/dashboard/page.tsx
```
Stop — Lucas commits.

---

### Task 6: Browser-publish auto-recording

**Files:**
- Create: `app/publish/recorder.tsx`
- Modify: `app/publish/page.tsx` (mount it in JWT mode for the owner)

**Interfaces:**
- Consumes: `usePresence` (presence-plus); `/api/vod/upload` (Task 5); needs the owner's most-recent session id — pass it from the server page.
- Produces: `<PublishRecorder name targetSessionId? />` — records the local camera while the stream is live and auto-uploads on stop.

> Browser/media — verified by build + manual LAN test.

- [ ] **Step 1: Implement the recorder**

Create `app/publish/recorder.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@/lib/use-presence";

// Records the broadcaster's own camera with MediaRecorder while the stream is
// live (its own getUserMedia, NOT the <moq-publish> element's internal stream),
// then auto-uploads the blob when the stream goes offline. Renders nothing.
export function PublishRecorder({
  name,
  url,
  targetSessionId,
}: {
  name: string;
  url: string;
  targetSessionId?: string;
}) {
  const { status } = usePresence(name, url);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef<number>(0);
  const sessionId = useRef<string | undefined>(targetSessionId);

  useEffect(() => {
    sessionId.current = targetSessionId;
  }, [targetSessionId]);

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (status === "live" && !recorder.current) {
      (async () => {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
        chunks.current = [];
        startedAt.current = Date.now();
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = async () => {
          stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks.current, { type: "video/webm" });
          if (!sessionId.current || blob.size === 0) return;
          const fd = new FormData();
          fd.set("file", blob, "recording.webm");
          fd.set("sessionId", sessionId.current);
          fd.set("durationMs", String(Date.now() - startedAt.current));
          fd.set("offsetMs", "0"); // record-start ≈ go-live for the browser path
          await fetch("/api/vod/upload", { method: "POST", body: fd });
        };
        rec.start();
        recorder.current = rec;
      })();
    }
    if (status !== "live" && recorder.current) {
      recorder.current.stop();
      recorder.current = null;
    }
  }, [status]);

  return null;
}
```

> Caveat (from spec): this is a second encode, not the exact bytes viewers saw, and `offsetMs=0` assumes record-start ≈ go-live. The replay sync-nudge slider (Task 7) absorbs small skew.
>
> `targetSessionId` for the browser path is the CURRENTLY-open session. The publish server page must pass the open session id (query `sessions` for the owner's stream where `endedAt is null`). If none is open yet at render time, the recorder still records and uploads to whatever id is passed; if that is stale, prefer wiring it to re-fetch the open session on go-live. Keep it simple: pass the open session id and accept the limitation that a session opened after page load needs a refresh.

- [ ] **Step 2: Mount it**

In `app/publish/page.tsx` (JWT mode, owner): query the owner's open session id and render `<PublishRecorder name={broadcastName} url={presenceUrl} targetSessionId={openSessionId} />`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 4: Stage**

```bash
git add app/publish/recorder.tsx app/publish/page.tsx
```
Stop — Lucas commits.

---

### Task 7: Synchronized replay page

**Files:**
- Create: `lib/replay.ts` (pure visible-message filter)
- Create: `lib/__tests__/replay.test.ts`
- Create: `app/vod/[sessionId]/page.tsx` (server)
- Create: `app/vod/[sessionId]/chat-replay.tsx` (client)

**Interfaces:**
- Consumes: `sessions` + `chatMessages` (Task 1); `formatUptime` (presence-plus).
- Produces:
  - `visibleMessages<T extends { offsetMs: number }>(messages: T[], recordingOffsetMs: number, videoTimeMs: number): T[]` — those with `offsetMs − recordingOffsetMs <= videoTimeMs`.
  - `/vod/<sessionId>` page rendering `<video>` + synced chat.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/replay.test.ts`:

```ts
import { expect, test } from "vitest";
import { visibleMessages } from "../replay";

const msgs = [{ offsetMs: 0 }, { offsetMs: 5000 }, { offsetMs: 10000 }];

test("shows messages up to the current video time (inclusive)", () => {
  expect(visibleMessages(msgs, 0, 5000)).toEqual([{ offsetMs: 0 }, { offsetMs: 5000 }]);
});

test("applies recordingOffsetMs (recording started 2s after go-live)", () => {
  // a message at stream-offset 5000 maps to video time 3000
  expect(visibleMessages(msgs, 2000, 3000)).toEqual([{ offsetMs: 0 }, { offsetMs: 5000 }]);
});

test("nothing visible before the first message", () => {
  expect(visibleMessages(msgs, 0, -1)).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- replay`
Expected: FAIL.

- [ ] **Step 3: Implement the filter**

Create `lib/replay.ts`:

```ts
// A message at stream offset `offsetMs` appears at video time
// `offsetMs - recordingOffsetMs`. Show every message whose video time has been
// reached. Pure, so it is unit-testable and reused on every `timeupdate`.
export function visibleMessages<T extends { offsetMs: number }>(
  messages: T[],
  recordingOffsetMs: number,
  videoTimeMs: number,
): T[] {
  return messages.filter((m) => m.offsetMs - recordingOffsetMs <= videoTimeMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- replay`
Expected: PASS.

- [ ] **Step 5: Implement the replay client**

Create `app/vod/[sessionId]/chat-replay.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schema";
import { visibleMessages } from "@/lib/replay";
import { formatUptime } from "@/lib/format-uptime";

export function ChatReplay({
  src,
  messages,
  recordingOffsetMs,
}: {
  src: string;
  messages: ChatMessage[];
  recordingOffsetMs: number;
}) {
  const [videoTimeMs, setVideoTimeMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const shown = useMemo(
    () => visibleMessages(messages, recordingOffsetMs + nudgeMs, videoTimeMs),
    [messages, recordingOffsetMs, nudgeMs, videoTimeMs],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div>
        <video
          ref={videoRef}
          src={src}
          controls
          onTimeUpdate={(e) => setVideoTimeMs(e.currentTarget.currentTime * 1000)}
          className="aspect-video w-full rounded-xl bg-black"
        />
        <label className="mt-2 block text-xs text-neutral-500">
          chat sync nudge: {nudgeMs} ms
          <input
            type="range"
            min={-10000}
            max={10000}
            step={250}
            value={nudgeMs}
            onChange={(e) => setNudgeMs(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>
      <aside className="h-[60vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 text-sm">
        {shown.map((m) => (
          <div key={m.id}>
            <span className="font-mono text-[10px] text-neutral-600">{formatUptime(m.offsetMs)} </span>
            <span className="font-medium text-neutral-300">{m.displayName}</span>{" "}
            <span className="text-neutral-200">{m.body}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: Implement the server page**

Create `app/vod/[sessionId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, chatMessages } from "@/lib/schema";
import { ChatReplay } from "./chat-replay";

export default async function VodPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session?.recordingUrl) notFound();
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.offsetMs),
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-4 text-xl font-semibold">Replay</h1>
      <ChatReplay
        src={session.recordingUrl}
        messages={messages}
        recordingOffsetMs={session.recordingOffsetMs}
      />
    </main>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 8: Stage**

```bash
git add lib/replay.ts lib/__tests__/replay.test.ts "app/vod/[sessionId]/page.tsx" "app/vod/[sessionId]/chat-replay.tsx"
```
Stop — Lucas commits.

---

### Task 8: VOD index (dashboard + /browse)

**Files:**
- Create: `app/vod-list.tsx` (server component listing a stream's recorded sessions)
- Modify: `app/dashboard/page.tsx` (show the owner's recordings)
- Modify: `app/browse/page.tsx` (link recordings per stream)

**Interfaces:**
- Consumes: `sessions` (Task 1).
- Produces: `<VodList streamId />` listing sessions with a `recordingUrl`, linking to `/vod/<id>`.

- [ ] **Step 1: Implement the list**

Create `app/vod-list.tsx`:

```tsx
import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

export async function VodList({ streamId }: { streamId: string }) {
  const recorded = await db.query.sessions.findMany({
    where: and(eq(sessions.streamId, streamId), isNotNull(sessions.recordingUrl)),
    orderBy: desc(sessions.startedAt),
  });
  if (recorded.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {recorded.map((s) => (
        <li key={s.id}>
          <Link href={`/vod/${s.id}`} className="text-neutral-300 underline hover:text-white">
            {s.startedAt.toLocaleString()}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Show on dashboard**

In `app/dashboard/page.tsx`, under the stream section, render `<VodList streamId={stream.id} />` with a "Past streams" heading.

- [ ] **Step 3: Show on /browse**

In `app/browse/page.tsx`, render `<VodList streamId={stream.id} />` inside each card.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Stage**

```bash
git add app/vod-list.tsx app/dashboard/page.tsx app/browse/page.tsx
```
Stop — Lucas commits.

---

## Manual LAN verification (after all tasks)

Run the custom server's production build on the LAN box and confirm:
- Two watch tabs on a live stream: messages appear in both with a relative `mm:ss` stamp; offline stream shows chat read-only.
- Broadcaster records in OBS, stops, uploads via dashboard → `/vod/<id>` plays chat in sync with video; seeking jumps the chat; the nudge slider corrects skew.
- Browser webcam publish auto-uploads on stop and replays.
- VOD index lists recorded sessions on the dashboard and `/browse`.

## Self-review notes

- **Spec coverage:** sessions+lifecycle (T1/T2), custom server + WS chat (T3) + UI (T4), VOD upload/storage (T5) + browser recorder (T6), replay (T7), VOD index (T8) — all spec milestones mapped.
- **Type consistency:** `offsetMs`/`recordingOffsetMs` are integers (ms) everywhere; `ChatMessage` type from `lib/schema` is reused by `use-chat`, `chat-panel`, and `chat-replay`; `computeOffsetMs`/`visibleMessages` agree on the `offsetMs − recordingOffsetMs` mapping.
- **Known gaps deferred (spec out-of-scope):** WS auth (guest-only `userId:null` for now), HTTP range for smooth seeking (noted in T5 step 6), session-opened-after-page-load for the browser recorder (noted in T6).
- **No-commit rule:** every task ends at `git add` + stop, not `git commit`.
