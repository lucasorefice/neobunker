# Reduce client bandwidth/overload (#2 shared presence connection + #4 VOD Range/caching)

Status: approved design (2026-06-21)
Branch: `perf-bandwidth-2-4` (off `main`)

## Goal

Two independent, self-contained reductions in client bandwidth/connection overload:

- **#2** — Collapse the watch page's ~4 per-viewer relay connections (live/offline
  status + viewer count) into ONE shared connection.
- **#4** — Make `/vod-file/` recordings support HTTP Range requests + caching so
  seeking and reloads don't re-download the whole file.

Note: this does NOT add gzip to media — live MoQ frames and VOD files are already
codec-compressed, so byte-compression is a non-goal. These two changes target the
actual overheads (redundant relay connections; full-file VOD re-downloads).

Build order: #4 first (isolated, low risk), then #2.

## Context (current state)

- Watch page `app/watch/[...name]/page.tsx` renders, per viewer tab, FOUR
  components that each open their own `Net.Connection.Reload`:
  `PresenceBadge` (`usePresence`), `LiveDuration` (`usePresence`),
  `WatchStage` (`usePresence`, for the offline overlay), and `ViewerCount`
  (`useViewerPresence`, which also publishes a viewer broadcast). Plus the
  `<moq-watch>` player (its own connection) and the chat WebSocket.
- `lib/use-presence.ts`: opens a `Net.Connection.Reload`, makes a `Broadcast`
  (status signal offline/loading/live), returns `{ status }`.
- `lib/use-viewer-presence.ts`: opens a `Net.Connection.Reload`, optionally
  publishes `@moq/publish` `Broadcast` at `<name>/viewers/<uuid>`, reads
  `conn.announced` (a `Getter<Set<Path>>`) and `countViewers(...)`, returns
  `{ count }`.
- `PresenceBadge`/`ViewerCount`/`LiveDuration` are ALSO used on `/browse` (many
  streams per page) and the dashboard — those pages have no single shared stream,
  so they must keep working standalone.
- `server.mjs` `handleVodFile`: `stat`s the file, sets only `content-type`, and
  pipes the whole file with `createReadStream(file).pipe(res)`. No
  `Accept-Ranges`, no `Content-Range`/206, no `Cache-Control`/`ETag`.
- The viewer token (`mintViewerToken`) grants `put:["<name>/viewers/"]` +
  `get:["<name>"]`; `get:["<name>"]` is a prefix that covers BOTH the broadcast's
  own ANNOUNCE (for status) and `<name>/viewers/*` (for the count). So a single
  viewer-token connection can power both.

## Part A — #2: shared presence connection (watch page)

### New: `app/presence-context.tsx`
- `PresenceProvider({ name, url, viewerUrl, announce, children })` (client):
  opens ONE `Net.Connection.Reload` using `viewerUrl` (the viewer-token URL).
  From that single connection it derives:
  - `status` — via one `Broadcast({ connection: conn.established,
    announced: conn.announced, name: Net.Path.from(name), enabled, reload })`,
    mirroring its `status` signal (same as `usePresence` today).
  - `viewerCount` — `countViewers([...conn.announced.peek()], name)`, recomputed
    on `conn.announced.subscribe(...)`; if `announce`, publish ONE
    `@moq/publish` `Broadcast` at `<name>/viewers/<uuid>`.
  - Exposes React context `{ status, viewerCount }`. Cancellation-safe teardown
    (cancelled flag; close broadcast(s) + connection), matching existing hooks.
  - `@moq/*` imported lazily (browser-only), same as the hooks.
- `usePresenceState(): { status: Status; viewerCount: number }` reads the context
  (throws if used outside a provider, so misuse is loud).

### Keep browse/dashboard working (DRY via presentational views)
- Extract pure presentational components into `app/presence-views.tsx`:
  - `PresenceBadgeView({ status, className? })` — the dot + LIVE/connecting/OFFLINE
    markup currently inside `PresenceBadge`.
  - `ViewerCountView({ count, className? })` — the `👁 N` markup + `aria-label`.
  - `LiveDurationView({ startedAt, live })` — the "live for X" ticking logic;
    takes `live` as a prop instead of calling `usePresence` itself. (The
    client-observed fallback timer stays; it needs only `startedAt` + `live`.)
- Standalone wrappers (UNCHANGED behavior, used on `/browse` + dashboard):
  - `PresenceBadge({ name, url, className? })` = `usePresence(name,url)` +
    `<PresenceBadgeView status>`.
  - `ViewerCount({ name, url, announce, className? })` = `useViewerPresence(...)` +
    `<ViewerCountView count>`.
  - `LiveDuration({ startedAt, name, url })` = `usePresence(name,url)` →
    `<LiveDurationView live={status==='live'} startedAt>`.

