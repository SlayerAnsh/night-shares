import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../ports/wallet-provider/wallet-provider";
import { isChain } from "../../market/chain/runtime";
import { chainCredits } from "./chain-credits";
export function createGetBalance(
  deps: Pick<Ports, "walletProvider"> & Partial<Ports>,
) {
  return async (user: User) => {
    const provider = deps.walletProvider;
    const explorer = (address: string) =>
      provider.explorerUrl ? `${provider.explorerUrl}/address/${address}` : "";
    const systemWallets = [];
    for (const name of Object.values(SYSTEM_ADDRESSES).sort()) {
      const wallet = await provider.custody?.getWallet({
        kind: "system",
        name,
      });
      systemWallets.push({
        name,
        walletAddress: wallet?.address ?? "",
        explorerUrl: wallet ? explorer(wallet.address) : "",
      });
    }
    return {
      ...(isChain(deps as Ports)
        ? { credits: await chainCredits(deps as Ports, user) }
        : {}),
      balance: await provider.balance(user.walletAddress),
      walletAddress: user.walletAddress,
      onchainUsdcBalance:
        (await provider.onchainUsdcBalance?.(user.walletAddress)) ?? null,
      explorerUrl: explorer(user.walletAddress),
      systemWallets,
    };
  };
}
