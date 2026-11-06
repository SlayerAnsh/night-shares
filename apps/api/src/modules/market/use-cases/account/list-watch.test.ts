import { expect, test } from "bun:test";
import { fixture } from "../../testing/fixture";
import { listWatch } from "./list-watch";
import { toggleWatch } from "./toggle-watch";

test("watch lists stay isolated by human", async () => {
  const d = await fixture();
  toggleWatch(d, d.user, d.key);
  expect(listWatch(d, d.user).nights[0]?.night?.date).toBe(d.night.date);
  expect(listWatch(d, { ...d.user, humanId: "another" }).nights).toHaveLength(
    0,
  );
});
