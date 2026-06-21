import { expect, test } from "vitest";
import { formatUptime } from "../format-uptime";

test("formats sub-minute as seconds", () => {
  expect(formatUptime(45_000)).toBe("45s");
});
test("formats minutes", () => {
  expect(formatUptime(12 * 60_000)).toBe("12m");
});
test("formats hours and zero-padded minutes", () => {
  expect(formatUptime(63 * 60_000)).toBe("1h 03m");
});
test("never negative", () => {
  expect(formatUptime(-5)).toBe("0s");
});
