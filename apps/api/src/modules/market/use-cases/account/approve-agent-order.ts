import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { fromProto } from "../../../../shared/night-key";
import { buyAgent } from "../agent/buy";
import type { Deps } from "../context";
export async function approveAgentOrder(
  deps: Deps,
  user: User,
  id: string,
  token: string,
) {
  if (agentPassSettings(deps.ports).config.agentApproval !== "idkit")
    throw new DomainError(
      "PERMISSION_DENIED",
      "Use an Agent Pass checkpoint to approve this order.",
    );
  const order = deps.repo.account(user.humanId).orders.get(id);
  if (!order?.night) throw new DomainError("NOT_FOUND", "Order not found.");
  if (order.status !== AgentOrderStatus.PENDING)
    throw new DomainError("FAILED_PRECONDITION", "Order already executed.");
  if (
    !deps.ports.verifications.consume({
      token,
      userId: user.id,
      action: "approve_agent_order",
      resourceId: id,
    })
  )
    throw new DomainError(
      "PERMISSION_DENIED",
      "Fresh World ID verification required.",
    );
  const execution = await buyAgent(
    deps,
    user,
    fromProto(order.night),
    order.size?.tenths ?? 0,
    order.budget?.micros ?? 0n,
  );
  order.status = AgentOrderStatus.EXECUTED;
  order.spent = execution.quote?.total;
  deps.repo.account(user.humanId).orders.set(id, order);
  return { order: structuredClone(order), execution };
}
