import { expect, test } from "bun:test";
import { tripFixture } from "../../test-support/fixture";

test("upcoming check-in consumes a user- and booking-bound action token once", () => {
  const f = tripFixture();
  expect(() => f.cases.checkIn(f.trip.id, "bad", "guest")).toThrow(
    "Verify your identity",
  );
  const { token } = f.ports.verifications.issue({
    userId: "guest",
    action: "check_in",
    resourceId: f.trip.id,
  });
  expect(f.cases.checkIn(f.trip.id, token, "guest").checkedIn).toBe(true);
  expect(() => f.cases.checkIn(f.trip.id, token, "guest")).toThrow();
});

for (const resourceId of [undefined, "", "bk_other"]) {
  test(`check-in rejects a token for resource ${String(resourceId)}`, () => {
    const f = tripFixture();
    const { token } = f.ports.verifications.issue({
      userId: "guest",
      action: "check_in",
      resourceId,
    });
    expect(() => f.cases.checkIn(f.trip.id, token, "guest")).toThrow(
      "Verify your identity",
    );
    expect(f.repo.trips.get(f.trip.id)?.trip.checkedIn).toBe(false);
  });
}

test("check-in rejects another user's token for the same booking", () => {
  const f = tripFixture();
  const { token } = f.ports.verifications.issue({
    userId: "other",
    action: "check_in",
    resourceId: f.trip.id,
  });
  expect(() => f.cases.checkIn(f.trip.id, token, "guest")).toThrow(
    "Verify your identity",
  );
  expect(f.repo.trips.get(f.trip.id)?.trip.checkedIn).toBe(false);
});
