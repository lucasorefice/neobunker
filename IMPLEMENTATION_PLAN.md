# MoQ one-to-many streaming — implementation plan

> A phased build plan for the prototype.
> Work phase by phase. Each phase is independently testable — do not start the
> next until the current phase's acceptance check passes.

## Goal

Build a prototype **one-to-many live video streaming** platform: a single
broadcaster streams from OBS to many browser viewers with sub-second latency
using **Media over QUIC (MoQ)**. Target up to ~200 concurrent viewers.

## Mental model (read this first — it prevents the most common mistake)

There are **two planes**, and they must stay separate:

- **Data plane** — `OBS → moq-relay → browser`. Carries the media over QUIC.
  It **never** passes through Next.js or the database. Do not try to proxy
  video through a Next.js route or a serverless function.
- **Control plane** — the Next.js app + PostgreSQL + Auth.js. It serves the
  player page, mints relay tokens, stores accounts and stream ownership, and
  reads live/offline status from the relay. No media bytes here.

**Locked decisions (do not change during the prototype):**
- Codec: **H.264 video + Opus audio**, single rendition. No AV1/HEVC.
- Targets: modern browsers only — desktop Chrome/Firefox/Edge/Safari 26.4+,
  mobile iOS 26.4+ or current Android Chrome. No legacy fallback yet.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend + backend | Next.js (App Router, TypeScript) | One codebase = whole control plane |
| Player library | `@kixelated/hang` (on `@kixelated/moq`) | **Verify package names at install** — being renamed to `@moq/*`. Pin versions. |
| Relay | `moq-relay` (Rust) | `cdn.moq.dev/anon` for Phase 0; self-host from Phase 1 |
| Database | PostgreSQL + Drizzle ORM | Prisma is an acceptable substitute |
| Auth | Auth.js (NextAuth) | Broadcaster login/sessions |
| Ingest | OBS + `moq-dev/obs` plugin | `moq-cli` / `hang-publish` as stand-in early on |

## Phases

### Phase 0 — Hello video (no infrastructure, ~1 hour)
- `npx create-next-app` (TypeScript, App Router).
- `npm add @kixelated/hang` (confirm the current package name first).
- Build a **client-only** player component:
  - `"use client"` at top.
  - Loaded via `dynamic(() => import("./player"), { ssr: false })`.
  - Registers the hang custom element (`import "@kixelated/hang/watch/element"`)
    inside `useEffect`.
  - Renders `<hang-watch url={RELAY_URL} name={name} controls><canvas/></hang-watch>`.
    The `<canvas>` child is required for video to render.
- Point `url` at `https://cdn.moq.dev/anon`.
- Publish a test broadcast from a second tab using `<hang-publish>` (webcam) or `moq-cli`.
- **Acceptance:** video plays inside your own Next.js page.

Target files: `app/watch/[name]/page.tsx`, `app/watch/[name]/player.tsx`.

### Phase 1 — Self-hosted relay
- Provision a small VPS (>1 Gbps egress tier, friendly egress pricing).
- Install `moq-relay` (packages at `apt.moq.dev` / `rpm.moq.dev`).
- Domain + valid TLS cert (QUIC **requires** TLS), and an open UDP port.
- Repoint `NEXT_PUBLIC_RELAY_URL` to the self-hosted relay.
- **Acceptance:** identical playback, now through your own relay.

### Phase 2 — Accounts + stream ownership (DB + Auth)
- Add PostgreSQL + Drizzle. Minimal schema:
  - `users` (id, email, …)
  - `streams` (id, owner_user_id, broadcast_name UNIQUE, title, created_at)
- Add Auth.js login and sessions.
- Add a broadcaster dashboard page that shows the user's stream + broadcast name.
- **Acceptance:** a logged-in broadcaster owns one uniquely named stream.

### Phase 3 — Tokens (secure the relay)
- Switch `moq-relay` to JWT mode with a shared secret.
- Token route handler: `app/api/token/route.ts`
  - Mints a **publish** token (authed broadcaster only, scoped to their broadcast name).
  - Mints **subscribe** tokens (per viewer / per stream).
  - Sign with `RELAY_JWT_SECRET`. Use the `moq-token` claim format for the relay version.
- Player passes the subscribe token to the relay; OBS uses the publish token.
- **Acceptance:** only the authed broadcaster can publish; viewers get scoped subscribe tokens.

### Phase 4 — OBS ingest
- Build/install the `moq-dev/obs` plugin (build-from-source OBS fork — budget time).
- Configure encoder: **H.264 video, Opus audio**; set publish token + broadcast name.
- **Acceptance:** a live OBS stream is visible to browser viewers.

### Phase 5 — Presence + polish
- Subscribe to the relay's ANNOUNCE to derive live/offline status (no polling).
- Reflect live/offline in the UI; show an offline state; optional viewer count.
- Basic styling on the watch page and dashboard.
- **Acceptance:** the UI flips between live and offline automatically.

## Target folder layout

```
app/
  watch/[name]/page.tsx        # server: resolves stream, renders <Player ssr:false>
  watch/[name]/player.tsx      # "use client": hang <hang-watch> + <canvas>
  dashboard/page.tsx           # broadcaster: stream name, publish instructions
  api/token/route.ts           # mints publish/subscribe JWTs
  api/auth/[...nextauth]/route.ts
lib/
  db.ts                        # drizzle client
  schema.ts                    # users, streams
  relay-token.ts               # JWT signing for moq-relay
```

## Environment variables

```
NEXT_PUBLIC_RELAY_URL   # e.g. https://relay.example.com  (https://cdn.moq.dev/anon in Phase 0)
RELAY_JWT_SECRET        # shared with moq-relay; used to sign publish/subscribe tokens
DATABASE_URL            # postgres connection string
AUTH_SECRET             # Auth.js
# + Auth.js provider keys as needed
```

## Gotchas (do not let these slip)

- The player **must be client-only** (`ssr: false`). WebTransport and WebCodecs
  do not exist on the server; SSR will crash or render nothing.
- **No media through the control plane.** Next.js/Vercel never sees video bytes.
- **Confirm package names at install.** `@kixelated/hang` / `@kixelated/moq` are
  mid-rename to `@moq/*`. Pin exact versions — drafts churn and break across versions.
- **H.264 + Opus only** for the prototype. Do not add AV1/HEVC tracks.
- `moq-relay` needs an **open UDP port** and a **valid TLS cert** (QUIC requirement).
- The DB stores **accounts and stream metadata only** — never media, never tokens.
- A `<hang-watch>` needs a `<canvas>` child or it won't download/decode video.
- Live status comes from relay **ANNOUNCE**, not from polling an endpoint.

## Out of scope for the prototype

LL-HLS fallback for older devices, relay clustering / multi-region, ABR or
multi-codec tracks, recording/VOD, native mobile apps, analytics. Note these as
TODOs; do not build them now.

## References

- moq.dev docs: https://doc.moq.dev
- hang (npm): `@kixelated/hang` — web component + JS API
- relay packages: https://apt.moq.dev , https://rpm.moq.dev
- public test relay: https://cdn.moq.dev/anon
