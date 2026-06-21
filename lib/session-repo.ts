import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import type { SessionRepo } from "@/lib/sessions";

export const dbSessionRepo: SessionRepo = {
  async findOpen(streamId) {
    const row = await db.query.sessions.findFirst({
      where: and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)),
    });
    return row ? { id: row.id } : undefined;
  },
  async open(streamId, startedAt) {
    await db.insert(sessions).values({ streamId, startedAt });
  },
  async close(streamId, endedAt) {
    await db
      .update(sessions)
      .set({ endedAt })
      .where(and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)));
  },
};
