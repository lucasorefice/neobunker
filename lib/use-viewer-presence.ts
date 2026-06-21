"use client";

import { useEffect, useState } from "react";
import { countViewers } from "@/lib/viewer-count";

// MoQ-native viewer presence. One relay connection per mount:
//  - if `announce`, publish an empty broadcast at <name>/viewers/<uuid> so this
//    viewer appears in ANNOUNCE (needs a viewer token: put on <name>/viewers/);
//  - always read the connection's ANNOUNCE set and count peers under
//    <name>/viewers/ (count includes self when announcing).
export function useViewerPresence(
  name: string,
  url: string,
  opts: { announce: boolean },
): { count: number } {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    let broadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(url), enabled: true });
      connection = conn;

      if (opts.announce) {
        const Publish = await import("@moq/publish");
        if (cancelled) return;
        const id = crypto.randomUUID();
        broadcast = new Publish.Broadcast({
          connection: conn.established,
          name: Net.Path.from(`${name}/viewers/${id}`),
          enabled: true,
        });
      }

      const recompute = () =>
        setCount(countViewers([...conn.announced.peek()], name));
      recompute();
      dispose = conn.announced.subscribe(recompute);
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
  }, [name, url, opts.announce]);

  return { count };
}
