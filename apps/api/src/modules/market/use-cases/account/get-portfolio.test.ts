import { expect, test } from "bun:test";
import { cutoffRefund, toMicros } from "@night-shares/market-model";
import { fixture } from "../../testing/fixture";
import { buy } from "../trading/buy";
import { getPortfolio } from "./get-portfolio";
import { postAsk } from "./post-ask";

test("portfolio values free and listed holdings and refunds all quantity independent of asks", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 10, 10n ** 12n);
  const fair = d.ports.inventory.get(d.key).state.pstar;
  const refund = toMicros(
    cutoffRefund(d.ports.inventory.get(d.key).state).perNight,
  );
  expect(getPortfolio(d, d.user).holdings[0]?.unsoldRefund?.micros).toBe(
    refund,
  );
  postAsk(d, d.user, d.key, 5, 1000000n);
  const response = getPortfolio(d, d.user);
  expect(response.holdings[0]?.size?.tenths).toBe(10);
  expect(response.holdings[0]?.value?.micros).toBe(toMicros(fair));
  expect(response.holdings[0]?.unsoldRefund?.micros).toBe(refund);
  expect(response.listings[0]?.size?.tenths).toBe(5);
});
