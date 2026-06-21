# Bandwidth/Overload Reduction (#2 shared presence + #4 VOD Range/cache) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut per-viewer relay connections on the watch page from ~4 to 1 (shared presence connection), and make `/vod-file/` recordings support HTTP Range + caching so seeks/reloads don't re-download whole files.

**Architecture:** #4 adds a pure `parseRange()` used by `server.mjs handleVodFile` to emit `206`/`416` + cache headers. #2 introduces a `PresenceProvider` that opens ONE relay connection (viewer token) and serves `{status, viewerCount}` via React context to context-fed view components on the watch page; `/browse` + dashboard keep their standalone components (DRY via extracted presentational views).

**Tech Stack:** Next.js 16 (App Router) + TypeScript (ESM), custom `server.mjs` (run via `tsx`), `@moq/watch`/`@moq/publish`, Vitest.

## Global Constraints

- **This is NOT the Next.js you know** (`AGENTS.md`): consult `node_modules/next/dist/docs/` before App-Router work if unsure.
- **Commits:** Lucas authorizes commits per execution run. If authorized, `git commit` each task on `perf-bandwidth-2-4` (never push) ending the body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (use `git -c commit.gpgsign=false commit` if signing complains). If not authorized this run, `git add` and stop.
- **No media compression** (gzip/brotli) — out of scope; media is already codec-compressed.
- `@moq/watch` / `@moq/publish` are browser-only — import lazily inside effects, never at server/module scope.
- The `<moq-watch>` player connection and the chat WebSocket are OUT OF SCOPE (unchanged).
- `/browse` and dashboard must keep working (standalone presence components, unchanged behavior).
- Recordings are content-addressed (`<sessionId>.<ext>`, written once) → safe to cache `immutable`.
- Branch `perf-bandwidth-2-4` (already created off `main`). Spec: `docs/superpowers/specs/2026-06-21-perf-bandwidth-2-4-design.md`.

---

### Task 1: `parseRange` pure function (#4)

**Files:**
- Create: `lib/http-range.ts`
- Create: `lib/__tests__/http-range.test.ts`

**Interfaces:**
- Produces: `type RangeResult = { start: number; end: number } | null | "unsatisfiable"` and `parseRange(header: string | undefined, size: number): RangeResult`. Consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/http-range.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseRange } from "../http-range";

const SIZE = 5000;

