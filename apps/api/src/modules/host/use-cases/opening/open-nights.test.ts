import { expect, test } from "bun:test";
import { fixture } from "../fixture";

test("open nights reject changes to price and room count", () => {
  const f = fixture();
  const before = f.ports.inventory.get(f.key);
  f.selection.allotmentPercent = 10;
  expect(() => f.use.openNights(f.userId, f.selection)).toThrow(
    "Price and room count are fixed once a night is open.",
  );
  expect(f.ports.inventory.get(f.key)).toEqual(before);
});
test("opening an unopened night mints all supply to NightVault", async () => {
  const f = fixture();
  f.ports.inventory.update(f.key, (r) => ({
    ...r,
    openedAt: 0,
    stopped: true,
  }));
  await f.use.openNights(f.userId, f.selection);
  const night = f.ports.inventory.get(f.key);
  expect(night.stopped).toBe(false);
  expect(
    f.ports.db
      .query(
        "SELECT owner, minted_tenths FROM host_pool_positions WHERE night_key = ?",
      )
      .get(f.key),
  ).toEqual({
    owner: "night_vault",
    minted_tenths: BigInt(Math.round(night.state.S * 10)),
  });
});
