# neobunker

Prototype **one-to-many live video streaming** platform: a single broadcaster
streams from OBS to many browser viewers with sub-second latency using
**Media over QUIC (MoQ)**. Target up to ~200 concurrent viewers.

Two planes, kept strictly separate:

- **Data plane** — `OBS → moq-relay → browser`. Media over QUIC; never touches Next.js or the DB.
- **Control plane** — Next.js + PostgreSQL + Auth.js. Serves pages, mints relay tokens, stores accounts/ownership.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the phased build plan.

## Stack

- **Frontend + backend:** Next.js (App Router, TypeScript)
- **Player:** `@kixelated/hang` (on `@kixelated/moq`)
- **Relay:** `moq-relay` (Rust)
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** Auth.js (NextAuth)
- **Ingest:** OBS + `moq-dev/obs` plugin
