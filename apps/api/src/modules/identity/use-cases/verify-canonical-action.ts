import type { Ports } from "../../../container/ports";
import type { IdentityProof } from "../../../ports/identity-verifier/identity-verifier";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
export async function verifyCanonicalAction(
  deps: Pick<Ports, "identityVerifier">,
  user: User,
  action: string,
  proof: IdentityProof,
  requestId?: string,
) {
  const verified = await deps.identityVerifier.verifyProof({
    proof,
    action,
    requestId,
    userId: user.id,
  });
  if (verified.subject !== user.humanId)
    throw new DomainError(
      "PERMISSION_DENIED",
      "The proof must belong to your signed-in World ID.",
    );
  return verified;
}
