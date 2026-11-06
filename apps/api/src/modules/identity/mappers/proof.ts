import type { CompleteSignInRequest } from "@night-shares/proto/identity/v1/identity_pb";
import type { IdentityProof } from "../../../ports/identity-verifier/identity-verifier";
import { DomainError } from "../../../shared/errors/domain-error";
export function fromProof(
  proof: CompleteSignInRequest["proof"],
): IdentityProof {
  if (proof.case === "idkitResultJson") return { idkitResultJson: proof.value };
  if (proof.case === "mockProof" || proof.case === "worldId")
    return proof.value;
  throw new DomainError("UNAUTHENTICATED", "A World ID proof is required.");
}
