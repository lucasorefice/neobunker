# Phase 4 — OBS ingest (`obs-moq`)

Stream into neobunker from **OBS Studio** (scenes, overlays, hardware encoding)
instead of the browser webcam page. OBS publishes to the same relay the browser
player watches: `OBS → moq-relay → viewers`.

> Verified on CachyOS/Arch (OBS 32.1.2). The exact package names differ per
> distro, but the flow is the same.

## You do NOT need the OBS fork

The upstream README says to build a fork of OBS "to show MoQ in the UI." In
practice that's only needed for the Settings → Stream **Service** dropdown.
Stock OBS loads the plugin fine, and the plugin ships a **"MoQ" dock** with a
**Go Live** button that publishes directly — which is the path that works. So:
**build only the plugin, use the dock.**

## 1. Build the plugin

Prereqs (besides stock OBS, which provides `libobs`): `cmake`, `rust`/`cargo`,
`just`, and a **real `ninja` binary** (a shell alias won't do — CMake's
subprocess needs it on `PATH`).

```bash
# Arch/CachyOS:
sudo pacman -S --needed cmake rust just ninja
# Debian/Ubuntu: sudo apt install -y cmake cargo just ninja-build  (+ obs-studio dev libs)

git clone --depth 1 https://github.com/moq-dev/obs.git moq-obs
cd moq-obs
just setup "" ubuntu-x86_64      # Linux preset; auto-detect also works
just build ubuntu-x86_64
```

Produces `build_x86_64/obs-moq.so`.

## 2. Install into OBS (user plugin dir)

```bash
P=~/.config/obs-studio/plugins/obs-moq
mkdir -p "$P/bin/64bit" "$P/data"
cp build_x86_64/obs-moq.so "$P/bin/64bit/"
cp -r build_x86_64/rundir/RelWithDebInfo/obs-moq/* "$P/data/"
ldd "$P/bin/64bit/obs-moq.so" | grep "not found"   # should print nothing
```

Confirm it loads: OBS log (`~/.config/obs-studio/logs/`) shows
`obs_init_module(obs-moq.so)` and `obs-moq.so` under *Loaded Modules*.

## 3. Trust the relay cert for OBS's MoQ client

OBS uses its own **Rust** MoQ client for QUIC — Chrome's WebTransport dev flag
does **not** apply to it. It validates the relay's TLS cert against the **system**
trust store, so add your mkcert root there:

```bash
# Arch/CachyOS (p11-kit):
sudo trust anchor /path/to/rootCA.pem
# Fedora:  sudo cp rootCA.pem /etc/pki/ca-trust/source/anchors/ && sudo update-ca-trust
# Debian:  sudo cp rootCA.pem /usr/local/share/ca-certificates/moq.crt && sudo update-ca-certificates
```

(For a publicly-trusted relay cert this step is unnecessary.)

## 4. Publish via the MoQ dock

1. Open OBS → **Docks → MoQ**.
2. **Relay URL**: your relay with the publish token, e.g.
   `https://relay.example.com/live?jwt=<publish-token>`. In JWT mode, copy this
   from the broadcaster **/dashboard** ("OBS publish URL"); in anon mode use
   `https://relay.example.com/anon`.
3. **Broadcast name**: your stream's name (e.g. `alice-7f3a9c.hang`).
4. Add a source to your scene, then click **Go Live**. Watch the status line
   under the button.

> Ignore **Settings → Stream** — stock OBS resets it to `rtmp_custom`. The dock
> runs its own output independently; that reset is harmless. The dock remembers
> its fields in `~/.config/obs-studio/plugin_config/obs-moq/dock.json`.

## 5. Codec & quality — Settings → Output

The dock builds its encoder from the profile's **Output** settings (it forces
MoQ-friendly `repeat_headers` + no B-frames automatically). Use **Output Mode =
Advanced**:

- **Video Encoder**: **H.264** for broad browser support — QuickSync H.264
  (hardware) or x264 (software). The plugin also advertises HEVC/AV1, but not all
  browsers decode those via WebCodecs.
- **Keyframe Interval**: **1–2 s** (not 0/auto) — key for low-latency join/recovery.
- **Rate Control** CBR, **Bitrate** to taste (≈2.5–6 Mbps @ 720p).
- **Audio**: AAC works out of the box. For **Opus** (H.264+Opus, the plan's
  codecs), the Settings dropdown won't list it — it's filtered by the
  `rtmp_custom` service — so set it directly in the profile's `basic.ini`:
  `[AdvOut] AudioEncoder=ffmpeg_opus` (with OBS closed), then Go Live.

Re-click **Go Live** after any Output change (the encoder is built at start).

## 6. Verify

Open `https://relay-app/watch/<broadcast-name>` (with WebTransport Developer Mode
enabled in Chrome for true QUIC, else the WebSocket fallback) → your OBS scene
plays, **● LIVE**.

## Gotchas

- **No fork needed** — stock OBS + the plugin + the MoQ dock is the working path.
- **`ninja` must be a binary**, not a shell alias, or the CMake configure fails.
- **OBS QUIC cert** is validated against the system trust store (step 3), separate
  from the browser's trust.
- **H.264** is the safe codec for the `@moq/watch` player; HEVC/AV1 may not decode
  in all browsers. AV1 *software* encoding is also very CPU-heavy for real time.
