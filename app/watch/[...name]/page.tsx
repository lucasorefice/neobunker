import Link from "next/link";
import WatchClient from "./watch-client";
import { PresenceBadge } from "@/app/presence-badge";
import { ViewerCount } from "@/app/viewer-count";
import { RELAY_URL } from "@/lib/relay";
import { subscribeRelayUrl, viewerRelayUrl } from "@/lib/relay-token";

// Catch-all segment: MoQ broadcast names are slash-paths (e.g. "room/alice.hang"),
// so /watch/room/alice.hang -> ["room", "alice.hang"] -> "room/alice.hang".
export default async function WatchPage({
  params,
}: {
  params: Promise<{ name: string[] }>;
}) {
  const { name } = await params;
  const broadcastName = name.map(decodeURIComponent).join("/");
  const url = await subscribeRelayUrl(broadcastName);
  const viewerUrl = await viewerRelayUrl(broadcastName);

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto mb-6 flex w-full max-w-5xl items-baseline justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← neobunker
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-mono text-lg">{broadcastName}</h1>
            <PresenceBadge name={broadcastName} url={url} />
            <ViewerCount name={broadcastName} url={viewerUrl} announce />
          </div>
        </div>
        <p className="text-right font-mono text-xs text-neutral-500">{RELAY_URL}</p>
      </div>

      <WatchClient url={url} name={broadcastName} />

      <p className="mx-auto mt-4 w-full max-w-5xl text-sm text-neutral-500">
        Waiting for a live broadcast on this name. Start one from the{" "}
        <Link href="/publish" className="text-neutral-300 underline hover:text-white">
          publish page
        </Link>{" "}
        (or OBS, once Phase 4 lands).
      </p>
    </main>
  );
}
