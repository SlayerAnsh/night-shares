import { assertIntegerTenths, toWholeTenths } from "../../shared/tenths";
import type { NightRecord } from "./inventory-repo";

export function wholeQuantities(record: NightRecord): NightRecord {
  if (record.returnedTenths !== undefined)
    assertIntegerTenths(record.returnedTenths);
  const state = record.state;
  return {
    ...record,
    state: {
      ...state,
      S: toWholeTenths(state.S) / 10,
      q: toWholeTenths(state.q) / 10,
      held: toWholeTenths(state.held) / 10,
      booked: toWholeTenths(state.booked) / 10,
      traderAsks: state.traderAsks.map((ask) => ({
        ...ask,
        size: toWholeTenths(ask.size) / 10,
      })),
    },
  };
}
