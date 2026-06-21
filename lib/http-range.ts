// Parse a single HTTP Range header for byte serving. Pure so it is unit-testable
// without a server. Multi-range is intentionally unsupported (returns null ->
// caller serves the full 200 response).
export type RangeResult =
  | { start: number; end: number } // satisfiable, inclusive
  | null // no/invalid header -> serve full 200
  | "unsatisfiable"; // valid syntax but out of bounds -> 416

export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice(6).trim();
  if (spec === "" || spec.includes(",")) return null; // no multi-range
  const dash = spec.indexOf("-");
  if (dash === -1) return null;
  const startStr = spec.slice(0, dash).trim();
  const endStr = spec.slice(dash + 1).trim();

  if (startStr === "") {
    // suffix: bytes=-N (last N bytes)
    const n = Number(endStr);
    if (endStr === "" || !Number.isInteger(n) || n <= 0) return null;
    if (size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(startStr);
  if (!Number.isInteger(start) || start < 0) return null;
  if (start >= size) return "unsatisfiable";

  if (endStr === "") return { start, end: size - 1 }; // open-ended

  const end = Number(endStr);
  if (!Number.isInteger(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
