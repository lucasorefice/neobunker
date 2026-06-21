# Phase 5 Presence-Plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing ANNOUNCE-driven presence with a real viewer count, broadcaster-recorded live uptime, a richer offline/live watch UI, and a `/browse` stream directory.

**Architecture:** Reuse the relay's ANNOUNCE stream everywhere (no polling). A shared `usePresence` hook backs the badge, the live-recorder, and the offline overlay. Viewer count is MoQ-native: each viewer self-announces an empty broadcast under `<name>/viewers/` and everyone counts those announcements. Uptime is recorded to Postgres by a client that observes the broadcaster's own go-live, with a client-observed fallback for OBS-only streams.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Drizzle + Postgres, `@moq/watch` / `@moq/publish` / `@moq/token`, Vitest.

## Global Constraints

- **This is NOT the Next.js you know** (per `AGENTS.md`): before writing App-Router/server code, read the relevant guide under `node_modules/next/dist/docs/`. Heed deprecation notices.
- **Do NOT run `git commit` or `git push`.** Lucas commits manually (standing rule). Every "Stage" step runs `git add` only and stops; Lucas reviews and commits.
- **Relay token claims** use moq-token format `root`/`put`/`get` (NOT `pub`/`sub`); `get` not `sub`. `RELAY_NAMESPACE = "live"`. `put`/`get` may be a string or array of strings; the relay treats them as path prefixes.
- **Anon mode** (no `RELAY_JWT_SECRET`): all relay URLs are the plain `RELAY_URL`. JWT mode: URLs carry `?jwt=`.
- **MoQ browser modules** (`@moq/watch`, `@moq/publish`) must be imported lazily in the browser only — never at server module scope.
- Branch: `phase5-presence-plus` (already created off `main`). Spec: `docs/superpowers/specs/2026-06-21-phase5-presence-plus-design.md`.

---

### Task 1: Vitest test harness

