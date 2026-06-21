"use client";

import WatchClient from "./watch-client";
import { usePresence } from "@/lib/use-presence";

// Wraps the player and overlays an offline/connecting card driven by ANNOUNCE
// presence, so the page shows a real "offline" state instead of a black box.
export function WatchStage({ url, name }: { url: string; name: string }) {
  const { status } = usePresence(name, url);
  const live = status === "live";
  const connecting = status === "connecting" || status === "loading";

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <WatchClient url={url} name={name} />
      {!live && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-neutral-950/80 text-center">
          <div>
            <p className="text-lg font-medium text-neutral-200">
              {connecting ? "Connecting…" : "Offline"}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {connecting ? "Reaching the relay…" : "Waiting for the broadcaster to go live."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
