import { expect, test } from "vitest";
import { nextLiveStartedAt } from "../live-state";

const now = new Date("2026-06-21T10:00:00Z");

test("live sets the timestamp when currently null", () => {
  expect(nextLiveStartedAt(null, "live", now)).toEqual(now);
});

test("live is idempotent: keeps the existing timestamp", () => {
  const earlier = new Date("2026-06-21T09:00:00Z");
  expect(nextLiveStartedAt(earlier, "live", now)).toEqual(earlier);
});

test("offline clears the timestamp", () => {
  expect(nextLiveStartedAt(now, "offline", now)).toBeNull();
});
