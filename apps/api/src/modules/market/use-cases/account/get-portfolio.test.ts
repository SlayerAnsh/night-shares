import { expect, test } from "bun:test";
import { toMicros, unsoldRefund } from "@night-shares/market-model";
import { fixture } from "../../testing/fixture";
import { buy } from "../trading/buy";
import { getPortfolio } from "./get-portfolio";
import { postAsk } from "./post-ask";

test("portfolio values free and listed holdings and only refunds parked quantity", async () => {
  const d = await fixture();
  await buy(d, d.user, d.key, 10, 10n ** 12n);
  const fair = d.ports.inventory.get(d.key).state.pstar;
  expect(getPortfolio(d, d.user).holdings[0]?.unsoldRefund?.micros).toBe(0n);
  postAsk(d, d.user, d.key, 5, 1000000n);
  const response = getPortfolio(d, d.user);
  expect(response.holdings[0]?.size?.tenths).toBe(10);
  expect(response.holdings[0]?.value?.micros).toBe(toMicros(fair));
  expect(response.holdings[0]?.unsoldRefund?.micros).toBe(
    toMicros(unsoldRefund(1, fair)) / 2n,
  );
  expect(response.listings[0]?.size?.tenths).toBe(5);
});