**Files:**
- Modify: `package.json` (add `vitest`, `test` script)
- Create: `vitest.config.ts`
- Create: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` (vitest) that other tasks add tests to. Test files live in `lib/__tests__/*.test.ts`.

- [ ] **Step 1: Add the dependency and script**

Run: `npm install -D vitest@^3`

Then add to `package.json` `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Write the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write a smoke test**

Create `lib/__tests__/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS (1 test passed).

- [ ] **Step 5: Stage**

```bash
git add package.json package-lock.json vitest.config.ts lib/__tests__/smoke.test.ts
```
Stop — Lucas commits.

---

### Task 2: Viewer token + token route `viewer` kind

**Files:**
- Modify: `lib/relay-token.ts`
- Create: `lib/__tests__/relay-token.test.ts`
- Modify: `app/api/token/route.ts`

**Interfaces:**
- Produces:
  - `mintViewerToken(name: string): Promise<string>` — JWT with claims `{ root:"live", put:["<name>/viewers/"], get:[name] }` (+ `iat`/`exp`).
  - `viewerRelayUrl(name: string): Promise<string>` — plain `RELAY_URL` in anon mode, token-bearing URL in JWT mode.
  - `POST /api/token { kind:"viewer", name }` → `{ token }` (no auth).

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/relay-token.test.ts` (decodes the JWT payload directly — no key needed):

```ts
import { beforeAll, expect, test } from "vitest";
import { generate } from "@moq/token";

function decodeClaims(jwt: string) {
  const payload = jwt.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

beforeAll(async () => {
  // A symmetric signing key in the JWK form lib/relay-token expects.
  const key = await generate("HS256");
  process.env.RELAY_JWT_SECRET = JSON.stringify(key.jwk);
});

test("mintViewerToken scopes put to <name>/viewers/ and get to <name>", async () => {
  const { mintViewerToken } = await import("../relay-token");
  const claims = decodeClaims(await mintViewerToken("room/alice.hang"));
  expect(claims.root).toBe("live");
  expect(claims.put).toEqual(["room/alice.hang/viewers/"]);
  expect(claims.get).toEqual(["room/alice.hang"]);
  expect(typeof claims.exp).toBe("number");
});
```

> If `generate("HS256")` does not expose `.jwk` in this version, inspect `node_modules/@moq/token/key.d.ts` for the `Key` shape and adjust how the JWK string is built — the assertion on claims stays the same.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- relay-token`
Expected: FAIL (`mintViewerToken` is not exported).

- [ ] **Step 3: Implement**

In `lib/relay-token.ts`, after `mintPublishToken`, add:

```ts
export async function mintViewerToken(broadcastName: string): Promise<string> {
  return sign(
    signingKey(),
    withExpiry({
      root: RELAY_NAMESPACE,
      put: [`${broadcastName}/viewers/`],
      get: [broadcastName],
    }),
  );
}

/** Relay URL a viewer uses to self-announce + count peers under <name>/viewers/. */
export async function viewerRelayUrl(broadcastName: string): Promise<string> {
  if (!isJwtMode()) return RELAY_URL;
  return withJwt(await mintViewerToken(broadcastName));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- relay-token`
Expected: PASS.

- [ ] **Step 5: Add the route branch**

In `app/api/token/route.ts`, import `mintViewerToken` and add a branch before the final fallback:

```ts
  if (kind === "viewer") {
    return NextResponse.json({ token: await mintViewerToken(name) });
  }
```

Also update the final error string to `"kind must be 'subscribe', 'publish', or 'viewer'"`.

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Stage**

```bash
git add lib/relay-token.ts lib/__tests__/relay-token.test.ts app/api/token/route.ts
```
Stop — Lucas commits.

---

### Task 3: Extract `usePresence` hook; refactor `PresenceBadge`

**Files:**
- Create: `lib/use-presence.ts`
- Modify: `app/presence-badge.tsx`

**Interfaces:**
- Produces: `usePresence(name: string, url: string): { status: Status }` where `type Status = "connecting" | "offline" | "loading" | "live"`. Browser-only (lazy-imports `@moq/watch`). Reused by Tasks 4, 6, 8.

> This is a browser hook touching WebTransport/WebCodecs; it is verified by typecheck + manual LAN test, not Vitest (those APIs don't exist in the node test env).

- [ ] **Step 1: Create the hook** (lift the effect body verbatim out of `presence-badge.tsx`)

Create `lib/use-presence.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export type Status = "connecting" | "offline" | "loading" | "live";

// Live/offline derived from the relay's ANNOUNCE stream (no polling). Opens a
// lightweight @moq Broadcast for `name` and mirrors its status signal. @moq is
// imported lazily (WebTransport/WebCodecs are browser-only). `url` carries the
// subscribe token in JWT mode.
export function usePresence(name: string, url: string): { status: Status } {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(url), enabled: true });
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
        reload: true,
      });
      connection = conn;
      broadcast = bc;
      setStatus(bc.status.peek());
      dispose = bc.status.subscribe((s) => setStatus(s));
    })();

    return () => {
      cancelled = true;
      try {
        dispose?.();
        broadcast?.close();
        connection?.close();
      } catch {
        // best-effort teardown
      }
    };
  }, [name, url]);

  return { status };
}
```

- [ ] **Step 2: Refactor `PresenceBadge` to consume it**

Replace the body of `app/presence-badge.tsx` so it imports and calls the hook (delete the inlined effect):

```tsx
"use client";

import { usePresence } from "@/lib/use-presence";

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
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 4: Stage**

```bash
git add lib/use-presence.ts app/presence-badge.tsx
```
Stop — Lucas commits.

---

### Task 4: Viewer count (self-announce + count)

**Files:**
- Create: `lib/viewer-count.ts` (pure counting)
- Create: `lib/__tests__/viewer-count.test.ts`
- Create: `lib/use-viewer-presence.ts` (browser hook)
- Create: `app/viewer-count.tsx` (component)
- Modify: `app/watch/[...name]/page.tsx` (render it in the header)

**Interfaces:**
- Produces:
  - `countViewers(announced: Iterable<string>, name: string): number` — number of distinct paths with prefix `<name>/viewers/`.
  - `useViewerPresence(name, url, opts: { announce: boolean }): { count: number }`.
  - `<ViewerCount name url announce />`.

- [ ] **Step 1: Write the failing test for the pure counter**

Create `lib/__tests__/viewer-count.test.ts`:

