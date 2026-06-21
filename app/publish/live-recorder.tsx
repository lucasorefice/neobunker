"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@/lib/use-presence";

// Observes the broadcaster's OWN stream via ANNOUNCE and records live/offline
// transitions to the DB. Mounted on pages the broadcaster has open while going
// live (publish + dashboard). Renders nothing.
export function LiveRecorder({ name, url }: { name: string; url: string }) {
  const { status } = usePresence(name, url);
  const last = useRef<"live" | "offline" | null>(null);

  useEffect(() => {
    const kind = status === "live" ? "live" : status === "offline" ? "offline" : null;
    if (!kind || kind === last.current) return;
    last.current = kind;
    void fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, name }),
    });
  }, [status, name]);

  return null;
}
