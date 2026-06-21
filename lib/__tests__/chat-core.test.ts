import { expect, test } from "vitest";
import { validateMessage, computeOffsetMs } from "../chat-core";

test("accepts a normal message and trims", () => {
  const r = validateMessage({ body: "  hi  ", displayName: " bob " });
  expect(r).toEqual({ ok: true, body: "hi", displayName: "bob" });
});
test("rejects empty body", () => {
  expect(validateMessage({ body: "   ", displayName: "bob" }).ok).toBe(false);
});
test("rejects over-long body", () => {
  expect(validateMessage({ body: "x".repeat(501), displayName: "bob" }).ok).toBe(false);
});
test("rejects over-long displayName", () => {
  expect(validateMessage({ body: "hi", displayName: "x".repeat(41) }).ok).toBe(false);
});
test("offset is sentAt minus startedAt in ms", () => {
  const started = new Date("2026-06-21T10:00:00Z");
  const sent = new Date("2026-06-21T10:00:12Z");
  expect(computeOffsetMs(sent, started)).toBe(12_000);
});
test("offset clamps negatives to zero", () => {
  const started = new Date("2026-06-21T10:00:05Z");
  const sent = new Date("2026-06-21T10:00:00Z");
  expect(computeOffsetMs(sent, started)).toBe(0);
});
