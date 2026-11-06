import { expect, test } from "bun:test";
import { createMemorySessionStore } from "./session-store.memory";

const user = {
  id: "usr_0001",
  humanId: "0xabc",
  level: "orb" as const,
  walletAddress: "0xwallet",
};

test("tokens are long, random and unrelated to each other", () => {
  const store = createMemorySessionStore();
  const first = store.create(user);
  const second = store.create(user);
  expect(first).not.toBe(second);
  expect(first.length).toBeGreaterThanOrEqual(43);
  expect(first).not.toContain("session");
});

test("a session is found by its token and gone after delete", () => {
  const store = createMemorySessionStore();
  const token = store.create(user);
  expect(store.get(token)).toEqual(user);
  expect(store.get(`${token}x`)).toBeUndefined();
  store.delete(token);
  expect(store.get(token)).toBeUndefined();
});
