"use client";

import { usePresence } from "@/lib/use-presence";
import { LiveDurationView } from "@/app/presence-views";

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
  return <LiveDurationView startedAt={startedAt} live={status === "live"} />;
}
