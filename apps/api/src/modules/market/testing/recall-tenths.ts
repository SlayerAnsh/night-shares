import type { BuyResult } from "@night-shares/market-model";
import { applyGuestBooking } from "../../inventory/mutations/apply-guest-booking";
import { reserveRecall } from "../../stay/use-cases/booking/reserve-recall";
import type { Deps } from "../use-cases/context";

export function recallTenths(d: Deps, key: string, tenths: number) {
  const take = tenths / 10;
  const route: BuyResult = {
    filled: take,
    avg: 1,
    gross: take,
    total: take,
    fee: 0,
    sellerFees: 0,
    sellerNet: take,
    fills: [{ src: "recall", take, price: 1 }],
  };
  d.ports.inventory.update(
    key,
    (before) =>
      reserveRecall(d.ports, before, route, applyGuestBooking(before, tenths))
        .next,
  );
}
