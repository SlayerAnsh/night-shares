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

test("scheduled failures reach onError without RPC credentials", async () => {
  const { registerRpcUrls } = await import("../shared/redact-url");
  const secret = "job-rpc-secret-123456789";
  const url = `https://rpc.invalid/v2/${secret}?dkey=${secret}`;
  registerRpcUrls([url]);
  let report: (error: unknown) => void = () => {};
  const reported = new Promise<unknown>((resolve) => {
    report = resolve;
  });
  const runner = createJobRunner({
    clock: createMockClock(0),
    intervalMs: 1,
    jobs: [
      {
        name: "failure",
        async run() {
          throw new Error(`${url} ${secret}`);
        },
      },
    ],
    onError: report,
  });
  runner.start();
  try {
    const error = await reported;
    expect(error).toBeInstanceOf(AggregateError);
    expect(JSON.stringify(error)).not.toContain(secret);
  } finally {
    await runner.stop();
  }
});
