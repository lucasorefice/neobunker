import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, sessions, streams } from "@/lib/schema";

export async function resolveOpenSession(
  broadcastName: string,
): Promise<{ sessionId: string; startedAt: Date } | undefined> {
  const stream = await db.query.streams.findFirst({
    where: eq(streams.broadcastName, broadcastName),
  });
  if (!stream) return undefined;
  const open = await db.query.sessions.findFirst({
    where: and(eq(sessions.streamId, stream.id), isNull(sessions.endedAt)),
    orderBy: desc(sessions.startedAt),
  });
  return open ? { sessionId: open.id, startedAt: open.startedAt } : undefined;
}

export async function backlog(sessionId: string) {
  return db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.offsetMs),
  });
}

export async function persist(row: {
  sessionId: string;
  userId: string | null;
  displayName: string;
  body: string;
  offsetMs: number;
  sentAt: Date;
}) {
  const [stored] = await db.insert(chatMessages).values(row).returning();
  return stored;
}
