"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@/lib/use-presence";

// Records the broadcaster's own camera with MediaRecorder while the stream is
// live (its own getUserMedia, NOT the <moq-publish> element's internal stream),
// then auto-uploads the blob when the stream goes offline. Renders nothing.
export function PublishRecorder({
  name,
  url,
  targetSessionId,
}: {
  name: string;
  url: string;
  targetSessionId?: string;
}) {
  const { status } = usePresence(name, url);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef<number>(0);
  const sessionId = useRef<string | undefined>(targetSessionId);

  useEffect(() => {
    sessionId.current = targetSessionId;
  }, [targetSessionId]);

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (status === "live" && !recorder.current) {
      (async () => {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
        chunks.current = [];
        startedAt.current = Date.now();
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = async () => {
          stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks.current, { type: "video/webm" });
          if (!sessionId.current || blob.size === 0) return;
          const fd = new FormData();
          fd.set("file", blob, "recording.webm");
          fd.set("sessionId", sessionId.current);
          fd.set("durationMs", String(Date.now() - startedAt.current));
          fd.set("offsetMs", "0"); // record-start ≈ go-live for the browser path
          await fetch("/api/vod/upload", { method: "POST", body: fd });
        };
        rec.start();
        recorder.current = rec;
      })();
    }
    if (status !== "live" && recorder.current) {
      recorder.current.stop();
      recorder.current = null;
    }
  }, [status]);

  // Stop recording and tracks on unmount
  useEffect(() => {
    return () => {
      if (recorder.current) {
        recorder.current.stop();
        recorder.current = null;
      }
    };
  }, []);

  return null;
}
