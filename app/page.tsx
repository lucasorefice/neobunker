"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_BROADCAST_NAME, RELAY_URL } from "@/lib/relay";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState(DEFAULT_BROADCAST_NAME);

  function watch() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const href = trimmed.split("/").map(encodeURIComponent).join("/");
    router.push(`/watch/${href}`);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-semibold tracking-tight">neobunker</h1>
        <p className="mt-2 text-neutral-400">
          One-to-many live video streaming over Media over QUIC.
        </p>

        <form
          className="mt-8 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            watch();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="broadcast name"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-200"
          >
            Watch
          </button>
        </form>

        <p className="mt-4 text-sm text-neutral-500">
          No stream yet?{" "}
          <a href="/publish" className="text-neutral-300 underline hover:text-white">
            Broadcast from your webcam
          </a>{" "}
          to test it end to end, or{" "}
          <a href="/dashboard" className="text-neutral-300 underline hover:text-white">
            sign in
          </a>{" "}
          to manage your stream.
        </p>

        <p className="mt-10 font-mono text-xs text-neutral-600">relay: {RELAY_URL}</p>
      </div>
    </main>
  );
}
