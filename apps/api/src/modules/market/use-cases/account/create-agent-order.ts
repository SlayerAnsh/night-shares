import { create } from "@bufbuild/protobuf";
import {
  AgentOrderSchema,
  AgentOrderStatus,
} from "@night-shares/proto/market/v1/portfolio_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { toProto } from "../../../../shared/night-key";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { buyAgent } from "../agent/buy";
import type { Deps } from "../context";
import { quoteBuy } from "../trading/quote-buy";
export async function createAgentOrder(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  budget: bigint,
) {
  if (budget <= 0n)
    throw new DomainError("INVALID_ARGUMENT", "Budget must be positive.");
  const quote = quoteBuy(deps, key, size, user);
  if (quote.filled?.tenths !== size)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Not enough trader liquidity.",
    );
  const total = quote.total?.micros ?? 0n;
  if (total > budget)
    throw new DomainError("FAILED_PRECONDITION", "Order exceeds budget.");
  agentWallets(deps.ports.db).check(user, key, total);
  const order = create(AgentOrderSchema, {
    id: deps.ports.ids.next("ord"),
    night: toProto(key),
    size: { tenths: size },
    budget: { micros: budget },
    spent: { micros: 0n },
    walletAddress: agentWallets(deps.ports.db).get(user).address,
    status: AgentOrderStatus.PENDING,
    requiresVerification: total > 1_000_000_000n,
  });
  if (!order.requiresVerification) {
    // Agent purchases share the human position and per-night cap.
    const execution = await buyAgent(
      deps,
      user,
      key,
      size,
      budget < 1_000_000_000n ? budget : 1_000_000_000n,
    );
    order.status = AgentOrderStatus.EXECUTED;
    order.spent = execution.quote?.total;
  }
  deps.repo.account(user.humanId).orders.set(order.id, order);
  return { order: structuredClone(order) };
}
