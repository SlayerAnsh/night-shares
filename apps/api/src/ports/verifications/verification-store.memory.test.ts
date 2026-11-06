import { expect, test } from "bun:test";
import { createMockClock } from "../clock/clock.mock";
import { createMemoryVerificationStore } from "./verification-store.memory";

const setup = () => {
  const clock = createMockClock();
  return { clock, store: createMemoryVerificationStore({ clock }) };
};

test("a token works once for its user and action", () => {
  const { store } = setup();
  const { token } = store.issue({ userId: "usr_1", action: "check_in" });
  expect(store.consume({ token, userId: "usr_1", action: "check_in" })).toBe(
    true,
  );
  expect(store.consume({ token, userId: "usr_1", action: "check_in" })).toBe(
    false,
  );
});

test("a token is rejected for another user or action", () => {
  const { store } = setup();
  const a = store.issue({ userId: "usr_1", action: "check_in" });
  expect(
    store.consume({ token: a.token, userId: "usr_2", action: "check_in" }),
  ).toBe(false);
  const b = store.issue({ userId: "usr_1", action: "check_in" });
  expect(
    store.consume({
      token: b.token,
      userId: "usr_1",
      action: "approve_agent_order",
    }),
  ).toBe(false);
});

test("a token expires after five minutes", () => {
  const { clock, store } = setup();
  const { token } = store.issue({ userId: "usr_1", action: "check_in" });
  clock.advance(5 * 60 * 1000);
  expect(store.consume({ token, userId: "usr_1", action: "check_in" })).toBe(
    false,
  );
});

test("resource-bound tokens cannot authorize another order or an unbound consumer", () => {
  const { store } = setup();
  for (const resourceId of [undefined, "ord_other", "ord_1"]) {
    const { token } = store.issue({
      userId: "usr_1",
      action: "approve_agent_order",
      resourceId: "ord_1",
    });
    expect(
      store.consume({
        token,
        userId: "usr_1",
        action: "approve_agent_order",
        resourceId,
      }),
    ).toBe(resourceId === "ord_1");
  }
});
