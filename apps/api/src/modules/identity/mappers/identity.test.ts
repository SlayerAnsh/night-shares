import { expect, test } from "bun:test";
import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
import { fromAction, fromLevel } from "./identity";

test("rejects unspecified levels and unsupported action strings", () => {
  expect(fromLevel(VerificationLevel.ORB)).toBe("orb");
  expect(fromLevel(VerificationLevel.DEVICE)).toBe("device");
  expect(() => fromLevel(VerificationLevel.UNSPECIFIED)).toThrow();
  expect(fromAction("check_in")).toBe("check_in");
  expect(fromAction("approve_agent_order")).toBe("approve_agent_order");
  expect(() => fromAction("sign_in")).toThrow();
});
