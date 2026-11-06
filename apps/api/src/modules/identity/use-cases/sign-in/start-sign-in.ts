import type { Ports } from "../../../../container/ports";
import type { VerificationLevel } from "../../../../ports/identity-verifier/identity-verifier";
export function createStartSignIn(deps: Pick<Ports, "identityVerifier">) {
  return (level: VerificationLevel, sessionId?: string, userId?: string) =>
    deps.identityVerifier.startRequest(level, "sign_in", userId, { sessionId });
}
