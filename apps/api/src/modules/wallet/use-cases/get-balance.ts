import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../ports/wallet-provider/wallet-provider";
export function createGetBalance(deps: Pick<Ports, "walletProvider">) {
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
      balance: await provider.balance(user.walletAddress),
      walletAddress: user.walletAddress,
      onchainUsdcBalance:
        (await provider.onchainUsdcBalance?.(user.walletAddress)) ?? null,
      explorerUrl: explorer(user.walletAddress),
      systemWallets,
    };
  };
}
