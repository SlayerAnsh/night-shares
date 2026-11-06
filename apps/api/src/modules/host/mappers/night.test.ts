import { expect, test } from "bun:test";
import { fixture } from "../use-cases/fixture";
import { guestMicros } from "./night";

for (const held of [0, 0.1, 1]) {
  test(`guest price recalls at most ${held} held rooms`, () => {
    const { ports, key } = fixture();
    try {
      const record = ports.inventory.get(key);
      record.state = {
        ...record.state,
        F: 100,
        k: 0,
        S: 10,
        q: held,
        booked: 0,
        held,
        traderAsks: [],
      };
      // The displayed book has eight 0.1-room pool asks at $100 and a $125 recall cap.
      const expected =
        held === 0 ? 81040000n : held === 0.1 ? 93702500n : 106365000n;
      expect(guestMicros(record)).toBe(expected);
    } finally {
      ports.db.close();
    }
  });
}
