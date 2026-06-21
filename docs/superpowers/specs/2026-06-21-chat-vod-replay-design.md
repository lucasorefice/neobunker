# Chat + VOD + synchronized replay

Status: approved design (2026-06-21)
Branch: `chat-vod-replay` (stacked on `phase5-presence-plus`)
Depends on: the presence-plus spec (`streams.liveStartedAt`, `POST /api/presence`).

## Goal

A live chat for viewers where every message carries a timestamp relative to the
livestream, plus video recording (VOD) and a synchronized replay that plays the
chat back against the recorded video at each message's relative timestamp.

Decided in brainstorming:
- Behavior: full DVR replay (chat synced to a seekable video timeline).
- Recording: publisher-side (OBS local recording + browser `MediaRecorder`),
  uploaded to the LAN server. The Node app server cannot record server-side
  (`@moq/watch` needs browser WebTransport/WebCodecs; `moq-relay` is a relay, not
  a recorder).
- Scope: chat + VOD + replay combined in this one spec, built as ordered
  milestones.

## Context (existing system)

- One stream per broadcaster (`streams`: `id`, `ownerUserId`, `broadcastName`
  unique, `title`). `users` for broadcaster accounts (Auth.js v5 Credentials;
  viewers are anonymous — no account).
- Presence-plus adds `streams.liveStartedAt` and `POST /api/presence`
  (`kind:"live"|"offline"`, owner-only) driven by a `<LiveRecorder>` client that
  watches the stream's own ANNOUNCE. This spec extends that route.
- Deployment: a custom HTTPS `server.mjs` wraps the Next production build on the
  LAN box, but it is NOT in the repo (rsynced, ad-hoc). There is no `ws`/socket
  dependency. Next.js App Router cannot host a WebSocket server in a route
  handler — a custom server is required.
- Verification norm: server logic is unit-testable; browser MoQ/media APIs are
  verified manually on the LAN.

## Data model (new)

### `sessions` — one row per go-live
- `id uuid pk`
- `streamId uuid -> streams.id` (cascade)
- `startedAt timestamptz not null`
- `endedAt timestamptz null`
- `recordingUrl text null`
- `recordingDurationMs integer null`
- `recordingOffsetMs integer not null default 0`
  (= recording-start minus session-start; lets replay map message offsets to
  video time)

### `chatMessages`
- `id uuid pk`
- `sessionId uuid -> sessions.id` (cascade)
- `userId uuid null -> users.id` (null for guests)
- `displayName text not null`
- `body text not null`
- `sentAt timestamptz not null default now()`
- `offsetMs integer not null` (server-computed `sentAt − session.startedAt`,
  clamped >= 0). This is the "timestamp relative to the livestream."

Drizzle migration under `drizzle/`.

## Milestone 1 — Sessions + presence-route extension

Extend `POST /api/presence` (from presence-plus):
- `kind:"live"`: as before set `liveStartedAt`, AND insert a `sessions` row
  (`startedAt=now`) only if the stream has no open session (`endedAt is null`).
  Idempotent.
- `kind:"offline"`: as before clear `liveStartedAt`, AND set the open session's
  `endedAt=now`.

`<LiveRecorder>` is mounted on BOTH the publish page and the dashboard, so a
broadcaster on either page while live opens a session. OBS-only with no web page
open creates no session (documented limitation; matches uptime fallback).

A small `lib/sessions.ts` holds the open-session helpers (find open, open, close)
so the route stays thin and the logic is unit-testable.

## Milestone 2 — Custom server + WebSocket live chat

### Custom server (repo-committed)
- Add `server.mjs` at the repo root: Node `http`/`https` server that delegates
  HTTP to Next's handler (`next({ dev })`) and attaches a `ws.WebSocketServer`
  on path `/chat`. TLS in production (mkcert cert paths via env, mirroring the
  current LAN server); plain HTTP in dev.
- Scripts: `dev` -> `node server.mjs` (dev mode), `start` -> `node server.mjs`
  (prod). Add `ws` (+ `@types/ws`) dependency. The custom server supersedes the
  ad-hoc LAN `server.mjs`; deploy notes (`deploy/lan.md`) updated.

### Chat protocol
- Client connects `wss://<host>/chat?name=<broadcastName>`.
- Server resolves `broadcastName -> stream -> current open session`.
  - No open session (offline): connection is read-only (or sends an `offline`
    notice); no messages accepted.
