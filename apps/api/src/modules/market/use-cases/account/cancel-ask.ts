import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { type Deps, syncPosition } from "../context";
import { humanWallets } from "../human-wallets";
export function cancelAsk(deps: Deps, user: User, askId: string) {
  return transaction(deps.ports.db, () => {
    const [key, owner, extra] = askId.split("|");
    if (!key || !owner || extra !== undefined)
      throw new DomainError("NOT_FOUND", "Ask not found.");
    const current = deps.ports.inventory.get(key);
    if (!humanWallets(deps.ports, user, current.propertyId).has(owner))
      throw new DomainError("NOT_FOUND", "Ask not found.");
    const ask = current.state.traderAsks.find((a) => a.who === owner);
    if (!ask) throw new DomainError("NOT_FOUND", "Ask not found.");
    const size = Math.round(ask.size * 10);
    const position = syncPosition(deps, user, current);
    const signed = deps.ports.db
      .query(
        "UPDATE market_signed_asks SET status = 'cancelled' WHERE night_key = ? AND maker = ?",
      )
      .run(key, owner).changes;
    if (!signed) {
      position.free += position.escrow;
      position.escrow = 0;
    }
    const record = deps.ports.inventory.update(key, (r) => ({
      ...r,
      state: {
        ...r.state,
        traderAsks: r.state.traderAsks.filter((a) => a.who !== owner),
      },
    }));
    deps.ports.activity.append({
      nightKey: key,
      propertyId: record.propertyId,
      kind: "ask_cancelled",
      actor: "trader",
      userId: user.id,
      tenths: size,
      priceMicros: position.askPrice,
    });
    return {};
  });
}
