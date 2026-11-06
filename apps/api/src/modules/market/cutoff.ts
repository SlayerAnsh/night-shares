import { ReleasePolicy } from "@night-shares/proto/host/v1/opening_pb";
import type { Ports } from "../../container/ports";
import { parseDate } from "../../shared/dates";
import type { NightRecord } from "../inventory/inventory-repo";

// Match the host calendar's UTC representation until catalog timezone data exists.
export function cutoffAt(ports: Ports, record: NightRecord): number {
  if (record.cutoffAt !== undefined) return record.cutoffAt;
  const row = ports.db
    .query<{ release_policy: bigint }, [string]>(
      "SELECT release_policy FROM host_releases WHERE night_key = ?",
    )
    .get(record.key);
  const policy = Number(row?.release_policy ?? ReleasePolicy.ARRIVAL_14);
  const hours =
    policy === ReleasePolicy.DAY_BEFORE_18
      ? -6
      : policy === ReleasePolicy.THREE_DAYS_BEFORE_12
        ? -60
        : 14;
  return parseDate(record.date) + hours * 3_600_000;
}
