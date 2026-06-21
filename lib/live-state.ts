// Pure decision for streams.liveStartedAt. "live" stamps the start once (so the
// uptime clock doesn't reset on repeat go-live pings); "offline" clears it.
export function nextLiveStartedAt(
  current: Date | null,
  kind: "live" | "offline",
  now: Date,
): Date | null {
  if (kind === "offline") return null;
  return current ?? now;
}
