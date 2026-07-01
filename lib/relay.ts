// Control-plane config for the relay (data plane). No media ever flows through
// Next.js — this only tells the browser elements which relay to talk to.
//
// NEXT_PUBLIC_RELAY_URL is inlined at build time. Defaults to Cloudflare's free
// draft-14 MoQ test relay (anon); repoint it at a self-hosted moq-relay as needed.
export const RELAY_URL =
  process.env.NEXT_PUBLIC_RELAY_URL ?? "https://draft-14.cloudflare.mediaoverquic.com/anon";

// A sensible default broadcast name for the demo forms. MoQ names are paths;
// the `.hang` suffix selects the hang catalog format the elements default to.
export const DEFAULT_BROADCAST_NAME = "room/alice.hang";
