import type { Ports } from "../../../../container/ports";
import type { VerificationLevel } from "../../../../ports/identity-verifier/identity-verifier";
export function createStartSignIn(deps: Pick<Ports, "identityVerifier">) {
  return (level: VerificationLevel) =>
    deps.identityVerifier.startRequest(level);
}
