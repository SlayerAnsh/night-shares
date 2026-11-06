import { expect, spyOn, test } from "bun:test";
import { createMockClock } from "../../../../ports/clock/clock.mock";
import { createMockIdentityVerifier } from "../../../../ports/identity-verifier/identity-verifier.mock";
import { createMockIdGenerator } from "../../../../ports/ids/id-generator.mock";
import { createMemorySessionStore } from "../../../../ports/sessions/session-store.memory";
import { createMockWalletProvider } from "../../../../ports/wallet-provider/wallet-provider.mock";
import { createMemoryUserRepo } from "../../repo/user-repo.memory";
import { createCompleteSignIn } from "./complete-sign-in";

function setup() {
  const ids = createMockIdGenerator(),
    clock = createMockClock(0);
  const identityVerifier = createMockIdentityVerifier({ ids, clock });
  const walletProvider = createMockWalletProvider({ ids, clock });
  const sessions = createMemorySessionStore();
  const complete = createCompleteSignIn({
    ids,
    identityVerifier,
    walletProvider,
    sessions,
    repo: createMemoryUserRepo(),
  });
  async function signIn(level: "device" | "orb", seed = "alice") {
    const req = await identityVerifier.startRequest(level);
    return complete({
      requestId: req.requestId,
      proof: `mock:${seed}:${level}`,
    });
  }
  return {
    complete,
    signIn,
    walletProvider,
    sessions,
    identityVerifier,
    clock,
  };
}
test("sign-in upgrades Device to Orb and never downgrades or relinks a wallet", async () => {
  const s = setup(),
    link = spyOn(s.walletProvider, "linkWallet");
  const device = await s.signIn("device"),
    orb = await s.signIn("orb"),
    again = await s.signIn("device");
  expect(device.user.level).toBe("device");
  expect(orb.user.level).toBe("orb");
  expect(again.user).toEqual(orb.user);
  expect(orb.user.id).toBe(device.user.id);
  expect(link).toHaveBeenCalledTimes(1);
  expect(s.sessions.get(orb.sessionToken)).toEqual(orb.user);
});
test("concurrent sign-ins share one user and wallet", async () => {
  const s = setup(),
    link = spyOn(s.walletProvider, "linkWallet");
  const results = await Promise.all([s.signIn("orb"), s.signIn("device")]);
  expect(results[0]?.user.id).toBe(results[1]?.user.id);
  expect(link).toHaveBeenCalledTimes(1);
  expect((await s.signIn("device")).user.level).toBe("orb");
});
test("invalid, expired and replayed proofs cannot create sessions", async () => {
  const s = setup();
  await expect(
    s.complete({ requestId: "", proof: "mock:alice:orb" }),
  ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  const req = await s.identityVerifier.startRequest("orb");
  await expect(
    s.complete({ requestId: req.requestId, proof: "bad" }),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(
    s.complete({ requestId: req.requestId, proof: "mock:alice:device" }),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  const input = { requestId: req.requestId, proof: "mock:alice:orb" };
  await s.complete(input);
  await expect(s.complete(input)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  const expired = await s.identityVerifier.startRequest("orb");
  s.clock.advance(300000);
  await expect(
    s.complete({ ...input, requestId: expired.requestId }),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
