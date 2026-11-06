import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { HostDeps } from "../deps";
import { createGetPayout } from "./get-payout";
export function createWithdraw(deps: HostDeps) {
  const payout = createGetPayout(deps);
  return async (user: User, propertyId: string, amount?: bigint) => {
    const withdrawn = transaction(deps.ports.db, () => {
      deps.repo.initialize(user);
      const available = payout(user.id, propertyId).availableNow.micros;
      const withdrawn = amount ?? available;
      if (withdrawn <= 0n || withdrawn > available)
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Choose an amount within your available payout.",
        );
      // Reserve before awaiting the transfer so concurrent withdrawals cannot spend twice.
      deps.repo.addWithdrawal(propertyId, withdrawn);
      return withdrawn;
    });
    let transactionId: string;
    try {
      [transactionId = ""] = await deps.ports.walletProvider.settle([
        {
          from: SYSTEM_ADDRESSES.pool,
          to: user.walletAddress,
          amount: withdrawn,
          memo: `Host payout for ${propertyId}`,
        },
      ]);
    } catch (error) {
      deps.repo.addWithdrawal(propertyId, -withdrawn);
      throw error;
    }
    return {
      transactionId,
      withdrawn: { micros: withdrawn },
      payout: payout(user.id, propertyId),
    };
  };
}
