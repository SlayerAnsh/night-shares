import { toJsonString } from "@bufbuild/protobuf";
import {
  AgentOrderSchema,
  AgentOrderStatus,
} from "@night-shares/proto/market/v1/portfolio_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import type { Deps } from "../context";
export function checkpointSnapshot(
  deps: Deps,
  user: User,
  orderId: string,
  expiresAt: number,
) {
  const order = deps.repo.account(user.humanId).orders.get(orderId);
  if (!order?.night) throw new DomainError("NOT_FOUND", "Order not found.");
  if (order.status !== AgentOrderStatus.PENDING || !order.requiresVerification)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Order does not need approval.",
    );
  const wallet = agentWallets(deps.ports.db).get(user);
  return JSON.stringify({
    order: toJsonString(AgentOrderSchema, order),
    maxTotal: String(order.budget?.micros ?? 0n),
    budget: String(wallet.total),
    perOrder: String(wallet.per_order),
    allowed: wallet.allowed,
    expiresAt,
  });
}
