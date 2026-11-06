import type { ServiceImpl } from "@connectrpc/connect";
import type { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import { requireUser } from "../../server/auth-context";
import { toTransaction } from "./mappers/transaction";
import type { createGetBalance } from "./use-cases/get-balance";
import type { createListTransactions } from "./use-cases/list-transactions";
export function createWalletHandler(cases: {
  getBalance: ReturnType<typeof createGetBalance>;
  listTransactions: ReturnType<typeof createListTransactions>;
}): ServiceImpl<typeof WalletService> {
  return {
    async getBalance(_req, ctx) {
      const result = await cases.getBalance(requireUser(ctx));
      return {
        balance: { micros: result.balance },
        walletAddress: result.walletAddress,
      };
    },
    async listTransactions(_req, ctx) {
      return {
        transactions: (await cases.listTransactions(requireUser(ctx))).map(
          toTransaction,
        ),
      };
    },
  };
}
