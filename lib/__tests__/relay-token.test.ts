import { beforeAll, expect, test } from "vitest";
import { generate } from "@moq/token";

function decodeClaims(jwt: string) {
  const payload = jwt.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

beforeAll(async () => {
  // A symmetric signing key in the JWK form lib/relay-token expects.
  const key = await generate("HS256");
  process.env.RELAY_JWT_SECRET = JSON.stringify(key);
});

test("mintViewerToken scopes put to <name>/viewers/ and get to <name>", async () => {
  const { mintViewerToken } = await import("../relay-token");
  const claims = decodeClaims(await mintViewerToken("room/alice.hang"));
  expect(claims.root).toBe("live");
  expect(claims.put).toEqual(["room/alice.hang/viewers/"]);
  expect(claims.get).toEqual(["room/alice.hang"]);
  expect(typeof claims.exp).toBe("number");
});
