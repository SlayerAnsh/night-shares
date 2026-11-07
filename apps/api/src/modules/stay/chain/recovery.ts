import type { CreateBookingRequest } from "@night-shares/proto/stay/v1/stay_pb";
import type { Ports } from "../../../container/ports";
import type { WalkReport } from "../../../ports/booking-report/booking-report";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import { reportOnChain } from "../../walk/use-cases/chain-report";
import { createSqliteStayRepo } from "../repo/stay-repo.sqlite";
import { bookOnChain } from "./book";
import { chainContext } from "./context";

/** Task 5 can invoke this after executor recovery, including on process restart. */
export async function recoverStayChain(ports: Ports) {
  const { reader } = chainContext(ports);
  const repo = createSqliteStayRepo(ports.db);
  const errors: unknown[] = [];
  for (const row of ports.db
    .query<{ payload: string }, [string]>(
      "SELECT payload FROM stay_chain_bookings WHERE fingerprint = ? AND state != 'reverted' AND (state != 'booked' OR pms_synced = 0)",
    )
    .all(reader.fingerprint)) {
    const payload = deserialize<{ input: CreateBookingRequest; user: User }>(
      row.payload,
    );
    try {
      await bookOnChain(ports, repo, payload.input, payload.user);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const row of ports.db
    .query<{ payload: string }, [string]>(
      "SELECT payload FROM stay_chain_walks WHERE fingerprint = ? AND state = 'reserved'",
    )
    .all(reader.fingerprint)) {
    const payload = deserialize<{ report: WalkReport }>(row.payload);
    try {
      await reportOnChain(ports, repo, payload.report);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Stay chain recovery remains pending.");
}
