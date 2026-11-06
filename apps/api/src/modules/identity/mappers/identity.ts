import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import type { User } from "../../../ports/sessions/session-store";
import type { VerifiedAction } from "../../../ports/verifications/verification-store";
import { DomainError } from "../../../shared/errors/domain-error";
export function fromLevel(level: VerificationLevel): User["level"] {
  if (level === VerificationLevel.DEVICE) return "device";
  if (level === VerificationLevel.ORB) return "orb";
  throw new DomainError(
    "INVALID_ARGUMENT",
    "Choose Device or Orb verification.",
  );
}
export function fromAction(action: string): VerifiedAction {
  if (action === "check_in" || action === "approve_agent_order") return action;
  throw new DomainError(
    "INVALID_ARGUMENT",
    "Choose a supported verification action.",
  );
}
export function toUser(user: User) {
  return {
    ...user,
    level:
      user.level === "orb" ? VerificationLevel.ORB : VerificationLevel.DEVICE,
  };
}
