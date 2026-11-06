import { beforeAll, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createMockClock } from "../clock/clock.mock";
import type { Attempt } from "./agent-pass";
import { validateToken } from "./validate-token";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let key: ReturnType<typeof createLocalJWKSet>;
const now = 1_800_000_000_000;
const policy = {
  issuer: "https://auth.world.org",
  clientId: "client",
  clock: createMockClock(now),
};
const attempt: Attempt = {
  id: "checkpoint_test",
  userId: "user",
  orderId: "order",
  state: "state",
  nonce: "nonce",
  verifier: "verifier",
  createdAt: now - 10_000,
  expiresAt: now + 590_000,
  acr: "https://world.org/oidc/acr/orb",
  returnTo: "https://api.example/agent-pass/callback",
  status: "pending",
  reason: "",
  claimed: true,
  allowEnrollment: true,
};
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  key = createLocalJWKSet({
    keys: [{ ...(await exportJWK(keys.publicKey)), kid: "test", alg: "RS256" }],
  });
});
async function token(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    iss: policy.issuer,
    aud: policy.clientId,
    sub: "pairwise",
    exp: now / 1000 + 60,
    iat: now / 1000,
    nonce: attempt.nonce,
    acr: attempt.acr,
    amr: ["pop"],
    auth_time: now / 1000 - 3,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(keys.privateKey);
}
test("RS256 proof and passkey results validate with attempt freshness", async () => {
  for (const amr of [["pop"], ["pop", "user", "mfa"]]) {
    const r = await validateToken(await token({ amr }), key, attempt, policy);
    expect(r.sub).toBe("pairwise");
    expect(r.amr).toEqual(amr);
  }
});
for (const [label, overrides] of Object.entries({
  issuer: { iss: "https://evil.example" },
  audience: { aud: "other" },
  nonce: { nonce: "other" },
  assurance: { acr: "https://world.org/oidc/acr/selfie" },
  methods: { amr: ["pwd"] },
  incompletePasskey: { amr: ["pop", "mfa"] },
  expired: { exp: now / 1000 - 1 },
  stale: { auth_time: now / 1000 - 16 },
  future: { auth_time: now / 1000 + 6 },
  missingAuthTime: { auth_time: undefined },
  issuedFuture: { iat: now / 1000 + 6 },
  missingExpiry: { exp: undefined },
  authorizedParty: { aud: ["client", "other"] },
  subject: { sub: "" },
}))
  test(`rejects ${label}`, async () => {
    await expect(
      validateToken(await token(overrides), key, attempt, policy),
    ).rejects.toThrow();
  });
test("rejects invalid signature and expired attempt", async () => {
  const other = await generateKeyPair("RS256");
  const wrong = createLocalJWKSet({
    keys: [{ ...(await exportJWK(other.publicKey)), kid: "test" }],
  });
  await expect(
    validateToken(await token(), wrong, attempt, policy),
  ).rejects.toThrow();
  await expect(
    validateToken(await token(), key, { ...attempt, expiresAt: now }, policy),
  ).rejects.toThrow("expired");
});
