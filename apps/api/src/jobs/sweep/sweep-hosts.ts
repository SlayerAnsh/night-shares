import type { Ports } from "../../container/ports";
import { createSqliteHostRepo } from "../../modules/host/repo/host-repo.sqlite";
import { createSweep } from "../../modules/host/use-cases/payout/sweep";

export async function sweepHosts(ports: Ports) {
  const sweep = createSweep({ ports, repo: createSqliteHostRepo(ports) });
  const owners = ports.db
    .query<
      { property_id: string; user_id: string; wallet_address: string },
      []
    >(
      "SELECT o.property_id, o.user_id, u.wallet_address FROM host_owners o JOIN identity_users u ON u.id = o.user_id",
    )
    .all();
  for (const owner of owners) {
    await sweep(owner.user_id, owner.property_id, owner.wallet_address);
  }
}
