"use client";

import { useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schema";
import { visibleMessages } from "@/lib/replay";
import { formatUptime } from "@/lib/format-uptime";

export function ChatReplay({
  src,
  messages,
  recordingOffsetMs,
}: {
  src: string;
  messages: ChatMessage[];
  recordingOffsetMs: number;
}) {
  const [videoTimeMs, setVideoTimeMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const shown = useMemo(
    () => visibleMessages(messages, recordingOffsetMs + nudgeMs, videoTimeMs),
    [messages, recordingOffsetMs, nudgeMs, videoTimeMs],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div>
        <video
          ref={videoRef}
          src={src}
          controls
          onTimeUpdate={(e) => setVideoTimeMs(e.currentTarget.currentTime * 1000)}
          className="aspect-video w-full rounded-xl bg-black"
        />
        <label className="mt-2 block text-xs text-neutral-500">
          chat sync nudge: {nudgeMs} ms
          <input
            type="range"
            min={-10000}
            max={10000}
            step={250}
            value={nudgeMs}
            onChange={(e) => setNudgeMs(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
      </div>
      <aside className="h-[60vh] overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 text-sm">
        {shown.map((m) => (
          <div key={m.id}>
            <span className="font-mono text-[10px] text-neutral-600">{formatUptime(m.offsetMs)} </span>
            <span className="font-medium text-neutral-300">{m.displayName}</span>{" "}
            <span className="text-neutral-200">{m.body}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
