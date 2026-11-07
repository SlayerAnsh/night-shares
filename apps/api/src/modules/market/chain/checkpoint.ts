import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { agentPassSettings } from "../../../ports/agent-pass/settings";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { fromProto } from "../../../shared/night-key";
import { buyAgent } from "../use-cases/agent/buy";
import type { Deps } from "../use-cases/context";
export async function resumeChainCheckpoint(
  deps: Deps,
  user: User,
  id: string,
) {
  const { store } = agentPassSettings(deps.ports);
  const a = store.get(id);
  if (!a || a.userId !== user.id || a.status !== "approved")
    throw new DomainError(
      "PERMISSION_DENIED",
      "Checkpoint approval is unavailable.",
    );
  const order = deps.repo.account(user.humanId).orders.get(a.orderId);
  if (!order?.night) throw new DomainError("NOT_FOUND", "Order not found.");
  try {
    const execution = await buyAgent(
      deps,
      user,
      fromProto(order.night),
      order.size?.tenths ?? 0,
      order.budget?.micros ?? 0n,
      `agent-order:${order.id}`,
      order.walletAddress,
    );
    deps.ports.db.transaction(() => {
      order.status = AgentOrderStatus.EXECUTED;
      order.spent = execution.quote?.total;
      deps.repo.account(user.humanId).orders.set(order.id, order);
      a.status = "used";
      a.reason = "";
      a.verifier = "";
      a.nonce = "";
      a.sessionToken = undefined;
      a.browser = undefined;
      store.save(a);
    })();
    return "approved";
  } catch (error) {
    const intent = deps.ports.db
      .query<{ state: string }, [string]>(
        "SELECT state FROM market_chain_intents WHERE id = ?",
      )
      .get(`agent-order:${order.id}`);
    a.reason =
      intent?.state === "reverted" ? "execution_reverted" : "execution_pending";
    // Proof is consumed once; the authorized immutable order can be resumed without replaying OIDC.
    if (intent?.state === "reverted") a.status = "denied";
    store.save(a);
    throw error;
  }
}
