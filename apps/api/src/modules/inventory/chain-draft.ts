import type { Database } from "bun:sqlite";
import type { NightRecord } from "./inventory-repo";

const deployments = new WeakMap<Database, string | undefined>();

export function configureChainInventory(db: Database, fingerprint?: string) {
  deployments.set(db, fingerprint);
}

/** Catalog fixtures are presentation data, never evidence of chain inventory. */
export function chainDraft(db: Database, record: NightRecord): NightRecord {
  const fingerprint = deployments.get(db);
  if (!fingerprint || record.chainFingerprint === fingerprint) return record;
  return {
    ...record,
    chainFingerprint: fingerprint,
    openedAt: 0,
    stopped: true,
    released: false,
    cutoffAt: undefined,
    returnedTenths: undefined,
    state: {
      ...record.state,
      F: 0.01,
      S: 0,
      q: 0,
      held: 0,
      booked: 0,
      cap: 0,
      traderAsks: [],
      cutoffPaid: undefined,
    },
  };
}
