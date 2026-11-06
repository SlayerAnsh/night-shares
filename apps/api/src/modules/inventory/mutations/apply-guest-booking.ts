import type { NightRecord } from "../inventory-repo";
import { clean, quantity } from "./quantity";
// Apply pool fills first. Booking burns acquired holdings, including recalled holdings.
export function applyGuestBooking(
  record: NightRecord,
  tenths: number,
): NightRecord {
  const size = quantity(tenths);
  return {
    ...record,
    state: {
      ...record.state,
      booked: clean(record.state.booked + size),
      held: clean(record.state.held - size),
    },
  };
}
