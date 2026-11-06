import { expect, test } from "bun:test";
import { openDatabase } from "../db/open-database";
import { createReadiness } from "./readiness";

test("readiness requires reachable database and every migration", () => {
  const db = openDatabase(":memory:");
  const ready = createReadiness(db);
  expect(ready()).toBe(true);
  db.exec("DELETE FROM schema_migrations WHERE version = 1");
  expect(ready()).toBe(false);
  db.close();
  expect(ready()).toBe(false);
});
