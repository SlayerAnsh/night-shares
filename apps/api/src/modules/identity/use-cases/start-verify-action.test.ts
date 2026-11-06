import { expect, test } from "bun:test";
import { createMockClock } from "../../../ports/clock/clock.mock";
import { createMockIdentityVerifier } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createMockIdGenerator } from "../../../ports/ids/id-generator.mock";
import { createStartVerifyAction } from "./start-verify-action";

const user = {
  id: "usr_alice",
  humanId: "alice",
  level: "orb" as const,
  walletAddress: "wallet",
};
test("action starts bind the signed-in user, purpose and required level", async () => {
  const identityVerifier = createMockIdentityVerifier({
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
  });
  const start = createStartVerifyAction({ identityVerifier });
  for (const action of ["check_in", "approve_agent_order"] as const) {
    const request = await start(user, action);
    expect(request.action.startsWith(`${action}:`)).toBe(true);
    expect(request.signal.startsWith(`${action}:`)).toBe(true);
    const verifying = identityVerifier.verifyProof({
      requestId: request.requestId,
      action,
      userId: user.id,
      proof: "mock:alice:device",
    });
    if (action === "approve_agent_order")
      await expect(verifying).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    else await expect(verifying).resolves.toMatchObject({ level: "device" });
  }
});
