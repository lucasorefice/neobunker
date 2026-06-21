import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, chatMessages } from "@/lib/schema";
import { ChatReplay } from "./chat-replay";

export default async function VodPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session?.recordingUrl) notFound();
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.offsetMs),
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <h1 className="mb-4 text-xl font-semibold">Replay</h1>
      <ChatReplay
        src={session.recordingUrl}
        messages={messages}
        recordingOffsetMs={session.recordingOffsetMs}
      />
    </main>
  );
}
