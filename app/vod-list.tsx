import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

export async function VodList({ streamId }: { streamId: string }) {
  const recorded = await db.query.sessions.findMany({
    where: and(eq(sessions.streamId, streamId), isNotNull(sessions.recordingUrl)),
    orderBy: desc(sessions.startedAt),
  });
  if (recorded.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {recorded.map((s) => (
        <li key={s.id}>
          <Link href={`/vod/${s.id}`} className="text-neutral-300 underline hover:text-white">
            {s.startedAt.toLocaleString()}
          </Link>
        </li>
      ))}
    </ul>
  );
}
