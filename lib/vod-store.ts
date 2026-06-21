import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

export function pickUploadTargetSession(
  rows: { id: string; endedAt: Date | null }[],
): string | undefined {
  const ended = rows.filter((r) => r.endedAt !== null) as { id: string; endedAt: Date }[];
  if (ended.length === 0) return undefined;
  ended.sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime());
  return ended[0].id;
}

export async function setRecording(
  sessionId: string,
  fields: { recordingUrl: string; recordingDurationMs?: number; recordingOffsetMs: number },
) {
  await db.update(sessions).set(fields).where(eq(sessions.id, sessionId));
}
