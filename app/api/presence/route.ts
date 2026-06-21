import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import { nextLiveStartedAt } from "@/lib/live-state";

// Records broadcaster-driven live/offline transitions (owner-only).
//   POST { kind: "live" | "offline", name }
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const kind = (body as { kind?: string })?.kind;
  const name = (body as { name?: string })?.name?.trim();
  if ((kind !== "live" && kind !== "offline") || !name) {
    return NextResponse.json(
      { error: "kind must be 'live'|'offline' and name is required" },
      { status: 400 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const owned = await db.query.streams.findFirst({
    where: and(eq(streams.ownerUserId, session.user.id), eq(streams.broadcastName, name)),
  });
  if (!owned) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const next = nextLiveStartedAt(owned.liveStartedAt ?? null, kind, new Date());
  await db.update(streams).set({ liveStartedAt: next }).where(eq(streams.id, owned.id));
  return NextResponse.json({ ok: true, liveStartedAt: next });
}
