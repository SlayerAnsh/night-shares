import { expect, test } from "bun:test";
import { tripFixture } from "../../test-support/fixture";
import { getTrip } from "./get-trip";

test("trip lookup rejects other users", () => {
  const f = tripFixture();
  expect(() => getTrip(f.repo, f.trip.id, "other")).toThrow("Trip not found.");
  expect(getTrip(f.repo, f.trip.id, "guest").trip.id).toBe(f.trip.id);
});
