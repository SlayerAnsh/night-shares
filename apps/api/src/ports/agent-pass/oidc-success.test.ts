import { expect, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createOidcAgentPass } from "./agent-pass.oidc";
import { checkpointStore } from "./store";

test("OIDC adapter discovers endpoints, redeems code and validates signed result through JWKS", async () => {
  const db = openDatabase(":memory:");
  const clock = createMockClock(1_800_000_000_000);
  const store = checkpointStore(db, clock, createMockIdGenerator());
  const keys = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test",
    alg: "RS256",
  };
  const calls: string[] = [];
  let state = "";
  const request = (async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path.endsWith("openid-configuration"))
      return Response.json({
        issuer: "https://auth.world.org",
        authorization_endpoint: "https://auth.world.org/authorize",
        token_endpoint: "https://auth.world.org/token",
        jwks_uri: "https://auth.world.org/jwks",
      });
    if (path === "/jwks") return Response.json({ keys: [jwk] });
    const a = store.byState(state);
    if (!a) throw new Error("Missing attempt");
    const token = await new SignJWT({
      sub: "pairwise",
      nonce: a.nonce,
      acr: a.acr,
      amr: ["pop"],
      auth_time: clock.now() / 1000,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://auth.world.org")
      .setAudience("client")
      .setIssuedAt(clock.now() / 1000)
      .setExpirationTime(clock.now() / 1000 + 60)
      .sign(keys.privateKey);
    return Response.json({ id_token: token });
  }) as typeof fetch;
  try {
    const adapter = createOidcAgentPass({
      store,
      clock,
      issuer: "https://auth.world.org",
      clientId: "client",
      clientSecret: "secret",
      redirectUri: "https://api.example/agent-pass/callback",
      fetch: request,
    });
    const started = await adapter.startCheckpoint({
      userId: "user",
      orderId: "order",
      acr: "https://world.org/oidc/acr/orb",
      returnTo: "https://api.example/agent-pass/callback",
    });
    state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
    expect(await adapter.completeCheckpoint({ state, code: "code" })).toEqual({
      attemptId: started.attemptId,
      sub: "pairwise",
      iss: "https://auth.world.org",
      acr: "https://world.org/oidc/acr/orb",
      amr: ["pop"],
      authTime: clock.now() / 1000,
    });
    expect(calls).toEqual([
      "/.well-known/openid-configuration",
      "/token",
      "/jwks",
    ]);
    await expect(
      adapter.completeCheckpoint({ state, code: "code" }),
    ).rejects.toThrow("mismatch");
  } finally {
    db.close();
  }
});
