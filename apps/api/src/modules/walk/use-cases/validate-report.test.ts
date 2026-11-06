import { expect, test } from "bun:test";
import { fixture } from "../testing/fixture";
import { validateReport } from "./validate-report";

for (const offset of [-1, 24 * 3600000 + 1]) {
  test(`walk rejects report outside window at offset ${offset}`, async () => {
    const f = await fixture();
    f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
    f.clock.advance(offset);
    expect(() =>
      validateReport(f.ports, f.repo, {
        ...f.report,
        reportedAt: f.clock.now(),
      }),
    ).toThrow("within 24 hours");
  });
}
test("walk accepts exact deadline and rejects missing tap and checked-in booking", async () => {
  const f = await fixture();
  expect(() => validateReport(f.ports, f.repo, f.report)).toThrow(
    "Tap the reception",
  );
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  f.clock.advance(24 * 3600000);
  expect(
    validateReport(f.ports, f.repo, { ...f.report, reportedAt: f.clock.now() })
      .trip.id,
  ).toBe(f.trip.id);
  const saved = f.repo.trips.get(f.trip.id);
  if (!saved) throw new Error("Missing fixture booking");
  saved.trip.checkedIn = true;
  f.repo.trips.set(f.trip.id, saved);
  expect(() => validateReport(f.ports, f.repo, f.report)).toThrow(
    "World ID desk check-in",
  );
});
test("tap and report require booking owner and matching property tag", async () => {
  const f = await fixture();
  expect(() => f.cases.tapReception(f.trip.id, "wrong", f.user.id)).toThrow(
    "does not match",
  );
  expect(() =>
    f.cases.tapReception(f.trip.id, f.trip.propertyId, "other"),
  ).toThrow("Trip not found");
  expect(() =>
    validateReport(f.ports, f.repo, { ...f.report, userId: "other" }),
  ).toThrow("Trip not found");
  const first = f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  f.clock.advance(1000);
  expect(f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id)).toEqual(
    first,
  );
});
test("future reports and taps after report time cannot establish presence", async () => {
  const f = await fixture();
  expect(() =>
    validateReport(f.ports, f.repo, {
      ...f.report,
      reportedAt: f.clock.now() + 1,
    }),
  ).toThrow("within 24 hours");
  f.clock.advance(1000);
  f.cases.tapReception(f.trip.id, f.trip.propertyId, f.user.id);
  expect(() => validateReport(f.ports, f.repo, f.report)).toThrow(
    "Tap the reception",
  );
});
