// Pure session lifecycle over an injected repo, so the open-once/close logic is
// unit-testable without a database. The DB-backed repo is wired in the presence
// route (Task 2).
export type SessionRepo = {
  findOpen(streamId: string): Promise<{ id: string } | undefined>;
  open(streamId: string, startedAt: Date): Promise<void>;
  close(streamId: string, endedAt: Date): Promise<void>;
};

export async function openSession(repo: SessionRepo, streamId: string, now: Date): Promise<void> {
  const existing = await repo.findOpen(streamId);
  if (existing) return;
  await repo.open(streamId, now);
}

export async function closeSession(repo: SessionRepo, streamId: string, now: Date): Promise<void> {
  const existing = await repo.findOpen(streamId);
  if (!existing) return;
  await repo.close(streamId, now);
}