```ts
import { expect, test } from "vitest";
import { countViewers } from "../viewer-count";

const name = "room/alice.hang";

test("counts only paths under <name>/viewers/", () => {
  const announced = [
    "room/alice.hang",                       // the broadcast itself — not a viewer
    "room/alice.hang/viewers/aaa",
    "room/alice.hang/viewers/bbb",
    "room/bob.hang/viewers/ccc",             // different stream
  ];
  expect(countViewers(announced, name)).toBe(2);
});

test("zero when nobody is watching", () => {
  expect(countViewers(["room/alice.hang"], name)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- viewer-count`
Expected: FAIL (`countViewers` not found).

- [ ] **Step 3: Implement the pure counter**

Create `lib/viewer-count.ts`:

```ts
// Counts distinct viewer self-announcements under `<name>/viewers/`. Pure so it
// is unit-testable without a relay; the browser hook feeds it the live ANNOUNCE
// set. Prefix matching mirrors @moq Path.hasPrefix (boundary at "/").
export function countViewers(announced: Iterable<string>, name: string): number {
  const prefix = `${name}/viewers/`;
  let n = 0;
  for (const path of announced) {
    if (path.startsWith(prefix) && path.length > prefix.length) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- viewer-count`
Expected: PASS.

- [ ] **Step 5: Implement the browser hook**

Create `lib/use-viewer-presence.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { countViewers } from "@/lib/viewer-count";

// MoQ-native viewer presence. One relay connection per mount:
//  - if `announce`, publish an empty broadcast at <name>/viewers/<uuid> so this
//    viewer appears in ANNOUNCE (needs a viewer token: put on <name>/viewers/);
//  - always read the connection's ANNOUNCE set and count peers under
//    <name>/viewers/ (count includes self when announcing).
export function useViewerPresence(
  name: string,
  url: string,
  opts: { announce: boolean },
): { count: number } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(url), enabled: true });
      connection = conn;

      if (opts.announce) {
        const Publish = await import("@moq/publish");
        if (cancelled) return;
        const id = crypto.randomUUID();
        broadcast = new Publish.Broadcast({
          connection: conn.established,
          name: Net.Path.from(`${name}/viewers/${id}`),
          enabled: true,
        });
      }

      const recompute = () =>
        setCount(countViewers([...conn.announced.peek()], name));
      recompute();
      dispose = conn.announced.subscribe(recompute);
    })();

    return () => {
      cancelled = true;
      try {
        dispose?.();
        broadcast?.close();
        connection?.close();
      } catch {
        // best-effort teardown
      }
    };
  }, [name, url, opts.announce]);

  return { count };
}
```

> `conn.announced` is a `Getter<Set<Path>>`; `.peek()` reads it and `.subscribe()` re-runs on change. Confirm these method names against `node_modules/@moq/net/connection/reload.d.ts` while implementing; if the API differs, the surrounding logic is unchanged.

- [ ] **Step 6: Implement the component**

Create `app/viewer-count.tsx`:

```tsx
"use client";

import { useViewerPresence } from "@/lib/use-viewer-presence";

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
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-neutral-400 ${className ?? ""}`}>
      <span aria-hidden>👁</span>
      {count}
    </span>
  );
}
```

- [ ] **Step 7: Wire into the watch header**

In `app/watch/[...name]/page.tsx`: import `ViewerCount` and `viewerRelayUrl`; compute `const viewerUrl = await viewerRelayUrl(broadcastName);` next to `url`; render `<ViewerCount name={broadcastName} url={viewerUrl} announce />` in the header next to `<PresenceBadge>`.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests pass, typecheck clean, build succeeds.

- [ ] **Step 9: Stage**

```bash
git add lib/viewer-count.ts lib/__tests__/viewer-count.test.ts lib/use-viewer-presence.ts app/viewer-count.tsx "app/watch/[...name]/page.tsx"
```
Stop — Lucas commits.

---

### Task 5: `liveStartedAt` schema + migration

**Files:**
- Modify: `lib/schema.ts`
- Create: a migration under `drizzle/` (generated)

**Interfaces:**
- Produces: `streams.liveStartedAt: timestamp (with tz) | null`. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Add the column**

In `lib/schema.ts`, inside the `streams` table definition, add:

```ts
  liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new SQL file in `drizzle/` adding `live_started_at`.

- [ ] **Step 3: Apply it to the local dev DB**

