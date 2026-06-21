# Phase 5 extension — richer presence

Status: approved design (2026-06-21)
Branch: `phase5-presence-plus` (off `main`)

## Goal

Extend the existing Phase 5 presence feature (ANNOUNCE-driven live/offline badge)
with four additions, keeping the project's "no polling, ANNOUNCE-driven" identity:

1. Real viewer count.
2. Live duration / uptime.
3. Richer offline/live UI on the watch page.
4. A stream directory (`/browse`).

## Context (existing system)

- `app/presence-badge.tsx` opens a lightweight `@moq/watch` `Broadcast` (with
  `reload:true`) for a name and mirrors its `status` signal into React. Already
  used on the watch page header and dashboard.
- `lib/relay-token.ts` mints relay JWTs. Claims use moq-token `root`/`put`/`get`
  (NOT `pub`/`sub`); `RELAY_NAMESPACE="live"`. `put`/`get` accept a string OR an
  array of strings, and the relay treats them as path prefixes (that is why
  `get:<name>` already authorizes all of a broadcast's tracks). Two helpers:
  `subscribeRelayUrl(name)` (`get:<name>`) and `publishRelayUrl(name)`
  (`put:<name>,get:<name>`, owner-only). Anon mode (no `RELAY_JWT_SECRET`)
  returns the plain relay URL.
- `app/api/token/route.ts` mints `subscribe` (any viewer) and `publish`
  (owner-only, ownership checked against the `streams` table) tokens.
- `lib/schema.ts`: `users` and `streams` (`broadcastName` unique, `ownerUserId`,
  `title`). One stream per broadcaster.
- Publishing: the web publish page renders `<moq-publish>` (its own UI controls
  drive go-live); OBS (Phase 4) publishes with a publish token, never touching
  the web app.
- Verification norm: phases were verified manually on the LAN; browser MoQ APIs
  (WebTransport/WebCodecs) are not unit-testable. The app's Node server cannot
  watch ANNOUNCE (`@moq/watch` needs browser APIs).

## Decisions

- **Viewer count:** ANNOUNCE self-presence (MoQ-native, no polling), not DB
  heartbeat.
- **Uptime:** broadcaster-recorded in DB (web publish path) with client-observed
  fallback for OBS-only streams.

## Components

### 0. Shared presence hook (refactor)

Extract the ANNOUNCE-subscription logic from `PresenceBadge` into
`lib/use-presence.ts`: `usePresence(name, url) -> { status }` where
`status: "connecting" | "offline" | "loading" | "live"`. `PresenceBadge` becomes
a thin consumer. Rationale: viewer count, live recorder, and the badge all reuse
this exact connect/subscribe/teardown dance; inlining it three times is the wrong
boundary.

### 1. Viewer count — ANNOUNCE self-presence

- **`lib/relay-token.ts`:** add `mintViewerToken(name)` ->
  `{ root:"live", put:["<name>/viewers/"], get:["<name>"] }` and
  `viewerRelayUrl(name)` (plain relay URL in anon mode, token-bearing in JWT
  mode).
- **`app/api/token/route.ts`:** add a `kind:"viewer"` branch (no auth — any
  viewer may announce their own presence). Returns the viewer token.
- **`lib/use-viewer-presence.ts`:** `useViewerPresence(name, url, { announce }) ->
  { count }`. In the browser: (a) if `announce`, **publish** an empty broadcast at
  `<name>/viewers/<crypto.randomUUID()>` via `@moq/publish` so this viewer shows
  up in ANNOUNCE; (b) always subscribe to ANNOUNCE and count distinct announced
  names under the `<name>/viewers/` prefix. Tear down the publish on unmount so
  other viewers' counts decrement. `@moq/publish`/`@moq/watch` imported lazily
  (browser-only).
- **`app/viewer-count.tsx`:** `<ViewerCount name url announce>` rendering `👁 N`
  (or "—" while connecting). Receives the relay URL computed server-side.
- **Watch page:** render `<ViewerCount announce>` in the header when live; pass a
  `viewerUrl` from `viewerRelayUrl(broadcastName)` (carries the `put` token).
- **Count-only callers (e.g. `/browse`)** pass `announce={false}` and only need a
  subscribe URL — `get:<name>` already authorizes reading the `viewers/` ANNOUNCE,
  so merely listing a stream never inflates its count.

### 2. Live duration — broadcaster-recorded + client fallback

- **`lib/schema.ts`:** add `liveStartedAt timestamp(withTimezone) null` to
  `streams`. Generate a Drizzle migration under `drizzle/`.
- **`app/api/presence/route.ts`:** `POST { kind:"live"|"offline", name }`,
  owner-only (reuse the publish-branch ownership check against `streams`).
  `live` sets `liveStartedAt = now()` **only if currently null** (idempotent);
  `offline` sets it null. Returns 401/403 as the token route does.
- **`app/publish/live-recorder.tsx`:** `<LiveRecorder name url>` mounted on the
  publish page. Uses `usePresence` to watch the stream's own ANNOUNCE; on
  transition -> `live` POSTs `{kind:"live"}`, on -> `offline` POSTs
  `{kind:"offline"}`. This is the web broadcaster path; OBS-only streams leave
  `liveStartedAt` null.
- **`app/live-duration.tsx`:** `<LiveDuration startedAt? live>` ticks "live for
  12m" once per minute (seconds under 1m). If `startedAt` is null but presence is
  live, count from the first client-observed live moment (fallback). Render only
  while live.
- **Watch page:** look up the stream by `broadcastName` to read `liveStartedAt`,
  pass to `<LiveDuration>`. (Watch page is already async/server.)
- **Dashboard:** show the same uptime pill next to the owner's stream.

### 3. Richer offline/live UI

- **Watch page:** replace the plain "Waiting for a live broadcast" paragraph with
  a centered **offline placeholder card** shown when `status !== "live"`
  ("Offline — waiting for the broadcaster"), and surface viewer count + uptime in
  the header when live. Smooth transition into the live state. The offline state
  is driven by the same `usePresence` status; a small client wrapper around the
  player area toggles the overlay.
- **Dashboard:** existing live/offline pill gains the uptime readout.

### 4. Stream directory — `/browse`

- **`app/browse/page.tsx`:** server component listing all `streams` from the DB
  as cards (title, broadcast name, Watch link), each with a reused
  `PresenceBadge` and a count-only `<ViewerCount announce={false}>` (subscribe URL
  per row, so browsing never registers as a viewer). Presence/subscribe URLs
  computed server-side per row. Sorting is incidental (badges show state); no
  client reorder needed.
- **`app/page.tsx`:** add a "Browse live streams" link to `/browse`.
- Scope note: shows DB-registered streams only. In JWT mode all real streams are
  provisioned in `streams`, so this is complete for the intended deployment;
  ad-hoc anon/OBS-only names are intentionally not enumerated.

## Testing

- **TDD — pure server logic:**
  - `mintViewerToken(name)` produces the exact claim shape
    (`root:"live"`, `put:["<name>/viewers/"]`, `get:["<name>"]`, with `exp`/`iat`).
  - `app/api/presence/route.ts`: owner-only (401 unauth, 403 non-owner);
    `live` sets `liveStartedAt` once and is idempotent on repeat; `offline`
    clears it.
- **Manual / LAN verification — MoQ client behavior** (matches phases 0–5):
  - Two watch tabs on one stream: viewer count reads 2, drops to 1 on close.
  - Badge still flips live/offline automatically.
  - Web go-live records `liveStartedAt`; watch page shows accurate uptime; OBS
    stream with no DB timestamp shows client-observed fallback.
  - `/browse` lists streams with correct live/offline + counts.

## Out of scope

- Server-side ANNOUNCE watching (infeasible in Node).
- Accurate uptime for OBS-only streams (intentional fallback to client-observed).
- Enumerating anon/ad-hoc broadcast names in the directory.
- Anything already listed out of scope in `IMPLEMENTATION_PLAN.md`
  (LL-HLS, clustering, ABR, recording/VOD, native apps, analytics).
