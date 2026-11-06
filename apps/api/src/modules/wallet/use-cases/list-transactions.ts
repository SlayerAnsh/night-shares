import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
export function createListTransactions(deps: Pick<Ports, "walletProvider">) {
  return (user: User) => deps.walletProvider.transactions(user.walletAddress);
}
