"use client";

// MoQ relay connection probe (spike/cloudflare-moq).
//
// A single page to test whether the hang/@moq stack can reach a given MoQ relay
// — primarily Cloudflare's MoQ CDN — WITHOUT the camera/publish/decode dance.
// It opens a lightweight @moq connection to a runtime-entered relay URL and
// reports each phase so a failure is legible:
//
//   opening  -> control-plane responding (ANNOUNCE received) -> live/offline
//
// @moq is imported lazily inside the effect (WebTransport is browser-only), so
// this page is SSR-safe despite being a client component.

import { useEffect, useRef, useState } from "react";
import { RELAY_URL, DEFAULT_BROADCAST_NAME } from "@/lib/relay";

type Phase =
  | "idle"
  | "opening"
  | "control-ok" // ANNOUNCE set received: WebTransport + control plane work
  | "error"
  | "timeout";

type Log = { t: string; msg: string };

export default function MoqProbePage() {
  const [relay, setRelay] = useState(RELAY_URL);
  const [name, setName] = useState(DEFAULT_BROADCAST_NAME);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("—");
  const [announceCount, setAnnounceCount] = useState<number>(0);
  const [logs, setLogs] = useState<Log[]>([]);
  const teardown = useRef<(() => void) | null>(null);

  const log = (msg: string) =>
    setLogs((l) => [...l, { t: new Date().toISOString().slice(11, 23), msg }]);

  useEffect(() => () => teardown.current?.(), []);

  function stop() {
    teardown.current?.();
    teardown.current = null;
    setRunning(false);
  }

  async function start() {
    stop();
    setLogs([]);
    setStatus("—");
    setAnnounceCount(0);
    setPhase("opening");
    setRunning(true);
    log(`opening connection to ${relay}`);

    let cancelled = false;
    let disposeAnnounce: (() => void) | undefined;
    let disposeStatus: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;
    let sawControl = false;

    const timer = setTimeout(() => {
      if (!cancelled && !sawControl) {
        setPhase("timeout");
        log("TIMEOUT: no ANNOUNCE within 10s — relay unreachable, auth-rejected, or DRAFT MISMATCH");
      }
    }, 10_000);

    teardown.current = () => {
      cancelled = true;
      clearTimeout(timer);
      try {
        disposeAnnounce?.();
        disposeStatus?.();
        broadcast?.close();
        connection?.close();
      } catch {
        // best-effort
      }
    };

    try {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;

      const conn = new Net.Connection.Reload({ url: new URL(relay), enabled: true });
      connection = conn;

      // Any ANNOUNCE callback (even an empty set) means the WebTransport session
      // established AND the control plane is speaking a compatible wire format.
      const onAnnounce = () => {
        if (cancelled) return;
        const set = [...conn.announced.peek()];
        setAnnounceCount(set.length);
        if (!sawControl) {
          sawControl = true;
          clearTimeout(timer);
          setPhase("control-ok");
          log(`control-plane OK — ANNOUNCE received (${set.length} broadcast(s))`);
        }
      };
      onAnnounce();
      disposeAnnounce = conn.announced.subscribe(onAnnounce);

      // live/offline for the chosen broadcast name.
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
        reload: true,
      });
      broadcast = bc;
      setStatus(String(bc.status.peek()));
      disposeStatus = bc.status.subscribe((s: unknown) => {
        if (!cancelled) setStatus(String(s));
      });
    } catch (e) {
      if (cancelled) return;
      clearTimeout(timer);
      setPhase("error");
      log(`ERROR: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    }
  }

  const phaseColor: Record<Phase, string> = {
    idle: "text-neutral-400",
    opening: "text-amber-400",
    "control-ok": "text-emerald-400",
    error: "text-red-400",
    timeout: "text-red-400",
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8 text-neutral-100">
      <header>
        <h1 className="text-xl font-semibold">MoQ relay probe</h1>
        <p className="text-sm text-neutral-400">
          Tests whether the hang/<code>@moq</code> stack can reach a relay (e.g. Cloudflare&apos;s MoQ
          CDN). Reaching <span className="text-emerald-400">control-ok</span> means the wire format is
          compatible; a <span className="text-red-400">timeout</span> usually means a draft mismatch,
          auth rejection, or unreachable host.
        </p>
      </header>

      <div className="space-y-3">
        <label className="block text-sm">
          Relay URL
          <input
            value={relay}
            onChange={(e) => setRelay(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm"
            placeholder="https://relay.cloudflare.mediaoverquic.com/..."
          />
        </label>
        <label className="block text-sm">
          Broadcast name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={start}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            {running ? "Restart probe" : "Start probe"}
          </button>
          {running && (
            <button
              onClick={stop}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-600"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-4 rounded-xl border border-neutral-800 p-4 text-sm">
        <div>
          <dt className="text-neutral-400">Phase</dt>
          <dd className={`font-mono ${phaseColor[phase]}`}>{phase}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">Broadcast status</dt>
          <dd className="font-mono">{status}</dd>
        </div>
        <div>
          <dt className="text-neutral-400">ANNOUNCE count</dt>
          <dd className="font-mono">{announceCount}</dd>
        </div>
      </dl>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-400">Log</h2>
        <pre className="max-h-72 overflow-auto rounded-xl border border-neutral-800 bg-black p-3 text-xs leading-relaxed">
          {logs.length ? logs.map((l) => `${l.t}  ${l.msg}`).join("\n") : "—"}
        </pre>
      </div>
    </main>
  );
}
