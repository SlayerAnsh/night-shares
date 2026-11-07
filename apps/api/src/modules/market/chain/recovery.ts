import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { Deps } from "../use-cases/context";
import { cancelChainAsks } from "./asks";
import { chainMarket, confirmed } from "./runtime";
import { executeChainTrade } from "./trading";

/** Task 5 can invoke this after journal recovery; all operations retain their original IDs. */
export async function recoverChainMarket(deps: Deps) {
  const { reader, executor, custody } = chainMarket(deps.ports);
  await reader.assertCurrent();
  const errors: unknown[] = [];
  const rows = deps.ports.db
    .query<
      {
        id: string;
        wallet_id: string;
        request: string;
        state: string;
        agent: bigint;
      },
      [string]
    >(
      "SELECT * FROM market_chain_intents WHERE fingerprint = ? AND (state = 'pending' OR (agent = 1 AND state = 'finalized'))",
    )
    .all(reader.fingerprint);
  for (const row of rows) {
    try {
      const request = deserialize<{
        kind: string;
        key: string;
        size: number;
        limit: bigint;
        agent: boolean;
        user: User;
      }>(row.request);
      if (request.kind === "transfer") {
        const result = await executor.recover(row.id);
        if (result.state === "reverted")
          deps.ports.db
            .query(
              "UPDATE market_chain_intents SET state = 'reverted' WHERE id = ?",
            )
            .run(row.id);
        confirmed(result);
        deps.ports.db
          .query(
            "UPDATE market_chain_intents SET state = 'finalized' WHERE id = ?",
          )
          .run(row.id);
        continue;
      }
      if (request.kind !== "buy" && request.kind !== "sell") continue;
      const orderId = row.id.startsWith("agent-order:")
        ? row.id.slice("agent-order:".length)
        : undefined;
      const order = orderId
        ? deps.repo.account(request.user.humanId).orders.get(orderId)
        : undefined;
      if (
        row.state === "finalized" &&
        (!order || order.status === AgentOrderStatus.EXECUTED)
      )
        continue;
      const wallet = await custody.resolveWallet?.(row.wallet_id);
      if (!wallet) throw new Error("Recovery custody wallet is unavailable.");
      const execution = await executeChainTrade(
        deps,
        request.user,
        request.key,
        request.size,
        request.limit,
        request.kind,
        { wallet, agent: request.agent, operationId: row.id },
      );
      if (order) {
        order.status = AgentOrderStatus.EXECUTED;
        order.spent = execution.quote?.total;
        deps.repo.account(request.user.humanId).orders.set(order.id, order);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  const cancellations = deps.ports.db
    .query<
      { wallet_id: string; target: string | null; user: string },
      [string]
    >(
      "SELECT * FROM market_chain_cancellations WHERE fingerprint = ? AND state = 'pending'",
    )
    .all(reader.fingerprint);
  for (const row of cancellations) {
    try {
      const wallet = await custody.resolveWallet?.(row.wallet_id);
      if (!wallet)
        throw new Error("Cancellation custody wallet is unavailable.");
      await cancelChainAsks(
        deps,
        deserialize<User>(row.user),
        row.target ?? undefined,
        wallet,
      );
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      "Market operations require reconciliation.",
    );
}
