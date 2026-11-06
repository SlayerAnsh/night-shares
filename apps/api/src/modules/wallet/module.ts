import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import type { Ports } from "../../container/ports";
import { createGetBalance } from "./use-cases/get-balance";
import { createListTransactions } from "./use-cases/list-transactions";
import { createWalletHandler } from "./wallet.handler";
export function createWalletModule(ports: Ports) {
  return {
    service: WalletService,
    handler: createWalletHandler({
      getBalance: createGetBalance(ports),
      listTransactions: createListTransactions(ports),
    }),
  };
}
