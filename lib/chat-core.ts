const MAX_BODY = 500;
const MAX_NAME = 40;

export function validateMessage(
  raw: unknown,
): { ok: true; body: string; displayName: string } | { ok: false; error: string } {
  const body = String((raw as { body?: unknown })?.body ?? "").trim();
  const displayName = String((raw as { displayName?: unknown })?.displayName ?? "").trim();
  if (!body) return { ok: false, error: "empty body" };
  if (body.length > MAX_BODY) return { ok: false, error: "body too long" };
  if (!displayName) return { ok: false, error: "empty name" };
  if (displayName.length > MAX_NAME) return { ok: false, error: "name too long" };
  return { ok: true, body, displayName };
}

export function computeOffsetMs(sentAt: Date, startedAt: Date): number {
  return Math.max(0, sentAt.getTime() - startedAt.getTime());
}
