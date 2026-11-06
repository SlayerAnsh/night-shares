import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { createSqliteHostRepo } from "../../host/repo/host-repo.sqlite";
import { createGetPayout } from "../../host/use-cases/payout/get-payout";
import { adjustCoverAccount } from "../repo/cover-accounts";
export function prepareCover(ports: Ports, host: User, holder: User) {
  const key = "prop_velana:rt_velana_0:2026-12-24";
  const repo = createSqliteHostRepo(ports);
  repo.initialize(host);
  ports.inventory.update(key, (record) => ({
    ...record,
    state: {
      ...record.state,
      F: 100,
      k: 1,
      S: 10,
      q: 1,
      held: 1,
      booked: 0,
      traderAsks: [],
    },
  }));
  ports.db
    .query("INSERT INTO market_holders VALUES (?, ?, ?)")
    .run(holder.humanId, holder.id, holder.walletAddress);
  ports.db
    .query(
      "INSERT INTO market_positions (human_id, night_key, free, average) VALUES (?, ?, 10, 100000000)",
    )
    .run(holder.humanId, key);
  const gross = createGetPayout({ ports, repo })(host.id, "prop_velana")
    .availableNow.micros;
  adjustCoverAccount(ports.db, "prop_velana", gross - 1n, 0n);
  return { key, repo, gross };
}
