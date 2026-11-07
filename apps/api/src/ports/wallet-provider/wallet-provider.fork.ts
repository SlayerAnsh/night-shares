import { getAddress } from "viem";
import type { ChainReader } from "../chain-reader/chain-reader";
import type { WalletCustody } from "../wallet-custody/wallet-custody";
import type { WalletProvider } from "./wallet-provider";
export function createForkWalletProvider(
  custody: WalletCustody,
  reader: ChainReader,
): WalletProvider {
  const unsupported = async (): Promise<never> => {
    throw new Error(
      "Chain financial operations require ChainExecutor intent and operation ID.",
    );
  };
  return {
    custody,
    async linkWallet(humanId) {
      return (await custody.createWallet({ kind: "user", humanId })).address;
    },
    async balance(address) {
      return (await reader.cash(getAddress(address))).value.usdc;
    },
    async onchainUsdcBalance(address) {
      return (await reader.cash(getAddress(address))).value.usdc;
    },
    settle: unsupported,
    transfer: unsupported,
    transactions: unsupported,
  };
}
