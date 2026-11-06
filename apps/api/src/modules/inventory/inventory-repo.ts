import type { NightState } from "@night-shares/market-model";
import type { NightIdentity } from "../../shared/night-key";
export type NightRecord = NightIdentity & {
  key: string;
  state: NightState;
  stopped: boolean;
  openedAt: number;
};
export interface InventoryRepo {
  get(key: string): NightRecord;
  seedNight(night: NightIdentity): NightRecord;
  // Domains must use update for writes so no await sits between read and save.
  update(
    key: string,
    mutate: (record: NightRecord) => NightRecord,
  ): NightRecord;
  save(record: NightRecord): void;
  list(filter?: {
    propertyId?: string;
    roomTypeId?: string;
    start?: string;
    end?: string;
  }): NightRecord[];
}
