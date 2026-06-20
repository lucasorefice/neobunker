import Link from "next/link";
import PublishClient from "./publish-client";
import { DEFAULT_BROADCAST_NAME, RELAY_URL } from "@/lib/relay";

// Phase 0 stand-in for OBS: broadcast the webcam straight from the browser so
// the watch page has something live to render. Replaced by the OBS plugin in
// Phase 4. ?name=room/bob.hang overrides the broadcast name.
export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  const broadcastName = name?.trim() || DEFAULT_BROADCAST_NAME;
  const watchHref = `/watch/${broadcastName.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto mb-6 flex w-full max-w-2xl items-baseline justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← neobunker
          </Link>
          <h1 className="mt-1 font-mono text-lg">publish · {broadcastName}</h1>
        </div>
        <p className="text-right font-mono text-xs text-neutral-500">{RELAY_URL}</p>
      </div>

      <PublishClient name={broadcastName} />

      <p className="mx-auto mt-4 w-full max-w-2xl text-sm text-neutral-500">
        Allow camera access, then open the{" "}
        <Link href={watchHref} className="text-neutral-300 underline hover:text-white">
          watch page
        </Link>{" "}
        in another tab to see yourself with sub-second latency.
      </p>
    </main>
  );
}
