import { expect, test } from "vitest";
import { pickUploadTargetSession } from "../vod-store";

test("picks the most-recent ended session", () => {
  const got = pickUploadTargetSession([
    { id: "a", endedAt: new Date("2026-06-21T09:00:00Z") },
    { id: "b", endedAt: new Date("2026-06-21T11:00:00Z") },
    { id: "c", endedAt: null }, // still live — skip
  ]);
  expect(got).toBe("b");
});

test("returns undefined when none ended", () => {
  expect(pickUploadTargetSession([{ id: "c", endedAt: null }])).toBeUndefined();
});
