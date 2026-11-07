import { expect, test } from "bun:test";
import { buildContainer } from "../../../../container/build-container";
import { card } from "./card";

test("zero-supply draft analytics return finite protobuf values", () => {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
  });
  try {
    const record = ports.inventory.seedNight({
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: ports.clock.today(),
    });
    Object.assign(record.state, {
      S: 0,
      F: 0.01,
      q: 0,
      held: 0,
      booked: 0,
      cap: 0,
      traderAsks: [],
    });
    const result = card(ports, record);
    expect(result.stats.expectedExit?.micros).toBe(0n);
    for (const object of [result.card, result.stats])
      for (const value of Object.values(object))
        if (typeof value === "number")
          expect(Number.isFinite(value)).toBe(true);
  } finally {
    ports.db.close();
  }
});
