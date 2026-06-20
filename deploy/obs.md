# Phase 4 — OBS ingest (`obs-moq`)

Stream into neobunker from **OBS Studio** instead of the browser webcam page, so
a broadcaster gets scenes, overlays, and hardware encoding. OBS publishes to the
same relay the browser player watches: `OBS → moq-relay → viewers`.

> **Docs-only / prep.** This guide is distilled from the upstream
> [`moq-dev/obs`](https://github.com/moq-dev/obs) README — it can't be verified
> here (building OBS + the plugin happens on your machine). Treat versions as
> moving targets and pin commits.

## Heads-up before you start

- **You must build a fork of OBS from source.** The MoQ output only shows up in
  a patched OBS UI ([`brianmed/obs-studio`](https://github.com/brianmed/obs-studio)),
  plus the [`moq-dev/obs`](https://github.com/moq-dev/obs) plugin. Budget time.
  There's **no prebuilt binary / Homebrew cask** for the plugin yet (the moq tap
  ships only CLI tools: `moq-cli`, `moq-relay`, `moq-token-cli`, …).
- **Codecs:** the plugin output currently supports **H.264 + AAC** only — *not*
  Opus. That differs from neobunker's browser publish path (H.264 + Opus). The
  `@moq/watch` player decodes AAC natively, so playback is fine; just note the
  prototype's "H.264 + Opus" locked decision doesn't hold for the OBS path yet.

## 1. Build & install the plugin

Prereqs: CMake 3.20+ (3.28+ on Ubuntu), a C++ compiler, and OBS dev libraries.
On Ubuntu 24.04 also: `ninja-build`, `pkg-config`, `build-essential`.

```bash
# Clone the plugin and the OBS fork (pin to known-good commits for repeatability).
git clone https://github.com/moq-dev/obs.git moq-obs
git clone https://github.com/brianmed/obs-studio.git obs-studio

# Build the OBS fork (swap "macos" for your platform's preset, e.g. "linux"/"windows").
cd obs-studio
cmake --preset macos
cmake --build --preset macos
cd ..

# Configure + build the plugin.
cd moq-obs
just setup          # or: just setup ../moq   (for local moq development)
just build
```

Install the built plugin:

```bash
# macOS: copies the .plugin into the OBS fork app and launches it
just run

# Linux: copy the .so into your OBS plugins dir
cp build_x86_64/obs-moq.so \
   ~/.config/obs-studio/plugins/obs-moq/bin/64bit/obs-moq.so
```

## 2. Configure the stream in OBS

1. **Settings → Stream**.
2. **Service** → **MoQ**.
3. **Server** → your relay:
   - Quick test: `https://cdn.moq.dev/anon`
   - Your self-hosted relay (anon mode): `https://relay.example.com/anon`
4. **Broadcast name / path** → your stream's `broadcastName` (copy it from
   neobunker's **/dashboard**, e.g. `phase3-f87a80`). Viewers watch it at
   `/watch/<broadcastName>`.
5. **Output → Encoder:** H.264 (`x264` or hardware). **Audio:** AAC.
6. **Start Streaming.**

Equivalent file-based config (drop into your OBS profile before launch):

```jsonc
// ~/.config/obs-studio/basic/profiles/<Profile>/service.json   (Linux)
// ~/Library/Application Support/obs-studio/basic/profiles/<Profile>/service.json (macOS)
{
  "type": "moq_service",
  "settings": {
    "server": "https://relay.example.com/anon",
    "use_auth": false,
    "service": "MoQ",
    "key": "phase3-f87a80"
  }
}
```

## 3. With neobunker's JWT relay (Phase 3)

In JWT mode the relay rejects untokened connections, so OBS must present a
**publish token**. Get it from **/dashboard** ("OBS publish URL" — the relay
origin with `?jwt=<publish token>`), which is scoped to your stream and authed
to you.

- Easiest: use that full token-bearing URL as the OBS **Server** (and connect at
  the relay **root**, not `/anon`, to match the token's `root:""`).
- The `service.json` `use_auth` flag is the plugin's auth hook; confirm its exact
  token field against the current plugin before relying on it.
- Tokens are **short-lived (~1h)** — regenerate from the dashboard when a stream
  is rejected.

**Recommended bring-up order:** validate the whole OBS pipeline against the
**anon** relay first (no tokens), then switch the relay to JWT mode and repoint
OBS at the token URL.

## Acceptance

Start streaming from OBS to `<broadcastName>`, then open
`/watch/<broadcastName>` in a browser — the OBS feed plays, and the page shows
**● LIVE**.

## Caveats / TODOs

- **Opus in the OBS output** — not supported yet (AAC only). Track upstream.
- **OBS fork required** — upstream OBS doesn't surface the MoQ service yet; the
  `brianmed/obs-studio` fork is a stopgap.
- **Pin commits** — both repos move fast; record the commits you built from.
- **Linux `just run`** — upstream hasn't wired it; use the manual `cp` above.
