import Link from "next/link";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { subscribeRelayUrl, viewerRelayUrl } from "@/lib/relay-token";
import { PresenceBadge } from "@/app/presence-badge";
import { ViewerCount } from "@/app/viewer-count";

export default async function BrowsePage() {
  const all = await db.query.streams.findMany();
  const rows = await Promise.all(
    all.map(async (s) => ({
      stream: s,
      presenceUrl: await subscribeRelayUrl(s.broadcastName),
      viewerUrl: await viewerRelayUrl(s.broadcastName),
      href: `/watch/${s.broadcastName.split("/").map(encodeURIComponent).join("/")}`,
    })),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← neobunker
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Browse streams</h1>
      {rows.length === 0 ? (
        <p className="mt-8 text-neutral-400">No streams yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {rows.map(({ stream, presenceUrl, viewerUrl, href }) => (
            <li key={stream.id} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <Link href={href} className="font-medium hover:underline">
                  {stream.title}
                </Link>
                <div className="flex items-center gap-3">
                  <ViewerCount name={stream.broadcastName} url={viewerUrl} announce={false} />
                  <PresenceBadge name={stream.broadcastName} url={presenceUrl} />
                </div>
              </div>
              <p className="mt-1 font-mono text-xs text-neutral-500">{stream.broadcastName}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
