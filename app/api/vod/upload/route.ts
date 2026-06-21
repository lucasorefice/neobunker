import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sessions, streams } from "@/lib/schema";
import { setRecording } from "@/lib/vod-store";

const VOD_DIR = path.join(process.cwd(), "var", "vod");

// multipart: file=<blob>, sessionId=<uuid>, offsetMs=<int>, durationMs=<int?>
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const sessionId = String(form.get("sessionId") ?? "");
  if (!(file instanceof File) || !sessionId) {
    return NextResponse.json({ error: "file and sessionId required" }, { status: 400 });
  }

  // Ownership: the session's stream must belong to the caller.
  const row = await db
    .select({ sessionId: sessions.id })
    .from(sessions)
    .innerJoin(streams, eq(sessions.streamId, streams.id))
    .where(and(eq(sessions.id, sessionId), eq(streams.ownerUserId, session.user.id)));
  if (row.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const ALLOWED_EXTS = new Set(["webm", "mp4", "mkv", "mov"]);
  const uploadedExt = (file.name.split(".").pop() ?? "").toLowerCase();
  const ext = ALLOWED_EXTS.has(uploadedExt) ? uploadedExt : "mp4";
  await mkdir(VOD_DIR, { recursive: true });
  await writeFile(path.join(VOD_DIR, `${sessionId}.${ext}`), Buffer.from(await file.arrayBuffer()));

  await setRecording(sessionId, {
    recordingUrl: `/vod-file/${sessionId}.${ext}`,
    recordingOffsetMs: Number(form.get("offsetMs") ?? 0) || 0,
    recordingDurationMs: form.get("durationMs") ? Number(form.get("durationMs")) : undefined,
  });
  return NextResponse.json({ ok: true });
}
