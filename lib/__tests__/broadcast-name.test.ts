import { expect, test } from "vitest";
import { randomBroadcastName, watchHref } from "../broadcast-name";

test("randomBroadcastName: stream-<12 hex>.hang by default", () => {
  expect(randomBroadcastName()).toMatch(/^stream-[0-9a-f]{12}\.hang$/);
});

test("randomBroadcastName: honors a custom prefix", () => {
  expect(randomBroadcastName("live")).toMatch(/^live-[0-9a-f]{12}\.hang$/);
});

test("randomBroadcastName: successive calls differ", () => {
  expect(randomBroadcastName()).not.toBe(randomBroadcastName());
});

test("watchHref: builds /watch/<name> for a single-segment name", () => {
  expect(watchHref("stream-3f9c2a1e8b7d.hang")).toBe("/watch/stream-3f9c2a1e8b7d.hang");
});

test("watchHref: encodes each path segment, keeping slashes as separators", () => {
  expect(watchHref("room/alice bob.hang")).toBe("/watch/room/alice%20bob.hang");
});
