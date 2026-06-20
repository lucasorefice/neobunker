import { load, sign, type Claims } from "@moq/token";
import { RELAY_URL } from "./relay";

// Server-only: signs relay JWTs with the shared key. NEVER import from a client
// component — RELAY_JWT_SECRET must not reach the browser.
//
// Token claims use the moq-token format the relay deserializes (root/put/get;
// `get`, not `sub`, since `sub` is a reserved JWT claim). Scope:
//   subscribe -> { root:"", get:<name> }            (watch <name> only, no publish)
//   publish   -> { root:"", put:<name>, get:<name> } (publish + self-watch <name>)
// Clients connect at the relay root ("") carrying ?jwt=<token>.

const TTL_SECONDS = 60 * 60; // 1 hour

export function isJwtMode(): boolean {
  return !!process.env.RELAY_JWT_SECRET;
}

function signingKey() {
  const jwk = process.env.RELAY_JWT_SECRET;
  if (!jwk) throw new Error("RELAY_JWT_SECRET is not set (JWT mode disabled)");
  return load(jwk);
}

function withExpiry(claims: Claims): Claims {
  const now = Math.floor(Date.now() / 1000);
  return { ...claims, iat: now, exp: now + TTL_SECONDS };
}

export async function mintSubscribeToken(broadcastName: string): Promise<string> {
  return sign(signingKey(), withExpiry({ root: "", get: broadcastName }));
}

export async function mintPublishToken(broadcastName: string): Promise<string> {
  return sign(
    signingKey(),
    withExpiry({ root: "", put: broadcastName, get: broadcastName }),
  );
}

function withJwt(token: string): string {
  const url = new URL(RELAY_URL);
  url.searchParams.set("jwt", token);
  return url.toString();
}

/** Relay URL a viewer connects to: plain in anon mode, token-bearing in JWT mode. */
export async function subscribeRelayUrl(broadcastName: string): Promise<string> {
  if (!isJwtMode()) return RELAY_URL;
  return withJwt(await mintSubscribeToken(broadcastName));
}

/** Relay URL a broadcaster connects to: plain in anon mode, token-bearing in JWT mode. */
export async function publishRelayUrl(broadcastName: string): Promise<string> {
  if (!isJwtMode()) return RELAY_URL;
  return withJwt(await mintPublishToken(broadcastName));
}
