import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { Deps } from "../context";
export function getAgentCheckpoint(deps: Deps, user: User, attemptId: string) {
  const a = agentPassSettings(deps.ports).store.get(attemptId);
  if (!a || a.userId !== user.id)
    throw new DomainError("NOT_FOUND", "Checkpoint not found.");
  return { status: a.status, reason: a.reason, orderId: a.orderId };
}