### Watch page rewiring (`app/watch/[...name]/page.tsx`)
- Wrap the header (badge/count/duration) + `WatchStage` in
  `<PresenceProvider name={broadcastName} url={url} viewerUrl={viewerUrl}
  announce>`.
- Inside the provider, render context-fed variants that read `usePresenceState()`
  and render the Views: a small `PresenceBadgeShared`, `ViewerCountShared`,
  `LiveDurationShared` (these live in `app/presence-context.tsx` or alongside it),
  and `WatchStage` reads `usePresenceState().status` for its offline overlay
  instead of calling `usePresence` directly when rendered under the provider.
- Result: one relay connection serves status + count for the whole watch tab.

### Out of scope
- The `<moq-watch>` player connection (custom element) — unchanged.
- The chat WebSocket — unchanged.
- Dashboard/`/browse` connection counts (single-user / per-row by design).

## Part B — #4: HTTP Range + caching for `/vod-file/`

### New: `lib/http-range.ts` (pure, TDD'd)
```ts
export type RangeResult =
  | { start: number; end: number } // satisfiable single range (inclusive)
  | null                            // no/invalid header -> serve full 200
  | "unsatisfiable";                // valid syntax but out of bounds -> 416

export function parseRange(header: string | undefined, size: number): RangeResult;
```
Rules (single range only; multi-range not supported -> treat as full 200):
- No header, or not starting `bytes=`, or unparseable -> `null`.
- `bytes=a-b` -> `{ start:a, end:min(b,size-1) }` when `a<=b` and `a<size`.
- `bytes=a-` (open end) -> `{ start:a, end:size-1 }` when `a<size`.
- `bytes=-n` (suffix) -> last `n` bytes -> `{ start:max(0,size-n), end:size-1 }`
  when `n>0`.
- Syntactically valid but `start>=size` (or `start>end`) -> `"unsatisfiable"`.

### `server.mjs` `handleVodFile` changes
After `stat(file)` (gives `size`, `mtime`):
- Always set: `Accept-Ranges: bytes`,
  `Cache-Control: public, max-age=31536000, immutable`,
  `ETag: "<size>-<mtimeMs>"`, `Last-Modified: <mtime UTC string>`,
  and the existing `content-type`.
- `const r = parseRange(req.headers.range, size);`
  - `r === "unsatisfiable"` -> `res.statusCode = 416`;
    `Content-Range: bytes */<size>`; `res.end()`.
  - `r` is a range -> `res.statusCode = 206`;
    `Content-Range: bytes <start>-<end>/<size>`;
    `Content-Length: <end-start+1>`; `createReadStream(file,{start,end}).pipe(res)`.
  - `r === null` -> `200`; `Content-Length: <size>`;
    `createReadStream(file).pipe(res)`.
- 404 path (missing file) unchanged. Keep the query-string-strip + `path.basename`
  traversal guard.

Rationale for `immutable`: a recording filename is `<sessionId>.<ext>` and is
written once per session, never mutated, so long-lived immutable caching is safe.

## Testing

- **#4 (TDD):** `lib/__tests__/http-range.test.ts` covers `parseRange`:
  no/invalid header -> null; `bytes=0-1023` -> {0,1023}; open-ended `bytes=100-`
  -> {100,size-1}; suffix `bytes=-500` -> {size-500,size-1}; clamp `end` past EOF;
  `start>=size` -> "unsatisfiable". Integration (manual, on the box):
  `curl -s -D- -r 0-1023 -k https://localhost:3000/vod-file/<id>.mp4 -o /dev/null`
  -> `206`, `Content-Range: bytes 0-1023/<size>`, `Content-Length: 1024`;
  full request -> `200` + `Accept-Ranges: bytes`.
- **#2:** verified by `npm test` (unchanged green) + `tsc` + `npm run build`, and a
  manual devtools check that a watch tab opens one presence connection (plus the
  player + chat WS) instead of four. Browser/relay provider code is not
  Vitest-tested (WebTransport/WebCodecs absent in node), consistent with the
  existing presence hooks; the extracted View components are pure and trivial.
  `/browse` and dashboard must still show correct live/offline + counts.

## Out of scope (explicitly)

- gzip/brotli of media; HLS/ABR; the player's own connection; chat-WS changes;
  reverse-proxy/CDN setup (a separate infra option); the O(N^2) viewer-count
  scaling concern (the count mechanism itself is unchanged here).
