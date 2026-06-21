import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streams } from "@/lib/schema";
import {
  isJwtMode,
  mintPublishToken,
  mintSubscribeToken,
} from "@/lib/relay-token";

// Mints relay JWTs.
//   POST { kind: "subscribe", name }  -> scoped subscribe token (any viewer)
//   POST { kind: "publish",   name }  -> publish token, ONLY for the authed
//                                        broadcaster who owns that stream
export async function POST(req: Request) {
  if (!isJwtMode()) {
    return NextResponse.json(
      { error: "JWT mode disabled (RELAY_JWT_SECRET not set)" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const kind = (body as { kind?: string })?.kind;
  const name = (body as { name?: string })?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (kind === "subscribe") {
    return NextResponse.json({ token: await mintSubscribeToken(name) });
  }

  if (kind === "publish") {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const owned = await db.query.streams.findFirst({
      where: and(
        eq(streams.ownerUserId, session.user.id),
        eq(streams.broadcastName, name),
      ),
    });
    if (!owned) {
      return NextResponse.json(
        { error: "forbidden: you do not own this stream" },
        { status: 403 },
      );
    }
    return NextResponse.json({ token: await mintPublishToken(name) });
  }

  return NextResponse.json(
    { error: "kind must be 'subscribe' or 'publish'" },
    { status: 400 },
  );
}
