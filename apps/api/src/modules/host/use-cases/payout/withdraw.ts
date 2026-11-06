import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import {
  adjustCoverAccount,
  coverAccount,
} from "../../../double-sale/repo/cover-accounts";
import type { HostDeps } from "../deps";
import { createGetPayout } from "./get-payout";
export function createWithdraw(deps: HostDeps) {
  const payout = createGetPayout(deps);
  const grossPayout = createGetPayout(deps, false);
  return async (user: User, propertyId: string, amount?: bigint) => {
    const { withdrawn, debt } = transaction(deps.ports.db, () => {
      deps.repo.initialize(user);
      const available = payout(user.id, propertyId).availableNow.micros;
      if (
        deps.ports.db
          .query(
            `SELECT 1 FROM double_sale_reports r JOIN inventory i ON i.night_key = r.night_key WHERE i.property_id = ? AND r.status = 'pending'`,
          )
          .get(propertyId)
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Cover settlement is in progress.",
        );
      const outstanding = coverAccount(deps.ports.db, propertyId).debt;
      const gross = grossPayout(user.id, propertyId).availableNow.micros;
      let debt = outstanding;
      if (debt > gross) debt = gross;
      const withdrawn = amount ?? available;
      if (
        withdrawn < 0n ||
        withdrawn > available ||
        (withdrawn === 0n && (amount !== undefined || debt === 0n))
      )
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Choose an amount within your available payout.",
        );
      // Reserve before awaiting the transfer so concurrent withdrawals cannot spend twice.
      adjustCoverAccount(deps.ports.db, propertyId, debt, -debt);
      deps.repo.addWithdrawal(propertyId, withdrawn);
      return { withdrawn, debt };
    });
    let transactionId: string;
    try {
      [transactionId = ""] = await deps.ports.walletProvider.settle(
        [
          {
            from: SYSTEM_ADDRESSES.pool,
            to: user.walletAddress,
            amount: withdrawn,
            memo: `Host payout for ${propertyId}`,
          },
          ...(debt > 0n
            ? [
                {
                  from: SYSTEM_ADDRESSES.pool,
                  to: SYSTEM_ADDRESSES.coverFund,
                  amount: debt,
                  memo: "Host debt repayment",
                },
              ]
            : []),
        ].filter((leg) => leg.amount > 0n),
      );
    } catch (error) {
      transaction(deps.ports.db, () => {
        deps.repo.addWithdrawal(propertyId, -withdrawn);
        adjustCoverAccount(deps.ports.db, propertyId, -debt, debt);
      });
      throw error;
    }
    return {
      transactionId,
      withdrawn: { micros: withdrawn },
      payout: payout(user.id, propertyId),
    };
  };
}
