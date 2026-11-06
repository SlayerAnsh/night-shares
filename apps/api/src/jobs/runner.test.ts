import { expect, test } from "bun:test";
import { createMockClock } from "../ports/clock/clock.mock";
import { createJobRunner } from "./runner";

test("explicit ticks run without starting a timer and overlapping ticks coalesce", async () => {
  const clock = createMockClock(0);
  let calls = 0;
  let finish = () => {};
  const job = {
    name: "test",
    run: () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  };
  const runner = createJobRunner({
    clock,
    jobs: [job],
    intervalMs: 60000,
    onError: () => {},
  });
  expect(calls).toBe(0);
  const first = runner.tick();
  expect(runner.tick()).toBe(first);
  finish();
  await first;
  clock.advance(60000);
  const next = runner.tick();
  finish();
  await next;
  expect(calls).toBe(2);
  await runner.stop();
});
