import type { Hex } from "viem";
import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import {
  deserialize,
  type ExecutionRequest,
} from "../../../ports/chain-executor/chain-executor";
import { syncWalkTrip } from "../../walk/repo/owed";
import { chainContext } from "./context";

/** Consume the shared, deduplicated reducer; never infer payments from host balances. */
export async function refreshChainWalkClaims(ports: Ports, userId: string) {
  if (ports.chainExecutor?.mode !== "fork") return;
  const { reader } = chainContext(ports);
  await reader.poll(1000);
  const payments = new Map<string, bigint>();
  for (const row of ports.db
    .query<{ args: string }, [string]>(
      "SELECT args FROM chain_events WHERE fingerprint = ? AND event = 'GuestClaimPaid'",
    )
    .all(reader.fingerprint)) {
    const event = deserialize<{ reportId: Hex; amount: bigint }>(row.args);
    payments.set(
      event.reportId,
      (payments.get(event.reportId) ?? 0n) + event.amount,
    );
  }
  transaction(ports.db, () => {
    for (const row of ports.db
      .query<
        { report_id: string; payload: string; owed_to_guest: bigint },
        [string, string]
      >(
        "SELECT c.report_id, c.payload, w.owed_to_guest FROM stay_chain_walks c JOIN walk_reports w ON w.id = c.report_id JOIN stay_trips t ON t.id = c.booking_id WHERE c.fingerprint = ? AND c.state = 'done' AND w.status = 'done' AND t.user_id = ?",
      )
      .all(reader.fingerprint, userId)) {
      const { request } = deserialize<{ request: ExecutionRequest }>(
        row.payload,
      );
      if (request.command.kind !== "reportWalk")
        throw new Error("Invalid walk intent.");
      const paid = payments.get(request.command.report.reportId) ?? 0n;
      if (paid > row.owed_to_guest)
        throw new Error("Chain claim payments exceed the recorded claim.");
      ports.db
        .query("UPDATE walk_reports SET owed_paid = ? WHERE id = ?")
        .run(paid, row.report_id);
      syncWalkTrip(ports.db, row.report_id);
    }
  });
}
