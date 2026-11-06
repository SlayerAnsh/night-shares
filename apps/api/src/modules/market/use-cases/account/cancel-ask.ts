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
    const record = deps.ports.inventory.update(key, (current) => {
      if (!humanWallets(deps.ports, user, current.propertyId).has(owner))
        throw new DomainError("NOT_FOUND", "Ask not found.");
      const position = syncPosition(deps, user, current);
      if (!position.escrow)
        throw new DomainError("NOT_FOUND", "Ask not found.");
      return {
        ...current,
        state: {
          ...current.state,
          traderAsks: current.state.traderAsks.filter((a) => a.who !== owner),
        },
      };
    });
    const position = deps.repo.position(user.humanId, key);
    const size = position.escrow;
    position.free += size;
    position.escrow = 0;
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
