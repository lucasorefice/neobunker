# LAN testing (Linux relay, multi-device, mkcert)

Run neobunker on your LAN so phones / other laptops can watch and broadcast.

**The one rule that drives everything:** browsers only expose **WebTransport +
WebCodecs** in a *secure context*. `http://localhost` counts; `http://192.168.x.x`
does **not**. So for other devices, both the **app** and the **relay** must be
served over **HTTPS** with a certificate those devices trust. We use
[`mkcert`](https://github.com/FiloSottile/mkcert) to run a tiny local CA and
install its root on each device — no public domain or Let's Encrypt needed.

Three pieces, all on the LAN server:

- **moq-relay** — the data plane (QUIC), native install, anon mode to start.
- **the Next.js app** — the control plane, served over HTTPS.
- **one mkcert cert** covering the server's LAN IP + hostname, used by both.

Replace `192.168.1.50` below with your server's actual LAN IP throughout.

---

## 0. Pick a stable address

Use the server's LAN IP (`192.168.1.50`) or an mDNS name (`bunker.local`).
Keep it consistent everywhere — it goes in the cert, the relay, and the app URL.

## 1. Local CA + certificate (mkcert)

On the **server**:

```bash
# install mkcert (Debian/Ubuntu): apt install mkcert libnss3-tools
#   or download the release binary from github.com/FiloSottile/mkcert
mkcert -install
mkcert 192.168.1.50 bunker.local localhost
# produces e.g. ./192.168.1.50+2.pem and ./192.168.1.50+2-key.pem
cp 192.168.1.50+2.pem cert.pem
cp 192.168.1.50+2-key.pem key.pem
```

Trust the CA on **every device that will watch or broadcast**:

```bash
mkcert -CAROOT          # prints the folder containing rootCA.pem
```

Copy `rootCA.pem` to each device and install it as a trusted root CA:

- **Android:** Settings → Security → *Encryption & credentials* → *Install a certificate* → *CA certificate*.
- **iOS:** AirDrop/email the `.pem` → install the profile → Settings → General → About → *Certificate Trust Settings* → enable it. (Safari 26.4+ for WebTransport.)
- **macOS:** double-click → Keychain Access → *System* → set to *Always Trust*.
- **Windows:** `certlm.msc` → *Trusted Root Certification Authorities* → Import.
- **Firefox** (any OS): it has its own store — import under Settings → Privacy → Certificates.

Without this, the device rejects the cert and WebTransport silently fails.

## 2. Run moq-relay (native, anon mode)

Start in **anon mode** (no tokens) to validate streaming first.

**Debian / Ubuntu:**

```bash
curl -fsSL https://apt.moq.dev/moq-keyring.gpg \
  | sudo tee /usr/share/keyrings/moq-keyring.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/moq-keyring.gpg] https://apt.moq.dev stable main" \
  | sudo tee /etc/apt/sources.list.d/moq.list
sudo apt update && sudo apt install moq-relay
```

(Fedora/RHEL: `dnf config-manager --add-repo https://rpm.moq.dev/moq.repo && dnf install moq-relay`. Other distros: grab the static binary from <https://github.com/moq-dev/moq/releases>.)

Drop the mkcert cert/key where the service can read them, and write the config:

```bash
sudo install -d -m 0750 /var/lib/moq-relay
sudo cp cert.pem key.pem /var/lib/moq-relay/
```

`/etc/moq-relay/relay.toml`:

```toml
[server]
listen = "[::]:4443"
[server.tls]
cert = "/var/lib/moq-relay/cert.pem"
key  = "/var/lib/moq-relay/key.pem"

[web.https]
listen = "[::]:4443"
cert = "/var/lib/moq-relay/cert.pem"
key  = "/var/lib/moq-relay/key.pem"

[auth]
public = "anon"
```

Open the firewall and start it:

```bash
sudo ufw allow 4443/udp    # QUIC / WebTransport (the media)
sudo ufw allow 4443/tcp    # HTTPS/WSS fallback + /certificate.sha256
sudo systemctl enable --now moq-relay
sudo journalctl -u moq-relay -f
```

Sanity check from another device (CA installed): `curl https://192.168.1.50:4443/certificate.sha256` should print a fingerprint with no TLS error.

## 3. Run the app over HTTPS

In the repo on the server:

```bash
npm install   # tsx and ws are runtime dependencies, already in package.json

# Write .env.local — the custom server reads this file at startup.
# Minimum required keys (adjust paths / values for your setup):
cat > .env.local <<'EOF'
NEXT_PUBLIC_RELAY_URL=https://192.168.1.50:4443/anon
DATABASE_URL=postgresql://lucas@127.0.0.1:5544/neobunker
AUTH_SECRET=<your-auth-secret>
# TLS: absolute paths to the mkcert cert and key produced in step 1.
TLS_CERT=/path/to/cert.pem
TLS_KEY=/path/to/key.pem
EOF

# Build the Next.js app (required before starting in production mode).
npm run build

# Start the custom server (chat WebSocket + VOD file serving + HTTPS).
PORT=3000 npm start
# npm start runs: NODE_ENV=production tsx --env-file=.env.local server.mjs
```

The custom server (`server.mjs`) reads `TLS_CERT` and `TLS_KEY` from the
environment. When both are set it starts an **HTTPS** listener using those
files; otherwise it falls back to plain HTTP. It also handles:

- `/chat` — WebSocket room for live and VOD-replay chat.
- `/vod-file/<basename>` — direct file serving from `var/vod/` (supports
  `.webm`, `.mp4`, `.mkv`, `.mov`).

All other requests are forwarded to Next.js.

The app is now at **`https://192.168.1.50:3000`**.

> **Note:** `npx next dev` or `npx next start` will NOT work for this
> deployment — they skip `server.mjs` entirely, so `/chat` (WebSocket) and
> `/vod-file/` are absent and chat + VOD playback silently break. Always use
> `npm start` (or `npm run dev` for local development), which runs `server.mjs`.

> `/dashboard`, `/login`, `/register`, and chat all require Postgres. Set up
> Postgres and run migrations per the main [README](../README.md#accounts--database-phase-2)
> before starting the server if you need those features.

## 4. Test it

From a LAN device (CA trusted):

1. Open `https://192.168.1.50:3000/publish?name=test`, allow the camera.
2. On another device open `https://192.168.1.50:3000/watch/test` → live video, **● LIVE**.

Or broadcast from **OBS** (see [obs.md](obs.md)) pointing at
`https://192.168.1.50:4443/anon`, broadcast name `test`.

## 5. Later: lock it down with JWT (Phase 3)

Once streaming works, switch the relay to JWT mode and turn on accounts:
follow the [JWT mode section](README.md#jwt-mode-phase-3). In JWT mode set
`NEXT_PUBLIC_RELAY_URL=https://192.168.1.50:4443` (the relay **root**, no
`/anon`) and set `RELAY_JWT_SECRET`; the app then mints scoped tokens.

## Gotchas

- **Secure context** — the app must be HTTPS on other devices (done via mkcert).
  Plain `http://<ip>:3000` will load but `WebTransport`/`VideoEncoder` will be
  `undefined` and nothing connects.
- **Install the mkcert CA on every device** that watches or broadcasts.
- **Keep app and relay both HTTPS** — an HTTPS page can't talk to an `http://`
  relay (mixed content).
- **Ports** — UDP **and** TCP 4443 (relay) + TCP 3000 (app) reachable on the LAN.
- **Codecs** — browser publish is H.264 + Opus; OBS is H.264 + AAC. The player
  decodes both.
