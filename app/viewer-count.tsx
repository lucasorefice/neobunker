"use client";

import { useViewerPresence } from "@/lib/use-viewer-presence";
import { ViewerCountView } from "@/app/presence-views";

export function ViewerCount({
  name,
  url,
  announce,
  className,
}: {
  name: string;
  url: string;
  announce: boolean;
  className?: string;
}) {
  const { count } = useViewerPresence(name, url, { announce });
  return <ViewerCountView count={count} className={className} />;
}
