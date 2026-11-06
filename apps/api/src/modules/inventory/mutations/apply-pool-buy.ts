import type { NightRecord } from "../inventory-repo";
import { clean, quantity } from "./quantity";
export function applyPoolBuy(record: NightRecord, tenths: number): NightRecord {
  const size = quantity(tenths);
  return {
    ...record,
    state: {
      ...record.state,
      q: clean(record.state.q + size),
      held: clean(record.state.held + size),
    },
  };
}
