import { expect, test } from "bun:test";
import { createMockClock } from "../../../../ports/clock/clock.mock";
import { createMockIdentityVerifier } from "../../../../ports/identity-verifier/identity-verifier.mock";
import { createMockIdGenerator } from "../../../../ports/ids/id-generator.mock";
import { createStartSignIn } from "./start-sign-in";

test("starts a request for the selected level with clock-based expiry", async () => {
  const identityVerifier = createMockIdentityVerifier({
    clock: createMockClock(1000),
    ids: createMockIdGenerator(),
  });
  expect(await createStartSignIn({ identityVerifier })("orb")).toEqual({
    requestId: "wid_0001",
    qrPayload: "mock-world-id:wid_0001:orb",
    expiresAt: 301000,
    appId: "",
    action: "night-shares-human",
    signal: "sign_in:nonce_0001",
    mode: 1,
  });
});
