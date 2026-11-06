import { transaction } from "../../../db/transaction";
import type { User } from "../../../ports/sessions/session-store";
import type { Deps } from "../use-cases/context";
import { makerNonce } from "./store";
export function cancelAllAsks({ ports }: Deps, user: User) {
  return transaction(ports.db, () => {
    const nonce = makerNonce(ports.db, user.walletAddress) + 1n;
    ports.db
      .query(
        "INSERT INTO market_maker_nonces VALUES (?, ?) ON CONFLICT(maker) DO UPDATE SET nonce = excluded.nonce",
      )
      .run(user.walletAddress, nonce);
    const cancelledCount = ports.db
      .query(
        "UPDATE market_signed_asks SET status = 'cancelled' WHERE maker = ? AND status = 'open'",
      )
      .run(user.walletAddress).changes;
    return { nonce, cancelledCount };
  });
}
