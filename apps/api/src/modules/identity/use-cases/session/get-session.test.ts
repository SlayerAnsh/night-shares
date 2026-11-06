import { expect, test } from "bun:test";
import { getSession } from "./get-session";

test("returns an isolated copy of the signed-in user", () => {
  const user = {
    id: "usr_1",
    humanId: "human",
    level: "device" as const,
    walletAddress: "wallet",
  };
  expect(getSession(user)).toEqual(user);
  expect(getSession(user)).not.toBe(user);
});
