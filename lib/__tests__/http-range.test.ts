import { expect, test } from "vitest";
import { parseRange } from "../http-range";

const SIZE = 5000;

test("no header -> null (serve full)", () => {
  expect(parseRange(undefined, SIZE)).toBeNull();
});
test("non-bytes unit -> null", () => {
  expect(parseRange("items=0-10", SIZE)).toBeNull();
});
test("closed range", () => {
  expect(parseRange("bytes=0-1023", SIZE)).toEqual({ start: 0, end: 1023 });
});
test("open-ended range -> to EOF", () => {
  expect(parseRange("bytes=100-", SIZE)).toEqual({ start: 100, end: 4999 });
});
test("suffix range -> last N bytes", () => {
  expect(parseRange("bytes=-500", SIZE)).toEqual({ start: 4500, end: 4999 });
});
test("end past EOF is clamped", () => {
  expect(parseRange("bytes=0-999999", SIZE)).toEqual({ start: 0, end: 4999 });
});
test("start at/after EOF -> unsatisfiable", () => {
  expect(parseRange("bytes=5000-", SIZE)).toBe("unsatisfiable");
});
test("multi-range unsupported -> null (full)", () => {
  expect(parseRange("bytes=0-10,20-30", SIZE)).toBeNull();
});
test("garbage -> null", () => {
  expect(parseRange("bytes=abc", SIZE)).toBeNull();
});
test("start > end -> null", () => {
  expect(parseRange("bytes=100-50", SIZE)).toBeNull();
});
