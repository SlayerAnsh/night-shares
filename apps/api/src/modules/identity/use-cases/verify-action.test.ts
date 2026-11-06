import { expect, mock, test } from "bun:test";
import { createMockClock } from "../../../ports/clock/clock.mock";
import type { IdentityVerifier } from "../../../ports/identity-verifier/identity-verifier";
import { createMemoryVerificationStore } from "../../../ports/verifications/verification-store.memory";
import { createVerifyAction } from "./verify-action";

const user = {
  id: "usr_1",
  humanId: "alice",
  level: "device" as const,
  walletAddress: "wallet",
};
test("verifies the requested scope and issues an expiring one-time token", async () => {
  const verifyProof = mock(async () => ({
    subject: "alice",
    nullifier: "alice-check-in",
    resourceId: "resource_1",
    level: "device" as const,
  }));
  const identityVerifier: IdentityVerifier = {
    verifyProof,
    startRequest: mock(),
  };
  const verifications = createMemoryVerificationStore({
    clock: createMockClock(1000),
  });
  for (const action of ["check_in", "approve_agent_order"] as const) {
    const result = await createVerifyAction({
      identityVerifier,
      verifications,
    })(user, action, "proof", "wid_1");
    expect(verifyProof).toHaveBeenLastCalledWith({
      proof: "proof",
      action,
      requestId: "wid_1",
      userId: user.id,
    });
    expect(result.expiresAt).toBe(301000);
    expect(
      verifications.consume({
        token: result.token,
        userId: user.id,
        action,
        resourceId: "resource_1",
      }),
    ).toBe(true);
    expect(
      verifications.consume({
        token: result.token,
        userId: user.id,
        action,
        resourceId: "resource_1",
      }),
    ).toBe(false);
  }
});
test("rejects another person's proof without issuing a token", async () => {
  const issue = mock();
  const identityVerifier: IdentityVerifier = {
    startRequest: mock(),
    verifyProof: async () => ({
      subject: "bob",
      nullifier: "bob-check-in",
      level: "orb",
    }),
  };
  await expect(
    createVerifyAction({
      identityVerifier,
      verifications: { issue, consume: mock() },
    })(user, "check_in", "proof"),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  expect(issue).not.toHaveBeenCalled();
});
