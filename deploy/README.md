# Phase 1 — Self-hosted `moq-relay`

This stands up your own MoQ relay (the **data plane**) so video flows
`OBS/browser → your relay → viewers` over QUIC instead of through the public
`cdn.moq.dev/anon`. The Next.js app (the **control plane**) is untouched — you
just repoint one env var at the end.

> **Why this can't be tested in CI / a sandbox:** QUIC needs a real server with
> a static IP, a valid TLS cert, and open UDP. These steps run on an actual VPS.

## QUIC requirements (read first)

Per the [moq.dev production guide](https://moq.dev/setup/prod):

1. **Static public IP** — QUIC is client/server; the relay must be reachable at a stable address.
2. **Valid TLS certificate** — QUIC mandates TLS. Use Let's Encrypt (below). Self-signed works only with browser fingerprint hacks (<2-week certs) — don't bother for this.
3. **Open UDP** — the firewall must allow **UDP/443** (plus **TCP/443** for the WebSocket fallback + cert debugging, and **TCP/80** briefly for cert issuance).

A small box is plenty for ~200 viewers: 1 vCPU / 1 GB RAM, on a provider with a
**static IP** and friendly egress pricing (Hetzner, OVH, Fly.io, a Hetzner/DO
droplet, etc.).

---

## Option A — Docker Compose (recommended, provider-agnostic)

Files in this directory:

| File | Purpose |
|---|---|
| `docker-compose.yml` | Runs `moqdev/moq-relay`, exposes UDP+TCP 443, mounts config + certs |
| `relay.toml` | Phase 1 anonymous config (anon pub+sub under `anon/**`) |
| `certs/` | Your TLS cert/key (gitignored — **never commit these**) |

### 1. Provision + DNS

Create the VPS, note its static IP, then add a DNS record for your relay
hostname (pick any subdomain you control):

```
A     relay.example.com  ->  <your.static.ip.v4>
AAAA  relay.example.com  ->  <your::static::ip::v6>   # if you have IPv6
```

Wait for it to resolve: `dig +short relay.example.com`.

### 2. Open the firewall

Allow inbound **UDP/443**, **TCP/443**, and (for cert issuance) **TCP/80**.
Example with `ufw`:

```bash
sudo ufw allow 443/udp
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
```

Cloud providers usually also have a separate security-group/firewall —
remember to open **UDP/443** there too (it's the one people forget).

### 3. Get a TLS certificate (Let's Encrypt)

Using certbot in standalone mode (port 80 must be free + open):

```bash
sudo apt install certbot            # or: dnf install certbot
sudo certbot certonly --standalone -d relay.example.com
```

Copy the issued cert + key into `certs/` as `cert.pem` / `key.pem` (the names
`relay.toml` expects). The relay uses the **same** cert for QUIC and HTTPS:

```bash
mkdir -p certs
sudo cp /etc/letsencrypt/live/relay.example.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/relay.example.com/privkey.pem   certs/key.pem
sudo chmod 644 certs/cert.pem && sudo chmod 640 certs/key.pem
# ensure the container can read them (single-tenant box):
sudo chown root:root certs/*.pem
```

### 4. Run it

```bash
docker compose up -d
docker compose logs -f moq-relay
```

### 5. Verify

```bash
# TCP side / cert plumbing — should print a base64 fingerprint:
curl https://relay.example.com/certificate.sha256
```

Then the real (QUIC) end-to-end check: set the app's relay URL (step 6) and load
the watch + publish pages — see the acceptance check below.

### 6. Renewal

`certbot renew` rewrites the live cert; re-copy and restart the relay:

```bash
sudo cp /etc/letsencrypt/live/relay.example.com/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/relay.example.com/privkey.pem   certs/key.pem
docker compose restart moq-relay
```

(Automate via a certbot `--deploy-hook` later; out of scope for the prototype.)

---

## Option B — Debian/Ubuntu package + systemd

If you'd rather not use Docker (see the full
[Linux walkthrough](https://moq.dev/setup/linux)):

```bash
curl -fsSL https://apt.moq.dev/moq-keyring.gpg \
  | sudo tee /usr/share/keyrings/moq-keyring.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/moq-keyring.gpg] https://apt.moq.dev stable main" \
  | sudo tee /etc/apt/sources.list.d/moq.list
sudo apt update && sudo apt install moq-relay
```

The package installs a `moq-relay.service` unit (`ExecStart=/usr/bin/moq-relay
--file /etc/moq-relay/relay.toml`) and a default config. Drop your certs in the
service's state dir and start it:

```bash
sudo install -d -m 0750 /var/lib/moq-relay
sudo cp /etc/letsencrypt/live/relay.example.com/fullchain.pem /var/lib/moq-relay/cert.pem
sudo cp /etc/letsencrypt/live/relay.example.com/privkey.pem   /var/lib/moq-relay/key.pem
# Edit /etc/moq-relay/relay.toml to match this dir's relay.toml (anon config),
# pointing cert/key at /var/lib/moq-relay/{cert,key}.pem.
sudo systemctl enable --now moq-relay
sudo journalctl -u moq-relay -f
```

The unit binds 443 without root via `CAP_NET_BIND_SERVICE`.

---

## Repoint the app at your relay

The app reads `NEXT_PUBLIC_RELAY_URL` (default `https://cdn.moq.dev/anon`, see
`../lib/relay.ts`). Point it at your relay's **`/anon`** path:

```bash
# in the project root: .env.local (gitignored)
NEXT_PUBLIC_RELAY_URL=https://relay.example.com/anon
```

`NEXT_PUBLIC_*` is inlined at build time, so rebuild/restart after changing it
(`npm run dev`, or redeploy).

## Acceptance

Identical playback, now through your own relay:

1. Open `/publish` (allow camera) — broadcasts to `room/alice.hang` via your relay.
2. Open `/watch/room/alice.hang` in another tab — video plays, **● LIVE**.

Unlike the Phase 0 sandbox, a real browser here uses **QUIC** (UDP/443), not the
WebSocket fallback.

## Security notes

- **Phase 1 publish is open.** `public = "anon"` lets anyone publish to
  `anon/**` (same as the public test relay). Phase 3 locks publishing behind a
  JWT signed with `RELAY_JWT_SECRET`.
- **Never commit `certs/`.** It holds your private key; it's gitignored here.
