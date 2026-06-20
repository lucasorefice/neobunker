"use client";

import dynamic from "next/dynamic";

// ssr:false keeps the player (and its WebTransport/WebCodecs imports) out of the
// server bundle entirely. dynamic(ssr:false) is only allowed inside a Client
// Component, which is why this thin wrapper exists between the server page and
// the player.
const Player = dynamic(() => import("./player"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto aspect-video w-full max-w-5xl animate-pulse rounded-xl bg-neutral-900" />
  ),
});

export default function WatchClient({ name }: { name: string }) {
  return <Player name={name} />;
}
