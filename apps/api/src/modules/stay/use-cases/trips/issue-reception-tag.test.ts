import { expect, test } from "bun:test";
import { loadConfig } from "../../../../config/load-config";
import { buildContainer } from "../../../../container/build-container";
import { tripFixture } from "../../test-support/fixture";

test("mock issuer requires booking ownership and disabled issuer fails closed", () => {
  const f = tripFixture();
  const demo = buildContainer({
    port: 0,
    adapters: "mock",
    devTagIssuer: true,
    dbPath: ":memory:",
  });
  f.ports.issueReceptionTag = demo.ports.issueReceptionTag;
  f.ports.receptionTag = demo.ports.receptionTag;
  expect(() => f.cases.issueReceptionTag(f.trip.id, "other")).toThrow(
    "Trip not found",
  );
  expect(f.cases.issueReceptionTag(f.trip.id, "guest").tagPayload).toContain(
    `${f.trip.propertyId}.`,
  );
  f.ports.issueReceptionTag = undefined;
  expect(() => f.cases.issueReceptionTag(f.trip.id, "guest")).toThrow(
    expect.objectContaining({ code: "FAILED_PRECONDITION" }),
  );
});

test("non mock startup requires reception secret", () => {
  expect(() => loadConfig({ ADAPTERS: "real" })).toThrow(
    "RECEPTION_TAG_SECRET",
  );
  expect(() => buildContainer({ port: 0, adapters: "real" as "mock" })).toThrow(
    "RECEPTION_TAG_SECRET",
  );
});

test("default config does not wire an issuer and rejects self issued tags", () => {
  const f = tripFixture();
  expect(loadConfig({}).devTagIssuer).toBe(false);
  expect(f.ports.issueReceptionTag).toBeUndefined();
  expect(() => f.cases.issueReceptionTag(f.trip.id, "guest")).toThrow(
    expect.objectContaining({ code: "FAILED_PRECONDITION" }),
  );
  const demo = buildContainer({
    port: 0,
    adapters: "mock",
    devTagIssuer: true,
    dbPath: ":memory:",
  });
  const payload =
    demo.ports.issueReceptionTag?.(f.trip.propertyId, f.ports.clock.now()) ??
    "";
  expect(() => f.cases.tapReception(f.trip.id, payload, "guest")).toThrow(
    "signature is invalid",
  );
  expect(f.ports.db.query("SELECT * FROM reception_taps").all()).toHaveLength(
    0,
  );
  demo.ports.db.close();
});

test("dev issuer requires explicit boolean and mock adapters at startup", () => {
  expect(loadConfig({ DEV_TAG_ISSUER: "true" }).devTagIssuer).toBe(true);
  expect(loadConfig({ DEV_TAG_ISSUER: "false" }).devTagIssuer).toBe(false);
  expect(() => loadConfig({ DEV_TAG_ISSUER: "1" })).toThrow("DEV_TAG_ISSUER");
  expect(() =>
    loadConfig({ DEV_TAG_ISSUER: "true", ADAPTERS: "real" }),
  ).toThrow("DEV_TAG_ISSUER requires ADAPTERS=mock");
  expect(() =>
    buildContainer({ port: 0, adapters: "real" as "mock", devTagIssuer: true }),
  ).toThrow("DEV_TAG_ISSUER requires ADAPTERS=mock");
});
