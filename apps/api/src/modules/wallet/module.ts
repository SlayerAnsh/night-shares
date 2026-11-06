import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import type { Ports } from "../../container/ports";
export function createWalletModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof WalletService> = {
    getBalance: notBuiltYet,
    listTransactions: notBuiltYet,
  };
  return { service: WalletService, handler };
}
