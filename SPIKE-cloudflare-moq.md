# Spike: hang/`@moq` stack ↔ Cloudflare MoQ relay

**Branch:** `spike/cloudflare-moq` (off `main` — the hang `/publish` + `/watch` are intact here; `feat/moqtail` is NOT usable for this, its `/watch` is the moqtail/draft-16 player).

**Question this answers:** Can the `@moq/publish` + `@moq/watch` (moq.dev "moq-lite") packages neobunker already ships round-trip through **Cloudflare's free MoQ CDN**, with no new client code? If yes, Cloudflare is a viable cheap + low-latency delivery path *on this stack* (not moqtail).

## Endpoint + version (found)
- **Relay endpoint:** `https://draft-14.cloudflare.mediaoverquic.com` — the hostname encodes the draft.
- **Version is the good case:** Cloudflare runs **draft-14**, and moq.dev states **"moq-lite is forward-compatible with moq-transport draft-14+"**. The `@moq/*` packages here ARE moq-lite, so the interop path is the one they advertise — compatibility is *likely*, not the draft-07 mismatch feared earlier.

## Still to confirm empirically
1. **Path/namespace** — try the bare host first (`https://draft-14.cloudflare.mediaoverquic.com`). If it times out, the relay may want a path/namespace segment (cdn.moq.dev uses `/anon`); check Cloudflare's docs for the equivalent.
2. **Auth** — does publishing need a token? (Subscribing may be open.) How is it passed?
3. **`@moq` build is new enough** — the installed `@moq/*` are `0.2.x`; they must be a draft-14-capable moq-lite build. If the probe times out despite a correct URL, **bump `@moq/*`** — that's version skew, not an architecture problem.

## Procedure

### 1. Baseline (prove the stack works at all)
```bash
npm run dev
```
- Open `/moq-probe`, leave the relay at the default `https://cdn.moq.dev/anon`, **Start probe** → expect Phase = `control-ok` within ~1s.
- Then open `/publish` (allow camera) and `/watch/room/alice.hang` in two tabs → expect live video. This confirms the `@moq` stack is healthy before blaming Cloudflare.

### 2. Probe Cloudflare (control-plane only — fast)
- On `/moq-probe`, paste Cloudflare's relay URL → **Start probe**.
- **Read the result:**
  - `control-ok` → WebTransport session + control plane are wire-compatible. Proceed to step 3.
  - `timeout` → no ANNOUNCE in 10s = unreachable, auth-rejected, or **draft mismatch**. Check the browser console / Network → WT for the close code.
  - `error` → the log shows the thrown error (DNS/TLS/WebTransport).

### 3. Full round-trip (only if step 2 = control-ok)
- Set `NEXT_PUBLIC_RELAY_URL` to Cloudflare's URL in `.env.local` (and wire the token into `lib/relay-token.ts` if required), restart, then `/publish` → `/watch/<name>` and confirm video flows edge-to-edge.

## Decision gate (~an afternoon)
- **Round-trips →** Cloudflare's free edge relay is a real cheap + sub-second delivery path on the hang stack. This becomes the production-MoQ direction; moqtail stays R&D.
- **Fails at control-plane →** version/draft skew is the likely cause. Try bumping the `@moq/*` packages (currently `0.2.x`) to whatever Cloudflare's docs pin, re-probe. If it still won't connect, Cloudflare isn't a drop-in for this stack version yet — log the close code and move on.

## Notes / risks
- **Test in Chrome.** Cloudflare's own docs note Safari WebTransport is still incomplete.
- The probe (`/moq-probe`) reaching `control-ok` is the cheap signal — you don't need camera/decode to know if the relay is reachable and compatible.
- Nothing here touches moqtail, the OBS bridge, or `feat/moqtail`. Pure browser-to-relay connectivity on the pre-migration stack.
