import { expect, test } from "bun:test";
import { loadConfig } from "../../../../config/load-config";
import { buildContainer } from "../../../../container/build-container";
import { tripFixture } from "../../test-support/fixture";

test("mock issuer requires booking ownership and disabled issuer fails closed", () => {
  const f = tripFixture();
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
