import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @/auth and @/lib/db before importing the route.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { streams: { findFirst: vi.fn() } }, update: vi.fn() } }));

// Import after mocks are set up.
import { POST } from "./route";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Typed helpers.
const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockFindFirst = db.query.streams.findFirst as ReturnType<typeof vi.fn>;
const mockUpdate = db.update as ReturnType<typeof vi.fn>;

// Capture the arg passed to .set() so tests can assert on it.
let capturedSetArg: unknown = undefined;

function makeUpdateChain() {
  return {
    set: vi.fn((arg: unknown) => {
      capturedSetArg = arg;
      return { where: vi.fn(() => Promise.resolve(undefined)) };
    }),
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/presence", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedSetArg = undefined;
  mockUpdate.mockReturnValue(makeUpdateChain());
});

describe("POST /api/presence", () => {
  it("returns 401 when auth() returns null (no session)", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "live", name: "room/alice" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const res = await POST(makeRequest({ kind: "live", name: "room/alice" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when authed but stream not owned", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindFirst.mockResolvedValue(undefined);
    const res = await POST(makeRequest({ kind: "live", name: "room/alice" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ kind: "live" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when kind is invalid", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(makeRequest({ kind: "unknown", name: "room/alice" }));
    expect(res.status).toBe(400);
  });

  it("live with liveStartedAt=null: calls update with a new Date", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const ownedStream = {
      id: "stream-1",
      ownerUserId: "user-1",
      broadcastName: "room/alice",
      liveStartedAt: null,
    };
    mockFindFirst.mockResolvedValue(ownedStream);

    const res = await POST(makeRequest({ kind: "live", name: "room/alice" }));
    expect(res.status).toBe(200);

    expect(mockUpdate).toHaveBeenCalledOnce();
    const setArg = (capturedSetArg as { liveStartedAt: unknown }).liveStartedAt;
    expect(setArg).toBeInstanceOf(Date);
  });

  it("live is idempotent: uses existing liveStartedAt when already set", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const existingDate = new Date("2026-06-21T09:00:00Z");
    const ownedStream = {
      id: "stream-1",
      ownerUserId: "user-1",
      broadcastName: "room/alice",
      liveStartedAt: existingDate,
    };
    mockFindFirst.mockResolvedValue(ownedStream);

    const res = await POST(makeRequest({ kind: "live", name: "room/alice" }));
    expect(res.status).toBe(200);

    const setArg = (capturedSetArg as { liveStartedAt: unknown }).liveStartedAt;
    expect(setArg).toBe(existingDate);
  });

  it("offline clears liveStartedAt: update called with null", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    const ownedStream = {
      id: "stream-1",
      ownerUserId: "user-1",
      broadcastName: "room/alice",
      liveStartedAt: new Date("2026-06-21T09:00:00Z"),
    };
    mockFindFirst.mockResolvedValue(ownedStream);

    const res = await POST(makeRequest({ kind: "offline", name: "room/alice" }));
    expect(res.status).toBe(200);

    const setArg = (capturedSetArg as { liveStartedAt: unknown }).liveStartedAt;
    expect(setArg).toBeNull();
  });
});
