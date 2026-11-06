import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { toggleWatch } from "./toggle-watch";

test("watch toggles on and off", async () => {
  const d = await fixture();
  expect(toggleWatch(d, d.user, d.key).isWatched).toBe(true);
  expect(toggleWatch(d, d.user, d.key).isWatched).toBe(false);
});
