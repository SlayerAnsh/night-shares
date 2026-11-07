import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { isChain } from "../../market/chain/runtime";
import { chainTransactions } from "./chain-transactions";
export function createListTransactions(
  deps: Pick<Ports, "walletProvider"> & Partial<Ports>,
) {
  return (user: User) =>
    isChain(deps as Ports)
      ? chainTransactions(deps as Ports, user)
      : deps.walletProvider.transactions(user.walletAddress);
}
