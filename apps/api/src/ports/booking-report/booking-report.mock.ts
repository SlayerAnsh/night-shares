import type { Database } from "bun:sqlite";
import { DomainError } from "../../shared/errors/domain-error";
import type { IdGenerator } from "../ids/id-generator";
import type { DoubleSaleReport } from "./booking-report";

const adapters = new WeakMap<Database, ReturnType<typeof createAdapter>>();
function createAdapter(ids: IdGenerator) {
  const reports: DoubleSaleReport[] = [];
  return {
    async poll() {
      return reports.map((report) => ({ ...report }));
    },
    report(nightKey: string, rooms: number) {
      if (!Number.isSafeInteger(rooms) || rooms <= 0)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Report a positive number of rooms.",
        );
      const report = { id: ids.next("report"), nightKey, rooms };
      reports.push(report);
      return { ...report };
    },
  };
}
export function bookingReportFor({
  db,
  ids,
}: {
  db: Database;
  ids: IdGenerator;
}) {
  let adapter = adapters.get(db);
  if (!adapter) {
    adapter = createAdapter(ids);
    adapters.set(db, adapter);
  }
  return adapter;
}
