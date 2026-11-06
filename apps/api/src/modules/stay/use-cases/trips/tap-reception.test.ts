import { expect, test } from "bun:test";
import { buildContainer as buildDemoContainer } from "../../../../container/build-container";
import type { MockClock } from "../../../../ports/clock/clock.mock";
import { tripFixture } from "../../test-support/fixture";

test("tap rejects forged, stale, reused and other property payloads without recording presence", () => {
  const f = tripFixture();
  const demo = buildDemoContainer({
    port: 0,
    adapters: "mock",
    devTagIssuer: true,
    dbPath: ":memory:",
  });
  f.ports.issueReceptionTag = demo.ports.issueReceptionTag;
  f.ports.receptionTag = demo.ports.receptionTag;
  const clock = f.ports.clock as MockClock;
  const payload = f.cases.issueReceptionTag(f.trip.id, "guest").tagPayload;
  const other = f.ports.issueReceptionTag?.("prop_other", clock.now()) ?? "";
  for (const forged of [f.trip.propertyId, other])
    expect(() => f.cases.tapReception(f.trip.id, forged, "guest")).toThrow();
  clock.advance(300_001);
  expect(() => f.cases.tapReception(f.trip.id, payload, "guest")).toThrow(
    "expired",
  );
  expect(f.ports.db.query("SELECT * FROM reception_taps").all()).toHaveLength(
    0,
  );
  const fresh = f.cases.issueReceptionTag(f.trip.id, "guest").tagPayload;
  expect(
    f.cases.tapReception(f.trip.id, fresh, "guest").tappedAt,
  ).toBeDefined();
  expect(() => f.cases.tapReception(f.trip.id, fresh, "guest")).toThrow(
    "already been used",
  );
});
