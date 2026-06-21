import Link from "next/link";
import { eq } from "drizzle-orm";
import { WatchStage } from "./watch-stage";
import { ChatPanel } from "@/app/chat-panel";
import { PresenceProvider, PresenceBadgeShared, ViewerCountShared, LiveDurationShared } from "@/app/presence-context";
import { RELAY_URL } from "@/lib/relay";
import { subscribeRelayUrl, viewerRelayUrl } from "@/lib/relay-token";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";

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
  const stream = await db.query.streams.findFirst({
    where: eq(streams.broadcastName, broadcastName),
  });

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-10 text-neutral-100">
      <PresenceProvider name={broadcastName} viewerUrl={viewerUrl} announce>
        <div className="mx-auto mb-6 flex w-full max-w-5xl items-baseline justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
              ← neobunker
            </Link>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-mono text-lg">{broadcastName}</h1>
              <PresenceBadgeShared />
              <ViewerCountShared />
              <LiveDurationShared startedAt={stream?.liveStartedAt?.toISOString() ?? null} />
            </div>
          </div>
          <p className="text-right font-mono text-xs text-neutral-500">{RELAY_URL}</p>
        </div>

        <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[1fr_20rem]">
          <WatchStage url={url} name={broadcastName} />
          <ChatPanel name={broadcastName} />
        </div>
      </PresenceProvider>
    </main>
  );
}