- On connect: server sends the session's existing messages (backlog) so joiners
  have context.
- On `{ type:"msg", body, displayName }`: validate (non-empty, length cap),
  compute `offsetMs`, persist a `chatMessages` row, broadcast the stored message
  to every client in the room (rooms keyed by `sessionId`).
- Identity: anonymous viewers pick a nickname (persisted in localStorage); a
  logged-in broadcaster's account name is used and `userId` set (cookie/session
  read on the WS upgrade). No moderation.
- The message-handling core is a pure function `(room, rawMsg, session) ->
  {persist, broadcast}` so it can be unit-tested without sockets.

### Live chat UI
- `lib/use-chat.ts`: `useChat(name) -> { messages, send, status, setNickname }`.
  Opens the WS, merges backlog + live messages, exposes `send`.
- `app/chat-panel.tsx`: renders the message list (sender + relative stream time
  `offsetMs -> mm:ss`) and an input with a first-send nickname prompt.
- Mounted on the watch page (beside the player on desktop, below on mobile) and
  visible to the broadcaster on the dashboard/publish page.

## Milestone 3 — VOD recording (publisher-side + upload)

- **OBS path:** broadcaster records locally (OBS built-in), then uploads the file
  via a dashboard "Upload recording" form, choosing the session (defaults to the
  most-recent ended session for their stream).
- **Browser webcam path:** `app/publish/recorder.ts` runs its OWN
  `getUserMedia` (mirroring the publisher's camera/mic) into a `MediaRecorder`,
  rather than reaching into the `<moq-publish>` element's internal stream; on
  stop, auto-uploads the blob. Records `recordStartedAt` so the client can report
  `recordingOffsetMs = recordStartedAt − session.startedAt` (defaults to 0 if
  unknown). Note: this is a second encode, not the exact bytes viewers saw.
- `POST /api/vod/upload` (owner-only; same ownership check as the publish-token
  branch): multipart body streamed to disk under a served VOD directory
  (e.g. `var/vod/<sessionId>.<ext>`, served by the custom server — NOT `public/`,
  which is build-time). Sets the session's `recordingUrl`, `recordingDurationMs`,
  `recordingOffsetMs`. File served as-is (MP4/WebM); no transcoding.

## Milestone 4 — Synchronized replay

- `app/vod/[sessionId]/page.tsx` (server): loads the session, its recording, and
  all messages ordered by `offsetMs`. Renders a seekable `<video controls
  src=recordingUrl>` plus `<ChatReplay>`.
- `app/vod/[sessionId]/chat-replay.tsx` (client): tracks `video.currentTime`,
  reveals messages where `offsetMs − recordingOffsetMs <= currentTime*1000`,
  rebuilds the visible set on seek, and offers a manual **sync-nudge** slider
  (extra offset added to `recordingOffsetMs`) for clock skew.
- VOD index: list a stream's past sessions that have a recording, linking to
  `/vod/<sessionId>` — surfaced on the dashboard and `/browse`.

## Testing

- **TDD — pure server logic:**
  - `lib/sessions.ts`: open is idempotent (no second open session); close sets
    `endedAt`.
  - presence-route extension: `live` opens at most one session; `offline` closes
    it.
  - chat message core: `offsetMs` computed and clamped >= 0; rejects empty /
    over-length bodies; persists then broadcasts.
  - `POST /api/vod/upload`: 401 unauth, 403 non-owner; sets recording fields.
  - replay filter: given messages + `recordingOffsetMs` + a video time, returns
    exactly the visible messages (boundary at equality).
- **Manual / LAN verification:**
  - Two watch tabs: messages appear live in both with relative timestamps.
  - Offline stream: chat read-only.
  - OBS record -> upload -> `/vod/<id>` plays chat in sync with the video;
    seeking jumps the chat; the nudge slider corrects skew.
  - Browser webcam publish auto-uploads and replays.

## Out of scope

- Moderation, emotes/reactions, message edit/delete, DMs.
- HLS/ABR/transcoding for VOD (serve the uploaded file as-is).
- Recording OBS-only streams with no broadcaster web page open (no session).
- Multi-instance WebSocket scaling (single LAN node; in-memory rooms backed by
  Postgres persistence).
- Everything already out of scope in `IMPLEMENTATION_PLAN.md`.

## Build order

Milestones 1 -> 2 -> 3 -> 4. Milestone 2 (live chat) is independently useful and
delivers the "relative timestamp" requirement; 3 and 4 add recording and replay.
