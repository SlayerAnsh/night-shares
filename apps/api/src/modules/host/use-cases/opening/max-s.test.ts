import { expect, test } from "bun:test";
import { assertMaxSupply } from "../../max-s";
import { fixture } from "../fixture";

test("100 rooms are allowed and 101 rooms are rejected", () => {
  expect(() => assertMaxSupply(1000)).not.toThrow();
  expect(() => assertMaxSupply(1010)).toThrow(
    "100 rooms per night and room type",
  );
});
test("opening and editing reject supply above 100 rooms before publishing", () => {
  const f = fixture();
  const get = f.ports.catalog.get.bind(f.ports.catalog);
  f.ports.catalog.get = (id) => {
    const p = get(id);
    return p ? { ...p, rooms: 202 } : p;
  };
  for (const openedAt of [0, 1]) {
    f.ports.inventory.update(f.key, (r) => ({ ...r, openedAt }));
    expect(() => f.use.openNights(f.userId, f.selection)).toThrow(
      "100 rooms per night and room type",
    );
  }
  f.ports.db.close();
});
