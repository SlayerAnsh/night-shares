import { expect, test } from "bun:test";
import { fixture } from "../testing/fixture";
import { postAsk } from "../use-cases/account/post-ask";
import { createMemoryMarketRepo } from "./market-repo.memory";

test("position adapters and SQLite reject fractional tenths", async () => {
  const d = await fixture();
  try {
    for (const repo of [d.repo, createMemoryMarketRepo()]) {
      const p = repo.position(d.user.humanId, d.key);
      for (const field of ["free", "escrow"] as const) {
        expect(() => {
          p[field] = 1.5;
        }).toThrow();
        expect(p[field]).toBe(0);
      }
    }
    expect(() =>
      d.ports.db.query("UPDATE market_positions SET free = 1.5").run(),
    ).toThrow("CHECK");
    d.repo.position(d.user.humanId, d.key).free = 3;
    postAsk(d, d.user, d.key, 3, 1000000n);
    for (const field of ["size", "remaining"])
      expect(() =>
        d.ports.db.query(`UPDATE market_signed_asks SET ${field} = 1.5`).run(),
      ).toThrow("CHECK");
  } finally {
    d.ports.db.close();
  }
});

test("inventory rejects fractional asks and holdings without changing stored state", async () => {
  const d = await fixture();
  try {
    const before = d.ports.inventory.get(d.key);
    for (const field of ["S", "q", "held", "booked"] as const)
      expect(() =>
        d.ports.inventory.update(d.key, (r) => ({
          ...r,
          state: { ...r.state, [field]: 0.15 },
        })),
      ).toThrow("whole tenths");
    expect(() =>
      d.ports.inventory.update(d.key, (r) => ({
        ...r,
        state: {
          ...r.state,
          traderAsks: [{ who: "mm-bot", price: 1, size: 0.15 }],
        },
      })),
    ).toThrow("whole tenths");
    expect(d.ports.inventory.get(d.key)).toEqual(before);
  } finally {
    d.ports.db.close();
  }
});
