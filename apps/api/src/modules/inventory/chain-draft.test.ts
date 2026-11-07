import { expect, test } from "bun:test";
import { fixture } from "../host/use-cases/fixture";
import { configureChainInventory } from "./chain-draft";
import { editAllotment } from "./mutations/edit-allotment";

test("deployment reset removes synthetic holdings and old opened projections", () => {
  const { ports, key } = fixture();
  const mock = ports.inventory.get(key);
  expect(mock.openedAt).toBeGreaterThan(0);
  ports.db
    .query("INSERT INTO chain_instances VALUES (?, ?, 1)")
    .run("fork-one", "{}");
  configureChainInventory(ports.db, "fork-one");
  const draft = ports.inventory.get(key);
  expect(draft.openedAt).toBe(0);
  expect(draft.state.held).toBe(0);
  expect(draft.state.booked).toBe(0);
  expect(draft.state.traderAsks).toEqual([]);
  expect(draft.stopped).toBe(true);
  ports.inventory.update(key, (record) => ({
    ...record,
    openedAt: 10,
    state: { ...record.state, S: 10 },
  }));
  expect(ports.inventory.get(key).openedAt).toBe(10);
  expect(() =>
    editAllotment(ports.inventory.get(key), { tenths: 100, preset: "calm" }),
  ).toThrow("allotment edits");
  ports.db.query("UPDATE chain_instances SET active = 0").run();
  ports.db
    .query("INSERT INTO chain_instances VALUES (?, ?, 1)")
    .run("fork-two", "{}");
  configureChainInventory(ports.db, "fork-two");
  expect(ports.inventory.get(key).openedAt).toBe(0);
  expect(ports.inventory.get(key).chainFingerprint).toBe("fork-two");
  ports.db.close();
});
