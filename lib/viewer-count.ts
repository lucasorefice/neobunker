// Counts distinct viewer self-announcements under `<name>/viewers/`. Pure so it
// is unit-testable without a relay; the browser hook feeds it the live ANNOUNCE
// set. Prefix matching mirrors @moq Path.hasPrefix (boundary at "/").
export function countViewers(announced: Iterable<string>, name: string): number {
  const prefix = `${name}/viewers/`;
  const seen = new Set<string>();
  for (const path of announced) {
    if (path.startsWith(prefix) && path.length > prefix.length) seen.add(path);
  }
  return seen.size;
}
