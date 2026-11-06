import { expect, test } from "bun:test";
import { TradeSide } from "@night-shares/proto/market/v1/analytics_pb";
import { fixture } from "../../testing/fixture";
import { listTape } from "./list-tape";

test("tape returns last 40 trade prints and filters listing activity", async () => {
  const d = await fixture();
  for (let i = 0; i < 45; i++)
    d.ports.activity.append({
      nightKey: d.key,
      propertyId: d.night.propertyId,
      kind: "trader_sold_back",
      actor: "pool",
      tenths: 1,
      priceMicros: BigInt(i),
    });
  d.ports.activity.append({
    nightKey: d.key,
    propertyId: d.night.propertyId,
    kind: "ask_posted",
    actor: "trader",
    tenths: 1,
  });
  const result = listTape(d, d.key);
  expect(result.prints).toHaveLength(40);
  expect(result.prints[0]?.price.micros).toBe(44n);
  expect(result.prints[0]?.side).toBe(TradeSide.SELL);
});
