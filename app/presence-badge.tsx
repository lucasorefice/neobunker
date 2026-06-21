"use client";

import { usePresence } from "@/lib/use-presence";
import { PresenceBadgeView } from "@/app/presence-views";

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
  return <PresenceBadgeView status={status} className={className} />;
}
