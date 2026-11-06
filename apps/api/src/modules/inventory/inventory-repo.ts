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
  save(record: NightRecord): void;
  list(filter?: {
    propertyId?: string;
    roomTypeId?: string;
    start?: string;
    end?: string;
  }): NightRecord[];
}
