"use client";

import { usePresence } from "@/lib/use-presence";

export function PresenceBadge({
  name,
  url,
  className,
}: {
  name: string;
  url: string;
  className?: string;
}) {
  const { status } = usePresence(name, url);
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
