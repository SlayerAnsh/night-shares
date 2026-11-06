import { expect, test } from "bun:test";
import {
  TapeActor,
  TradeSide,
} from "@night-shares/proto/market/v1/analytics_pb";
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

test("tape actors distinguish caller, guests, traders, agents and sell-back", async () => {
  const d = await fixture();
  const events = [
    { kind: "guest_booked", actor: "guest", expected: TapeActor.GUEST },
    { kind: "trader_bought", actor: "trader", expected: TapeActor.TRADER },
    { kind: "trader_bought", actor: "agent", expected: TapeActor.AGENT },
    { kind: "trader_sold_back", actor: "pool", expected: TapeActor.SELL_BACK },
  ] as const;
  for (const event of events) {
    d.ports.activity.append({
      nightKey: d.key,
      propertyId: d.night.propertyId,
      kind: event.kind,
      actor: event.actor,
      userId: d.user.id,
      tenths: 1,
    });
    expect(listTape(d, d.key).prints[0]?.actor).toBe(event.expected);
    expect(listTape(d, d.key, d.user.id).prints[0]?.actor).toBe(TapeActor.YOU);
    expect(listTape(d, d.key, "another").prints[0]?.actor).toBe(event.expected);
  }
});
