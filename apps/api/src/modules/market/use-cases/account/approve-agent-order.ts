import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { fromProto } from "../../../../shared/night-key";
import type { Deps } from "../context";
import { buy } from "../trading/buy";
export async function approveAgentOrder(
  deps: Deps,
  user: User,
  id: string,
  token: string,
) {
  const order = deps.repo.account(user.humanId).orders.get(id);
  if (!order?.night) throw new DomainError("NOT_FOUND", "Order not found.");
  if (order.status !== AgentOrderStatus.PENDING)
    throw new DomainError("FAILED_PRECONDITION", "Order already executed.");
  if (
    !deps.ports.verifications.consume({
      token,
      userId: user.id,
      action: "approve_agent_order",
    })
  )
    throw new DomainError(
      "PERMISSION_DENIED",
      "Fresh World ID verification required.",
    );
  const execution = await buy(
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
