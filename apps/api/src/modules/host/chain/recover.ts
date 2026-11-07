import type { Ports } from "../../../container/ports";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import { createSqliteHostRepo } from "../repo/host-repo.sqlite";
import { chainPorts } from "./execute";
import { openChainNights } from "./open";

/** Task 5 can retry the original immutable opening and its PMS outbox after restart. */
export async function recoverHostOpenings(ports: Ports) {
  if (ports.chainExecutor?.mode !== "chain") return;
  const { reader } = chainPorts(ports);
  const deps = { ports, repo: createSqliteHostRepo(ports) };
  const rows = ports.db
    .query<{ user_id: string; payload: string }, [string]>(
      "SELECT user_id, payload FROM host_chain_openings WHERE fingerprint = ? AND status IN ('pending', 'pms_pending')",
    )
    .all(reader.fingerprint);
  const failures: unknown[] = [];
  for (const row of rows) {
    const payload = deserialize<{
      plan: Parameters<typeof openChainNights>[2][number];
    }>(row.payload);
    try {
      await openChainNights(deps, row.user_id, [payload.plan]);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}
