import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { type BuyResult, toMicros } from "@night-shares/market-model";
import { ExecutionSchema } from "@night-shares/proto/market/v1/book_pb";
import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { mulTenths } from "../../../../shared/money";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { type Deps, quantity } from "../context";
import { revertFills } from "../trading/revert-fills";
import { settleBuy } from "../trading/settle-buy";
import { withSettlement } from "../trading/with-settlement";
import { reserveAgentBuy } from "./reserve-buy";
export async function buyAgent(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  max: bigint,
) {
  quantity({ tenths: size });
  return withSettlement(deps, key, () =>
    executeBuy(deps, user, key, size, max),
  );
}
async function executeBuy(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  max: bigint,
) {
  const { ports } = deps;
  const marketMaker = SYSTEM_ADDRESSES.marketMaker;
  const {
    record,
    result,
    used,
    before,
    quote,
    position,
    previousAverage,
    total,
  } = reserveAgentBuy(deps, user, key, size, max);
  try {
    await settleBuy(
      deps,
      { ...user, walletAddress: agentWallets(ports.db).get(user).address },
      key,
      result,
      marketMaker,
      before.state,
    );
  } catch (error) {
    transaction(ports.db, () => {
      agentWallets(ports.db).compensate(user, total);
      ports.inventory.update(key, (current) =>
        revertFills(current, result as BuyResult, before),
      );
      const held = position.free + position.escrow;
      const cost = mulTenths(position.average, held) - total;
      position.free -= size;
      position.average =
        held === used + size
          ? previousAverage
          : held === size
            ? 0n
            : (cost * 10n) / BigInt(held - size);
    });
    throw error;
  }
  ports.activity.append({
    nightKey: key,
    propertyId: record.propertyId,
    kind: "agent_order_filled",
    actor: "agent",
    userId: user.id,
    tenths: size,
    priceMicros: toMicros(result.avg),
  });
  return create(ExecutionSchema, {
    id: ports.ids.next("ord"),
    quote,
    executedAt: timestampFromMs(ports.clock.now()),
  });
}
