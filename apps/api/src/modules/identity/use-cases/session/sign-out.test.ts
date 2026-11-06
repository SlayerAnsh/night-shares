import { expect, test } from "bun:test";
import { createMemorySessionStore } from "../../../../ports/sessions/session-store.memory";
import { createSignOut } from "./sign-out";

test("revokes only the supplied session", () => {
  const sessions = createMemorySessionStore();
  const user = {
    id: "usr_1",
    humanId: "human",
    level: "device" as const,
    walletAddress: "wallet",
  };
  const first = sessions.create(user),
    second = sessions.create(user);
  createSignOut({ sessions })(first);
  expect(sessions.get(first)).toBeUndefined();
  expect(sessions.get(second)).toEqual(user);
  expect(() => createSignOut({ sessions })(undefined)).toThrow();
});
