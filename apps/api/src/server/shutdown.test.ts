import { expect, test } from "bun:test";
import { createLogger } from "./logging/logger";
import { createShutdown } from "./shutdown";

test("shutdown stops admission and waits for requests and hooks before closing SQLite", async () => {
  const events: string[] = [];
  let finishRequest = () => {};
  let finishHook = () => {};
  const request = new Promise<void>((resolve) => {
    finishRequest = resolve;
  });
  const hook = new Promise<void>((resolve) => {
    finishHook = resolve;
  });
  const shutdown = createShutdown({
    server: {
      beginShutdown: () => {
        events.push("draining");
      },
      close: (callback) => {
        events.push("close");
        callback?.();
        return undefined as never;
      },
      closeIdleConnections: () => {},
      closeAllConnections: () => {
        events.push("force");
      },
      drain: () => request,
    },
    hooks: [
      () => {
        events.push("hook");
        return hook;
      },
    ],
    closeDatabase: () => {
      events.push("db");
    },
    logger: createLogger("silent"),
    timeoutMs: 1000,
    exit: () => {
      events.push("exit");
    },
  });
  const first = shutdown();
  expect(shutdown()).toBe(first);
  expect(events).toEqual(["draining", "close", "hook"]);
  finishRequest();
  await Promise.resolve();
  expect(events).not.toContain("db");
  finishHook();
  await first;
  expect(events).toEqual(["draining", "close", "hook", "db"]);
});

test("shutdown deadline forces stalled work to stop and closes SQLite once", async () => {
  const events: string[] = [];
  const shutdown = createShutdown({
    server: {
      beginShutdown: () => {},
      close: () => undefined as never,
      closeIdleConnections: () => {},
      closeAllConnections: () => {
        events.push("force");
      },
      drain: () => new Promise(() => {}),
    },
    hooks: [() => new Promise(() => {})],
    closeDatabase: () => {
      events.push("db");
    },
    logger: createLogger("silent"),
    timeoutMs: 1,
    exit: (code) => {
      events.push(`exit:${code}`);
    },
  });
  await shutdown();
  expect(events).toEqual(["force", "db", "exit:1"]);
});
