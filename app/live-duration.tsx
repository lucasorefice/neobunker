"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "@/lib/use-presence";
import { formatUptime } from "@/lib/format-uptime";

// Shows "live for Xm" while live. Prefers the broadcaster-recorded `startedAt`;
// if absent (e.g. OBS-only stream), falls back to the first client-observed live
// moment. Hidden when not live.
export function LiveDuration({
  startedAt,
  name,
  url,
}: {
  startedAt?: string | null;
  name: string;
  url: string;
}) {
  const { status } = usePresence(name, url);
  const live = status === "live";
  const observed = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!live) {
      observed.current = null;
      return;
    }
    if (observed.current === null) observed.current = Date.now();
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  if (!live) return null;
  const origin = startedAt ? new Date(startedAt).getTime() : (observed.current ?? Date.now());
  return (
    <span className="text-xs text-neutral-400">live for {formatUptime(Date.now() - origin)}</span>
  );
}
