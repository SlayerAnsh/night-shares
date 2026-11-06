import type { Ports } from "../../../container/ports";
import type { IdentityProof } from "../../../ports/identity-verifier/identity-verifier";
import type { User } from "../../../ports/sessions/session-store";
import type { VerifiedAction } from "../../../ports/verifications/verification-store";
import { verifyCanonicalAction } from "./verify-canonical-action";
export function createVerifyAction(
  deps: Pick<Ports, "identityVerifier" | "verifications">,
) {
  return async (
    user: User,
    action: VerifiedAction,
    proof: IdentityProof,
    requestId?: string,
  ) => {
    const verified = await verifyCanonicalAction(
      deps,
      user,
      action,
      proof,
      requestId,
    );
    return deps.verifications.issue({
      userId: user.id,
      action,
      resourceId: verified.resourceId,
    });
  };
}
