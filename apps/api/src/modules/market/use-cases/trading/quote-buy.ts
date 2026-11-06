import { routeBuy } from "@night-shares/market-model";
import type { User } from "../../../../ports/sessions/session-store";
import { buyQuote } from "../../mappers/route";
import { bookOf, type Deps, syncPosition } from "../context";
export function quoteBuy(deps: Deps, key: string, size: number, user?: User) {
  const record = deps.ports.inventory.get(key);
  const position = user ? syncPosition(deps, user, record) : undefined;
  return buyQuote(
    record,
    size,
    routeBuy(bookOf(deps.ports, record, user?.walletAddress), size / 10),
    position ? position.free + position.escrow : 0,
  );
}