test("no header -> null (serve full)", () => {
  expect(parseRange(undefined, SIZE)).toBeNull();
});
test("non-bytes unit -> null", () => {
  expect(parseRange("items=0-10", SIZE)).toBeNull();
});
test("closed range", () => {
  expect(parseRange("bytes=0-1023", SIZE)).toEqual({ start: 0, end: 1023 });
});
test("open-ended range -> to EOF", () => {
  expect(parseRange("bytes=100-", SIZE)).toEqual({ start: 100, end: 4999 });
});
test("suffix range -> last N bytes", () => {
  expect(parseRange("bytes=-500", SIZE)).toEqual({ start: 4500, end: 4999 });
});
test("end past EOF is clamped", () => {
  expect(parseRange("bytes=0-999999", SIZE)).toEqual({ start: 0, end: 4999 });
});
test("start at/after EOF -> unsatisfiable", () => {
  expect(parseRange("bytes=5000-", SIZE)).toBe("unsatisfiable");
});
test("multi-range unsupported -> null (full)", () => {
  expect(parseRange("bytes=0-10,20-30", SIZE)).toBeNull();
});
test("garbage -> null", () => {
  expect(parseRange("bytes=abc", SIZE)).toBeNull();
});
test("start > end -> null", () => {
  expect(parseRange("bytes=100-50", SIZE)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- http-range`
Expected: FAIL (`../http-range` not found).

- [ ] **Step 3: Implement**

Create `lib/http-range.ts`:

```ts
// Parse a single HTTP Range header for byte serving. Pure so it is unit-testable
// without a server. Multi-range is intentionally unsupported (returns null ->
// caller serves the full 200 response).
export type RangeResult =
  | { start: number; end: number } // satisfiable, inclusive
  | null // no/invalid header -> serve full 200
  | "unsatisfiable"; // valid syntax but out of bounds -> 416

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice(6).trim();
  if (spec === "" || spec.includes(",")) return null; // no multi-range
  const dash = spec.indexOf("-");
  if (dash === -1) return null;
  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  if (startStr === "") {
    // suffix: bytes=-N (last N bytes)
    const n = Number(endStr);
    if (endStr === "" || !Number.isInteger(n) || n <= 0) return null;
    if (size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isInteger(start) || start < 0) return null;
  if (start >= size) return "unsatisfiable";

  if (endStr === "") return { start, end: size - 1 }; // open-ended

  const end = Number(endStr);
  if (!Number.isInteger(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- http-range`
Expected: PASS (all cases).

- [ ] **Step 5: Commit (if authorized this run)**

```bash
git add lib/http-range.ts lib/__tests__/http-range.test.ts
git -c commit.gpgsign=false commit -m "feat(vod): parseRange helper for HTTP Range (TDD)"
```

---

### Task 2: Range + caching in `handleVodFile` (#4)

**Files:**
- Modify: `server.mjs` (the `handleVodFile` function + add the `parseRange` import)

**Interfaces:**
- Consumes: `parseRange` from `./lib/http-range.ts` (Task 1).
- Produces: `/vod-file/<name>` responses with `Accept-Ranges`, `Cache-Control`, `ETag`, `Last-Modified`; `206`+`Content-Range` for valid ranges; `416` for unsatisfiable; full `200`+`Content-Length` otherwise.

> `server.mjs` is `.mjs` run via `tsx`, so `tsc`/`next build` don't type-check it — verify by booting + `curl`.

- [ ] **Step 1: Add the import**

In `server.mjs`, add to the import block near the other `./lib/*` imports:

```js
import { parseRange } from "./lib/http-range.ts";
```

- [ ] **Step 2: Replace `handleVodFile` body**

Replace the existing `handleVodFile` function in `server.mjs` with:

```js
/** Serve a file from var/vod/ at /vod-file/<basename>, with Range + caching. */
async function handleVodFile(req, res) {
  if (!req.url?.startsWith("/vod-file/")) return false;
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = path.join(VOD_DIR, path.basename(pathname));
  try {
    const st = await stat(file);
    const EXT_TO_MIME = {
      ".webm": "video/webm",
      ".mp4": "video/mp4",
      ".mkv": "video/x-matroska",
      ".mov": "video/quicktime",
    };
    const fileExt = path.extname(file).toLowerCase();
    res.setHeader("content-type", EXT_TO_MIME[fileExt] ?? "application/octet-stream");
    res.setHeader("accept-ranges", "bytes");
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("etag", `"${st.size}-${Math.floor(st.mtimeMs)}"`);
    res.setHeader("last-modified", st.mtime.toUTCString());

    const r = parseRange(req.headers.range, st.size);
    if (r === "unsatisfiable") {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${st.size}`);
      res.end();
      return true;
    }
    if (r) {
      res.statusCode = 206;
      res.setHeader("content-range", `bytes ${r.start}-${r.end}/${st.size}`);
      res.setHeader("content-length", String(r.end - r.start + 1));
      createReadStream(file, { start: r.start, end: r.end }).pipe(res);
      return true;
    }
    res.setHeader("content-length", String(st.size));
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
  return true;
}
```

- [ ] **Step 3: Boot + curl smoke (local, HTTP dev)**

```bash
# minimal env for the custom server if .env.local is absent
[ -f .env.local ] || printf 'DATABASE_URL=postgresql://lucas@127.0.0.1:5544/neobunker\nPORT=3000\n' > .env.local
mkdir -p var/vod && head -c 4096 /dev/urandom > var/vod/smoke.mp4
npm run build >/dev/null 2>&1
PORT=3000 npm run start >/tmp/nbperf.log 2>&1 & SRV=$!
for i in $(seq 1 20); do (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && break; sleep 1; done
echo "--- full request ---"; curl -s -D- -o /dev/null http://localhost:3000/vod-file/smoke.mp4 | grep -iE "HTTP/|accept-ranges|cache-control|content-length|etag"
echo "--- range request ---"; curl -s -D- -o /dev/null -r 0-1023 http://localhost:3000/vod-file/smoke.mp4 | grep -iE "HTTP/|content-range|content-length"
kill $SRV 2>/dev/null; rm -f var/vod/smoke.mp4
```

Expected: full → `HTTP/1.1 200`, `accept-ranges: bytes`, `cache-control: public, max-age=31536000, immutable`, `content-length: 4096`, an `etag`. Range → `HTTP/1.1 206 Partial Content`, `content-range: bytes 0-1023/4096`, `content-length: 1024`.

> If `npm run start` can't boot locally (no relay/DB), do this same `curl` smoke on the LAN box against `https://localhost:3000/vod-file/<a real recording>` with `-k` instead. Don't skip the smoke.

- [ ] **Step 4: Commit (if authorized this run)**

```bash
git add server.mjs
git -c commit.gpgsign=false commit -m "feat(vod): HTTP Range + caching for /vod-file/"
```

---

### Task 3: Extract presentational views + thin standalone components (#2)

**Files:**
- Create: `app/presence-views.tsx`
- Modify: `app/presence-badge.tsx`, `app/viewer-count.tsx`, `app/live-duration.tsx`

**Interfaces:**
- Consumes: `Status` from `@/lib/use-presence`; `formatUptime` from `@/lib/format-uptime`.
- Produces: `PresenceBadgeView({status,className?})`, `ViewerCountView({count,className?})`, `LiveDurationView({startedAt?,live})` in `app/presence-views.tsx`. `PresenceBadge`/`ViewerCount`/`LiveDuration` keep the SAME public props and behavior (used on `/browse` + dashboard).

> Browser/visual refactor — verified by `tsc` + `build` (no Vitest for these; behavior must be unchanged).

- [ ] **Step 1: Create the view components**

Create `app/presence-views.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { Status } from "@/lib/use-presence";
import { formatUptime } from "@/lib/format-uptime";

// Pure presentation, no relay connection — fed status/count by either the
// standalone components (their own hook) or the shared PresenceProvider context.
export function PresenceBadgeView({ status, className }: { status: Status; className?: string }) {
  const live = status === "live";
  const connecting = status === "connecting" || status === "loading";
  const dot = live ? "bg-red-500" : connecting ? "bg-amber-400" : "bg-neutral-600";
  const label = live ? "LIVE" : connecting ? "connecting" : "OFFLINE";
  const text = live ? "text-red-400" : connecting ? "text-amber-400" : "text-neutral-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text} ${className ?? ""}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${live ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

export function ViewerCountView({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-label={`${count} watching`}
      className={`inline-flex items-center gap-1 text-xs text-neutral-400 ${className ?? ""}`}
    >
      <span aria-hidden>👁</span>
      {count}
    </span>
  );
}

export function LiveDurationView({ startedAt, live }: { startedAt?: string | null; live: boolean }) {
  const observed = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!live) {
      observed.current = null;
      return;
    }
    if (observed.current === null) observed.current = Date.now();
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!live) return null;
  const origin = startedAt ? new Date(startedAt).getTime() : (observed.current ?? Date.now());
  return (
    <span className="text-xs text-neutral-400">live for {formatUptime(Date.now() - origin)}</span>
  );
}
```

- [ ] **Step 2: Slim `presence-badge.tsx`**

Replace `app/presence-badge.tsx` with:

```tsx
"use client";

import { usePresence } from "@/lib/use-presence";
import { PresenceBadgeView } from "@/app/presence-views";

export function PresenceBadge({
  name,
  url,
  className,
}: {
  name: string;
  url: string;
  className?: string;
}) {
  const { status } = usePresence(name, url);
  return <PresenceBadgeView status={status} className={className} />;
}
```

- [ ] **Step 3: Slim `viewer-count.tsx`**

Replace `app/viewer-count.tsx` with:

```tsx
"use client";

import { useViewerPresence } from "@/lib/use-viewer-presence";
import { ViewerCountView } from "@/app/presence-views";

export function ViewerCount({
  name,
  url,
  announce,
  className,
}: {
  name: string;
  url: string;
  announce: boolean;
  className?: string;
}) {
  const { count } = useViewerPresence(name, url, { announce });
  return <ViewerCountView count={count} className={className} />;
}
```

- [ ] **Step 4: Slim `live-duration.tsx`**

Replace `app/live-duration.tsx` with:

```tsx
"use client";

import { usePresence } from "@/lib/use-presence";
import { LiveDurationView } from "@/app/presence-views";

export function LiveDuration({
  startedAt,
  name,
  url,
}: {
  startedAt?: string | null;
  name: string;
  url: string;
}) {
  const { status } = usePresence(name, url);
  return <LiveDurationView startedAt={startedAt} live={status === "live"} />;
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests pass (unchanged count), tsc clean, build succeeds.

- [ ] **Step 6: Commit (if authorized this run)**

```bash
git add app/presence-views.tsx app/presence-badge.tsx app/viewer-count.tsx app/live-duration.tsx
git -c commit.gpgsign=false commit -m "refactor(presence): extract presentational views (no behavior change)"
```

---

### Task 4: `PresenceProvider` + context + shared variants (#2)

**Files:**
- Create: `app/presence-context.tsx`

**Interfaces:**
- Consumes: `Status` from `@/lib/use-presence`; `countViewers` from `@/lib/viewer-count`; the views from `@/app/presence-views` (Task 3).
- Produces: `PresenceProvider({name, viewerUrl, announce, children})`, `usePresenceState(): {status, viewerCount}`, and shared variants `PresenceBadgeShared({className?})`, `ViewerCountShared({className?})`, `LiveDurationShared({startedAt?})`. Consumed by Task 5.

> Browser/relay code — verified by `tsc` + `build` + (Task 5) manual connection-count check. No Vitest (WebTransport/WebCodecs absent in node), consistent with the existing hooks.

- [ ] **Step 1: Create the provider + context + shared variants**

Create `app/presence-context.tsx`:

```tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/use-presence";
import { countViewers } from "@/lib/viewer-count";
import { PresenceBadgeView, ViewerCountView, LiveDurationView } from "@/app/presence-views";

type PresenceState = { status: Status; viewerCount: number };
const PresenceContext = createContext<PresenceState | null>(null);

// Opens ONE relay connection (viewer token URL: put:<name>/viewers/, get:<name>)
// that powers BOTH live/offline status and the viewer count, replacing the
// separate connections each presence component used to open. @moq imported
// lazily (browser-only).
export function PresenceProvider({
  name,
  viewerUrl,
  announce,
  children,
}: {
  name: string;
  viewerUrl: string;
  announce: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let disposeStatus: (() => void) | undefined;
    let disposeAnnounced: (() => void) | undefined;
    let statusBroadcast: { close(): void } | undefined;
    let viewerBroadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(viewerUrl), enabled: true });
      connection = conn;

      // live/offline status from the broadcast's own ANNOUNCE
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
        reload: true,
      });
      statusBroadcast = bc;
      setStatus(bc.status.peek());
      disposeStatus = bc.status.subscribe((s) => setStatus(s));

      // viewer count from the same connection's ANNOUNCE set; publish self if announce
      if (announce) {
        const Publish = await import("@moq/publish");
        if (cancelled) return;
        const id = crypto.randomUUID();
        viewerBroadcast = new Publish.Broadcast({
          connection: conn.established,
          name: Net.Path.from(`${name}/viewers/${id}`),
          enabled: true,
        });
      }
      const recompute = () => setViewerCount(countViewers([...conn.announced.peek()], name));
      recompute();
      disposeAnnounced = conn.announced.subscribe(recompute);
    })();

    return () => {
      cancelled = true;
      try {
        disposeStatus?.();
        disposeAnnounced?.();
        statusBroadcast?.close();
        viewerBroadcast?.close();
        connection?.close();
      } catch {
        // best-effort teardown
      }
    };
  }, [name, viewerUrl, announce]);

  return (
    <PresenceContext.Provider value={{ status, viewerCount }}>{children}</PresenceContext.Provider>
  );
}

export function usePresenceState(): PresenceState {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresenceState must be used within a PresenceProvider");
  return ctx;
}

// Context-fed variants for the watch page (one shared connection).
export function PresenceBadgeShared({ className }: { className?: string }) {
  const { status } = usePresenceState();
  return <PresenceBadgeView status={status} className={className} />;
}

export function ViewerCountShared({ className }: { className?: string }) {
  const { viewerCount } = usePresenceState();
  return <ViewerCountView count={viewerCount} className={className} />;
}

export function LiveDurationShared({ startedAt }: { startedAt?: string | null }) {
  const { status } = usePresenceState();
  return <LiveDurationView startedAt={startedAt} live={status === "live"} />;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean, build succeeds (the provider isn't rendered anywhere yet — that's Task 5).

- [ ] **Step 3: Commit (if authorized this run)**

```bash
git add app/presence-context.tsx
git -c commit.gpgsign=false commit -m "feat(presence): shared PresenceProvider (one connection for status+count)"
```

---

### Task 5: Rewire the watch page onto the shared connection (#2)

**Files:**
- Modify: `app/watch/[...name]/watch-stage.tsx`
- Modify: `app/watch/[...name]/page.tsx`

**Interfaces:**
- Consumes: `PresenceProvider`, `usePresenceState`, `PresenceBadgeShared`, `ViewerCountShared`, `LiveDurationShared` (Task 4).
- Produces: a watch page that opens ONE presence connection per tab (plus the player + chat, which are out of scope).

> `WatchStage` is only rendered on the watch page (inside the provider), so it can read context directly.

- [ ] **Step 1: WatchStage reads context status**

Replace `app/watch/[...name]/watch-stage.tsx` with:

```tsx
"use client";

import WatchClient from "./watch-client";
import { usePresenceState } from "@/app/presence-context";

// Wraps the player and overlays an offline/connecting card. Status comes from the
// shared PresenceProvider (the watch page wraps this component in it), so it no
// longer opens its own relay connection.
export function WatchStage({ url, name }: { url: string; name: string }) {
  const { status } = usePresenceState();
  const live = status === "live";
  const connecting = status === "connecting" || status === "loading";

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <WatchClient url={url} name={name} />
      {!live && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-neutral-950/80 text-center">
          <div>
            <p className="text-lg font-medium text-neutral-200">
              {connecting ? "Connecting…" : "Offline"}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {connecting ? "Reaching the relay…" : "Waiting for the broadcaster to go live."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wrap the watch page in the provider + use shared variants**

In `app/watch/[...name]/page.tsx`:
1. Replace the imports of `PresenceBadge`, `ViewerCount`, `LiveDuration` with the shared variants + provider:

```tsx
import { PresenceProvider, PresenceBadgeShared, ViewerCountShared, LiveDurationShared } from "@/app/presence-context";
```
(Keep the `WatchStage` and `ChatPanel` imports. Remove the now-unused `PresenceBadge`/`ViewerCount`/`LiveDuration` imports.)

2. Wrap the content from the header through `WatchStage` in `<PresenceProvider>` and swap the three components for their shared variants. The header block becomes:

```tsx
<PresenceProvider name={broadcastName} viewerUrl={viewerUrl} announce>
  {/* header */}
  <PresenceBadgeShared />
  <ViewerCountShared />
  <LiveDurationShared startedAt={stream?.liveStartedAt?.toISOString() ?? null} />
  {/* ...the rest of the existing header markup stays... */}
  <WatchStage url={url} name={broadcastName} />
  <ChatPanel name={broadcastName} />
</PresenceProvider>
```

Keep the existing layout/markup (the `grid`/header structure, the `RELAY_URL` text, links). The only changes: the three presence components become the `Shared` variants with NO `name`/`url` props (they read context), and the whole stream UI region (header + stage + chat) is nested inside `<PresenceProvider>`. `viewerUrl` is already computed in the page (`await viewerRelayUrl(broadcastName)`).

> Note: `WatchStage` now throws if rendered outside a provider — that's fine, it's only on this page. Do not render `WatchStage`/`*Shared` outside the provider.

- [ ] **Step 3: Verify build + tests**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests pass, tsc clean, build succeeds.

- [ ] **Step 4: Manual connection-count check**

Boot the app (locally `npm run dev`, or on the box), open the watch page in the browser, and in DevTools → Network → WS/WebTransport confirm the tab opens **one** presence/relay connection (plus the `<moq-watch>` player connection and the `/chat` WebSocket) — not four. Confirm the LIVE/OFFLINE badge, viewer count, and uptime still update, and that `/browse` + dashboard still show correct presence.

- [ ] **Step 5: Commit (if authorized this run)**

```bash
git add "app/watch/[...name]/watch-stage.tsx" "app/watch/[...name]/page.tsx"
git -c commit.gpgsign=false commit -m "perf(watch): one shared presence connection per viewer tab"
```

---

## Manual verification (after all tasks)

- **#4:** on the box, `curl -s -D- -o /dev/null -k -r 0-1023 https://localhost:3000/vod-file/<sessionId>.mp4` → `206` + `content-range: bytes 0-1023/<size>`; a full request → `200` + `accept-ranges: bytes` + `cache-control: …immutable`. In a browser, scrubbing a `/vod/<id>` recording should seek without re-downloading from the start.
- **#2:** watch tab opens one presence connection (DevTools), badge/count/uptime live-update, `/browse` + dashboard unaffected.

## Self-review notes

- Spec coverage: parseRange (T1), server Range+cache (T2), view extraction (T3), provider+context+shared variants (T4), watch rewiring (T5) — all spec sections mapped.
- Type consistency: `Status` reused from `@/lib/use-presence`; `RangeResult`/`parseRange` identical in T1 and T2; `PresenceProvider` takes `{name, viewerUrl, announce}` (no `url` — only `viewerUrl` is needed) and the watch page already computes `viewerUrl`.
- `/browse` + dashboard keep the standalone components (T3) — unchanged behavior; only the watch page adopts the shared connection (T5).
