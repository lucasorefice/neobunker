# Task 8 Report: VOD Index Implementation

## Status: DONE

## Summary
Successfully implemented VOD index component listing recorded sessions with direct playback links on dashboard and browse pages.

## Implementation Details

### Component: `app/vod-list.tsx`
- Async server component filtering sessions by `recordingUrl` presence
- Drizzle query: `and(eq(sessions.streamId, streamId), isNotNull(sessions.recordingUrl))` ordered by `desc(sessions.startedAt)`
- Returns `null` when empty (keeps cards clean)
- Maps sessions to `/vod/<id>` links labeled with `startedAt.toLocaleString()`

### Integration
- **Dashboard** (`app/dashboard/page.tsx`): Renders under stream section with "Past streams" heading, after OBS publish URL section
- **Browse** (`app/browse/page.tsx`): Renders inside each stream card below broadcast name

### Verification
- `npx tsc --noEmit`: Success (no errors)
- `npm run build`: Success (compiled 12/12 pages)

## Self-Review Checklist
- ✓ Empty→null handling preserves card layouts
- ✓ Correct Drizzle filter + ordering applied
- ✓ Dashboard PresenceBadge, LiveDuration, upload form intact
- ✓ Browse PresenceBadge/ViewerCount(announce={false}) wiring unchanged
- ✓ No dead code or unused imports

## Commit
SHA: 85f93e5  
Subject: Implement VOD index for dashboard and browse pages (Task 8)

## Files Changed
- Created: `app/vod-list.tsx`
- Modified: `app/dashboard/page.tsx`
- Modified: `app/browse/page.tsx`

---

## Final-review fix wave

### Fix 1 — Guarantee at most one open session per stream (TOCTOU race)

**(a) DB partial unique index**

Modified `lib/schema.ts` to add a `uniqueIndex("sessions_one_open_per_stream").on(t.streamId).where(sql\`${t.endedAt} is null\`)` in the `sessions` table's index config. Drizzle's `pgTable` third-argument API with `uniqueIndex(...).where(sql\`...\`)` generated the correct predicate.

Migration generated: **`drizzle/0003_amused_johnny_blaze.sql`**

SQL generated:
```sql
CREATE UNIQUE INDEX "sessions_one_open_per_stream" ON "sessions" USING btree ("stream_id") WHERE "sessions"."ended_at" is null;
```

Migration applied with `DATABASE_URL=postgresql://lucas@127.0.0.1:5544/neobunker npx drizzle-kit migrate` — succeeded cleanly (no duplicate open sessions existed).

Index confirmed via `psql -c "\d sessions"`: `"sessions_one_open_per_stream" UNIQUE, btree (stream_id) WHERE ended_at IS NULL`

**(b) Conflict-tolerant insert**

In `lib/session-repo.ts`, wrapped the `db.insert(sessions)` in a try/catch that checks for Postgres error code `"23505"` (unique_violation) and returns silently; other errors are rethrown.

**(c) Deterministic findOpen with orderBy**

Added `orderBy: desc(sessions.startedAt)` to `findOpen` in `lib/session-repo.ts` and to `resolveOpenSession` in `lib/chat-store.ts`. Added `desc` import in both files.

---

### Fix 2 — Update deploy/lan.md for the custom server

Rewrote section 3 of `deploy/lan.md` to:
- Build first with `npm run build`
- Start with `PORT=3000 npm start` (which runs `NODE_ENV=production tsx --env-file=.env.local server.mjs`)
- Document that `server.mjs` reads `TLS_CERT` and `TLS_KEY` env vars (file paths to PEM cert/key) for HTTPS
- Note that `tsx` and `ws` are runtime deps already in `package.json`, and `.env.local` must be present
- Explicitly warn that `npx next dev` / `npx next start` bypass `server.mjs` and break chat + VOD

---

### Fix 3 — Preserve real recording extension + correct content-types

**`app/api/vod/upload/route.ts`:** Replaced `file.type.includes("webm") ? "webm" : "mp4"` with extension detection from `file.name` (lowercased), allowing webm/mp4/mkv/mov, falling back to mp4.

**`server.mjs` `handleVodFile`:** Replaced the two-branch ternary with a `EXT_TO_MIME` map: `.webm→video/webm`, `.mp4→video/mp4`, `.mkv→video/x-matroska`, `.mov→video/quicktime`, else `application/octet-stream`.

---

### Fix 4 — useChat robustness

In `lib/use-chat.ts`:
- Wrapped `JSON.parse(e.data)` in try/catch with early `return` on parse failure
- Added type narrowing (`typeof data !== "object"`) after parse
- Added `status !== "open"` guard to `send()` (alongside existing `readyState !== OPEN` check), added `status` to the `useCallback` dependency array

---

### Test / Build / Boot Results

- `npm test`: **34/34 tests pass** (10 test files)
- `npx tsc --noEmit`: **clean** (no errors)
- `npm run build`: **clean** (12/12 pages compiled)
- Boot smoke test (`PORT=3000 npm start`, curl `http://localhost:3000/`): **HTTP_OK**

---

### Commit

See git log for SHA on branch `chat-vod-replay`.
