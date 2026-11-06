import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createOidcAgentPass } from "./agent-pass.oidc";
import { checkpointStore } from "./store";

test("OIDC requests essential Orb, fresh login, PKCE and confidential one-use redemption", async () => {
  const db = openDatabase(":memory:");
  const clock = createMockClock(1_800_000_000_000);
  const store = checkpointStore(db, clock, createMockIdGenerator());
  let redeemed = 0;
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("openid-configuration"))
      return Response.json({
        issuer: "https://auth.world.org",
        authorization_endpoint: "https://auth.world.org/authorize",
        token_endpoint: "https://auth.world.org/token",
        jwks_uri: "https://auth.world.org/jwks",
      });
    redeemed++;
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("client:s%3Aecret").toString("base64")}`,
    );
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code");
    expect(body.get("code_verifier")).toBeTruthy();
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }) as typeof fetch;
  const adapter = createOidcAgentPass({
    store,
    clock,
    issuer: "https://auth.world.org",
    clientId: "client",
    clientSecret: "s:ecret",
    redirectUri: "https://api.example/agent-pass/callback",
    fetch: request,
  });
  try {
    const r = await adapter.startCheckpoint({
      userId: "user",
      orderId: "order",
      acr: "https://world.org/oidc/acr/orb",
      returnTo: "https://api.example/agent-pass/callback",
    });
    const a = store.get(r.attemptId);
    if (!a) throw new Error("Missing attempt");
    const p = new URL(r.authorizeUrl).searchParams;
    expect(p.get("max_age")).toBe("0");
    expect(p.get("prompt")).toBe("login");
    expect(p.get("scope")).toBe("openid");
    expect(JSON.parse(p.get("claims") ?? "{}")).toEqual({
      id_token: { acr: { essential: true, value: a.acr } },
    });
    expect(p.get("code_challenge")).toBe(
      createHash("sha256").update(a.verifier).digest("base64url"),
    );
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("nonce")).toBe(a.nonce);
    await expect(
      adapter.completeCheckpoint({ state: a.state, code: "code" }),
    ).rejects.toThrow("access_denied");
    await expect(
      adapter.completeCheckpoint({ state: a.state, code: "code" }),
    ).rejects.toThrow("mismatch");
    expect(redeemed).toBe(1);
  } finally {
    db.close();
  }
});
