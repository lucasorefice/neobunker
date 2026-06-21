"use client";

import { useViewerPresence } from "@/lib/use-viewer-presence";

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
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-neutral-400 ${className ?? ""}`}>
      <span aria-hidden>👁</span>
      {count}
    </span>
  );
}
