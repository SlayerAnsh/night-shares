import { toMicros } from "@night-shares/market-model";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { transaction } from "../../../../db/transaction";
import type {
  Attempt,
  CheckpointResult,
} from "../../../../ports/agent-pass/agent-pass";
import { CheckpointFailure } from "../../../../ports/agent-pass/failure";
import { checkpointLedger } from "../../../../ports/agent-pass/ledger.sqlite";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { fromProto } from "../../../../shared/night-key";
import { resumeChainCheckpoint } from "../../chain/checkpoint";
import { isChain } from "../../chain/runtime";
import type { Deps } from "../context";
import { reserveAgentBuy } from "./reserve-buy";
import { settleAgentBuy } from "./settle-buy";
import { checkpointSnapshot } from "./snapshot";
export async function executeCheckpoint(
  deps: Deps,
  user: User,
  attempt: Attempt,
  result: CheckpointResult,
) {
  const { ports } = deps;
  const { store } = agentPassSettings(ports);
  const outcome = transaction(ports.db, () => {
    const a = store.get(attempt.id);
    if (a?.status === "expired") throw new CheckpointFailure("expired");
    if (a?.status !== "pending" || !a.claimed || result.attemptId !== a.id)
      throw new CheckpointFailure("mismatch");
    if (ports.clock.now() >= a.expiresAt)
      throw new CheckpointFailure("expired");
    if (
      user.id !== a.userId ||
      user.level !== "orb" ||
      ports.sessions.get(a.sessionToken ?? "")?.id !== user.id
    )
      throw new CheckpointFailure("mismatch");
    const linked = store.link(user.id);
    const owner = store.owner(result.iss, result.sub);
    if (
      (linked && (linked.iss !== result.iss || linked.sub !== result.sub)) ||
      (!linked && !a.allowEnrollment) ||
      (owner && owner !== user.id)
    )
      throw new CheckpointFailure("access_denied");
    if (a.allowEnrollment) {
      if (a.orderId || linked) throw new CheckpointFailure("access_denied");
      store.enroll(user.id, result.iss, result.sub);
      a.status = "used";
      a.sessionToken = undefined;
      a.verifier = "";
      a.nonce = "";
      a.browser = undefined;
      store.save(a);
      return "approved";
    }
    if (checkpointSnapshot(deps, user, a.orderId, a.expiresAt) !== a.snapshot)
      throw new CheckpointFailure("mismatch");
    const order = deps.repo.account(user.humanId).orders.get(a.orderId);
    if (!order?.night) throw new CheckpointFailure("mismatch");
    const key = fromProto(order.night);
    // Do not interleave an atomic approval with an unsettled reservation.
    if (
      ports.db
        .query("SELECT 1 FROM market_settlements WHERE night_key = ?")
        .get(key)
    )
      throw new CheckpointFailure("access_denied");
    a.status = "approved";
    store.save(a);
    if (isChain(ports)) return "chain";
    const r = reserveAgentBuy(
      deps,
      user,
      key,
      order.size?.tenths ?? 0,
      order.budget?.micros ?? 0n,
    );
    settleAgentBuy(
      deps,
      checkpointLedger(ports),
      { ...user, walletAddress: order.walletAddress },
      key,
      r.result,
      SYSTEM_ADDRESSES.marketMaker,
      r.before.state,
    );
    order.status = AgentOrderStatus.EXECUTED;
    order.spent = r.quote.total;
    deps.repo.account(user.humanId).orders.set(order.id, order);
    ports.activity.append({
      nightKey: key,
      propertyId: r.record.propertyId,
      kind: "agent_order_filled",
      actor: "agent",
      userId: user.id,
      tenths: order.size?.tenths ?? 0,
      priceMicros: toMicros(r.result.avg),
    });
    a.status = "used";
    a.reason = "";
    a.verifier = "";
    a.nonce = "";
    a.sessionToken = undefined;
    a.browser = undefined;
    store.save(a);
    return "approved";
  });
  return outcome === "chain"
    ? resumeChainCheckpoint(deps, user, attempt.id)
    : outcome;
}
