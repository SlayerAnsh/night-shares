import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { type Deps, syncPosition } from "../context";
export function cancelAsk(deps: Deps, user: User, askId: string) {
  const [key, owner, extra] = askId.split("|");
  if (!key || owner !== user.walletAddress || extra !== undefined)
    throw new DomainError("NOT_FOUND", "Ask not found.");
  const record = deps.ports.inventory.update(key, (current) => {
    const position = syncPosition(deps, user, current);
    if (!position.escrow) throw new DomainError("NOT_FOUND", "Ask not found.");
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
  // The shared activity vocabulary represents listing edits as ask_posted.
  deps.ports.activity.append({
    nightKey: key,
    propertyId: record.propertyId,
    kind: "ask_posted",
    actor: "trader",
    userId: user.id,
    tenths: 0,
    priceMicros: position.askPrice,
  });
  return {};
}
