import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import type { VerifiedAction } from "../../../ports/verifications/verification-store";
export function createStartVerifyAction(deps: Pick<Ports, "identityVerifier">) {
  return (user: User, action: VerifiedAction, resourceId?: string) =>
    deps.identityVerifier.startRequest(
      action === "approve_agent_order" ? "orb" : "device",
      action,
      user.id,
      { resourceId },
    );
}
