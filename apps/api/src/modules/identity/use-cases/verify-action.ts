import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import type { VerifiedAction } from "../../../ports/verifications/verification-store";
import { DomainError } from "../../../shared/errors/domain-error";
export function createVerifyAction(
  deps: Pick<Ports, "identityVerifier" | "verifications">,
) {
  return async (user: User, action: VerifiedAction, proof: string) => {
    const verified = await deps.identityVerifier.verifyProof({ proof, action });
    if (verified.subject !== user.humanId)
      throw new DomainError(
        "PERMISSION_DENIED",
        "The proof must belong to your signed-in World ID.",
      );
    return deps.verifications.issue({ userId: user.id, action });
  };
}
