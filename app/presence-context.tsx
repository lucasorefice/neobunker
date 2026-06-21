"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/use-presence";
import { countViewers } from "@/lib/viewer-count";
import { PresenceBadgeView, ViewerCountView, LiveDurationView } from "@/app/presence-views";

type PresenceState = { status: Status; viewerCount: number };
const PresenceContext = createContext<PresenceState | null>(null);

// Opens ONE relay connection (viewer token URL: put:<name>/viewers/, get:<name>)
// that powers BOTH live/offline status and the viewer count, replacing the
// separate connections each presence component used to open. @moq imported
// lazily (browser-only).
export function PresenceProvider({
  name,
  viewerUrl,
  announce,
  children,
}: {
  name: string;
  viewerUrl: string;
  announce: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let disposeStatus: (() => void) | undefined;
    let disposeAnnounced: (() => void) | undefined;
    let statusBroadcast: { close(): void } | undefined;
    let viewerBroadcast: { close(): void } | undefined;
    let connection: { close(): void } | undefined;

    (async () => {
      const { Net, Broadcast } = await import("@moq/watch");
      if (cancelled) return;
      const conn = new Net.Connection.Reload({ url: new URL(viewerUrl), enabled: true });
      connection = conn;

      // live/offline status from the broadcast's own ANNOUNCE
      const bc = new Broadcast({
        connection: conn.established,
        announced: conn.announced,
        name: Net.Path.from(name),
        enabled: true,
        reload: true,
      });
      statusBroadcast = bc;
      setStatus(bc.status.peek());
      disposeStatus = bc.status.subscribe((s) => setStatus(s));

      // viewer count from the same connection's ANNOUNCE set; publish self if announce
      if (announce) {
        const Publish = await import("@moq/publish");
        if (cancelled) return;
        const id = crypto.randomUUID();
        viewerBroadcast = new Publish.Broadcast({
          connection: conn.established,
          name: Net.Path.from(`${name}/viewers/${id}`),
          enabled: true,
        });
      }
      const recompute = () => setViewerCount(countViewers([...conn.announced.peek()], name));
      recompute();
      disposeAnnounced = conn.announced.subscribe(recompute);
    })();

    return () => {
      cancelled = true;
      try {
        disposeStatus?.();
        disposeAnnounced?.();
        statusBroadcast?.close();
        viewerBroadcast?.close();
        connection?.close();
      } catch {
        // best-effort teardown
      }
    };
  }, [name, viewerUrl, announce]);

  return (
    <PresenceContext.Provider value={{ status, viewerCount }}>{children}</PresenceContext.Provider>
  );
}

export function usePresenceState(): PresenceState {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresenceState must be used within a PresenceProvider");
  return ctx;
}

// Context-fed variants for the watch page (one shared connection).
export function PresenceBadgeShared({ className }: { className?: string }) {
  const { status } = usePresenceState();
  return <PresenceBadgeView status={status} className={className} />;
}

export function ViewerCountShared({ className }: { className?: string }) {
  const { viewerCount } = usePresenceState();
  return <ViewerCountView count={viewerCount} className={className} />;
}

export function LiveDurationShared({ startedAt }: { startedAt?: string | null }) {
  const { status } = usePresenceState();
  return <LiveDurationView startedAt={startedAt} live={status === "live"} />;
}
