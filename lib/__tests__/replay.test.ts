import { expect, test } from "vitest";
import { visibleMessages } from "../replay";

const msgs = [{ offsetMs: 0 }, { offsetMs: 5000 }, { offsetMs: 10000 }];

test("shows messages up to the current video time (inclusive)", () => {
  expect(visibleMessages(msgs, 0, 5000)).toEqual([{ offsetMs: 0 }, { offsetMs: 5000 }]);
});

test("applies recordingOffsetMs (recording started 2s after go-live)", () => {
  // a message at stream-offset 5000 maps to video time 3000
  expect(visibleMessages(msgs, 2000, 3000)).toEqual([{ offsetMs: 0 }, { offsetMs: 5000 }]);
});

test("nothing visible before the first message", () => {
  expect(visibleMessages(msgs, 0, -1)).toEqual([]);
});
