import { randomBytes } from "node:crypto";

// Derive a stable, URL-safe slug from the email local-part.
export function slugifyEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "user";
}

export function randomSuffix(bytes = 3): string {
  return randomBytes(bytes).toString("hex"); // e.g. 6 hex chars
}

// A fresh candidate broadcast name like "alice-7f3a9c.hang". Single path segment
// so it maps cleanly to /watch/<name> and /publish?name=<name>. The `.hang`
// suffix declares the catalog format explicitly, which the @moq client
// recommends (otherwise it warns and probes the format).
export function candidateBroadcastName(email: string): string {
  return `${slugifyEmail(email)}-${randomSuffix()}.hang`;
}

// A fresh, unguessable broadcast name — no account/email needed — e.g.
// "stream-3f9c2a1e8b7d.hang". 12 hex chars = 48 bits of entropy, far beyond
// guess/scan range on a public anon relay where the name is the only secret.
export function randomBroadcastName(prefix = "stream"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}.hang`;
}

// The viewer URL for a broadcast name. Each path segment is encoded individually
// so slashes stay as separators — matches the /watch/[...name] route, which
// decodeURIComponent()s each segment.
export function watchHref(name: string): string {
  return `/watch/${name.split("/").map(encodeURIComponent).join("/")}`;
}
