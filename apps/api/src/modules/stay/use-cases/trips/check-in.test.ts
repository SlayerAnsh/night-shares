import { expect, test } from "bun:test";
import { tripFixture } from "../../test-support/fixture";

test("upcoming check-in consumes a user-bound action token once", () => {
  const f = tripFixture();
  expect(() => f.cases.checkIn(f.trip.id, "bad", "guest")).toThrow(
    "Verify your identity",
  );
  const { token } = f.ports.verifications.issue({
    userId: "guest",
    action: "check_in",
  });
  expect(f.cases.checkIn(f.trip.id, token, "guest").checkedIn).toBe(true);
  expect(() => f.cases.checkIn(f.trip.id, token, "guest")).toThrow();
});
