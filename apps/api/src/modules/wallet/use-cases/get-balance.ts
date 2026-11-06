import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
export function createGetBalance(deps: Pick<Ports, "walletProvider">) {
  return async (user: User) => ({
    balance: await deps.walletProvider.balance(user.walletAddress),
    walletAddress: user.walletAddress,
  });
}
