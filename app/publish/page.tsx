import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import PublishClient from "./publish-client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { DEFAULT_BROADCAST_NAME, RELAY_URL } from "@/lib/relay";
import { isJwtMode, publishRelayUrl } from "@/lib/relay-token";

// Phase 0 stand-in for OBS: broadcast the webcam from the browser.
// - Anon mode: any ?name works (handy for quick tests).
// - JWT mode (RELAY_JWT_SECRET set): only the authed broadcaster may publish,
//   and only their own stream — they get a publish token scoped to it.
export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;

  let broadcastName: string;
  if (isJwtMode()) {
    const session = await auth();
    if (!session?.user?.id) redirect("/login");
    const stream = await db.query.streams.findFirst({
      where: eq(streams.ownerUserId, session.user.id),
    });
    if (!stream) redirect("/dashboard");
    broadcastName = stream.broadcastName;
  } else {
    broadcastName = name?.trim() || DEFAULT_BROADCAST_NAME;
  }

  const url = await publishRelayUrl(broadcastName);
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

      <PublishClient url={url} name={broadcastName} />

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
