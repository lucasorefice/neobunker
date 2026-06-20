import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { RELAY_URL } from "@/lib/relay";
import { logout } from "../auth-actions";
import { PresenceBadge } from "../presence-badge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const stream = await db.query.streams.findFirst({
    where: eq(streams.ownerUserId, session.user.id),
  });

  const watchHref = stream
    ? `/watch/${stream.broadcastName.split("/").map(encodeURIComponent).join("/")}`
    : "#";
  const publishHref = stream
    ? `/publish?name=${encodeURIComponent(stream.broadcastName)}`
    : "#";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <form action={logout}>
          <button className="text-sm text-neutral-400 hover:text-neutral-200">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{session.user.email}</p>

      {stream ? (
        <section className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">{stream.title}</h2>
            <PresenceBadge name={stream.broadcastName} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Broadcast name</dt>
              <dd className="font-mono text-neutral-200">{stream.broadcastName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">Relay</dt>
              <dd className="font-mono text-neutral-400">{RELAY_URL}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={publishHref}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Go live
            </Link>
            <Link
              href={watchHref}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-neutral-500"
            >
              View watch page
            </Link>
          </div>

          <p className="mt-5 text-xs text-neutral-500">
            Publish to <span className="font-mono">{stream.broadcastName}</span>{" "}
            (browser webcam now; OBS in Phase 4). Viewers watch at{" "}
            <span className="font-mono">{watchHref}</span>.
          </p>
        </section>
      ) : (
        <p className="mt-8 text-neutral-400">
          No stream provisioned for this account.
        </p>
      )}
    </main>
  );
}
