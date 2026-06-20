"use client";

import { useEffect, useState } from "react";

type Status = "connecting" | "offline" | "loading" | "live";

// Live/offline presence derived from the relay's ANNOUNCE stream (no polling).
// A lightweight @moq Broadcast subscribes to announcements for `name` and exposes
// a reactive status signal we mirror into React state. The @moq import is
// deferred to the browser (WebTransport/WebCodecs don't exist on the server).
// `url` is computed server-side and carries the relay's ?jwt= subscribe token in
// JWT mode (plain relay URL in anon mode).
export function PresenceBadge({
  name,
  url,
  className,
}: {
  name: string;
  url: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;

      const conn = new Net.Connection.Reload({
        url: new URL(url),
        enabled: true,
      });
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
        // Re-evaluate as broadcasts appear/disappear in ANNOUNCE so status flips
        // live<->offline automatically (without this it only checks once).
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

  const live = status === "live";
  const connecting = status === "connecting" || status === "loading";

  const dot = live
    ? "bg-red-500"
    : connecting
      ? "bg-amber-400"
      : "bg-neutral-600";
  const label = live ? "LIVE" : connecting ? "connecting" : "OFFLINE";
  const text = live
    ? "text-red-400"
    : connecting
      ? "text-amber-400"
      : "text-neutral-500";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${text} ${className ?? ""}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${dot} ${live ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
