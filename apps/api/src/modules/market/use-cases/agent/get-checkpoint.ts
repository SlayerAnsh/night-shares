import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { resumeChainCheckpoint } from "../../chain/checkpoint";
import { isChain } from "../../chain/runtime";
import type { Deps } from "../context";
export function getAgentCheckpoint(deps: Deps, user: User, attemptId: string) {
  const a = agentPassSettings(deps.ports).store.get(attemptId);
  if (!a || a.userId !== user.id)
    throw new DomainError("NOT_FOUND", "Checkpoint not found.");
  if (isChain(deps.ports) && a.status === "approved")
    return resumeChainCheckpoint(deps, user, a.id)
      .catch(() => undefined)
      .then(() => {
        const current = agentPassSettings(deps.ports).store.get(a.id) ?? a;
        return {
          status: current.status,
          reason: current.reason,
          orderId: current.orderId,
        };
      });
  return { status: a.status, reason: a.reason, orderId: a.orderId };
}
