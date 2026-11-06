import { expect, test } from "bun:test";
import { routeBuy, toMicros } from "@night-shares/market-model";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { routeNight } from "../../pricing/quote-night";
import { fixture } from "../../test-support/fixture";
import { settlement } from "./settlement";

test("rounded settlement conserves the route total", () => {
  const f = fixture();
  const route = routeNight(f.ports.inventory.get(f.key), 1);
  expect(settlement(route).reduce((s, p) => s + p.amount, 0n)).toBe(
    toMicros(route.total),
  );
});

test("seeded ask proceeds use the shared market maker address", () => {
  const route = routeBuy(
    {
      asks: [{ src: "trader", who: "mm-bot", price: 1, size: 0.5 }],
      bids: [],
      recall: 10,
    },
    0.5,
    { guest: true },
  );
  expect(settlement(route)).toContainEqual({
    to: SYSTEM_ADDRESSES.marketMaker,
    amount: 493500n,
  });
});
