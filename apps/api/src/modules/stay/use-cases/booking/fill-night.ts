import { type BuyResult, toTenths } from "@night-shares/market-model";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { applyGuestBooking } from "../../../inventory/mutations/apply-guest-booking";
import { applyPoolBuy } from "../../../inventory/mutations/apply-pool-buy";
import { applyTraderAskFill } from "../../../inventory/mutations/apply-trader-ask-fill";
export function fillNight(
  record: NightRecord,
  route: BuyResult,
  rooms: number,
) {
  if (record.released)
    throw new DomainError("FAILED_PRECONDITION", "This night has closed.");
  let next = record;
  for (const fill of route.fills) {
    if (fill.src === "pool") next = applyPoolBuy(next, toTenths(fill.take));
    if (fill.src === "trader") {
      const index = next.state.traderAsks.findIndex(
        (a) => a.who === fill.who && a.price === fill.price,
      );
      next = applyTraderAskFill(next, index, toTenths(fill.take));
    }
  }
  if (toTenths(next.state.held) < rooms * 10)
    throw new DomainError("FAILED_PRECONDITION", "Not enough rooms available.");
  return applyGuestBooking(next, rooms * 10);
}
