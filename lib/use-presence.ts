"use client";

import { useEffect, useState } from "react";

export type Status = "connecting" | "offline" | "loading" | "live";

// Live/offline derived from the relay's ANNOUNCE stream (no polling). Opens a
// lightweight @moq Broadcast for `name` and mirrors its status signal. @moq is
// imported lazily (WebTransport/WebCodecs are browser-only). `url` carries the
// subscribe token in JWT mode.
export function usePresence(name: string, url: string): { status: Status } {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(url), enabled: true });
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
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

  return { status };
}
