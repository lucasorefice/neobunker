// Generate the shared HS256 signing key for relay JWT mode (Phase 3).
//
//   node scripts/gen-relay-key.mjs > root.jwk
//
// HS256 is symmetric, so the SAME key both signs (app) and verifies (relay):
//   1. Put root.jwk on the relay host and point [auth] key at it (see deploy/).
//   2. Set RELAY_JWT_SECRET in the app to the exact same JSON (one line).
//
// Keep it secret — anyone with this key can mint publish tokens.
import { generate } from "@moq/token";

const key = await generate("HS256");
process.stderr.write(
  "Generated HS256 key. Save stdout as the relay's root.jwk AND set it as RELAY_JWT_SECRET.\n",
);
process.stdout.write(JSON.stringify(key) + "\n");
