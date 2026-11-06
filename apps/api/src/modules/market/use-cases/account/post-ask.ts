import { create } from "@bufbuild/protobuf";
import { recallStrike, toMicros } from "@night-shares/market-model";
import { AskSchema } from "@night-shares/proto/market/v1/book_pb";
import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { toProto } from "../../../../shared/night-key";
import { assertOpen, type Deps, syncPosition } from "../context";
import { humanWallets } from "../human-wallets";
export function postAsk(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  price: bigint,
) {
  return transaction(deps.ports.db, () => {
    if (price <= 0n)
      throw new DomainError("INVALID_ARGUMENT", "Ask price must be positive.");
    const record = deps.ports.inventory.update(key, (current) => {
      assertOpen(deps.ports, current);
      const position = syncPosition(deps, user, current);
      if (size > position.free + position.escrow)
        throw new DomainError("FAILED_PRECONDITION", "Not enough room nights.");
      const wallets = humanWallets(deps.ports, user, current.propertyId);
      const traderAsks = current.state.traderAsks.filter(
        (a) => !wallets.has(a.who ?? ""),
      );
      traderAsks.push({
        who: user.walletAddress,
        size: size / 10,
        price: Number(price) / 1e6,
      });
      return { ...current, state: { ...current.state, traderAsks } };
    });
    const position = deps.repo.position(user.humanId, key);
    position.free += position.escrow - size;
    position.escrow = size;
    position.askPrice = price;
    deps.ports.activity.append({
      nightKey: key,
      propertyId: record.propertyId,
      kind: "ask_posted",
      actor: "trader",
      userId: user.id,
      tenths: size,
      priceMicros: price,
    });
    return {
      ask: create(AskSchema, {
        id: `${key}|${user.walletAddress}`,
        night: toProto(key),
        size: { tenths: size },
        price: { micros: price },
      }),
      isAboveTwiceFair: price > 2n * toMicros(record.state.pstar),
      isAboveRecallCap:
        price > toMicros(recallStrike(record.state.F, record.state.k)),
    };
  });
}
