"use client";

import { useState } from "react";
import { useChat } from "@/lib/use-chat";
import { formatUptime } from "@/lib/format-uptime";

export function ChatPanel({ name }: { name: string }) {
  const { messages, status, send, nickname, setNickname } = useChat(name);
  const [draft, setDraft] = useState("");

  return (
    <aside className="flex h-[70vh] w-full flex-col rounded-xl border border-neutral-800 bg-neutral-900/50 lg:h-auto">
      <header className="border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
        Chat {status === "offline" && "· stream offline"}
      </header>
      <ul className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {messages.map((m) => (
          <li key={m.id}>
            <span className="font-mono text-[10px] text-neutral-600">
              {formatUptime(m.offsetMs)}{" "}
            </span>
            <span className="font-medium text-neutral-300">{m.displayName}</span>{" "}
            <span className="text-neutral-200">{m.body}</span>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t border-neutral-800 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nickname.trim()) return;
          send(draft);
          setDraft("");
        }}
      >
        {!nickname.trim() ? (
          <input
            placeholder="pick a nickname"
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none"
            onBlur={(e) => setNickname(e.target.value)}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`message as ${nickname}`}
            disabled={status !== "open"}
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-sm outline-none disabled:opacity-50"
          />
        )}
        <button className="rounded-md bg-white px-3 py-1 text-sm font-medium text-neutral-950 disabled:opacity-50" disabled={status !== "open"}>
          Send
        </button>
      </form>
    </aside>
  );
}
