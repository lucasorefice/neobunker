import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";
import type { SessionRepo } from "@/lib/sessions";

export const dbSessionRepo: SessionRepo = {
  async findOpen(streamId) {
    const row = await db.query.sessions.findFirst({
      where: and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)),
      orderBy: desc(sessions.startedAt),
    });
    return row ? { id: row.id } : undefined;
  },
  async open(streamId, startedAt) {
    try {
      await db.insert(sessions).values({ streamId, startedAt });
    } catch (err: unknown) {
      // Unique-violation (23505) means a concurrent open already exists — harmless no-op.
      const code = (err as { code?: string }).code;
      if (code === "23505") return;
      throw err;
    }
  },
  async close(streamId, endedAt) {
    await db
      .update(sessions)
      .set({ endedAt })
      .where(and(eq(sessions.streamId, streamId), isNull(sessions.endedAt)));
  },
};
