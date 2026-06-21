import { expect, test } from "vitest";
import { countViewers } from "../viewer-count";

const name = "room/alice.hang";

test("counts only paths under <name>/viewers/", () => {
  const announced = [
    "room/alice.hang",                       // the broadcast itself — not a viewer
    "room/alice.hang/viewers/aaa",
    "room/alice.hang/viewers/bbb",
    "room/bob.hang/viewers/ccc",             // different stream
  ];
  expect(countViewers(announced, name)).toBe(2);
});

test("zero when nobody is watching", () => {
  expect(countViewers(["room/alice.hang"], name)).toBe(0);
});
