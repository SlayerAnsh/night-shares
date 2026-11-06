import { expect, test } from "bun:test";
import { toMicros } from "@night-shares/market-model";
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
