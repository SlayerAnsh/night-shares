import type { Ports } from "../container/ports";
import { transaction } from "../db/transaction";
export function expireAsks(ports: Ports) {
  return transaction(
    ports.db,
    () =>
      ports.db
        .query(
          "UPDATE market_signed_asks SET status = 'expired' WHERE status = 'open' AND expiry <= ?",
        )
        .run(ports.clock.now()).changes,
  );
}