Run: `npx drizzle-kit migrate`
Expected: applies cleanly. (Uses `DATABASE_URL`; the local throwaway Postgres is on port 5544.)

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Stage**

```bash
git add lib/schema.ts drizzle/
```
Stop — Lucas commits.

---

### Task 6: Presence route + `<LiveRecorder>`

**Files:**
- Create: `lib/live-state.ts` (pure set-once/clear decision)
- Create: `lib/__tests__/live-state.test.ts`
- Create: `app/api/presence/route.ts`
- Create: `app/publish/live-recorder.tsx`
- Modify: `app/publish/page.tsx` (mount recorder)
- Modify: `app/dashboard/page.tsx` (mount recorder)

**Interfaces:**
- Consumes: `streams.liveStartedAt` (Task 5); `usePresence` (Task 3); `subscribeRelayUrl` (existing).
- Produces:
  - `nextLiveStartedAt(current: Date | null, kind: "live" | "offline", now: Date): Date | null` — set-once on "live", null on "offline".
  - `POST /api/presence { kind:"live"|"offline", name }` (owner-only).
  - `<LiveRecorder name url />` — POSTs the transitions.

- [ ] **Step 1: Write the failing test for the decision helper**

Create `lib/__tests__/live-state.test.ts`:

```ts
import { expect, test } from "vitest";
import { nextLiveStartedAt } from "../live-state";

const now = new Date("2026-06-21T10:00:00Z");

test("live sets the timestamp when currently null", () => {
  expect(nextLiveStartedAt(null, "live", now)).toEqual(now);
});

test("live is idempotent: keeps the existing timestamp", () => {
  const earlier = new Date("2026-06-21T09:00:00Z");
  expect(nextLiveStartedAt(earlier, "live", now)).toEqual(earlier);
});

test("offline clears the timestamp", () => {
  expect(nextLiveStartedAt(now, "offline", now)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- live-state`
Expected: FAIL (`nextLiveStartedAt` not found).

- [ ] **Step 3: Implement the helper**

Create `lib/live-state.ts`:

```ts
// Pure decision for streams.liveStartedAt. "live" stamps the start once (so the
// uptime clock doesn't reset on repeat go-live pings); "offline" clears it.
export function nextLiveStartedAt(
  current: Date | null,
  kind: "live" | "offline",
  now: Date,
): Date | null {
  if (kind === "offline") return null;
  return current ?? now;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- live-state`
Expected: PASS.

- [ ] **Step 5: Implement the route** (mirror the ownership check in `app/api/token/route.ts`)

Create `app/api/presence/route.ts`:

```ts
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { nextLiveStartedAt } from "@/lib/live-state";

// Records broadcaster-driven live/offline transitions (owner-only).
//   POST { kind: "live" | "offline", name }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const kind = (body as { kind?: string })?.kind;
  const name = (body as { name?: string })?.name?.trim();
  if ((kind !== "live" && kind !== "offline") || !name) {
    return NextResponse.json(
      { error: "kind must be 'live'|'offline' and name is required" },
      { status: 400 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owned = await db.query.streams.findFirst({
    where: and(eq(streams.ownerUserId, session.user.id), eq(streams.broadcastName, name)),
  });
  if (!owned) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const next = nextLiveStartedAt(owned.liveStartedAt ?? null, kind, new Date());
  await db.update(streams).set({ liveStartedAt: next }).where(eq(streams.id, owned.id));
  return NextResponse.json({ ok: true, liveStartedAt: next });
}
```

- [ ] **Step 6: Implement `<LiveRecorder>`**

Create `app/publish/live-recorder.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@/lib/use-presence";

// Observes the broadcaster's OWN stream via ANNOUNCE and records live/offline
// transitions to the DB. Mounted on pages the broadcaster has open while going
// live (publish + dashboard). Renders nothing.
export function LiveRecorder({ name, url }: { name: string; url: string }) {
  const { status } = usePresence(name, url);
  const last = useRef<"live" | "offline" | null>(null);

  useEffect(() => {
    const kind = status === "live" ? "live" : status === "offline" ? "offline" : null;
    if (!kind || kind === last.current) return;
    last.current = kind;
    void fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, name }),
    });
  }, [status, name]);

  return null;
}
```

- [ ] **Step 7: Mount it**

