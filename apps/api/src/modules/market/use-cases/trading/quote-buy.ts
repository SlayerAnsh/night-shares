import { routeBuy } from "@night-shares/market-model";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { isChain } from "../../chain/runtime";
import { cutoffAt } from "../../cutoff";
import { buyQuote } from "../../mappers/route";
import { bookOf, type Deps, quantity, syncPosition } from "../context";
import { humanWallets } from "../human-wallets";
export function quoteBuy(deps: Deps, key: string, size: number, user?: User) {
  if (isChain(deps.ports))
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain reads require the asynchronous chain market reader.",
    );
  quantity({ tenths: size });
  const record = deps.ports.inventory.get(key);
  const position = user ? syncPosition(deps, user, record) : undefined;
  return buyQuote(
    record,
    size,
    routeBuy(
      bookOf(
        deps.ports,
        record,
        user ? humanWallets(deps.ports, user, record.propertyId) : undefined,
      ),
      size / 10,
    ),
    position ? position.free + position.escrow : 0,
    cutoffAt(deps.ports, record),
  );
}
