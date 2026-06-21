import { expect, test } from "vitest";
import { openSession, closeSession, type SessionRepo } from "../sessions";

function fakeRepo() {
  const calls: string[] = [];
  let open: { id: string } | undefined;
  const repo: SessionRepo = {
    async findOpen() {
      return open;
    },
    async open() {
      open = { id: "s1" };
      calls.push("open");
    },
    async close() {
      open = undefined;
      calls.push("close");
    },
  };
  return { repo, calls };
}

const now = new Date("2026-06-21T10:00:00Z");

test("openSession opens when none is open", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  expect(calls).toEqual(["open"]);
});

test("openSession is idempotent when one is already open", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  await openSession(repo, "stream1", now);
  expect(calls).toEqual(["open"]);
});

test("closeSession closes the open one", async () => {
  const { repo, calls } = fakeRepo();
  await openSession(repo, "stream1", now);
  await closeSession(repo, "stream1", now);
  expect(calls).toEqual(["open", "close"]);
});