- In `app/publish/page.tsx`: compute `const presenceUrl = await subscribeRelayUrl(broadcastName);` (import `subscribeRelayUrl`) and render `<LiveRecorder name={broadcastName} url={presenceUrl} />` inside the page. (Mount only in JWT mode if you prefer; harmless in anon mode since the route requires auth and will 401 — guard with `{isJwtMode() && ...}` to avoid noise.)
- In `app/dashboard/page.tsx`: it already computes `presenceUrl`; render `{stream && <LiveRecorder name={stream.broadcastName} url={presenceUrl} />}`.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests pass, typecheck clean, build succeeds.

- [ ] **Step 9: Stage**

```bash
git add lib/live-state.ts lib/__tests__/live-state.test.ts app/api/presence/route.ts app/publish/live-recorder.tsx app/publish/page.tsx app/dashboard/page.tsx
```
Stop — Lucas commits.

---

### Task 7: Live duration display

**Files:**
- Create: `lib/format-uptime.ts`
- Create: `lib/__tests__/format-uptime.test.ts`
- Create: `app/live-duration.tsx`
- Modify: `app/watch/[...name]/page.tsx` (read `liveStartedAt`, render)
- Modify: `app/dashboard/page.tsx` (render)

**Interfaces:**
- Consumes: `streams.liveStartedAt` (Task 5); `usePresence` (Task 3).
- Produces:
  - `formatUptime(ms: number): string` — `"0s"`, `"45s"`, `"12m"`, `"1h 03m"`.
  - `<LiveDuration startedAt?: string | null name url />` — ticks while live; uses `startedAt` when present, else counts from first client-observed live.

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/format-uptime.test.ts`:

```ts
import { expect, test } from "vitest";
import { formatUptime } from "../format-uptime";

