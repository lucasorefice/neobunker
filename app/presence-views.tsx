"use client";

import { useEffect, useRef, useState } from "react";
import type { Status } from "@/lib/use-presence";
import { formatUptime } from "@/lib/format-uptime";

// Pure presentation, no relay connection — fed status/count by either the
// standalone components (their own hook) or the shared PresenceProvider context.
export function PresenceBadgeView({ status, className }: { status: Status; className?: string }) {
  const live = status === "live";
  const connecting = status === "connecting" || status === "loading";
  const dot = live ? "bg-red-500" : connecting ? "bg-amber-400" : "bg-neutral-600";
  const label = live ? "LIVE" : connecting ? "connecting" : "OFFLINE";
  const text = live ? "text-red-400" : connecting ? "text-amber-400" : "text-neutral-500";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text} ${className ?? ""}`}>
      <span className={`h-2 w-2 rounded-full ${dot} ${live ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

export function ViewerCountView({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-label={`${count} watching`}
      className={`inline-flex items-center gap-1 text-xs text-neutral-400 ${className ?? ""}`}
    >
      <span aria-hidden>👁</span>
      {count}
    </span>
  );
}

export function LiveDurationView({ startedAt, live }: { startedAt?: string | null; live: boolean }) {
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
