import type { Database } from "bun:sqlite";
import type { IdGenerator } from "../ids/id-generator";
import type { WalkReport } from "./booking-report";

const adapters = new WeakMap<Database, ReturnType<typeof createAdapter>>();
function createAdapter(ids: IdGenerator) {
  const reports: WalkReport[] = [];
  return {
    async poll() {
      return reports.map((report) => ({ ...report }));
    },
    report(input: Omit<WalkReport, "id">) {
      const report = { ...input, id: ids.next("report") };
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