test("formats sub-minute as seconds", () => {
  expect(formatUptime(45_000)).toBe("45s");
});
test("formats minutes", () => {
  expect(formatUptime(12 * 60_000)).toBe("12m");
});
test("formats hours and zero-padded minutes", () => {
  expect(formatUptime(63 * 60_000)).toBe("1h 03m");
});
test("never negative", () => {
  expect(formatUptime(-5)).toBe("0s");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- format-uptime`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `lib/format-uptime.ts`:

```ts
// Human "live for" string from an elapsed millisecond count.
export function formatUptime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- format-uptime`
Expected: PASS.

- [ ] **Step 5: Implement `<LiveDuration>`**

Create `app/live-duration.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/lib/use-presence";
import { formatUptime } from "@/lib/format-uptime";

// Shows "live for Xm" while live. Prefers the broadcaster-recorded `startedAt`;
// if absent (e.g. OBS-only stream), falls back to the first client-observed live
// moment. Hidden when not live.
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
  const live = status === "live";
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

- [ ] **Step 6: Wire into watch page**

In `app/watch/[...name]/page.tsx`: look up the stream to read `liveStartedAt`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
// ...
const stream = await db.query.streams.findFirst({
  where: eq(streams.broadcastName, broadcastName),
});
```

Then render `<LiveDuration startedAt={stream?.liveStartedAt?.toISOString() ?? null} name={broadcastName} url={url} />` in the header.

- [ ] **Step 7: Wire into dashboard**

In `app/dashboard/page.tsx`, render `<LiveDuration startedAt={stream.liveStartedAt?.toISOString() ?? null} name={stream.broadcastName} url={presenceUrl} />` next to the presence pill.

- [ ] **Step 8: Verify**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green.

- [ ] **Step 9: Stage**

```bash
git add lib/format-uptime.ts lib/__tests__/format-uptime.test.ts app/live-duration.tsx "app/watch/[...name]/page.tsx" app/dashboard/page.tsx
```
Stop — Lucas commits.

---

### Task 8: Richer offline/live watch UI

**Files:**
- Create: `app/watch/[...name]/watch-stage.tsx` (client wrapper: overlay + player)
- Modify: `app/watch/[...name]/page.tsx` (use the stage; drop the plain paragraph)

**Interfaces:**
- Consumes: `usePresence` (Task 3); existing `WatchClient` (the `dynamic(ssr:false)` player).
- Produces: `<WatchStage url name />` rendering the player with an offline placeholder overlay when `status !== "live"`.

> Browser/visual — verified by build + manual LAN test.

- [ ] **Step 1: Create the stage wrapper**

Create `app/watch/[...name]/watch-stage.tsx`:

```tsx
"use client";

import WatchClient from "./watch-client";
import { usePresence } from "@/lib/use-presence";

// Wraps the player and overlays an offline/connecting card driven by ANNOUNCE
// presence, so the page shows a real "offline" state instead of a black box.
export function WatchStage({ url, name }: { url: string; name: string }) {
  const { status } = usePresence(name, url);
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

> If `WatchClient` already constrains its own width (`max-w-5xl`), drop the wrapper's width classes to avoid double-constraining — check `watch-client.tsx` while implementing.

- [ ] **Step 2: Use it in the page**

In `app/watch/[...name]/page.tsx`: replace `<WatchClient url={url} name={broadcastName} />` and the "Waiting for a live broadcast…" paragraph with `<WatchStage url={url} name={broadcastName} />`. Import `WatchStage`; remove the now-unused `WatchClient` import if no longer referenced.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 4: Stage**

```bash
git add "app/watch/[...name]/watch-stage.tsx" "app/watch/[...name]/page.tsx"
```
Stop — Lucas commits.

---

### Task 9: `/browse` stream directory

**Files:**
- Create: `app/browse/page.tsx`
- Modify: `app/page.tsx` (add a link to `/browse`)

**Interfaces:**
- Consumes: `streams` table; `PresenceBadge` (Task 3); `ViewerCount` (Task 4); `subscribeRelayUrl` + `viewerRelayUrl`.
- Produces: a server page listing all DB streams as cards with live/offline + count.

- [ ] **Step 1: Create the page**

Create `app/browse/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { subscribeRelayUrl, viewerRelayUrl } from "@/lib/relay-token";
import { PresenceBadge } from "@/app/presence-badge";
import { ViewerCount } from "@/app/viewer-count";

export default async function BrowsePage() {
  const all = await db.query.streams.findMany();
  const rows = await Promise.all(
    all.map(async (s) => ({
      stream: s,
      presenceUrl: await subscribeRelayUrl(s.broadcastName),
      viewerUrl: await viewerRelayUrl(s.broadcastName),
      href: `/watch/${s.broadcastName.split("/").map(encodeURIComponent).join("/")}`,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← neobunker
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Browse streams</h1>
      {rows.length === 0 ? (
        <p className="mt-8 text-neutral-400">No streams yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map(({ stream, presenceUrl, viewerUrl, href }) => (
            <li key={stream.id} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <Link href={href} className="font-medium hover:underline">
                  {stream.title}
                </Link>
                <div className="flex items-center gap-3">
                  <ViewerCount name={stream.broadcastName} url={viewerUrl} announce={false} />
                  <PresenceBadge name={stream.broadcastName} url={presenceUrl} />
                </div>
              </div>
              <p className="mt-1 font-mono text-xs text-neutral-500">{stream.broadcastName}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

> `announce={false}` is critical — browsing must not register the visitor as a viewer of every listed stream.

- [ ] **Step 2: Link from home**

In `app/page.tsx`, add near the existing links:

```tsx
        <a href="/browse" className="text-neutral-300 underline hover:text-white">
          Browse live streams
        </a>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 4: Stage**

```bash
git add app/browse/page.tsx app/page.tsx
```
Stop — Lucas commits.

---

## Manual LAN verification (after all tasks)

Run the production build on the LAN box (per `deploy/lan.md`) and confirm:
- Watch page: badge flips OFFLINE→LIVE automatically; offline overlay shows when not live.
- Open two watch tabs on one stream → viewer count reads 2; close one → 1.
- `/browse` lists streams with correct live/offline + counts; merely viewing `/browse` does NOT bump counts.
- Broadcaster on the dashboard/publish page going live records `liveStartedAt`; watch page shows accurate "live for Xm"; an OBS-only stream (no web page open) shows client-observed uptime.

## Self-review notes

- Spec coverage: shared hook (T3), viewer count (T2/T4), uptime record+display (T5/T6/T7), offline UI (T8), directory (T9) — all spec sections mapped.
- `announce={false}` on `/browse` enforces the "browsing never inflates counts" decision.
- Browser-only hooks are verified by build + manual LAN, not Vitest (documented); all pure logic is TDD'd.
