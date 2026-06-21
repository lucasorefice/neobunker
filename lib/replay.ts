// A message at stream offset `offsetMs` appears at video time
// `offsetMs - recordingOffsetMs`. Show every message whose video time has been
// reached. Pure, so it is unit-testable and reused on every `timeupdate`.
export function visibleMessages<T extends { offsetMs: number }>(
  messages: T[],
  recordingOffsetMs: number,
  videoTimeMs: number,
): T[] {
  return messages.filter((m) => m.offsetMs - recordingOffsetMs <= videoTimeMs);
}
